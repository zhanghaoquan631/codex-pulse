import * as THREE from 'three';
import { WEATHER } from './weather.mjs';
import { groundHeight } from './landforms.mjs';

const MAX_RAIN = 120;
const RAIN_RADIUS = 20;
const PROBES_PER_FRAME = 6;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const copyBackground = background => background?.isColor ? background.clone() : background;

/** Weather presentation only. Game rules and timers remain in AdventureGame.
 * update(weatherState, player, level, world, dt, active) is safe across world
 * rebuilds. A null weatherState restores the current world's original palette.
 */
export class AdventureWeather {
  constructor(scene, { flashElement = null } = {}) {
    this.scene = scene;
    this.flashElement = flashElement;
    this.weatherId = null;
    this.rainCount = 0;
    this.rainGroup = new THREE.Group();
    this.rainGroup.name = 'adventure-weather';
    this.rainGroup.visible = false;
    scene.add(this.rainGroup);

    this._positions = new Float32Array(MAX_RAIN * 6);
    this._geometry = new THREE.BufferGeometry();
    this._geometry.setAttribute('position', new THREE.BufferAttribute(this._positions, 3).setUsage(THREE.DynamicDrawUsage));
    this._geometry.setDrawRange(0, 0);
    this._material = new THREE.LineBasicMaterial({ color: 0x6d8795, transparent: true, opacity: .25, depthWrite: false, fog: true });
    this._rain = new THREE.LineSegments(this._geometry, this._material);
    this._rain.name = 'pencil-rain';
    this._rain.frustumCulled = false;
    this.rainGroup.add(this._rain);

    this._drops = Array.from({ length: MAX_RAIN }, () => ({ x: 0, z: 0, y: 0, floor: 0, top: 0, valid: false, phase: Math.random() }));
    this._ray = new THREE.Raycaster();
    this._rayDirection = new THREE.Vector3(0, -1, 0);
    this._rayOrigin = new THREE.Vector3();
    this._root = undefined;
    this._baseline = null;
    this._roofs = [];
    this._lights = [];
    this._rainAmount = 0;
    this._wind = 0;
    this._lightFactor = 1;
    this._nextLightning = 14 + Math.random() * 12;
    this._lightningPhase = -1;
    this._restored = true;
    this._disposed = false;
    this._targetSky = new THREE.Color();
    this._targetFog = new THREE.Color();
    this._motionQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this._reducedMotion = !!this._motionQuery?.matches;
    this._onMotionChange = event => {
      this._reducedMotion = !!event.matches;
      if (this._reducedMotion) { this._lightningPhase = -1; this._setFlash(0); }
    };
    this._motionQuery?.addEventListener?.('change', this._onMotionChange);
    this._setFlash(0);
  }

  _setFlash(amount) {
    // Optional overlay remains deliberately dim; no rapid double flashes.
    if (this.flashElement) this.flashElement.style.opacity = String(clamp(amount, 0, .025));
  }

  _adoptWorld(world) {
    const root = world?.root || null;
    if (root === this._root) return;
    for (const { light, intensity } of this._lights) light.intensity = intensity;
    this._root = root;
    this._baseline = {
      background: copyBackground(this.scene.background),
      fog: this.scene.fog?.clone() || null,
    };
    this._lights = [];
    this._roofs = [];
    root?.updateMatrixWorld(true);
    root?.traverse(object => {
      if (object.isLight) this._lights.push({ light: object, intensity: object.intensity });
      if (!object.isMesh || !object.geometry) return;
      for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.every(material => !material || material.visible === false || (material.transparent && material.opacity < .08))) return;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      if (!object.geometry.boundingBox) return;
      const bounds = object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld);
      // Static bounds are a broad phase for roof/ground probes, not collision.
      this._roofs.push({ object, bounds });
    });
    for (const drop of this._drops) drop.valid = false;
    this._rainAmount = 0;
    this._wind = 0;
    this._lightFactor = 1;
    this._lightningPhase = -1;
    this._nextLightning = 14 + Math.random() * 12;
    this._restored = false;
    this._setFlash(0);
  }

  _restore() {
    if (!this._restored && this._baseline) {
      this.scene.background = copyBackground(this._baseline.background);
      this.scene.fog = this._baseline.fog?.clone() || null;
      for (const { light, intensity } of this._lights) light.intensity = intensity;
    }
    this._restored = true;
    this.weatherId = null;
    this.rainCount = 0;
    this.rainGroup.visible = false;
    this._geometry.setDrawRange(0, 0);
    this._rainAmount = 0;
    this._lightFactor = 1;
    this._lightningPhase = -1;
    this._setFlash(0);
  }

  _roofHeight(x, z, level, player) {
    const ground = finite(groundHeight(level, x, z));
    const candidates = [];
    for (const { object, bounds } of this._roofs) {
      if (object.visible && x >= bounds.min.x - .02 && x <= bounds.max.x + .02 && z >= bounds.min.z - .02 && z <= bounds.max.z + .02) candidates.push(object);
    }
    this._rayOrigin.set(x, Math.max(ground, finite(player?.y)) + 90, z);
    this._ray.set(this._rayOrigin, this._rayDirection);
    this._ray.near = 0;
    this._ray.far = 180;
    // Only a few newly spawned columns are probed each frame. Every later drop
    // in that column reuses its roof height until the player moves it elsewhere.
    const first = this._ray.intersectObjects(candidates, false)[0];
    return first ? Math.max(ground, first.point.y + .06) : ground;
  }

  _newColumn(drop, player, level) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * (RAIN_RADIUS - 1);
    drop.x = finite(player.x) + Math.cos(angle) * radius;
    drop.z = finite(player.z) + Math.sin(angle) * radius;
    drop.floor = this._roofHeight(drop.x, drop.z, level, player);
    const playerGround = finite(groundHeight(level, finite(player.x), finite(player.z)));
    drop.top = Math.max(drop.floor + 8, playerGround + finite(player.y) + 15);
    drop.y = drop.floor + .5 + Math.random() * Math.max(1, drop.top - drop.floor - .5);
    drop.valid = true;
  }

  _updateRain(player, level, dt) {
    const desired = clamp(Math.round(this._rainAmount * MAX_RAIN), 0, MAX_RAIN);
    let probes = 0, count = 0;
    const length = .5 + this._rainAmount * .65;
    const velocity = 10 + this._rainAmount * 9;
    for (let index = 0; index < desired; index++) {
      const drop = this._drops[index];
      if (drop.valid && Math.hypot(drop.x - finite(player.x), drop.z - finite(player.z)) > RAIN_RADIUS) drop.valid = false;
      if (!drop.valid) {
        if (probes >= PROBES_PER_FRAME) continue;
        this._newColumn(drop, player, level);
        probes++;
      }
      drop.y -= dt * velocity * (.85 + drop.phase * .3);
      if (drop.y <= drop.floor + .04) drop.y = drop.top;
      const bottom = Math.max(drop.floor + .035, drop.y - length);
      const offset = count * 6;
      // A short slant conveys wind without letting entire rain columns drift
      // through a previously probed roof. The bottom always stops at its roof.
      this._positions[offset] = drop.x;
      this._positions[offset + 1] = bottom;
      this._positions[offset + 2] = drop.z;
      this._positions[offset + 3] = drop.x - this._wind * .16;
      this._positions[offset + 4] = drop.y;
      this._positions[offset + 5] = drop.z - this._wind * .05;
      count++;
    }
    this.rainCount = count;
    this.rainGroup.visible = count > 0;
    this._material.opacity = .17 + this._rainAmount * .17;
    this._geometry.setDrawRange(0, count * 2);
    this._geometry.attributes.position.needsUpdate = true;
  }

  _updateLightning(definition, dt) {
    if (!definition.visual.lightning || this._reducedMotion) {
      this._lightningPhase = -1;
      this._nextLightning = Math.max(12, this._nextLightning);
      return 0;
    }
    if (this._lightningPhase >= 0) {
      this._lightningPhase += dt;
      if (this._lightningPhase >= 1.15) { this._lightningPhase = -1; return 0; }
      return Math.sin(this._lightningPhase / 1.15 * Math.PI) ** 2;
    }
    this._nextLightning -= dt;
    if (this._nextLightning <= 0) {
      this._lightningPhase = 0;
      this._nextLightning = 14 + Math.random() * 14;
    }
    return 0;
  }

  update(weatherState, player, level, world, dt = 0, active = true) {
    if (this._disposed) return;
    this._adoptWorld(world);
    if (!weatherState || !player || !level || !this._root) { this._restore(); return; }
    const definition = Object.hasOwn(WEATHER, weatherState.id) ? WEATHER[weatherState.id] : WEATHER.clear;
    this.weatherId = definition.id;
    this._restored = false;
    if (!active) {
      this._setFlash(0);
      for (const { light, intensity } of this._lights) light.intensity = intensity * this._lightFactor;
      return; // Rain positions, colour transition and lightning clocks freeze.
    }
    const seconds = clamp(finite(dt), 0, .1);
    const alpha = 1 - Math.exp(-seconds * 1.55);
    const visual = definition.visual;
    const baselineSky = this._baseline.background?.isColor ? this._baseline.background : new THREE.Color(level.art?.sky ?? 0xf1ecdf);
    this._targetSky.copy(baselineSky).lerp(new THREE.Color(visual.sky), definition.id === 'clear' ? 0 : .62);
    this._targetFog.copy(baselineSky).lerp(new THREE.Color(visual.fogColor), definition.id === 'clear' ? 0 : .62);
    if (!this.scene.background?.isColor) this.scene.background = baselineSky.clone();
    this.scene.background.lerp(this._targetSky, alpha);
    if (!this.scene.fog?.isFog) this.scene.fog = new THREE.Fog(this._targetFog, 68, 145);
    const near = definition.id === 'clear' ? finite(this._baseline.fog?.near, 68) : Math.max(10, visual.fogNear);
    const far = definition.id === 'clear' ? finite(this._baseline.fog?.far, 145) : Math.max(near + 20, visual.fogFar);
    this.scene.fog.color.lerp(this._targetFog, alpha);
    this.scene.fog.near += (near - this.scene.fog.near) * alpha;
    this.scene.fog.far += (far - this.scene.fog.far) * alpha;
    this._rainAmount += (visual.rainAmount - this._rainAmount) * alpha;
    this._wind += (visual.wind - this._wind) * alpha;
    this._lightFactor += (visual.lightIntensity - this._lightFactor) * alpha;
    const lightning = this._updateLightning(definition, seconds);
    for (const { light, intensity } of this._lights) light.intensity = intensity * this._lightFactor * (1 + lightning * .07);
    this._setFlash(lightning * .02);
    this._updateRain(player, level, seconds);
  }

  dispose() {
    if (this._disposed) return;
    this._restore();
    this._disposed = true;
    this._motionQuery?.removeEventListener?.('change', this._onMotionChange);
    this.scene.remove(this.rainGroup);
    this._geometry.dispose();
    this._material.dispose();
    this._roofs.length = 0;
    this._lights.length = 0;
  }
}
