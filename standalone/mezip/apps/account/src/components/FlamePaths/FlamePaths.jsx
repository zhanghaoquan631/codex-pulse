import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import './FlamePaths.css';

// Flame Paths' full-screen vertex pass. The fragment pass below intentionally
// keeps the original wave math and timing; only the RGB gains are changed per
// zone by the parent component.
const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform vec2 uRes;
uniform float uSpeed;
uniform float uCenter;
uniform float uAmp;
uniform float uFreq;
uniform float uInnerFreq;
uniform float uPull;
uniform int uDir;
uniform float uPowA;
uniform float uPowB;
uniform float uRedGain;
uniform float uGreenGain;
uniform float uBlueGain;
uniform float uGreenPow;
uniform float uBluePow;
uniform vec3 uBg;
uniform float uAlpha;
uniform vec2 uPointer;
uniform float uCursorActive;
uniform float uCursorIntensity;

const float TAU = 6.2831853;
const float PI = 3.14159265;

void main() {
  float aspect = uRes.x / uRes.y;

  vec2 st = vec2(vUv.x * aspect, vUv.y);
  vec2 nrm = vUv;

  if (uDir == 1) {
    st.x = aspect - st.x;
    nrm.x = 1.0 - nrm.x;
  } else if (uDir == 2) {
    float tmp = st.x;
    st.x = st.y;
    st.y = aspect - tmp;
    float ntmp = nrm.x;
    nrm.x = nrm.y;
    nrm.y = 1.0 - ntmp;
  } else if (uDir == 3) {
    float tmp = st.x;
    st.x = 1.0 - st.y;
    st.y = tmp;
    float ntmp = nrm.x;
    nrm.x = 1.0 - nrm.y;
    nrm.y = ntmp;
  }

  st.y -= uCenter;

  float t = uTime * uSpeed;

  vec2 pointerNrm = uPointer;
  float cursorDist = length(nrm - pointerNrm);
  float cursorInfluence = smoothstep(0.5, 0.0, cursorDist) * uCursorActive * uCursorIntensity;

  float localAmp = uAmp + cursorInfluence * 3.0;
  float localPowA = uPowA - cursorInfluence * 4.0;
  float localPowB = uPowB - cursorInfluence * 1.5;

  st.y *= sin(nrm.x * uFreq * TAU + t) + localAmp;

  st.y = st.x + sin(sin(st.y * uInnerFreq));

  st.x -= abs(sin(nrm.y * PI)) * uPull;
  st.x -= t;

  float combine = st.x + st.y;
  float diff = st.x - st.y;

  float cA = cos(combine);
  float cB = cos(diff);

  float fire = sqrt(pow(abs(cA), max(localPowA, 1.0)) * pow(abs(cB), max(localPowB, 1.0)));

  float intensityBoost = 1.0 + cursorInfluence * 0.5;
  vec3 col = vec3(
    fire * nrm.x * uRedGain * intensityBoost,
    pow(fire, uGreenPow) * nrm.x * uGreenGain * intensityBoost,
    pow(fire, uBluePow) * nrm.x * nrm.y * uBlueGain * intensityBoost
  );

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 result = mix(uBg, col, clamp(lum * 8.0, 0.0, 1.0));

  gl_FragColor = vec4(result, uAlpha);
}
`;

const presets = {
  green: {
    redGain: 0.35,
    greenGain: 4.2,
    blueGain: 1.4,
    greenPower: 1.05,
    bluePower: 1.2,
    backgroundColor: '#061a13'
  },
  blue: {
    redGain: 0.35,
    greenGain: 1.4,
    blueGain: 5,
    greenPower: 1,
    bluePower: 1.5,
    backgroundColor: '#09101f'
  },
  orange: {
    redGain: 5,
    greenGain: 1.9,
    blueGain: 0.2,
    greenPower: 1,
    bluePower: 1.25,
    backgroundColor: '#0c0807'
  }
};

function FlameShader({ tone, opacity = 0.78 }) {
  const meshRef = useRef(null);
  const { size } = useThree();
  const preset = presets[tone] ?? presets.blue;
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uSpeed: { value: 0.5 },
      uCenter: { value: 1 },
      uAmp: { value: 10 },
      uFreq: { value: 0.6 },
      uInnerFreq: { value: 2.5 },
      uPull: { value: 1 },
      uDir: { value: 2 },
      uPowA: { value: 30 },
      uPowB: { value: 10 },
      uRedGain: { value: preset.redGain },
      uGreenGain: { value: preset.greenGain },
      uBlueGain: { value: preset.blueGain },
      uGreenPow: { value: preset.greenPower },
      uBluePow: { value: preset.bluePower },
      uBg: { value: new THREE.Color(preset.backgroundColor) },
      uAlpha: { value: opacity },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uCursorActive: { value: 0 },
      uCursorIntensity: { value: 1 }
    }),
    [opacity, preset.backgroundColor, preset.blueGain, preset.bluePower, preset.greenGain, preset.greenPower, preset.redGain]
  );

  useFrame((state) => {
    const material = meshRef.current?.material;
    if (!material) return;
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uRes.value.set(Math.max(1, size.width), Math.max(1, size.height));
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

// Keep the official component's default opacity; the three palettes below are
// the only intentional visual variation from the source effect.
export default function FlamePaths({ tone, opacity = 1 }) {
  return (
    <div className={`zone-flame zone-flame-${tone}`} aria-hidden="true">
      <Canvas
        orthographic
        camera={{ position: [0, 0, 1], zoom: 1, left: -1, right: 1, top: 1, bottom: -1 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <FlameShader tone={tone} opacity={opacity} />
      </Canvas>
    </div>
  );
}
