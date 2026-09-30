(() => {
  'use strict';

  const canvas = document.getElementById('particleCanvas');
  const status = document.getElementById('renderStatus');
  const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const source = new Image();
  const sourceCanvas = document.createElement('canvas');
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });

  const view = { width: 1, height: 1, dpr: 1 };
  const pointer = {
    x: -1e6, y: -1e6, lastX: -1e6, lastY: -1e6,
    vx: 0, vy: 0, energy: 0, inside: false, movedAt: -Infinity
  };
  const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const particles = [];
  let imageReady = false;
  let imageBox = { x: 0, y: 0, width: 1, height: 1 };
  let lastFrame = performance.now();
  let resizeFrame = 0;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const lerp = (from, to, amount) => from + (to - from) * amount;
  const luminance = (r, g, b) => r * .2126 + g * .7152 + b * .0722;

  function sizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    view.width = Math.max(1, rect.width);
    view.height = Math.max(1, rect.height);
    view.dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 1.5);
    canvas.width = Math.round(view.width * view.dpr);
    canvas.height = Math.round(view.height * view.dpr);
    context.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    context.imageSmoothingEnabled = true;
    if (imageReady) buildPortrait();
  }

  function fitImage() {
    const horizontalRoom = view.width * (view.width < 680 ? .88 : .71);
    const verticalRoom = view.height * (view.width < 680 ? .81 : .86);
    const scale = Math.min(horizontalRoom / source.naturalWidth, verticalRoom / source.naturalHeight);
    const width = source.naturalWidth * scale;
    const height = source.naturalHeight * scale;
    return { x: (view.width - width) * .5, y: (view.height - height) * .5, width, height };
  }

  function readLuma(data, width, height, x, y) {
    const sx = clamp(x, 0, width - 1);
    const sy = clamp(y, 0, height - 1);
    const index = (sy * width + sx) * 4;
    return luminance(data[index], data[index + 1], data[index + 2]);
  }

  function addParticle({ x, y, r, g, b, brightness, edge, localX, localY }) {
    const jitterX = (Math.random() - .5) * .75;
    const jitterY = (Math.random() - .5) * .75;
    const depth = .5 + Math.pow(Math.random(), .45) * (3.7 + edge * 3.4);
    particles.push({
      homeX: x + jitterX,
      homeY: y + jitterY,
      x: x + jitterX,
      y: y + jitterY,
      vx: 0,
      vy: 0,
      z: depth,
      vz: 0,
      baseZ: depth,
      depthX: (Math.random() - .5) * (1.6 + edge * 4.5),
      depthY: (Math.random() - .5) * (1.4 + edge * 3.8),
      r: clamp(r * (1.16 + edge * .26), 0, 255),
      g: clamp(g * (1.16 + edge * .26), 0, 255),
      b: clamp(b * (1.16 + edge * .26), 0, 255),
      brightness,
      edge,
      localX,
      localY,
      size: 1.02 + Math.pow(edge, .7) * 1.78 + Math.random() * .72,
      alpha: clamp(.46 + brightness / 255 * .34 + edge * .18, .38, 1),
      shard: edge > .32 && Math.random() > .42
    });
  }

  function buildPortrait() {
    particles.length = 0;
    imageBox = fitImage();
    const particleLimit = view.width < 680 ? 7200 : 12000;

    const sampleWidth = 210;
    const sampleHeight = Math.round(sampleWidth * source.naturalHeight / source.naturalWidth);
    sourceCanvas.width = sampleWidth;
    sourceCanvas.height = sampleHeight;
    sourceContext.clearRect(0, 0, sampleWidth, sampleHeight);
    sourceContext.drawImage(source, 0, 0, sampleWidth, sampleHeight);
    const { data } = sourceContext.getImageData(0, 0, sampleWidth, sampleHeight);
    const xScale = imageBox.width / sampleWidth;
    const yScale = imageBox.height / sampleHeight;

    for (let y = 1; y < sampleHeight - 1; y += 1) {
      for (let x = 1; x < sampleWidth - 1; x += 1) {
        const index = (y * sampleWidth + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const brightness = luminance(r, g, b);
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        const edge = clamp((
          Math.abs(brightness - readLuma(data, sampleWidth, sampleHeight, x - 1, y)) +
          Math.abs(brightness - readLuma(data, sampleWidth, sampleHeight, x + 1, y)) +
          Math.abs(brightness - readLuma(data, sampleWidth, sampleHeight, x, y - 1)) +
          Math.abs(brightness - readLuma(data, sampleWidth, sampleHeight, x, y + 1))
        ) / 238, 0, 1);

        // Near-black background never becomes particles. Bright facets and their edges are sampled most densely.
        const chromaticShadow = chroma > 25 && brightness > 5;
        if (brightness < 10 && edge < .16 && !chromaticShadow) continue;
        let density = clamp((brightness - 7) / 128 * .50 + edge * .80 + chroma / 255 * .40, .05, .98);
        if (chromaticShadow) density = Math.max(density, .16);
        if (Math.random() > density) continue;

        addParticle({
          x: imageBox.x + (x + .5) * xScale,
          y: imageBox.y + (y + .5) * yScale,
          r,
          g,
          b,
          brightness,
          edge,
          localX: x / sampleWidth,
          localY: y / sampleHeight
        });

        // Give high-contrast silhouette transitions a second, offset layer for visible thickness.
        if (edge > .54 && Math.random() < .64) {
          addParticle({
            x: imageBox.x + (x + .32) * xScale,
            y: imageBox.y + (y + .32) * yScale,
            r,
            g,
            b,
            brightness,
            edge,
            localX: x / sampleWidth,
            localY: y / sampleHeight
          });
        }
      }
    }

    // Keep coverage even from top to bottom: randomly retain a dense, balanced subset if needed.
    for (let index = particles.length - 1; index > particleLimit; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [particles[index], particles[swapIndex]] = [particles[swapIndex], particles[index]];
    }
    if (particles.length > particleLimit) particles.length = particleLimit;

    canvas.dataset.ready = 'true';
    canvas.dataset.particles = String(particles.length);
    status.textContent = `晶体肖像已构建，共 ${particles.length} 个彩色粒子。`;
  }

  function paintBackground() {
    context.fillStyle = '#03050a';
    context.fillRect(0, 0, view.width, view.height);

    const centerX = imageBox.x + imageBox.width * .55;
    const centerY = imageBox.y + imageBox.height * .47;
    const halo = context.createRadialGradient(centerX, centerY, imageBox.width * .06, centerX, centerY, imageBox.height * .62);
    halo.addColorStop(0, 'rgba(63, 78, 162, .13)');
    halo.addColorStop(.48, 'rgba(34, 25, 108, .052)');
    halo.addColorStop(1, 'rgba(3, 5, 10, 0)');
    context.fillStyle = halo;
    context.fillRect(0, 0, view.width, view.height);
  }

  function drawShard(x, y, size) {
    context.beginPath();
    context.moveTo(x, y - size);
    context.lineTo(x + size, y);
    context.lineTo(x, y + size);
    context.lineTo(x - size, y);
    context.closePath();
    context.fill();
  }

  function updateParticle(particle, dt, now) {
    const quiet = now - pointer.movedAt > 150 || !pointer.inside;
    const currentSpeed = Math.hypot(pointer.vx, pointer.vy);

    if (!quiet && currentSpeed > .35 && !motionPreference?.matches) {
      const dx = particle.x - pointer.x;
      const dy = particle.y - pointer.y;
      const distanceSquared = dx * dx + dy * dy;
      const radius = Math.min(182, Math.max(112, imageBox.width * .31));
      const distance = Math.max(Math.sqrt(distanceSquared), 1);
      // A hollow-center ripple keeps the exact detail under the cursor instead of punching a black circular hole.
      const normalizedDistance = distance / radius;
      const influence = clamp(2.15 * normalizedDistance * Math.exp(-normalizedDistance * normalizedDistance * 1.3), 0, 1);
      if (influence > .008) {
        const force = influence * (.48 + Math.min(currentSpeed, 48) * .08) * pointer.energy;
        particle.vx += (dx / distance * force + pointer.vx * influence * .045) * dt;
        particle.vy += (dy / distance * force + pointer.vy * influence * .045) * dt;
        particle.vz += influence * (1.15 + currentSpeed * .042) * dt;
      }
    }

    const spring = motionPreference?.matches ? .20 : .104;
    particle.vx += (particle.homeX - particle.x) * spring * dt;
    particle.vy += (particle.homeY - particle.y) * spring * dt;
    particle.vz += (particle.baseZ - particle.z) * .085 * dt;
    particle.vx *= Math.pow(.71, dt);
    particle.vy *= Math.pow(.71, dt);
    particle.vz *= Math.pow(.74, dt);
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.z += particle.vz * dt;
  }

  function render(now) {
    const dt = Math.min((now - lastFrame) / 16.667, 1.8);
    lastFrame = now;
    paintBackground();

    const hasRecentMotion = pointer.inside && now - pointer.movedAt < 180;
    const parallaxX = hasRecentMotion ? clamp(pointer.vx * .12, -5, 5) : 0;
    const parallaxY = hasRecentMotion ? clamp(pointer.vy * .12, -5, 5) : 0;

    context.globalCompositeOperation = 'source-over';
    for (const particle of particles) {
      updateParticle(particle, dt, now);
      const depthFactor = particle.z / 7;
      const x = particle.x + particle.depthX * depthFactor + parallaxX * depthFactor;
      const y = particle.y + particle.depthY * depthFactor + parallaxY * depthFactor;
      const rearAlpha = particle.alpha * (.055 + particle.edge * .065);
      const rearSize = particle.size * (1.45 + depthFactor * .55);
      context.fillStyle = `rgba(${particle.r}, ${particle.g}, ${particle.b}, ${rearAlpha})`;
      context.fillRect(x + particle.depthX * 2.3, y + particle.depthY * 2.3, rearSize, rearSize);
    }

    context.globalCompositeOperation = 'source-over';
    for (const particle of particles) {
      const depthFactor = particle.z / 7;
      const x = particle.x + particle.depthX * depthFactor + parallaxX * depthFactor;
      const y = particle.y + particle.depthY * depthFactor + parallaxY * depthFactor;
      const dynamicOpacity = clamp(particle.alpha - Math.min(Math.hypot(particle.vx, particle.vy) * .003, .10), .28, 1);
      context.fillStyle = `rgba(${particle.r}, ${particle.g}, ${particle.b}, ${dynamicOpacity})`;
      if (particle.shard) drawShard(x, y, particle.size * (1.05 + particle.edge * .28));
      else context.fillRect(x - particle.size * .5, y - particle.size * .5, particle.size, particle.size);
    }

    context.globalCompositeOperation = 'source-over';
    pointer.vx *= .84;
    pointer.vy *= .84;
    pointer.energy = lerp(pointer.energy, pointer.inside ? 1 : 0, .04);
    requestAnimationFrame(render);
  }

  function toCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerMove(event) {
    const point = toCanvasPoint(event);
    if (!pointer.inside) {
      pointer.lastX = point.x;
      pointer.lastY = point.y;
      pointer.inside = true;
    }
    pointer.vx = clamp(point.x - pointer.lastX, -46, 46);
    pointer.vy = clamp(point.y - pointer.lastY, -46, 46);
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.lastX = point.x;
    pointer.lastY = point.y;
    pointer.energy = 1;
    pointer.movedAt = performance.now();
  }

  function onPointerLeave() {
    pointer.inside = false;
    pointer.x = -1e6;
    pointer.y = -1e6;
    pointer.lastX = -1e6;
    pointer.lastY = -1e6;
  }

  canvas.addEventListener('pointermove', onPointerMove, { passive: true });
  canvas.addEventListener('pointerleave', onPointerLeave, { passive: true });
  canvas.addEventListener('pointercancel', onPointerLeave, { passive: true });
  canvas.addEventListener('pointerdown', onPointerMove, { passive: true });
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(sizeCanvas);
  }, { passive: true });

  window.__crystalPortraitDebug = {
    getState() {
      const sample = particles.slice(0, Math.min(particles.length, 700));
      const meanOffset = sample.length ? sample.reduce((sum, particle) => sum + Math.hypot(particle.x - particle.homeX, particle.y - particle.homeY), 0) / sample.length : 0;
      return { ready: imageReady, particles: particles.length, meanOffset, pointerEnergy: pointer.energy };
    }
  };

  source.addEventListener('load', () => {
    imageReady = true;
    sizeCanvas();
    requestAnimationFrame(render);
  }, { once: true });
  source.addEventListener('error', () => {
    status.textContent = '晶体肖像素材载入失败。';
  }, { once: true });
  source.src = './crystal-portrait-source.png';
})();
