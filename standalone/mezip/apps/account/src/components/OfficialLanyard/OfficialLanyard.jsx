/* eslint-disable react/no-unknown-property */
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, extend, useFrame } from '@react-three/fiber';
import { useGLTF, useTexture, Environment, Lightformer, Html } from '@react-three/drei';
import { BallCollider, CuboidCollider, Physics, RigidBody, useRopeJoint, useSphericalJoint } from '@react-three/rapier';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline';

// replace with your own imports, see the usage snippet for details
import cardGLB from './card.glb';
import lanyard from './lanyard.png';

import * as THREE from 'three';
import './OfficialLanyard.css';

extend({ MeshLineGeometry, MeshLineMaterial });

// 1x1 transparent pixel — lets useTexture be called unconditionally when a
// front/back image isn't supplied.
const BLANK_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// The card model's front face is UV-mapped to the LEFT half of the texture
// atlas and the back face to the RIGHT half (measured from card.glb). Each
// custom image is composited into its own half so the two faces render
// independently, aspect-preserving (no stretching).
const FRONT_UV_RECT = { x: 0, y: 0, w: 0.5, h: 0.755 };
const BACK_UV_RECT = { x: 0.5, y: 0, w: 0.5, h: 0.757 };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const kaiFont = 'KaiTi, STKaiti, DFKai-SB, serif';

// meshline recalculates bounds inside setPoints. During a throw Rapier can
// briefly hand a line an invalid vertex; keep that transient from bubbling up
// as a renderer-wide NaN error while the next finite frame settles the rope.
function ensureStableMeshLineBounds(geometry) {
  if (!geometry || geometry.__stableBoundsPatched) return;
  geometry.__stableBoundsPatched = true;
  const computeSphere = THREE.BufferGeometry.prototype.computeBoundingSphere;
  const computeBox = THREE.BufferGeometry.prototype.computeBoundingBox;
  geometry.computeBoundingSphere = function safeComputeBoundingSphere() {
    const values = this.attributes?.position?.array;
    if (!values || !Array.from(values).every(Number.isFinite)) {
      this.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
      return;
    }
    computeSphere.call(this);
    if (!this.boundingSphere || !Number.isFinite(this.boundingSphere.radius)) {
      this.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    }
  };
  geometry.computeBoundingBox = function safeComputeBoundingBox() {
    const values = this.attributes?.position?.array;
    if (!values || !Array.from(values).every(Number.isFinite)) {
      this.boundingBox = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
      return;
    }
    computeBox.call(this);
    if (!this.boundingBox || ![this.boundingBox.min, this.boundingBox.max].every(point =>
      point && [point.x, point.y, point.z].every(Number.isFinite)
    )) {
      this.boundingBox = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    }
  };
}

const finiteTriplet = value => value && [value.x, value.y, value.z].every(Number.isFinite);
const clampVelocity = (value, limit = 6) => ({
  x: clamp(Number.isFinite(value?.x) ? value.x : 0, -limit, limit),
  y: clamp(Number.isFinite(value?.y) ? value.y : 0, -limit, limit),
  z: clamp(Number.isFinite(value?.z) ? value.z : 0, -limit, limit)
});

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function clipToFace(ctx, rect, W, H) {
  const rx = rect.x * W;
  const ry = rect.y * H;
  const rw = rect.w * W;
  const rh = rect.h * H;
  ctx.save();
  roundedRect(ctx, rx, ry, rw, rh, Math.min(rw, rh) * 0.045);
  ctx.clip();
  return { rx, ry, rw, rh };
}

function drawDivider(ctx, x, y, width, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, width * 0.004);
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.stroke();
  ctx.restore();
}

function drawProfileFront(ctx, rect, W, H, portrait, name, title) {
  const { rx, ry, rw, rh } = clipToFace(ctx, rect, W, H);
  const bg = ctx.createLinearGradient(rx, ry, rx + rw, ry + rh);
  bg.addColorStop(0, '#24160f');
  bg.addColorStop(0.5, '#1a1210');
  bg.addColorStop(1, '#0b0909');
  ctx.fillStyle = bg;
  ctx.fillRect(rx, ry, rw, rh);

  const amber = ctx.createRadialGradient(rx + rw * 0.22, ry + rh * 0.12, 0, rx + rw * 0.3, ry + rh * 0.28, rw * 1.05);
  amber.addColorStop(0, 'rgba(231, 142, 83, 0.42)');
  amber.addColorStop(0.46, 'rgba(110, 48, 22, 0.18)');
  amber.addColorStop(1, 'rgba(9, 8, 8, 0)');
  ctx.fillStyle = amber;
  ctx.fillRect(rx, ry, rw, rh);

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 193, 132, 0.3)';
  ctx.lineWidth = Math.max(2, rw * 0.006);
  ctx.beginPath();
  ctx.arc(rx + rw * 0.18, ry + rh * 0.28, rw * 0.44, Math.PI * 0.74, Math.PI * 1.72);
  ctx.arc(rx + rw * 0.84, ry + rh * 0.68, rw * 0.62, Math.PI * 1.06, Math.PI * 1.98);
  ctx.stroke();
  ctx.restore();

  const safePanelY = ry + rh * 0.135;
  const safePanelH = rh * 0.23;
  const panel = ctx.createLinearGradient(rx, safePanelY, rx, safePanelY + safePanelH);
  panel.addColorStop(0, 'rgba(11, 9, 8, 0.08)');
  panel.addColorStop(1, 'rgba(11, 9, 8, 0.94)');
  ctx.fillStyle = panel;
  ctx.fillRect(rx, safePanelY, rw, safePanelH);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff0d6';
  ctx.shadowColor = 'rgba(0,0,0,0.72)';
  ctx.shadowBlur = rw * 0.022;
  ctx.font = `700 ${Math.round(rw * 0.112)}px ${kaiFont}`;
  ctx.fillText(name || '弓弦影', rx + rw * 0.5, ry + rh * 0.235);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#f4b47e';
  ctx.font = `700 ${Math.round(rw * 0.049)}px ${kaiFont}`;
  ctx.fillText(`Alex · ${title || 'FDE产品经理'}`, rx + rw * 0.5, ry + rh * 0.315);
  drawDivider(ctx, rx + rw * 0.25, ry + rh * 0.37, rw * 0.5, 'rgba(248, 187, 130, 0.8)');

  if (portrait?.width && portrait?.height) {
    const portraitWidth = rw * 1.12;
    const portraitHeight = (portrait.height / portrait.width) * portraitWidth;
    const portraitX = rx + (rw - portraitWidth) / 2;
    const portraitY = ry + rh * 0.38;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.drawImage(portrait, portraitX, portraitY, portraitWidth, portraitHeight);
    const foregroundFade = ctx.createLinearGradient(rx, ry + rh * 0.79, rx, ry + rh);
    foregroundFade.addColorStop(0, 'rgba(10,8,8,0)');
    foregroundFade.addColorStop(1, 'rgba(10,8,8,0.52)');
    ctx.fillStyle = foregroundFade;
    ctx.fillRect(rx, ry + rh * 0.77, rw, rh * 0.23);
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = 'rgba(255, 225, 187, 0.84)';
  ctx.font = `600 ${Math.round(rw * 0.035)}px ${kaiFont}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('FIELD NOTES / 01', rx + rw * 0.08, ry + rh * 0.94);
  ctx.textAlign = 'right';
  ctx.fillText('FDE', rx + rw * 0.92, ry + rh * 0.94);
  ctx.restore();

  ctx.restore();
}

function drawProfileBack(ctx, rect, W, H, name, title) {
  const { rx, ry, rw, rh } = clipToFace(ctx, rect, W, H);
  const bg = ctx.createLinearGradient(rx, ry, rx + rw, ry + rh);
  bg.addColorStop(0, '#15100e');
  bg.addColorStop(0.48, '#08090a');
  bg.addColorStop(1, '#20130d');
  ctx.fillStyle = bg;
  ctx.fillRect(rx, ry, rw, rh);

  const glow = ctx.createRadialGradient(rx + rw * 0.88, ry + rh * 0.12, 0, rx + rw * 0.88, ry + rh * 0.12, rw * 0.92);
  glow.addColorStop(0, 'rgba(230, 155, 91, 0.23)');
  glow.addColorStop(0.55, 'rgba(117, 66, 35, 0.08)');
  glow.addColorStop(1, 'rgba(8, 8, 9, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(rx, ry, rw, rh);

  // A restrained grain field keeps the back from looking like a flat poster.
  ctx.save();
  ctx.fillStyle = 'rgba(255, 213, 171, 0.13)';
  for (let i = 0; i < 82; i += 1) {
    const px = rx + (((i * 37) % 101) / 101) * rw;
    const py = ry + (((i * 53) % 97) / 97) * rh;
    const size = Math.max(1, rw * (i % 5 === 0 ? 0.006 : 0.003));
    ctx.fillRect(px, py, size, size);
  }
  ctx.restore();

  const padding = rw * 0.09;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#e5b982';
  ctx.font = `700 ${Math.round(rw * 0.035)}px ${kaiFont}`;
  ctx.fillText('IDENTITY / 01', rx + padding, ry + rh * 0.13);

  ctx.fillStyle = '#fff2dc';
  ctx.font = `700 ${Math.round(rw * 0.105)}px ${kaiFont}`;
  ctx.fillText('Alex', rx + padding, ry + rh * 0.225);
  ctx.fillStyle = '#f6d5b0';
  ctx.font = `700 ${Math.round(rw * 0.053)}px ${kaiFont}`;
  ctx.fillText(`${name || '弓弦影'} · ${title || 'FDE产品经理'}`, rx + padding, ry + rh * 0.285);
  ctx.fillStyle = '#b9a089';
  ctx.font = `600 ${Math.round(rw * 0.034)}px ${kaiFont}`;
  ctx.fillText('FDE PRODUCT · BORN 中国', rx + padding, ry + rh * 0.335);
  drawDivider(ctx, rx + padding, ry + rh * 0.38, rw - padding * 2, 'rgba(238, 200, 158, 0.42)');

  const sections = [
    ['ABOUT / 02', '观察行为、注意力与决策。'],
    ['DESIGN × TECHNOLOGY / 03', '探索产品与技术之间。'],
    ['OFF HOURS / 04', '咖啡、写字、乱涂和小工具。']
  ];
  const sectionStart = 0.455;
  const sectionStep = 0.158;
  sections.forEach(([label, copy], index) => {
    const y = ry + rh * (sectionStart + sectionStep * index);
    ctx.fillStyle = '#e5b982';
    ctx.font = `700 ${Math.round(rw * 0.031)}px ${kaiFont}`;
    ctx.fillText(label, rx + padding, y);
    ctx.fillStyle = '#f5e9dc';
    ctx.font = `700 ${Math.round(rw * 0.049)}px ${kaiFont}`;
    ctx.fillText(copy, rx + padding, y + rh * 0.055);
    if (index < sections.length - 1) {
      drawDivider(ctx, rx + padding, y + rh * 0.095, rw - padding * 2, 'rgba(238, 200, 158, 0.28)');
    }
  });

  ctx.fillStyle = 'rgba(255, 226, 191, 0.86)';
  ctx.font = `600 ${Math.round(rw * 0.03)}px ${kaiFont}`;
  ctx.textAlign = 'center';
  ctx.fillText('这是公开 Creator 介绍', rx + rw * 0.5, ry + rh * 0.955);
  ctx.restore();
}

export default function OfficialLanyard({
  position = [0, 0, 30],
  gravity = [0, -40, 0],
  fov = 20,
  transparent = true,
  frontImage = null,
  backImage = null,
  imageFit = 'cover',
  lanyardImage = null,
  lanyardWidth = 1,
  cornerDragOnly = true,
  profileName = null,
  profileTitle = null,
  cardContent = null,
  htmlDistanceFactor = 10,
  cardRotation = [0, 0, 0],
  cards = null
}) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [isCompact, setIsCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 560);
  const [interactionState, setInteractionState] = useState('rest');

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      setIsCompact(window.innerWidth <= 560);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keep the original single-band API intact, while allowing the composed
  // page to mount several official bands in one shared physics world. A
  // shared Canvas is important here: every tag remains draggable across the
  // three visual zones instead of getting clipped by a separate canvas.
  const bandEntries = Array.isArray(cards) && cards.length
    ? cards
    : [{
        id: 'default',
        frontImage,
        backImage,
        imageFit,
        lanyardImage,
        lanyardWidth,
        cornerDragOnly,
        profileName,
        profileTitle,
        cardContent,
        htmlDistanceFactor,
        cardRotation,
        worldOffset: [0, 0, 0]
      }];

  return (
    <div className="lanyard-wrapper" data-lanyard="official" data-card-interaction={interactionState}>
      <Canvas
        camera={{ position: position, fov: fov }}
        dpr={[1, isMobile ? 1.5 : 2]}
        gl={{ alpha: transparent }}
        onCreated={({ gl }) => gl.setClearColor(new THREE.Color(0x000000), transparent ? 0 : 1)}
      >
        <ambientLight intensity={Math.PI} />
        <Physics gravity={gravity} timeStep={isMobile ? 1 / 30 : 1 / 60}>
          {bandEntries.map((entry, index) => (
            <Band
              key={entry.id ?? index}
              isMobile={isMobile}
              frontImage={entry.frontImage ?? null}
              backImage={entry.backImage ?? null}
              imageFit={entry.imageFit ?? imageFit}
              lanyardImage={entry.lanyardImage ?? null}
              lanyardWidth={entry.lanyardWidth ?? lanyardWidth}
              cornerDragOnly={entry.cornerDragOnly ?? cornerDragOnly}
              onInteractionStateChange={entry.onInteractionStateChange ?? setInteractionState}
              profileName={entry.profileName ?? null}
              profileTitle={entry.profileTitle ?? null}
              cardContent={entry.cardContent ?? null}
              htmlDistanceFactor={entry.htmlDistanceFactor ?? htmlDistanceFactor}
              cardRotation={entry.cardRotation ?? cardRotation}
              worldOffset={isCompact
                ? (entry.compactWorldOffset ?? entry.worldOffset ?? [0, 0, 0])
                : (entry.worldOffset ?? [0, 0, 0])}
              compact={isCompact}
            />
          ))}
        </Physics>
        <Environment blur={0.75}>
          <Lightformer
            intensity={2}
            color="white"
            position={[0, -1, 5]}
            rotation={[0, 0, Math.PI / 3]}
            scale={[100, 0.1, 1]}
          />
          <Lightformer
            intensity={3}
            color="white"
            position={[-1, -1, 1]}
            rotation={[0, 0, Math.PI / 3]}
            scale={[100, 0.1, 1]}
          />
          <Lightformer
            intensity={3}
            color="white"
            position={[1, 1, 1]}
            rotation={[0, 0, Math.PI / 3]}
            scale={[100, 0.1, 1]}
          />
          <Lightformer
            intensity={10}
            color="white"
            position={[-10, 0, 14]}
            rotation={[0, Math.PI / 2, Math.PI / 3]}
            scale={[100, 10, 1]}
          />
        </Environment>
      </Canvas>
    </div>
  );
}
function Band({
  maxSpeed = 50,
  minSpeed = 0,
  isMobile = false,
  frontImage = null,
  backImage = null,
  imageFit = 'cover',
  lanyardImage = null,
  lanyardWidth = 1,
  cornerDragOnly = true,
  onInteractionStateChange,
  profileName = null,
  profileTitle = null,
  cardContent = null,
  htmlDistanceFactor = 10,
  cardRotation = [0, 0, 0],
  worldOffset = [0, 0, 0],
  compact = false
}) {
  const band = useRef(),
    fixed = useRef(),
    j1 = useRef(),
    j2 = useRef(),
    j3 = useRef(),
    card = useRef(),
    visualCard = useRef(),
    cardMaterial = useRef();
  const vec = new THREE.Vector3(),
    ang = new THREE.Vector3(),
    rot = new THREE.Vector3(),
    dir = new THREE.Vector3();
  const bodyDefaults = useMemo(
    () => ({
      fixed: [0, 0, 0],
      j1: [0.5, 0, 0],
      j2: [1, 0, 0],
      j3: [1.5, 0, 0],
      card: [2, 0, 0]
    }),
    []
  );
  const segmentProps = { type: 'dynamic', canSleep: true, colliders: false, angularDamping: 4, linearDamping: 4 };
  const { nodes, materials } = useGLTF(cardGLB);
  const texture = useTexture(lanyardImage || lanyard);
  // useTexture must be called unconditionally; use a blank pixel when an image
  // isn't supplied for a given face, then skip compositing it below.
  const frontTex = useTexture(frontImage || BLANK_PIXEL);
  const backTex = useTexture(backImage || BLANK_PIXEL);

  // Composite the front/back images into the card's texture atlas (front = left
  // half, back = right half). The official GLB, clip, rope, joints and physics
  // remain untouched; only the two printed faces are personalised here.
  const cardMap = useMemo(() => {
    const baseMap = materials.base.map;
    if (!frontImage && !backImage && !profileName) return baseMap;

    const baseImg = baseMap.image;
    const W = baseImg.width;
    const H = baseImg.height;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return baseMap;
    // Keep the original baked atlas for the card edges and any untouched face.
    ctx.drawImage(baseImg, 0, 0, W, H);

    const drawFitted = (img, rect) => {
      const rx = rect.x * W;
      const ry = rect.y * H;
      const rw = rect.w * W;
      const rh = rect.h * H;
      const pick = imageFit === 'contain' ? Math.min : Math.max;
      const scale = pick(rw / img.width, rh / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = rx + (rw - dw) / 2;
      const dy = ry + (rh - dh) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
      ctx.clip();
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
    };

    if (profileName) {
      drawProfileFront(ctx, FRONT_UV_RECT, W, H, frontTex.image, profileName, profileTitle);
      drawProfileBack(ctx, BACK_UV_RECT, W, H, profileName, profileTitle);
    } else {
      if (frontImage && frontTex.image) drawFitted(frontTex.image, FRONT_UV_RECT);
      if (backImage && backTex.image) drawFitted(backTex.image, BACK_UV_RECT);
    }

    const composite = new THREE.CanvasTexture(canvas);
    composite.colorSpace = THREE.SRGBColorSpace;
    composite.flipY = baseMap.flipY;
    composite.anisotropy = 16;
    composite.needsUpdate = true;
    return composite;
  }, [frontImage, backImage, imageFit, frontTex, backTex, materials.base.map, profileName, profileTitle]);
  const [curve] = useState(
    () =>
      new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()])
  );
  const initialRopePoints = useMemo(
    () => [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.5, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1.5, 0, 0)
    ],
    []
  );
  const [dragged, drag] = useState(false);
  const [hovered, hover] = useState(false);
  const [cornerHovered, setCornerHovered] = useState(false);
  const [faceSide, setFaceSide] = useState('front');
  const faceSideRef = useRef('front');
  const frameState = useRef(null);
  const domDrag = useRef({ active: false, clientX: 0, clientY: 0, pointerId: null });
  const domEndListener = useRef(null);
  const domMoveListener = useRef(null);
  const tiltRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const normalTint = useMemo(() => new THREE.Color(1, 1, 1), []);
  const hoverTint = useMemo(() => new THREE.Color(0.74, 0.77, 0.86), []);

  const repairBody = (ref, localPosition) => {
    const body = ref.current;
    if (!body) return false;
    const translation = body.translation?.();
    if (!finiteTriplet(translation)) {
      body.setTranslation?.({
        x: (worldOffset[0] ?? 0) + localPosition[0],
        y: 5.74 + (worldOffset[1] ?? 0) + localPosition[1],
        z: (worldOffset[2] ?? 0) + localPosition[2]
      }, true);
      body.setLinvel?.({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel?.({ x: 0, y: 0, z: 0 }, true);
      return false;
    }
    const linear = body.linvel?.();
    const angular = body.angvel?.();
    if (linear && !finiteTriplet(linear)) body.setLinvel?.({ x: 0, y: 0, z: 0 }, true);
    if (angular && !finiteTriplet(angular)) body.setAngvel?.({ x: 0, y: 0, z: 0 }, true);
    return true;
  };

  const capCardVelocity = () => {
    const body = card.current;
    if (!body) return;
    const linear = clampVelocity(body.linvel?.(), 4.5);
    const angular = clampVelocity(body.angvel?.(), 5);
    body.setLinvel?.(linear, true);
    body.setAngvel?.(angular, true);
  };

  const screenToWorld = (clientX, clientY) => {
    const state = frameState.current;
    if (!state?.gl?.domElement) return null;
    const bounds = state.gl.domElement.getBoundingClientRect();
    const ndcX = ((clientX - bounds.left) / bounds.width) * 2 - 1;
    const ndcY = -((clientY - bounds.top) / bounds.height) * 2 + 1;
    vec.set(ndcX, ndcY, 0.5).unproject(state.camera);
    dir.copy(vec).sub(state.camera.position).normalize();
    vec.add(dir.multiplyScalar(state.camera.position.length()));
    return vec.clone();
  };

  const dragApi = useMemo(
    () => ({
      begin(clientX, clientY, pointerId = null) {
        const point = screenToWorld(clientX, clientY);
        if (domDrag.current.active) return true;
        if (!point || !card.current) return false;
        if (domEndListener.current) {
          window.removeEventListener('pointerup', domEndListener.current, true);
          window.removeEventListener('pointercancel', domEndListener.current, true);
          window.removeEventListener('mouseup', domEndListener.current, true);
        }
        if (domMoveListener.current) {
          window.removeEventListener('pointermove', domMoveListener.current, true);
          window.removeEventListener('mousemove', domMoveListener.current, true);
        }
        domMoveListener.current = event => {
          if (!domDrag.current.active) return;
          dragApi.move(event.clientX, event.clientY);
        };
        domEndListener.current = () => {
          domDrag.current.active = false;
          domDrag.current.pointerId = null;
          capCardVelocity();
          drag(false);
          window.removeEventListener('pointerup', domEndListener.current, true);
          window.removeEventListener('pointercancel', domEndListener.current, true);
          window.removeEventListener('mouseup', domEndListener.current, true);
          if (domMoveListener.current) {
            window.removeEventListener('pointermove', domMoveListener.current, true);
            window.removeEventListener('mousemove', domMoveListener.current, true);
            domMoveListener.current = null;
          }
          domEndListener.current = null;
        };
        window.addEventListener('pointermove', domMoveListener.current, true);
        window.addEventListener('mousemove', domMoveListener.current, true);
        window.addEventListener('pointerup', domEndListener.current, true);
        window.addEventListener('pointercancel', domEndListener.current, true);
        window.addEventListener('mouseup', domEndListener.current, true);
        domDrag.current = { active: true, clientX, clientY, pointerId };
        [card, j1, j2, j3, fixed].forEach(ref => ref.current?.wakeUp());
        drag(new THREE.Vector3().copy(point).sub(card.current.translation()));
        return true;
      },
      move(clientX, clientY) {
        if (!domDrag.current.active) return;
        domDrag.current.clientX = clientX;
        domDrag.current.clientY = clientY;
      },
      end() {
        if (domEndListener.current) {
          window.removeEventListener('pointerup', domEndListener.current, true);
          window.removeEventListener('pointercancel', domEndListener.current, true);
          window.removeEventListener('mouseup', domEndListener.current, true);
          domEndListener.current = null;
        }
        if (domMoveListener.current) {
          window.removeEventListener('pointermove', domMoveListener.current, true);
          window.removeEventListener('mousemove', domMoveListener.current, true);
          domMoveListener.current = null;
        }
        domDrag.current.active = false;
        domDrag.current.pointerId = null;
        capCardVelocity();
        drag(false);
      },
      cancel() {
        if (domEndListener.current) {
          window.removeEventListener('pointerup', domEndListener.current, true);
          window.removeEventListener('pointercancel', domEndListener.current, true);
          window.removeEventListener('mouseup', domEndListener.current, true);
          domEndListener.current = null;
        }
        if (domMoveListener.current) {
          window.removeEventListener('pointermove', domMoveListener.current, true);
          window.removeEventListener('mousemove', domMoveListener.current, true);
          domMoveListener.current = null;
        }
        domDrag.current.active = false;
        domDrag.current.pointerId = null;
        capCardVelocity();
        drag(false);
      }
    }),
    []
  );

  const localCardUv = uv => {
    if (!uv) return null;
    const rect = uv.x < 0.5 ? FRONT_UV_RECT : BACK_UV_RECT;
    return {
      x: clamp((uv.x - rect.x) / rect.w, 0, 1),
      y: clamp((uv.y - rect.y) / rect.h, 0, 1)
    };
  };

  const isCorner = event => {
    if (!cornerDragOnly) return true;
    const uv = localCardUv(event.uv);
    if (!uv) return false;
    const edgeX = uv.x <= 0.16 || uv.x >= 0.84;
    const edgeY = uv.y <= 0.16 || uv.y >= 0.84;
    return edgeX && edgeY;
  };

  const resetHoverTilt = () => {
    tiltRef.current.targetX = 0;
    tiltRef.current.targetY = 0;
  };

  const updateHoverTilt = event => {
    const uv = localCardUv(event.uv);
    if (!uv || dragged) return;
    // Keep the original card's gentle, directional hover response while the
    // actual rope and body remain the official Rapier simulation.
    tiltRef.current.targetX = (0.5 - uv.y) * 0.13;
    tiltRef.current.targetY = (uv.x - 0.5) * 0.18;
  };

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1]);
  useSphericalJoint(j3, card, [
    [0, 0, 0],
    [0, 1.5, 0]
  ]);

  useEffect(() => {
    if (hovered || dragged) {
      document.body.style.cursor = dragged ? 'grabbing' : cornerHovered ? 'grab' : 'default';
      return () => void (document.body.style.cursor = 'auto');
    }
  }, [hovered, cornerHovered, dragged]);

  useEffect(() => {
    onInteractionStateChange?.(dragged ? 'dragging' : hovered ? 'hovering' : 'rest');
  }, [dragged, hovered, onInteractionStateChange]);

  useFrame((state, delta) => {
    frameState.current = state;
    const bodiesReady = repairBody(fixed, bodyDefaults.fixed)
      && repairBody(j1, bodyDefaults.j1)
      && repairBody(j2, bodyDefaults.j2)
      && repairBody(j3, bodyDefaults.j3)
      && repairBody(card, bodyDefaults.card);
    if (!bodiesReady) {
      drag(false);
      domDrag.current.active = false;
    }
    if (card.current) {
      const bodyRotation = card.current.rotation();
      const bodyQuaternion = new THREE.Quaternion(
        bodyRotation.x,
        bodyRotation.y,
        bodyRotation.z,
        bodyRotation.w
      );
      const cardNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(bodyQuaternion).normalize();
      const cardPosition = card.current.translation();
      const toCamera = new THREE.Vector3(
        state.camera.position.x - cardPosition.x,
        state.camera.position.y - cardPosition.y,
        state.camera.position.z - cardPosition.z
      ).normalize();
      const facing = cardNormal.dot(toCamera);
      if (Math.abs(facing) > 0.12) {
        const nextFace = facing >= 0 ? 'front' : 'back';
        if (nextFace !== faceSideRef.current) {
          faceSideRef.current = nextFace;
          setFaceSide(nextFace);
        }
      }
    }
    if (dragged && bodiesReady) {
      if (domDrag.current.active) {
        const domPoint = screenToWorld(domDrag.current.clientX, domDrag.current.clientY);
        if (domPoint && finiteTriplet(domPoint)) vec.copy(domPoint);
      } else {
        vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
        dir.copy(vec).sub(state.camera.position).normalize();
        vec.add(dir.multiplyScalar(state.camera.position.length()));
      }
      [card, j1, j2, j3, fixed].forEach(ref => ref.current?.wakeUp());
      const nextTranslation = {
        // Keep the throw wide enough to cross all three zones, but bounded so
        // the rope joint never receives an unphysical infinite stretch.
        x: clamp(vec.x - dragged.x, -8.5, 9.5),
        y: clamp(vec.y - dragged.y, 0.8, 8.2),
        z: clamp(vec.z - dragged.z, -1.25, 1.25)
      };
      card.current?.setNextKinematicTranslation(nextTranslation);
    }
    // Rapier mounts each band's joints over a few frames. Do not feed an
    // uninitialised translation into MeshLineGeometry: with three bands that
    // race is more visible and would produce NaN bounding-box warnings.
    if (fixed.current && j1.current && j2.current && j3.current && card.current && band.current) {
      const jointsReady = [j1, j2, j3, fixed, card].every(ref => {
        const translation = ref.current?.translation?.();
        return translation && [translation.x, translation.y, translation.z].every(Number.isFinite);
      });
      if (jointsReady) {
        ensureStableMeshLineBounds(band.current.geometry);
        [j1, j2].forEach(ref => {
          if (!ref.current.lerped) ref.current.lerped = new THREE.Vector3().copy(ref.current.translation());
          const clampedDistance = Math.max(0.1, Math.min(1, ref.current.lerped.distanceTo(ref.current.translation())));
          ref.current.lerped.lerp(
            ref.current.translation(),
            delta * (minSpeed + clampedDistance * (maxSpeed - minSpeed))
          );
        });
        curve.points[0].copy(j3.current.translation());
        curve.points[1].copy(j2.current.lerped);
        curve.points[2].copy(j1.current.lerped);
        curve.points[3].copy(fixed.current.translation());
        const ropePoints = curve.getPoints(isMobile ? 16 : 32);
        if (ropePoints.every(point => [point.x, point.y, point.z].every(Number.isFinite))) {
          band.current.geometry.setPoints(ropePoints);
        }
      }
      ang.copy(card.current.angvel());
      rot.copy(card.current.rotation());
      card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z });
    }

    const tilt = tiltRef.current;
    const smooth = 1 - Math.exp(-delta * 11);
    tilt.x += (tilt.targetX - tilt.x) * smooth;
    tilt.y += (tilt.targetY - tilt.y) * smooth;
    if (visualCard.current) {
      visualCard.current.rotation.x = tilt.x;
      visualCard.current.rotation.y = tilt.y;
    }
    if (cardMaterial.current) {
      cardMaterial.current.color.lerp(hovered && !dragged ? hoverTint : normalTint, smooth);
    }
  });

  curve.curveType = 'chordal';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

  return (
    <>
      <group position={[worldOffset[0] ?? 0, 5.74 + (worldOffset[1] ?? 0), worldOffset[2] ?? 0]}>
        <RigidBody ref={fixed} {...segmentProps} type="fixed" />
        <RigidBody position={[0.5, 0, 0]} ref={j1} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1, 0, 0]} ref={j2} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1.5, 0, 0]} ref={j3} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody
          position={[2, 0, 0]}
          rotation={cardRotation}
          ref={card}
          {...segmentProps}
          type={dragged ? 'kinematicPosition' : 'dynamic'}
        >
          {/* Bands share one physics world, but cards must pass through each
              other while being thrown between zones. A sensor keeps the
              official rope simulation independent and avoids collision
              impulses destabilising a neighbouring tag. */}
          <CuboidCollider args={[0.8, 1.125, 0.01]} sensor />
          <group
            ref={visualCard}
            scale={compact ? 1.65 : 2.25}
            position={[0, -1.2, -0.05]}
            onPointerOver={event => {
              hover(true);
              setCornerHovered(isCorner(event));
              updateHoverTilt(event);
            }}
            onPointerMove={event => {
              setCornerHovered(isCorner(event));
              updateHoverTilt(event);
            }}
            onPointerOut={() => {
              hover(false);
              setCornerHovered(false);
              resetHoverTilt();
            }}
            onPointerCancel={event => {
              if (!dragged) return;
              event.target.releasePointerCapture?.(event.pointerId);
              drag(false);
            }}
            onPointerUp={event => {
              if (!dragged) return;
              event.target.releasePointerCapture?.(event.pointerId);
              drag(false);
            }}
            onPointerDown={event => {
              if (!isCorner(event)) return;
              event.stopPropagation();
              event.target.setPointerCapture?.(event.pointerId);
              drag(new THREE.Vector3().copy(event.point).sub(vec.copy(card.current.translation())));
            }}
          >
            <mesh geometry={nodes.card.geometry}>
              <meshPhysicalMaterial
                ref={cardMaterial}
                map={cardMap}
                map-anisotropy={16}
                clearcoat={isMobile ? 0 : 1}
                clearcoatRoughness={0.15}
                roughness={0.9}
                metalness={0.8}
                transparent={Boolean(cardContent)}
                opacity={cardContent ? 0 : 1}
                depthWrite={!cardContent}
              />
            </mesh>
            {cardContent && (
              <Html
                transform
                distanceFactor={htmlDistanceFactor}
                position={[0, 0, 0.035]}
                rotation={[0, Math.PI, 0]}
                zIndexRange={[2, 2]}
                className="lanyard-card-html"
              >
                {typeof cardContent === 'function'
                  ? cardContent({ dragApi, faceSide, isDragging: dragged })
                  : cardContent}
              </Html>
            )}
            <mesh geometry={nodes.clip.geometry} material={materials.metal} material-roughness={0.3} />
            <mesh geometry={nodes.clamp.geometry} material={materials.metal} />
          </group>
        </RigidBody>
      </group>
      <mesh ref={band} frustumCulled={false}>
        <meshLineGeometry points={initialRopePoints} />
        <meshLineMaterial
          color="white"
          depthTest={false}
          resolution={isMobile ? [1000, 2000] : [1000, 1000]}
          useMap
          map={texture}
          repeat={[-4, 1]}
          lineWidth={lanyardWidth}
        />
      </mesh>
    </>
  );
}
