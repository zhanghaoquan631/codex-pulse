import { Canvas, events as createCanvasEvents, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import ParticleModes from './ParticleModes';
import MatchGameOverlay from './MatchGameOverlay';
import SiteVersion from './SiteVersion.jsx';
import { useAccountSync } from './useAccountSync.mjs';
import LiveGalleryQuest, { useGalleryQuest } from './LiveGalleryQuest.jsx';
import { companionCard, companionDirection, galleryFocusDistance, galleryCardStatus, hideGalleryCard, populateGalleryCell, galleryMedia } from './galleryQuest.mjs';
import { useAutoGalleryTarget } from './useGalleryQuest.mjs';
import './styles.css';
import './gallerySettings.css';

const OFFICIAL_IMAGES = [
  { url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&q=75', width: 600, height: 400 },
  { url: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=600&q=75', width: 600, height: 400 },
  { url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&q=75', width: 600, height: 400 },
  { url: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=600&q=75', width: 600, height: 400 },
  { url: 'https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=600&q=75', width: 600, height: 400 },
  { url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=600&q=75', width: 600, height: 400 },
  { url: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=600&q=75', width: 600, height: 400 },
  { url: 'https://images.unsplash.com/photo-1465056836900-8f1e4f32c1f6?w=600&q=75', width: 600, height: 338 }
];

const ORIGINAL_WORKS_IMAGES = Array.from({ length: 75 }, (_, index) => ({
  url: `/original-image-library/card-${String(index + 1).padStart(3, '0')}.png`,
  width: 3,
  height: 4
}));

const WECHAT_0051_IMAGES = Array.from({ length: 89 }, (_, index) => ({
  id: `wechat-0051-${String(index + 1).padStart(3, '0')}`,
  url: `/wechat-0051/wechat-0051-${String(index + 1).padStart(3, '0')}.jpg`,
  width: 3,
  height: 4,
}));

const WECHAT_0327_IMAGES = Array.from({ length: 56 }, (_, index) => ({
  id: `wechat-0327-${String(index + 1).padStart(3, '0')}`,
  url: `/wechat-0327/wechat-0327-${String(index + 1).padStart(3, '0')}.jpg`,
  width: 3,
  height: 4,
}));

const textureRecords = new Map();
const cellRecords = new Map();
const planeGeometry = new THREE.PlaneGeometry(1, 1);

const vertexShader = `
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragmentShader = `
precision highp float;
uniform sampler2D uMap;
uniform float uOpacity;
uniform float uRadius;
uniform float uSelected;
uniform vec2 uSize;
varying vec2 vUv;
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  varying float vFogDepth;
#endif
float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}
void main() {
  vec4 tex = texture2D(uMap, vUv);
  float shortEdge = min(uSize.x, uSize.y);
  float r = uRadius * shortEdge * 0.5;
  vec2 p = (vUv - 0.5) * uSize;
  vec2 halfSize = uSize * 0.5;
  float d = roundedBox(p, halfSize, r);
  float aa = fwidth(d);
  float mask = 1.0 - smoothstep(-aa, aa, d);
  float alpha = mask * uOpacity;
  #ifdef USE_FOG
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    alpha *= 1.0 - fogFactor;
  #endif
  if (alpha < 0.001) discard;
  float border = (1.0 - smoothstep(shortEdge * .018, shortEdge * .027, -d)) * min(uSelected, 1.0);
  vec3 borderColor = uSelected > 1.5 ? vec3(.24, 1.0, .58) : vec3(.68, .38, 1.0);
  gl_FragColor = vec4(mix(tex.rgb, borderColor, border), alpha);
  #include <colorspace_fragment>
}
`;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

function hash(value) {
  const next = 10000 * Math.sin(9999 * value);
  return next - Math.floor(next);
}

function hashString(value) {
  let output = 0;
  for (let index = 0; index < value.length; index += 1) {
    output = (output << 5) - output + value.charCodeAt(index);
    output |= 0;
  }
  return Math.abs(output);
}

function makeCellImages(cx, cy, cz, cellSize, density, imageSize) {
  const key = `${cx},${cy},${cz}|${cellSize}|${density}|${imageSize}`;
  const cached = cellRecords.get(key);
  if (cached) return cached;
  const seed = hashString(key);
  const images = Array.from({ length: density }, (_, index) => {
    const localSeed = seed + index * 7919;
    return {
      id: `${key}-${index}`,
      px: cx * cellSize + hash(localSeed) * cellSize,
      py: cy * cellSize + hash(localSeed + 1) * cellSize,
      pz: cz * cellSize + hash(localSeed + 2) * cellSize,
      size: imageSize * (0.65 + 0.7 * hash(localSeed + 4)),
      imageIndex: Math.floor(1000000 * hash(localSeed + 5))
    };
  });
  cellRecords.set(key, images);
  if (cellRecords.size > 512) cellRecords.delete(cellRecords.keys().next().value);
  return images;
}

function useTexture(url) {
  const [texture, setTexture] = useState(() => textureRecords.get(url)?.texture ?? null);

  useEffect(() => {
    let record = textureRecords.get(url);
    if (!record) {
      record = { texture: null, subscribers: new Set() };
      textureRecords.set(url, record);
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(url, loaded => {
        loaded.minFilter = THREE.LinearMipmapLinearFilter;
        loaded.magFilter = THREE.LinearFilter;
        loaded.generateMipmaps = true;
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.needsUpdate = true;
        record.texture = loaded;
        record.subscribers.forEach(subscriber => subscriber(loaded));
        record.subscribers.clear();
      });
    }
    if (record.texture) {
      setTexture(record.texture);
      return undefined;
    }
    record.subscribers.add(setTexture);
    return () => record.subscribers.delete(setTexture);
  }, [url]);

  // A filler may switch media after a pair clears. Never paint/click its previous
  // texture under the new URL while the next image is still loading.
  return textureRecords.get(url)?.texture ?? null;
}

export function GalleryPlane({ info, media, controllerRef, cellSize, viewRange, imageRadius, onFocus, questStatus = 'card' }) {
  const texture = useTexture(media.url);
  const meshRef = useRef();
  const materialRef = useRef();
  const opacityRef = useRef(0);
  const scale = useMemo(() => new THREE.Vector3(info.size * (media.width / media.height), info.size, 1), [info.size, media.height, media.width]);
  const uniforms = useMemo(() => THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uMap: { value: null },
      uOpacity: { value: 0 },
      uRadius: { value: imageRadius },
      uSelected: { value: 0 },
      uSize: { value: new THREE.Vector2(1, 1) }
    }
  ]), []);

  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material || !texture) {
      if (mesh) { mesh.visible = false; mesh.userData.hitReady = false; }
      return;
    }
    material.uniforms.uMap.value = texture;
    const distance = Math.hypot(info.px - camera.position.x, info.py - camera.position.y, info.pz - camera.position.z);
    const focused = controllerRef.current.focusTarget?.id === info.id;
    const removing = questStatus === 'removing';
    const targetOpacity = !removing && (focused || distance < cellSize * (viewRange + 1)) ? 1 : 0;
    opacityRef.current = focused && !removing ? 1 : lerp(opacityRef.current, targetOpacity, removing ? .24 : .12);
    material.uniforms.uOpacity.value = opacityRef.current;
    material.uniforms.uRadius.value = imageRadius;
    material.uniforms.uSize.value.set(scale.x, scale.y);
    material.uniforms.uSelected.value = questStatus === 'picked' ? 2 : questStatus === 'target' ? 1 : 0;
    mesh.visible = opacityRef.current > 0.01;
    const fogDepth = camera.position.z - info.pz;
    const fogT = clamp((fogDepth - 120) / 200, 0, 1);
    mesh.userData.hitReady = !removing && fogDepth > camera.near && opacityRef.current * (1 - fogT * fogT * (3 - 2 * fogT)) > .05;
    mesh.renderOrder = focused || questStatus === 'target' ? 999 : ['mate', 'picked'].includes(questStatus) ? 998 : 0;
    material.depthTest = !(focused || ['mate', 'picked'].includes(questStatus));
  });

  return (
    <mesh
      ref={meshRef}
      geometry={planeGeometry}
      position={[info.px, info.py, info.pz]}
      scale={scale}
      visible={false}
      userData={{ questStatus, galleryCard: true, hitReady: false }}
      onClick={event => {
        event.stopPropagation();
        if (questStatus !== 'removing' && opacityRef.current > .05) onFocus({ ...info, url: media.url, media, scaleX: scale.x, scaleY: scale.y });
      }}
    >
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        fog
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function GalleryCell({ cx, cy, cz, crowded, images, remaining, cellSize, density, imageSize, controllerRef, viewRange, imageRadius, onFocus, game }) {
  const planes = useMemo(
    () => populateGalleryCell(makeCellImages(cx, cy, cz, cellSize, density, imageSize), { cx, cy, cz, crowded }, game?.active, cellSize, imageSize),
    [cellSize, cx, cy, cz, crowded, density, imageSize, game?.active]
  );

  return planes.map(info => {
    const media = galleryMedia(info, images, remaining, game);
    if (hideGalleryCard(game, { ...info, url: media?.url })) return null;
    return media ? (
      <GalleryPlane
        key={info.id}
        info={info}
        media={media}
        controllerRef={controllerRef}
        cellSize={cellSize}
        viewRange={viewRange}
        imageRadius={imageRadius}
        onFocus={onFocus}
        questStatus={galleryCardStatus(game, { id: info.id, url: media.url })}
      />
    ) : null;
  });
}

function DismissFocusPlane({ onDismiss }) {
  const meshRef = useRef();
  const { camera } = useThree();

  useFrame(() => {
    if (!meshRef.current) return;
    meshRef.current.position.set(camera.position.x, camera.position.y, camera.position.z - 410);
  });

  return (
    <mesh ref={meshRef} onClick={onDismiss} renderOrder={-1000}>
      <planeGeometry args={[10000, 10000]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function makeOffsets(range) {
  const offsets = [];
  for (let x = -range; x <= range; x += 1) {
    for (let y = -range; y <= range; y += 1) {
      for (let z = -range; z <= range; z += 1) {
        if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) <= range) offsets.push({ x, y, z });
      }
    }
  }
  return offsets;
}

function InfiniteField({ images = OFFICIAL_IMAGES, game, navigationRef, locateRequest = 0, cellSize = 110, density = 5, imageSize = 14, viewRange = 2, dragSpeed = 1, driftAmount = 8, friction = 0.9, autoZoom = false, autoZoomSpeed = 0.5, imageRadius = 0.06, allowImageFocusOnClick = true }) {
  const { camera, gl } = useThree();
  const controllerRef = useRef({
    velocity: { x: 0, y: 0, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 50 },
    drift: { x: 0, y: 0 },
    mouse: { x: 0, y: 0 },
    lastMouse: { x: 0, y: 0 },
    dragging: false,
    scrollAccum: 0,
    lastTouches: [],
    lastTouchDistance: 0,
    focused: false,
    focusTarget: null,
    focusEase: 0.08,
    preFocusPosition: { x: 0, y: 0, z: 0 },
    dragDistanceSquared: 0,
    lastCellKey: ''
  });
  const cameraRef = useRef({ x: 0, y: 0, z: 50 });
  const offsets = useMemo(() => makeOffsets(viewRange + 1), [viewRange]);
  const [cells, setCells] = useState([]);
  // Freeze the URL-to-cell mapping for a run, even if an upload arrives.
  const runImages = useRef(images), wasActive = useRef(false);
  if (game?.active && !wasActive.current) runImages.current = images;
  wasActive.current = game?.active;
  const fieldImages = game?.active ? runImages.current : images;
  const remaining = useMemo(() => fieldImages.filter(image => game.quest.order.includes(image.url) && !game.quest.cleared.includes(image.url)), [fieldImages, game.quest]);
  const liveCards = useMemo(() => cells.flatMap(cell => populateGalleryCell(makeCellImages(cell.cx, cell.cy, cell.cz, cellSize, density, imageSize), cell, game.active, cellSize, imageSize).flatMap(info => {
    const media = galleryMedia(info, fieldImages, remaining, game);
    if (!media || hideGalleryCard(game, { ...info, url: media.url })) return [];
    return { ...info, url: media.url, media, scaleX: info.size * media.width / media.height, scaleY: info.size };
  })), [cells, fieldImages, remaining, cellSize, density, imageSize, game.active, game.quest]);
  const mate = useMemo(() => game?.active && game.target ? companionCard(game.target, { seed: game.quest.seed, progress: game.quest.cleared.length }) : null, [game?.active, game?.target, game?.quest.seed, game?.quest.cleared.length]);
  useEffect(() => {
    navigationRef.current = {
      getLock: () => {
        if (!game.active || !game.target || !mate || game.pending) return null;
        const destination = game.picked?.id === mate.id ? game.target : mate;
        return { targetId: game.target.id, destination };
      },
      lock: ({ destination }) => {
        const state = controllerRef.current;
        state.focused = true; state.focusTarget = destination;
        state.velocity = { x: 0, y: 0, z: 0 }; state.target = { x: 0, y: 0, z: 0 }; state.scrollAccum = 0;
      },
      hint: () => {
      if (game.active && mate) game.setNotice(companionDirection(camera.position, mate));
    } };
    return () => { navigationRef.current = null; };
  }, [navigationRef, camera, mate, game.active, game.target, game.picked, game.pending, game.setNotice]);

  const updateCells = useCallback(() => {
    const state = controllerRef.current;
    const cx = Math.floor(state.position.x / cellSize);
    const cy = Math.floor(state.position.y / cellSize);
    const cz = Math.floor(state.position.z / cellSize);
    const key = `${cx},${cy},${cz}`;
    if (key === state.lastCellKey) return;
    state.lastCellKey = key;
    setCells(offsets.map(offset => ({
      key: `${cx + offset.x},${cy + offset.y},${cz + offset.z}`,
      cx: cx + offset.x,
      cy: cy + offset.y,
      cz: cz + offset.z,
      crowded: Math.abs(offset.x) <= 1 && Math.abs(offset.y) <= 1 && offset.z >= -2 && offset.z <= 0
    })));
  }, [cellSize, offsets]);

  const clearFocus = useCallback(() => {
    const state = controllerRef.current;
    state.focused = false;
    state.focusTarget = null;
  }, []);

  const focusPlane = useCallback((target, { force = false, ease = 0.08 } = {}) => {
    const state = controllerRef.current;
    if (state.dragDistanceSquared > 16) return;
    if (state.focused && state.focusTarget) {
      if (!force && state.focusTarget.id === target.id) {
        clearFocus();
        return;
      }
      state.focusTarget = target;
      state.focusEase = ease;
      state.velocity = { x: 0, y: 0, z: 0 };
      state.target = { x: 0, y: 0, z: 0 };
      state.scrollAccum = 0;
      return;
    }
    state.focused = true;
    state.focusTarget = target;
    state.focusEase = ease;
    state.preFocusPosition = { ...state.position };
    state.velocity = { x: 0, y: 0, z: 0 };
    state.target = { x: 0, y: 0, z: 0 };
    state.scrollAccum = 0;
  }, [clearFocus]);

  useEffect(() => { clearFocus(); }, [game?.active, game?.quest.seed, clearFocus]);
  useAutoGalleryTarget(game, liveCards, { px: camera.position.x, py: camera.position.y, pz: camera.position.z }, fieldImages, imageSize);
  useEffect(() => {
    if (!game?.active || !game.target) { if (game?.active) clearFocus(); return; }
    const state = controllerRef.current;
    state.focused = true; state.focusTarget = game.target;
    state.velocity = { x: 0, y: 0, z: 0 }; state.target = { x: 0, y: 0, z: 0 }; state.scrollAccum = 0;
  // Automatic next-target focus and explicit Return only: manual picks must not
  // pull the camera away from the card the player is trying to click.
  }, [game?.active, game?.focusRequest, locateRequest, clearFocus]);
  const pickPlane = target => {
    if (controllerRef.current.dragDistanceSquared > 16) return;
    if (game?.active) {
      if (game.searching) {
        // Search mode is exploratory: a click only moves the camera and stages
        // a candidate. Scoring remains behind the explicit confirm action.
        game.inspect(target);
        // Search clicks always move toward the requested card. In particular,
        // clicking the card that is already focused must not toggle focus off.
        focusPlane(target, { force: true, ease: 0.055 });
        return;
      }
      clearFocus(); game.pick(target);
    }
    else if (allowImageFocusOnClick) focusPlane(target);
  };

  useEffect(() => {
    const state = controllerRef.current;
    state.position = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    updateCells();
  }, [camera, updateCells]);

  useEffect(() => {
    const element = gl.domElement;
    const state = controllerRef.current;
    const getTouchDistance = touches => {
      if (touches.length < 2) return 0;
      return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    };
    const onMouseDown = event => {
      state.dragging = true;
      state.lastMouse = { x: event.clientX, y: event.clientY };
      state.dragDistanceSquared = 0;
    };
    const onMouseUp = () => { state.dragging = false; };
    const onMouseMove = event => {
      const width = element.clientWidth || 1;
      const height = element.clientHeight || 1;
      state.mouse = { x: event.clientX / width * 2 - 1, y: -(2 * event.clientY / height) + 1 };
      if (!state.dragging) return;
      const deltaX = event.clientX - state.lastMouse.x;
      const deltaY = event.clientY - state.lastMouse.y;
      state.dragDistanceSquared += deltaX * deltaX + deltaY * deltaY;
      if (state.focused && state.dragDistanceSquared > 16) clearFocus();
      if (!state.focused) {
        state.target.x -= deltaX * dragSpeed * 0.025;
        state.target.y += deltaY * dragSpeed * 0.025;
      }
      state.lastMouse = { x: event.clientX, y: event.clientY };
    };
    const onWheel = event => {
      event.preventDefault();
      clearFocus();
      state.scrollAccum += 0.006 * event.deltaY;
    };
    const onTouchStart = event => {
      // touch-action:none handles gestures; allow a tap to produce a card click.
      state.lastTouches = Array.from(event.touches);
      state.lastTouchDistance = getTouchDistance(state.lastTouches);
      state.dragDistanceSquared = 0;
    };
    const onTouchMove = event => {
      event.preventDefault();
      const touches = Array.from(event.touches);
      if (touches.length === 1 && state.lastTouches.length >= 1) {
        const touch = touches[0];
        const previous = state.lastTouches[0];
        if (touch && previous) {
          state.dragDistanceSquared += (touch.clientX - previous.clientX) ** 2 + (touch.clientY - previous.clientY) ** 2;
          clearFocus();
          state.target.x -= (touch.clientX - previous.clientX) * dragSpeed * 0.02;
          state.target.y += (touch.clientY - previous.clientY) * dragSpeed * 0.02;
        }
      } else if (touches.length === 2 && state.lastTouchDistance > 0) {
        clearFocus();
        const distance = getTouchDistance(touches);
        state.scrollAccum += (state.lastTouchDistance - distance) * 0.006;
        state.lastTouchDistance = distance;
      }
      state.lastTouches = touches;
    };
    const onTouchEnd = event => {
      state.lastTouches = Array.from(event.touches);
      state.lastTouchDistance = getTouchDistance(state.lastTouches);
    };
    const onMouseLeave = () => {
      state.mouse = { x: 0, y: 0 };
      state.dragging = false;
    };
    element.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    element.addEventListener('mouseleave', onMouseLeave);
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('touchstart', onTouchStart, { passive: false });
    element.addEventListener('touchmove', onTouchMove, { passive: false });
    element.addEventListener('touchend', onTouchEnd, { passive: false });
    return () => {
      element.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      element.removeEventListener('mouseleave', onMouseLeave);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
    };
  }, [clearFocus, dragSpeed, gl]);

  useFrame(() => {
    const state = controllerRef.current;
    if (state.focused && state.focusTarget) {
      const target = state.focusTarget;
      const distance = game?.active ? galleryFocusDistance(target, camera.aspect) : 1.2 * Math.max(target.scaleX, target.scaleY);
      const ease = state.focusEase || 0.08;
      state.position.x = lerp(state.position.x, target.px, ease);
      state.position.y = lerp(state.position.y, target.py, ease);
      state.position.z = lerp(state.position.z, target.pz + distance, ease);
      state.drift.x = lerp(state.drift.x, 0, 0.15);
      state.drift.y = lerp(state.drift.y, 0, 0.15);
      state.velocity = { x: 0, y: 0, z: 0 };
      state.target = { x: 0, y: 0, z: 0 };
      state.scrollAccum = 0;
    } else {
      const driftScale = clamp(state.position.z / 50, 0.3, 2);
      if (!state.dragging) {
        state.drift.x = lerp(state.drift.x, state.mouse.x * driftAmount * driftScale, 0.12);
        state.drift.y = lerp(state.drift.y, state.mouse.y * driftAmount * driftScale, 0.12);
      }
      state.target.z += state.scrollAccum;
      state.scrollAccum *= 0.8;
      if (autoZoom) state.position.z -= autoZoomSpeed;
      state.target.x = clamp(state.target.x, -3.2, 3.2);
      state.target.y = clamp(state.target.y, -3.2, 3.2);
      state.target.z = clamp(state.target.z, -3.2, 3.2);
      state.velocity.x = lerp(state.velocity.x, state.target.x, 0.16);
      state.velocity.y = lerp(state.velocity.y, state.target.y, 0.16);
      state.velocity.z = lerp(state.velocity.z, state.target.z, 0.16);
      state.position.x += state.velocity.x;
      state.position.y += state.velocity.y;
      state.position.z += state.velocity.z;
      state.target.x *= friction;
      state.target.y *= friction;
      state.target.z *= friction;
    }
    camera.position.set(state.position.x + state.drift.x, state.position.y + state.drift.y, state.position.z);
    cameraRef.current = { ...state.position };
    updateCells();
  });

  return (
    <>
      <DismissFocusPlane onDismiss={clearFocus} />
      {cells.map(({ key, ...cell }) => (
        <GalleryCell
          key={key}
          {...cell}
          images={fieldImages}
          remaining={remaining}
          cellSize={cellSize}
          density={density}
          imageSize={imageSize}
          controllerRef={controllerRef}
          viewRange={viewRange}
          imageRadius={imageRadius}
          onFocus={pickPlane}
          game={game}
        />
      ))}
      {game?.active && game.target && !liveCards.some(card => card.id === game.target.id) && <GalleryPlane
        info={game.target} media={game.target.media} controllerRef={controllerRef} cellSize={cellSize} viewRange={viewRange} imageRadius={imageRadius}
        questStatus={galleryCardStatus(game, game.target)} onFocus={pickPlane} />}
      {mate && <GalleryPlane key={mate.id} info={mate} media={mate.media} controllerRef={controllerRef} cellSize={cellSize} viewRange={viewRange} imageRadius={imageRadius}
        questStatus={galleryCardStatus(game, mate)} onFocus={pickPlane} />}
    </>
  );
}

function asMedia(work, access) {
  const url = `/gallery/uploads/${encodeURIComponent(work.filename)}?access=${encodeURIComponent(access)}`;
  return new Promise(resolve => {
    const probe = new Image();
    probe.onload = () => resolve({ id: work.id, url, width: probe.naturalWidth || 4, height: probe.naturalHeight || 3 });
    probe.onerror = () => resolve({ id: work.id, url, width: 4, height: 3 });
    probe.src = url;
  });
}

function useGalleryArchive() {
  const [config, setConfig] = useState(null);
  const [uploadedImages, setUploadedImages] = useState([]);

  const refreshWorks = useCallback(async (access) => {
    const response = await fetch(`/api/gallery/works?access=${encodeURIComponent(access)}`);
    if (!response.ok) throw new Error('Unable to load gallery works');
    const { works } = await response.json();
    const media = await Promise.all(works.map(work => asMedia(work, access)));
    setUploadedImages(media);
  }, []);

  useEffect(() => {
    let alive = true;
    let events;
    (async () => {
      const response = await fetch('/api/gallery/config');
      if (!response.ok) throw new Error('Unable to load upload link');
      const nextConfig = await response.json();
      if (!alive) return;
      const access = new URL(nextConfig.uploadUrl).searchParams.get('access');
      setConfig({ ...nextConfig, access });
      await refreshWorks(access);
      events = new EventSource(`/api/gallery/events?access=${encodeURIComponent(access)}`);
      events.addEventListener('work-added', () => refreshWorks(access).catch(() => {}));
    })().catch(() => {});
    return () => { alive = false; events?.close(); };
  }, [refreshWorks]);

  const images = [...WECHAT_0327_IMAGES, ...WECHAT_0051_IMAGES, ...ORIGINAL_WORKS_IMAGES, ...OFFICIAL_IMAGES];
  return { config, images: uploadedImages.length ? [...uploadedImages, ...images] : images };
}

function UploadLauncher({ config }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!config) return null;
  const copyLink = async () => {
    await navigator.clipboard.writeText(config.uploadUrl).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <aside className="upload-launcher">
      <button type="button" onClick={() => setOpen(value => !value)}>{open ? '收起上传入口' : '手机上传照片'}</button>
      {open && <>
        <img className="qr" src={config.qrCode} alt="手机上传二维码" />
        <p>手机和电脑在同一 Wi-Fi 时，扫码上传后会自动进入画廊。</p>
        <input className="link" readOnly value={config.uploadUrl} aria-label="手机上传链接" />
        <button type="button" onClick={copyLink}>{copied ? '已复制手机链接' : '复制手机链接'}</button>
      </>}
    </aside>
  );
}

function InfiniteGallery() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const { config, images } = useGalleryArchive();
  const [gameOpen, setGameOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsHost, setSettingsHost] = useState(null);
  const settingsRef = useRef(null), settingsButton = useRef(null);
  useEffect(() => {
    if (!settingsOpen) return;
    const key = event => { if (event.key === 'Escape') { setSettingsOpen(false); settingsButton.current?.focus(); } };
    const outside = event => { if (!settingsRef.current?.contains(event.target)) setSettingsOpen(false); };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', outside); };
  }, [settingsOpen]);
  const [locateRequest, setLocateRequest] = useState(0);
  const navigationRef = useRef(null);
  const personalImages = images.filter(image => /^(\/original-image-library\/|\/wechat-0051\/|\/wechat-0327\/)/.test(image.url)).slice(0, 220);
  const questGame = useGalleryQuest(personalImages);
  const cloud = useAccountSync(questGame);
  return (
    <main className="infinite-gallery" aria-label="Infinite Gallery">
      <aside className="gallery-settings" ref={settingsRef}>
        <section id="gallery-settings-panel" className="gallery-settings-panel" aria-label="画廊设置" hidden={!settingsOpen}>
          <header><strong>画廊设置</strong><button type="button" aria-label="关闭设置" onClick={() => { setSettingsOpen(false); settingsButton.current?.focus(); }}>×</button></header>
          <div ref={setSettingsHost} className="gallery-settings-controls" />
          <UploadLauncher config={config} />
          {!questGame.active && <div className="game-actions">
            <button type="button" className="game-toggle" onClick={() => { setGameOpen(true); setSettingsOpen(false); }}>普通配对</button>
            <button type="button" className="game-toggle quest-toggle" onClick={() => { questGame.open(); setSettingsOpen(false); }}>画廊闯关</button>
          </div>}
          <SiteVersion />
        </section>
        <button ref={settingsButton} className="gallery-settings-toggle" type="button" aria-label="画廊设置" aria-expanded={settingsOpen} aria-controls="gallery-settings-panel" onClick={() => setSettingsOpen(value => !value)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m9 3-.6 2.3-2 .9-2.2-.6-2 3.5 1.7 1.7v2.4l-1.7 1.7 2 3.5 2.2-.6 2 .9L9 21h6l.6-2.3 2-.9 2.2.6 2-3.5-1.7-1.7v-2.4l1.7-1.7-2-3.5-2.2.6-2-.9L15 3Z"/><circle cx="12" cy="12" r="3.2"/></svg>
        </button>
      </aside>
      <ParticleModes controlsHost={settingsHost} />
      <Canvas
        events={state => ({
          ...createCanvasEvents(state),
          filter: intersections => intersections.filter(hit => !hit.object.userData.galleryCard || hit.object.userData.hitReady).sort((a, b) => {
            const rank = hit => ['target', 'mate', 'picked'].includes(hit.object.userData.questStatus) ? 1 : 0;
            return rank(b) - rank(a) || a.distance - b.distance;
          })
        })}
        camera={{ position: [0, 0, 50], fov: 60, near: 1, far: 500 }}
        dpr={dpr}
        flat
        gl={{ antialias: false, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#000000']} />
        <fog attach="fog" args={['#000000', 120, 320]} />
        <InfiniteField images={images} game={questGame} navigationRef={navigationRef} locateRequest={locateRequest} />
      </Canvas>
      {gameOpen && <MatchGameOverlay images={images} onClose={() => setGameOpen(false)} />}
      {questGame.active && <LiveGalleryQuest game={questGame} cloud={cloud} images={personalImages} controlsHost={settingsHost} navigationRef={navigationRef} onLocate={() => setLocateRequest(value => value + 1)} onHint={() => navigationRef.current?.hint()} />}
    </main>
  );
}

export default InfiniteGallery;

createRoot(document.getElementById('root')).render(<InfiniteGallery />);
