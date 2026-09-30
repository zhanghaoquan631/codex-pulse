import * as THREE from './vendor/three.module.js';

/**
 * Self-contained weather VFX; world units are metres.
 * No DOM, external assets, scene lights, fog, or renderer settings are changed.
 *
 * const weather = new WeatherEffects({ scene, camera });
 * weather.setPreset('snow');
 * weather.update(dt, { position: camera.position, indoors: false, hour: 16.5 });
 *
 * `position` optionally anchors precipitation. The sky always follows the camera.
 * `sunDirection` is a unit vector available for the application's own sun light.
 * Rain, snow, and clouds each use at most one draw call; only rain OR snow is shown.
 */
export const WEATHER_PRESETS = Object.freeze({
  sunny: Object.freeze({ label: '晴朗', temperature: 24, skyTop: '#79b6d3', skyBottom: '#e1edf0', fog: '#c5dce0', sunColor: '#fff1d4', skyLight: '#d3eaff', groundLight: '#687253', sunIntensity: 3.4, ambientIntensity: 2.2, clouds: 9, cloudOpacity: 0.68, cloudColor: '#f5f6f0', sunVisibility: 1, rain: 0, snow: 0, wind: 1.2 }),
  cloudy: Object.freeze({ label: '多云', temperature: 21, skyTop: '#859dad', skyBottom: '#d3dce0', fog: '#b9c9cf', sunColor: '#e7edf0', skyLight: '#c9dbe8', groundLight: '#697163', sunIntensity: 1.4, ambientIntensity: 2.0, clouds: 32, cloudOpacity: 0.91, cloudColor: '#c4cbd0', sunVisibility: 0.22, rain: 0, snow: 0, wind: 2.0 }),
  rain: Object.freeze({ label: '下雨', temperature: 18, skyTop: '#657c8b', skyBottom: '#a8bac5', fog: '#9baeb8', sunColor: '#cad7e2', skyLight: '#aac4d6', groundLight: '#53615d', sunIntensity: 0.65, ambientIntensity: 1.7, clouds: 38, cloudOpacity: 0.97, cloudColor: '#8496a3', sunVisibility: 0.06, rain: 2600, snow: 0, wind: 5.0 }),
  storm: Object.freeze({ label: '雷雨', temperature: 17, skyTop: '#384e61', skyBottom: '#768998', fog: '#748b9c', sunColor: '#aebed0', skyLight: '#809bad', groundLight: '#394b48', sunIntensity: 0.3, ambientIntensity: 1.1, clouds: 44, cloudOpacity: 0.99, cloudColor: '#526778', sunVisibility: 0, rain: 5000, snow: 0, wind: 11.0 }),
  hot: Object.freeze({ label: '炎热', temperature: 35, skyTop: '#87bdd4', skyBottom: '#f3e4c0', fog: '#e5d8bb', sunColor: '#ffdf9f', skyLight: '#ebedda', groundLight: '#86784b', sunIntensity: 4.0, ambientIntensity: 2.5, clouds: 5, cloudOpacity: 0.55, cloudColor: '#fff4db', sunVisibility: 1.15, rain: 0, snow: 0, wind: 0.65 }),
  cold: Object.freeze({ label: '寒冷', temperature: 4, skyTop: '#82a6bf', skyBottom: '#d7e5ee', fog: '#c3d8e7', sunColor: '#e4f0ff', skyLight: '#c0d9f1', groundLight: '#667981', sunIntensity: 2.2, ambientIntensity: 1.9, clouds: 15, cloudOpacity: 0.76, cloudColor: '#e2edf5', sunVisibility: 0.78, rain: 0, snow: 0, wind: 2.5 }),
  snow: Object.freeze({ label: '下雪', temperature: -2, skyTop: '#849dae', skyBottom: '#d8e3ea', fog: '#c0d1de', sunColor: '#dceafb', skyLight: '#c3d9ed', groundLight: '#7b8a91', sunIntensity: 0.85, ambientIntensity: 2.2, clouds: 37, cloudOpacity: 0.94, cloudColor: '#c3d2df', sunVisibility: 0.1, rain: 0, snow: 2100, wind: 1.8 }),
});

const TAU = Math.PI * 2;
const MAX_RAIN = 5000;
const MAX_SNOW = 2100;
const MAX_CLOUDS = 44;

// A repeatable local generator avoids modifying Math.random or application state.
function randomFactory(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rainVertex = `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uWind;
  uniform vec3 uAnchor;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    vUv = uv;
    float speed = 25.0 + aSeed.w * 16.0;
    vec3 p;
    p.x = (fract(aSeed.x + uTime * uWind / 48.0) - 0.5) * 48.0;
    p.z = (fract(aSeed.z + uTime * uWind * 0.13 / 48.0) - 0.5) * 48.0;
    p.y = fract(aSeed.y - uTime * speed / 34.0) * 34.0 - 7.0;
    float edge = 1.0 - smoothstep(17.0, 24.0, max(abs(p.x), abs(p.z)));
    vFade = edge * smoothstep(-7.0, -3.0, p.y) * (0.5 + aSeed.w * 0.5);
    vec4 view = viewMatrix * vec4(uAnchor + p, 1.0);
    vec3 velocity = normalize((viewMatrix * vec4(uWind, -speed, uWind * 0.13, 0.0)).xyz);
    view.xyz += velocity * position.y * (1.4 + aSeed.w * 1.7);
    view.x += position.x * (0.075 + aSeed.w * 0.065);
    gl_Position = projectionMatrix * view;
  }
`;

const rainFragment = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    float line = 1.0 - smoothstep(0.06, 0.5, abs(vUv.x - 0.5));
    float ends = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.58, 1.0, vUv.y));
    float alpha = line * ends * vFade * uOpacity;
    if (alpha < 0.008) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const snowVertex = `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uWind;
  uniform vec3 uAnchor;
  varying float vFade;
  void main() {
    vec3 p;
    p.x = (fract(aSeed.x + uTime * uWind / 42.0) - 0.5) * 42.0;
    p.z = (fract(aSeed.z + uTime * 0.27 / 42.0) - 0.5) * 42.0;
    p.y = fract(aSeed.y - uTime * (1.7 + aSeed.w * 2.4) / 28.0) * 28.0 - 6.0;
    p.x += sin(uTime * 0.7 + aSeed.z * 41.0) * (0.7 + aSeed.w);
    p.z += cos(uTime * 0.58 + aSeed.x * 39.0) * 0.8;
    vFade = (1.0 - smoothstep(15.0, 21.0, max(abs(p.x), abs(p.z)))) * smoothstep(-6.0, -2.0, p.y);
    vec4 view = viewMatrix * vec4(uAnchor + p, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = clamp((0.23 + aSeed.w * 0.5) * 350.0 / max(1.0, -view.z), 1.3, 17.0);
  }
`;

const snowFragment = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float alpha = (1.0 - smoothstep(0.3, 1.0, d)) * vFade * uOpacity;
    if (alpha < 0.012) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const cloudVertex = `
  attribute vec4 aCloud;
  attribute vec3 aShape;
  uniform float uTime;
  uniform float uWind;
  varying vec2 vUv;
  varying float vVariation;
  void main() {
    vUv = uv;
    vVariation = aShape.z;
    vec3 p = aCloud.xyz;
    float angle = uTime * 0.0008 * uWind;
    p.xz = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p.xz;
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    view.xy += position.xy * aCloud.w * aShape.xy;
    gl_Position = projectionMatrix * view;
  }
`;

const cloudFragment = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uDaylight;
  uniform float uLightning;
  varying vec2 vUv;
  varying float vVariation;
  float blob(vec2 p, vec2 center, vec2 radius) {
    return 1.0 - smoothstep(0.6, 1.0, length((p - center) / radius));
  }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float c = blob(p, vec2(-0.5, -0.1), vec2(0.46, 0.42));
    c = max(c, blob(p, vec2(-0.15, 0.13), vec2(0.5, 0.64)));
    c = max(c, blob(p, vec2(0.28, 0.12), vec2(0.5, 0.53)));
    c = max(c, blob(p, vec2(0.60, -0.16), vec2(0.37, 0.34)));
    c = max(c, blob(p, vec2(0.05, -0.24), vec2(0.73, 0.33)));
    float alpha = c * uOpacity;
    if (alpha < 0.012) discard;
    float shade = mix(0.68, 1.06, smoothstep(-0.45, 0.55, p.y)) * (0.94 + vVariation * 0.09);
    vec3 color = uColor * shade * mix(0.15, 1.0, uDaylight);
    color += vec3(0.21, 0.26, 0.32) * uLightning;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const discVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const discFragment = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uMoon;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float core = 1.0 - smoothstep(0.29, 0.315, r);
    float halo = exp(-r * r * 5.5) * (1.0 - smoothstep(0.8, 1.0, r));
    float alpha = (core * 0.97 + halo * mix(0.27, 0.09, uMoon)) * uOpacity;
    if (alpha < 0.003) discard;
    float crater = 1.0;
    crater -= (1.0 - smoothstep(0.035, 0.10, length(p - vec2(-0.08, 0.10)))) * 0.12 * uMoon;
    crater -= (1.0 - smoothstep(0.04, 0.12, length(p - vec2(0.09, -0.08)))) * 0.16 * uMoon;
    crater -= (1.0 - smoothstep(0.02, 0.06, length(p - vec2(-0.12, -0.11)))) * 0.09 * uMoon;
    gl_FragColor = vec4(uColor * crater, min(alpha, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function shaderMaterial(vertexShader, fragmentShader, uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader, fragmentShader, uniforms,
    transparent: true, depthTest: true, depthWrite: false,
    fog: false, toneMapped: false, side: THREE.DoubleSide,
  });
}

function seededAttributes(count, random) {
  const values = new Float32Array(count * 4);
  for (let i = 0; i < values.length; i++) values[i] = random();
  return values;
}

export class WeatherEffects {
  constructor({ scene, camera } = {}) {
    if (!scene?.isScene || !camera?.isCamera) throw new TypeError('WeatherEffects requires a Three.js scene and camera.');
    this.scene = scene;
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.name = 'Campus weather effects';
    this.skyGroup = new THREE.Group();
    this.skyGroup.name = 'Weather sky';
    this.group.add(this.skyGroup);
    this.scene.add(this.group);
    this.sunDirection = new THREE.Vector3();
    this.moonDirection = new THREE.Vector3();
    this._cameraPosition = new THREE.Vector3();
    this._cameraQuaternion = new THREE.Quaternion();
    this._anchor = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._random = randomFactory(730916);
    this._time = 0;
    this._hour = 12;
    this._disposed = false;
    this._boltAge = -1;
    this._nextBolt = 4;
    this._makeRain();
    this._makeSnow();
    this._makeClouds();
    this._makeDiscs();
    this._makeLightning();
    this.setPreset('sunny');
    this.setHour(12);
    this.update(0);
  }

  _makeRain() {
    const plane = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry().copy(plane);
    plane.dispose();
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seededAttributes(MAX_RAIN, this._random), 4));
    geometry.instanceCount = 0;
    const material = shaderMaterial(rainVertex, rainFragment, {
      uTime: { value: 0 }, uWind: { value: 5 }, uAnchor: { value: this._anchor },
      uColor: { value: new THREE.Color('#d5e5f2') }, uOpacity: { value: 0.5 },
    });
    this.rain = new THREE.Mesh(geometry, material);
    this.rain.name = 'Instanced rain';
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 4;
    this.group.add(this.rain);
  }

  _makeSnow() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SNOW * 3), 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seededAttributes(MAX_SNOW, this._random), 4));
    const material = shaderMaterial(snowVertex, snowFragment, {
      uTime: { value: 0 }, uWind: { value: 1.8 }, uAnchor: { value: this._anchor },
      uColor: { value: new THREE.Color('#eef6ff') }, uOpacity: { value: 0.95 },
    });
    this.snow = new THREE.Points(geometry, material);
    this.snow.name = 'Snowflakes';
    this.snow.frustumCulled = false;
    this.snow.renderOrder = 4;
    this.group.add(this.snow);
  }

  _makeClouds() {
    const plane = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry().copy(plane);
    plane.dispose();
    const centers = new Float32Array(MAX_CLOUDS * 4);
    const shapes = new Float32Array(MAX_CLOUDS * 3);
    for (let i = 0; i < MAX_CLOUDS; i++) {
      const azimuth = i * 2.3999632297;
      const elevation = 0.14 + this._random() * 0.66;
      const distance = 2300 + this._random() * 650;
      centers.set([Math.cos(azimuth) * distance * Math.cos(elevation), Math.sin(elevation) * distance, Math.sin(azimuth) * distance * Math.cos(elevation), 560 + this._random() * 630], i * 4);
      shapes.set([1.4 + this._random() * 0.75, 0.55 + this._random() * 0.28, this._random()], i * 3);
    }
    geometry.setAttribute('aCloud', new THREE.InstancedBufferAttribute(centers, 4));
    geometry.setAttribute('aShape', new THREE.InstancedBufferAttribute(shapes, 3));
    const material = shaderMaterial(cloudVertex, cloudFragment, {
      uTime: { value: 0 }, uWind: { value: 1 }, uOpacity: { value: 0.8 },
      uColor: { value: new THREE.Color('#f5f6f0') }, uDaylight: { value: 1 }, uLightning: { value: 0 },
    });
    this.clouds = new THREE.Mesh(geometry, material);
    this.clouds.name = 'Procedural cloud bank';
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -12;
    this.skyGroup.add(this.clouds);
  }

  _makeDiscs() {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const makeDisc = (name, color, moon, size) => {
      const mesh = new THREE.Mesh(geometry, shaderMaterial(discVertex, discFragment, {
        uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 }, uMoon: { value: moon },
      }));
      mesh.name = name;
      mesh.scale.setScalar(size);
      mesh.renderOrder = -20;
      mesh.frustumCulled = false;
      this.skyGroup.add(mesh);
      return mesh;
    };
    this.sun = makeDisc('Sun and soft halo', '#fff1c9', 0, 770);
    this.moon = makeDisc('Moon and soft halo', '#e7f1ff', 1, 520);
  }

  _makeLightning() {
    // A single slow, faint distant bolt; no point light or full-screen flash.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
    this.lightning = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
      color: '#b5cde3', transparent: true, opacity: 0,
      depthWrite: false, depthTest: true, toneMapped: false,
    }));
    this.lightning.name = 'Distant quiet lightning';
    this.lightning.frustumCulled = false;
    this.lightning.renderOrder = -10;
    this.lightning.visible = false;
    this.skyGroup.add(this.lightning);
  }

  setPreset(key) {
    if (this._disposed) return this;
    if (!Object.prototype.hasOwnProperty.call(WEATHER_PRESETS, key)) throw new RangeError(`Unknown weather preset: ${key}`);
    this.preset = key;
    this.settings = WEATHER_PRESETS[key];
    const preset = this.settings;
    this.rain.visible = preset.rain > 0;
    this.rain.geometry.instanceCount = preset.rain;
    this.rain.material.uniforms.uWind.value = preset.wind;
    this.snow.visible = preset.snow > 0;
    this.snow.geometry.setDrawRange(0, preset.snow);
    this.snow.material.uniforms.uWind.value = preset.wind;
    this.clouds.geometry.instanceCount = preset.clouds;
    this.clouds.material.uniforms.uColor.value.set(preset.cloudColor);
    this.clouds.material.uniforms.uOpacity.value = preset.cloudOpacity;
    this.clouds.material.uniforms.uWind.value = preset.wind;
    this._boltAge = -1;
    this._nextBolt = 4 + this._random() * 5;
    this.lightning.visible = false;
    this.clouds.material.uniforms.uLightning.value = 0;
    this.setHour(this._hour);
    return this;
  }

  setHour(hour) {
    if (this._disposed || !Number.isFinite(hour)) return this;
    this._hour = ((hour % 24) + 24) % 24;
    const angle = ((this._hour - 6) / 24) * TAU;
    this.sunDirection.set(-Math.cos(angle) * 0.85, Math.sin(angle), Math.cos(angle) * 0.35 + 0.28).normalize();
    this.moonDirection.copy(this.sunDirection).negate();
    this.sun.position.copy(this.sunDirection).multiplyScalar(3300);
    this.moon.position.copy(this.moonDirection).multiplyScalar(3350);
    const daylight = THREE.MathUtils.smoothstep(this.sunDirection.y, -0.12, 0.3);
    const aboveHorizon = THREE.MathUtils.smoothstep(this.sunDirection.y, -0.04, 0.06);
    const moonAboveHorizon = THREE.MathUtils.smoothstep(this.moonDirection.y, -0.04, 0.07);
    const warmth = 1 - THREE.MathUtils.smoothstep(this.sunDirection.y, 0.04, 0.42);
    this.sun.material.uniforms.uColor.value.set(this.preset === 'hot' ? '#ffe0a3' : '#fff2cf').lerp(new THREE.Color('#ff9a50'), warmth * 0.65);
    this.sun.material.uniforms.uOpacity.value = aboveHorizon * this.settings.sunVisibility;
    this.moon.material.uniforms.uOpacity.value = moonAboveHorizon * Math.max(0.24, this.settings.sunVisibility) * 0.95;
    this.sun.visible = aboveHorizon > 0.001 && this.settings.sunVisibility > 0;
    this.moon.visible = moonAboveHorizon > 0.001;
    this.clouds.material.uniforms.uDaylight.value = daylight;
    this.rain.material.uniforms.uColor.value.set('#d5e5f2').multiplyScalar(0.38 + daylight * 0.62);
    this.snow.material.uniforms.uColor.value.set('#eef6ff').multiplyScalar(0.48 + daylight * 0.52);
    return this;
  }

  _startBolt() {
    this.camera.getWorldDirection(this._forward);
    this._forward.y = 0;
    if (this._forward.lengthSq() < 0.001) this._forward.set(0, 0, -1);
    this._forward.normalize();
    const sideways = (this._random() - 0.5) * 650;
    const x = this._forward.x * 1700 - this._forward.z * sideways;
    const z = this._forward.z * 1700 + this._forward.x * sideways;
    const points = this.lightning.geometry.attributes.position.array;
    let px = x, py = 1050, pz = z;
    for (let i = 0; i < 9; i++) {
      const nx = px + (this._random() - 0.5) * 58;
      const ny = py - 46 - this._random() * 30;
      const nz = pz + (this._random() - 0.5) * 32;
      points.set([px, py, pz, nx, ny, nz], i * 6);
      px = nx; py = ny; pz = nz;
    }
    // Short branch off the middle of the main bolt, in the same draw call.
    px = points[24]; py = points[25]; pz = points[26];
    for (let i = 9; i < 12; i++) {
      const nx = px + 35 + this._random() * 25, ny = py - 26, nz = pz + 10;
      points.set([px, py, pz, nx, ny, nz], i * 6);
      px = nx; py = ny; pz = nz;
    }
    this.lightning.geometry.attributes.position.needsUpdate = true;
    this._boltAge = 0;
    this.lightning.visible = true;
  }

  update(dt, { position, indoors = false, hour } = {}) {
    if (this._disposed) return;
    const elapsed = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.15)) : 0;
    this._time += elapsed;
    if (Number.isFinite(hour) && hour !== this._hour) this.setHour(hour);
    this.group.visible = !indoors;
    if (indoors) return;
    this.camera.getWorldPosition(this._cameraPosition);
    this.camera.getWorldQuaternion(this._cameraQuaternion);
    this.skyGroup.position.copy(this._cameraPosition);
    this.sun.quaternion.copy(this._cameraQuaternion);
    this.moon.quaternion.copy(this._cameraQuaternion);
    if (Array.isArray(position) && position.length >= 3) this._anchor.fromArray(position);
    else if (position && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z)) this._anchor.copy(position);
    else this._anchor.copy(this._cameraPosition);
    this.rain.material.uniforms.uTime.value = this._time;
    this.snow.material.uniforms.uTime.value = this._time;
    this.clouds.material.uniforms.uTime.value = this._time;
    if (this.preset === 'storm') {
      if (this._boltAge < 0) {
        this._nextBolt -= elapsed;
        if (this._nextBolt <= 0) this._startBolt();
      } else {
        this._boltAge += elapsed;
        const progress = this._boltAge / 1.65;
        const glow = Math.sin(Math.min(1, progress) * Math.PI);
        this.lightning.material.opacity = glow * 0.28;
        this.clouds.material.uniforms.uLightning.value = glow * 0.2;
        if (progress >= 1) {
          this.lightning.visible = false;
          this.clouds.material.uniforms.uLightning.value = 0;
          this._boltAge = -1;
          this._nextBolt = 13 + this._random() * 15;
        }
      }
    }
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.group.removeFromParent();
    const geometries = new Set(), materials = new Set();
    this.group.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) {
        const list = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of list) materials.add(material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.group.clear();
  }
}
