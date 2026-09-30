(() => {
  'use strict';

  const experience = document.getElementById('experience');
  const canvas = document.getElementById('particleCanvas');
  const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
  const photoAnchor = document.getElementById('photoAnchor');
  const portraitShell = document.getElementById('portraitShell');
  const portraitImage = document.getElementById('portraitImage');
  const status = document.getElementById('renderStatus');
  const sourceCanvas = document.createElement('canvas');
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  const particles = [];
  const viewport = { width: 1, height: 1, dpr: 1 };
  const pointer = {
    x: -1e6, y: -1e6, lastX: -1e6, lastY: -1e6,
    vx: 0, vy: 0, speed: 0, inside: false, movedAt: -Infinity
  };
  const viewMotion = { x: 0, y: 0, targetX: 0, targetY: 0, lightX: 50, lightY: 46 };
  let photoBox = { x: 0, y: 0, width: 1, height: 1 };
  let imageReady = false;
  let resizeFrame = 0;
  let lastFrame = performance.now();

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const luminance = (r, g, b) => r * .2126 + g * .7152 + b * .0722;

  function sizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    viewport.width = Math.max(1, rect.width);
    viewport.height = Math.max(1, rect.height);
    viewport.dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 1.5);
    canvas.width = Math.round(viewport.width * viewport.dpr);
    canvas.height = Math.round(viewport.height * viewport.dpr);
    context.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    if (imageReady) buildContourParticles();
  }

  function pixelScore(data, width, height, x, y) {
    const sx = clamp(x, 0, width - 1);
    const sy = clamp(y, 0, height - 1);
    const index = (sy * width + sx) * 4;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const value = luminance(r, g, b);
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    return { r, g, b, value, chroma, foreground: value > 11 || chroma > 19 };
  }

  function addParticle({ x, y, normalX, normalY, r, g, b, edge, brightness, depth }) {
    const homeDistance = 2.2 + Math.random() * (6.5 + edge * 9);
    const tangentX = -normalY;
    const tangentY = normalX;
    const tangent = (Math.random() - .5) * (2.6 + edge * 3.2);
    const homeX = x + normalX * homeDistance + tangentX * tangent;
    const homeY = y + normalY * homeDistance + tangentY * tangent;
    const lift = 1.12 + edge * .31;
    particles.push({
      homeX,
      homeY,
      x: homeX,
      y: homeY,
      vx: 0,
      vy: 0,
      z: depth,
      vz: 0,
      baseZ: depth,
      r: clamp(r * lift, 0, 255),
      g: clamp(g * lift, 0, 255),
      b: clamp(b * lift, 0, 255),
      edge,
      size: .85 + edge * 1.55 + Math.random() * .72,
      alpha: clamp(.36 + brightness / 255 * .39 + edge * .28, .35, .98),
      seed: Math.random() * Math.PI * 2,
      shard: edge > .43 && Math.random() > .45
    });
  }

  function buildContourParticles() {
    particles.length = 0;
    const anchorRect = photoAnchor.getBoundingClientRect();
    photoBox = { x: anchorRect.x, y: anchorRect.y, width: anchorRect.width, height: anchorRect.height };

    const sampleWidth = 224;
    const sampleHeight = Math.round(sampleWidth * portraitImage.naturalHeight / portraitImage.naturalWidth);
    sourceCanvas.width = sampleWidth;
    sourceCanvas.height = sampleHeight;
    sourceContext.clearRect(0, 0, sampleWidth, sampleHeight);
    sourceContext.drawImage(portraitImage, 0, 0, sampleWidth, sampleHeight);
    const { data } = sourceContext.getImageData(0, 0, sampleWidth, sampleHeight);
    const scaleX = photoBox.width / sampleWidth;
    const scaleY = photoBox.height / sampleHeight;
    const cap = viewport.width < 680 ? 2500 : 3900;

    for (let y = 2; y < sampleHeight - 2; y += 1) {
      for (let x = 2; x < sampleWidth - 2; x += 1) {
        const here = pixelScore(data, sampleWidth, sampleHeight, x, y);
        if (!here.foreground) continue;

        const left = pixelScore(data, sampleWidth, sampleHeight, x - 2, y);
        const right = pixelScore(data, sampleWidth, sampleHeight, x + 2, y);
        const top = pixelScore(data, sampleWidth, sampleHeight, x, y - 2);
        const bottom = pixelScore(data, sampleWidth, sampleHeight, x, y + 2);
        const exteriorCount = [left, right, top, bottom].filter((point) => !point.foreground).length;
        const gradientX = right.value - left.value;
        const gradientY = bottom.value - top.value;
        const gradientLength = Math.max(Math.hypot(gradientX, gradientY), 1);
        const edge = clamp((Math.abs(gradientX) + Math.abs(gradientY)) / 154 + exteriorCount * .12, 0, 1);

        if (exteriorCount === 0 && edge < .48) continue;
        const keepChance = exteriorCount > 0 ? .72 : .10;
        if (Math.random() > keepChance * (.68 + edge * .55)) continue;

        addParticle({
          x: photoBox.x + (x + .5) * scaleX,
          y: photoBox.y + (y + .5) * scaleY,
          normalX: -gradientX / gradientLength,
          normalY: -gradientY / gradientLength,
          r: here.r,
          g: here.g,
          b: here.b,
          edge,
          brightness: here.value,
          depth: .6 + edge * 4.4 + Math.random() * 2.2
        });
      }
    }

    for (let index = particles.length - 1; index > cap; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [particles[index], particles[swapIndex]] = [particles[swapIndex], particles[index]];
    }
    if (particles.length > cap) particles.length = cap;

    canvas.dataset.ready = 'true';
    canvas.dataset.particles = String(particles.length);
    status.textContent = `实体照片已就位，外轮廓共有 ${particles.length} 个彩色粒子。`;
  }

  function drawDiamond(x, y, size) {
    context.beginPath();
    context.moveTo(x, y - size);
    context.lineTo(x + size, y);
    context.lineTo(x, y + size);
    context.lineTo(x - size, y);
    context.closePath();
    context.fill();
  }

  function updateParticle(particle, delta, now) {
    const recent = pointer.inside && now - pointer.movedAt < 150 && pointer.speed > .4 && !reducedMotion?.matches;
    if (recent) {
      const dx = particle.x - pointer.x;
      const dy = particle.y - pointer.y;
      const distance = Math.max(Math.hypot(dx, dy), 1);
      const radius = clamp(photoBox.width * .38, 125, 186);
      const normalized = distance / radius;
      const influence = clamp(2 * normalized * Math.exp(-normalized * normalized * 1.4), 0, 1);
      if (influence > .012) {
        const force = influence * (.35 + Math.min(pointer.speed, 46) * .072);
        const tangent = Math.sin(particle.seed + now * .002) * influence * .34;
        particle.vx += (dx / distance * force + pointer.vx * influence * .035 - dy / distance * tangent) * delta;
        particle.vy += (dy / distance * force + pointer.vy * influence * .035 + dx / distance * tangent) * delta;
        particle.vz += influence * (1 + pointer.speed * .035) * delta;
      }
    }

    particle.vx += (particle.homeX - particle.x) * .098 * delta;
    particle.vy += (particle.homeY - particle.y) * .098 * delta;
    particle.vz += (particle.baseZ - particle.z) * .11 * delta;
    particle.vx *= Math.pow(.72, delta);
    particle.vy *= Math.pow(.72, delta);
    particle.vz *= Math.pow(.7, delta);
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.z += particle.vz * delta;
  }

  function render(now) {
    const delta = Math.min((now - lastFrame) / 16.667, 1.8);
    lastFrame = now;
    context.clearRect(0, 0, viewport.width, viewport.height);

    const recentMotion = pointer.inside && now - pointer.movedAt < 170 && !reducedMotion?.matches;
    canvas.dataset.motion = recentMotion ? 'active' : 'idle';
    viewMotion.targetX = recentMotion ? clamp((pointer.y / viewport.height - .5) * -2.2, -1.3, 1.3) : 0;
    viewMotion.targetY = recentMotion ? clamp((pointer.x / viewport.width - .5) * 2.4, -1.5, 1.5) : 0;
    viewMotion.x += (viewMotion.targetX - viewMotion.x) * .06;
    viewMotion.y += (viewMotion.targetY - viewMotion.y) * .06;
    viewMotion.lightX += ((recentMotion ? pointer.x / viewport.width * 100 : 50) - viewMotion.lightX) * .05;
    viewMotion.lightY += ((recentMotion ? pointer.y / viewport.height * 100 : 46) - viewMotion.lightY) * .05;
    portraitShell.style.transform = `perspective(1200px) rotateX(${viewMotion.x.toFixed(3)}deg) rotateY(${viewMotion.y.toFixed(3)}deg)`;
    portraitShell.style.setProperty('--light-x', `${viewMotion.lightX.toFixed(2)}%`);
    portraitShell.style.setProperty('--light-y', `${viewMotion.lightY.toFixed(2)}%`);

    context.globalCompositeOperation = 'source-over';
    for (const particle of particles) {
      updateParticle(particle, delta, now);
      const depth = particle.z / 6;
      const x = particle.x + viewMotion.y * depth * 1.2;
      const y = particle.y - viewMotion.x * depth * 1.2;
      context.fillStyle = `rgba(${particle.r}, ${particle.g}, ${particle.b}, ${particle.alpha * .12})`;
      const haloSize = particle.size * (2.4 + depth * .5);
      context.fillRect(x - haloSize * .5, y - haloSize * .5, haloSize, haloSize);
    }

    context.globalCompositeOperation = 'lighter';
    for (const particle of particles) {
      const depth = particle.z / 6;
      const x = particle.x + viewMotion.y * depth * 1.2;
      const y = particle.y - viewMotion.x * depth * 1.2;
      context.fillStyle = `rgba(${particle.r}, ${particle.g}, ${particle.b}, ${particle.alpha})`;
      if (particle.shard) drawDiamond(x, y, particle.size);
      else context.fillRect(x - particle.size * .5, y - particle.size * .5, particle.size, particle.size);
    }
    context.globalCompositeOperation = 'source-over';

    pointer.vx *= .82;
    pointer.vy *= .82;
    pointer.speed = Math.hypot(pointer.vx, pointer.vy);
    requestAnimationFrame(render);
  }

  function movePointer(event) {
    const rect = experience.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (!pointer.inside) {
      pointer.lastX = x;
      pointer.lastY = y;
      pointer.inside = true;
    }
    pointer.vx = clamp(x - pointer.lastX, -46, 46);
    pointer.vy = clamp(y - pointer.lastY, -46, 46);
    pointer.speed = Math.hypot(pointer.vx, pointer.vy);
    pointer.x = x;
    pointer.y = y;
    pointer.lastX = x;
    pointer.lastY = y;
    pointer.movedAt = performance.now();
  }

  function leavePointer() {
    pointer.inside = false;
    pointer.x = -1e6;
    pointer.y = -1e6;
    pointer.lastX = -1e6;
    pointer.lastY = -1e6;
  }

  experience.addEventListener('pointermove', movePointer, { passive: true });
  experience.addEventListener('pointerdown', movePointer, { passive: true });
  experience.addEventListener('pointerleave', leavePointer, { passive: true });
  experience.addEventListener('pointercancel', leavePointer, { passive: true });
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(sizeCanvas);
  }, { passive: true });

  window.__entityPhotoParticleDebug = {
    getState() {
      const displacement = particles.reduce((summary, particle) => {
        const distance = Math.hypot(particle.x - particle.homeX, particle.y - particle.homeY);
        summary.total += distance;
        summary.max = Math.max(summary.max, distance);
        return summary;
      }, { total: 0, max: 0 });
      return {
        imageReady,
        particleCount: particles.length,
        photoOpacity: Number.parseFloat(getComputedStyle(portraitImage).opacity),
        photoNaturalSize: [portraitImage.naturalWidth, portraitImage.naturalHeight],
        averageDisplacement: particles.length ? displacement.total / particles.length : 0,
        maxDisplacement: displacement.max,
        pointerInside: pointer.inside
      };
    }
  };

  portraitImage.addEventListener('load', () => {
    imageReady = true;
    sizeCanvas();
    requestAnimationFrame(render);
  }, { once: true });
  portraitImage.addEventListener('error', () => {
    status.textContent = '实体照片载入失败。';
  }, { once: true });
  if (portraitImage.complete && portraitImage.naturalWidth > 0) portraitImage.dispatchEvent(new Event('load'));
})();
