import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const GLITTER_WARP = {
  speed: 1,
  density: 20,
  brightness: 1,
  starSize: 0.1,
  focalDepth: 0.05,
  turbulence: 0,
  color: '#B19EEF'
};

const STAR_BURST = {
  speed: 1,
  density: 0.5,
  starCount: 100,
  color: '#E3B3EA',
  centerX: 0.5,
  centerY: 0.5,
  starSize: 0.3,
  brightness: 1,
  opacity: 1,
  flowerIntensity: 0.5,
  twinkleSpeed: 0.2,
  wobbleAmount: 1,
  innerLayerIntensity: 1,
  outerLayerIntensity: 1.5,
  fadeHeight: 2.5
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function random(index) {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function rgb(hex) {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized.length === 3
    ? normalized.split('').map(character => `${character}${character}`).join('')
    : normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

function rgba(color, alpha) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${clamp(alpha, 0, 1)})`;
}

function resizeCanvas(canvas) {
  const bounds = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  return { width, height, dpr };
}

function GlitterWarpCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d', { alpha: true });
    const color = rgb(GLITTER_WARP.color);
    let dimensions = resizeCanvas(canvas);
    let particles = [];
    let frame;
    let previous = performance.now();

    const resetParticle = (particle, index, near = false) => {
      const seed = index * 17 + (near ? performance.now() * 0.001 : 0);
      particle.x = random(seed + 1) * 2 - 1;
      particle.y = random(seed + 2) * 2 - 1;
      particle.z = near ? 0.76 + random(seed + 3) * 0.24 : 0.08 + random(seed + 3) * 0.92;
      particle.seed = random(seed + 4) * Math.PI * 2;
    };

    const seedParticles = () => {
      const count = clamp(Math.round(
        (dimensions.width * dimensions.height / 34000) * GLITTER_WARP.density
      ), 170, 760);
      particles = Array.from({ length: count }, (_, index) => {
        const particle = {};
        resetParticle(particle, index);
        return particle;
      });
    };

    const onResize = () => {
      dimensions = resizeCanvas(canvas);
      seedParticles();
    };

    const observer = new ResizeObserver(onResize);
    observer.observe(canvas);
    seedParticles();

    const draw = now => {
      const delta = Math.min(40, now - previous);
      previous = now;
      const { width, height, dpr } = dimensions;
      const centerX = width * 0.5;
      const centerY = height * 0.5;
      const minSide = Math.min(width, height);
      const focal = Math.max(0.0001, GLITTER_WARP.focalDepth);
      const time = now * 0.001;

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = 'lighter';

      const vignette = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(width, height) * 0.78);
      vignette.addColorStop(0, rgba(color, 0.02));
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = vignette;
      context.fillRect(0, 0, width, height);

      particles.forEach((particle, index) => {
        const priorZ = particle.z;
        particle.z -= delta * 0.00022 * GLITTER_WARP.speed;
        if (particle.z < focal * 0.64) resetParticle(particle, index, true);

        const currentZ = Math.max(focal * 0.64, particle.z);
        const rotation = GLITTER_WARP.turbulence * Math.sin(time * 0.8 + particle.seed);
        const cosine = Math.cos(rotation);
        const sine = Math.sin(rotation);
        const x = particle.x * cosine - particle.y * sine;
        const y = particle.x * sine + particle.y * cosine;
        const depth = 1 / currentZ;
        const oldDepth = 1 / Math.max(currentZ + Math.max(0.002, priorZ - currentZ), focal * 0.64);
        const scale = minSide * 0.18;
        const currentX = centerX + x * scale * depth;
        const currentY = centerY + y * scale * depth;
        const previousX = centerX + x * scale * oldDepth;
        const previousY = centerY + y * scale * oldDepth;
        const distance = Math.hypot(currentX - centerX, currentY - centerY);
        const maxDistance = Math.hypot(width, height) * 0.76;

        if (distance > maxDistance) {
          resetParticle(particle, index, true);
          return;
        }

        const opacity = clamp((1 - currentZ) * 0.72 * GLITTER_WARP.brightness + 0.08, 0.06, 0.78);
        const lineWidth = 0.28 + (1 - currentZ) * 1.6 + GLITTER_WARP.starSize * 1.8;
        context.strokeStyle = rgba(color, opacity * 0.65);
        context.lineWidth = lineWidth;
        context.beginPath();
        context.moveTo(previousX, previousY);
        context.lineTo(currentX, currentY);
        context.stroke();

        const twinkle = 0.58 + 0.42 * Math.sin(time * 4.2 + particle.seed * 8);
        const starRadius = (0.45 + (1 - currentZ) * 2.3) * (0.8 + GLITTER_WARP.starSize * 2) * twinkle;
        context.fillStyle = rgba(color, opacity * twinkle);
        context.beginPath();
        context.arc(currentX, currentY, starRadius, 0, Math.PI * 2);
        context.fill();

        if ((index + Math.floor(time * 5)) % 17 === 0) {
          context.strokeStyle = rgba(color, opacity * 0.56);
          context.lineWidth = 0.55;
          context.beginPath();
          context.moveTo(currentX - starRadius * 3.4, currentY);
          context.lineTo(currentX + starRadius * 3.4, currentY);
          context.moveTo(currentX, currentY - starRadius * 3.4);
          context.lineTo(currentX, currentY + starRadius * 3.4);
          context.stroke();
        }
      });

      context.globalCompositeOperation = 'source-over';
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return <canvas className="particle-mode-canvas" ref={canvasRef} aria-hidden="true" />;
}

function StarBurstCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d', { alpha: true });
    const color = rgb(STAR_BURST.color);
    const stars = Array.from({ length: STAR_BURST.starCount }, (_, index) => ({
      angle: random(index + 12) * Math.PI * 2,
      phase: random(index + 33) * Math.PI * 2,
      radius: 0.12 + random(index + 55) * 0.88,
      width: 0.35 + random(index + 89) * 1.1,
      seed: random(index + 144)
    }));
    let dimensions = resizeCanvas(canvas);
    let frame;

    const onResize = () => { dimensions = resizeCanvas(canvas); };
    const observer = new ResizeObserver(onResize);
    observer.observe(canvas);

    const drawSpark = (x, y, radius, alpha) => {
      context.strokeStyle = rgba(color, alpha);
      context.lineWidth = 0.5;
      context.beginPath();
      context.moveTo(x - radius * 2.8, y);
      context.lineTo(x + radius * 2.8, y);
      context.moveTo(x, y - radius * 2.8);
      context.lineTo(x, y + radius * 2.8);
      context.stroke();
      context.fillStyle = rgba(color, alpha * 1.35);
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    };

    const draw = now => {
      const { width, height, dpr } = dimensions;
      const centerX = width * STAR_BURST.centerX;
      const centerY = height * STAR_BURST.centerY;
      const maxRadius = Math.hypot(width, height) * 0.58;
      const time = now * 0.001 * STAR_BURST.speed;

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = 'lighter';

      const bloom = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius * 0.46);
      bloom.addColorStop(0, rgba(color, 0.2 * STAR_BURST.opacity));
      bloom.addColorStop(0.2, rgba(color, 0.06 * STAR_BURST.opacity));
      bloom.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = bloom;
      context.fillRect(0, 0, width, height);

      stars.forEach((star, index) => {
        const petal = 1 + Math.sin(star.angle * 8 + time * 0.7) * STAR_BURST.flowerIntensity * 0.26;
        const wobble = Math.sin(time * 1.6 + star.phase) * STAR_BURST.wobbleAmount * 0.018;
        const angle = star.angle + wobble;
        const pulse = 0.66 + 0.34 * Math.sin(time * (2 + STAR_BURST.twinkleSpeed * 7) + star.phase);
        const endRadius = maxRadius * star.radius * petal;
        const startRadius = Math.max(2, endRadius * (0.08 + star.seed * 0.16));
        const endX = centerX + Math.cos(angle) * endRadius;
        const endY = centerY + Math.sin(angle) * endRadius;
        const startX = centerX + Math.cos(angle) * startRadius;
        const startY = centerY + Math.sin(angle) * startRadius;
        const alpha = (0.13 + 0.48 * star.seed) * pulse * STAR_BURST.brightness * STAR_BURST.opacity;
        const ray = context.createLinearGradient(startX, startY, endX, endY);
        ray.addColorStop(0, rgba(color, alpha * STAR_BURST.innerLayerIntensity));
        ray.addColorStop(0.58, rgba(color, alpha * 0.5));
        ray.addColorStop(1, rgba(color, 0));
        context.strokeStyle = ray;
        context.lineWidth = star.width * (0.45 + STAR_BURST.starSize);
        context.beginPath();
        context.moveTo(startX, startY);
        context.lineTo(endX, endY);
        context.stroke();

        const outerRadius = endRadius * (0.58 + 0.42 * Math.sin(time * 0.9 + star.phase) ** 2);
        const outerX = centerX + Math.cos(angle) * outerRadius;
        const outerY = centerY + Math.sin(angle) * outerRadius;
        if (index % 2 === 0) drawSpark(outerX, outerY, (0.45 + star.seed * 1.35) * (0.7 + STAR_BURST.starSize), alpha * STAR_BURST.outerLayerIntensity);
      });

      const verticalFade = context.createLinearGradient(0, 0, 0, height);
      verticalFade.addColorStop(0, 'rgba(0, 0, 0, 0)');
      verticalFade.addColorStop(clamp(1 / STAR_BURST.fadeHeight, 0.15, 0.75), 'rgba(0, 0, 0, 0.08)');
      verticalFade.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
      context.globalCompositeOperation = 'destination-out';
      context.fillStyle = verticalFade;
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = 'source-over';
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return <canvas className="particle-mode-canvas" ref={canvasRef} aria-hidden="true" />;
}

const MODES = [
  { id: 'gallery', label: '原色影像牆', shortLabel: '原色' },
  { id: 'glitter-warp', label: '閃光經紗', shortLabel: '閃光經紗' },
  { id: 'star-burst', label: '星爆', shortLabel: '星爆' },
  { id: 'mixed', label: '混合粒子', shortLabel: '混合' }
];

function PillNavIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2.8 14 10l7.2 2-7.2 2-2 7.2-2-7.2-7.2-2 7.2-2L12 2.8Z" />
      <path d="m18.2 3.2.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" />
    </svg>
  );
}

export default function ParticleModes({ controlsHost }) {
  const [mode, setMode] = useState('gallery');
  const active = MODES.find(item => item.id === mode) ?? MODES[0];
  const activeIndex = Math.max(0, MODES.findIndex(item => item.id === mode));

  return (
    <>
      {controlsHost && createPortal(<section className="particle-mode-switcher" aria-label="粒子特效模式">
        <div className="particle-pill-nav">
          <button
            className={`particle-pill-logo${mode === 'gallery' ? ' is-active' : ''}`}
            type="button"
            aria-label="切换到原色影像墙"
            aria-pressed={mode === 'gallery'}
            onClick={() => setMode('gallery')}
          >
            <PillNavIcon />
          </button>
          <div className="particle-pill-items" role="group" aria-label="选择粒子特效">
            <span className="particle-pill-highlight" style={{ transform: `translateX(${activeIndex * 100}%)` }} aria-hidden="true" />
          {MODES.map(item => (
            <button
              key={item.id}
              type="button"
              className={`particle-pill-item${mode === item.id ? ' is-active' : ''}`}
              aria-pressed={mode === item.id}
              onClick={() => setMode(item.id)}
            >
              {item.shortLabel}
            </button>
          ))}
          </div>
        </div>
        <p aria-live="polite">当前：{active.label}</p>
      </section>, controlsHost)}
      {mode === 'glitter-warp' && <GlitterWarpCanvas />}
      {mode === 'star-burst' && <StarBurstCanvas />}
      {mode === 'mixed' && <><GlitterWarpCanvas /><StarBurstCanvas /></>}
    </>
  );
}
