(() => {
  const stage = document.getElementById('demoStage');
  const title = document.getElementById('demoTitle');
  const number = document.getElementById('demoNumber');
  const english = document.getElementById('demoEnglish');
  const status = document.getElementById('labStatus');
  const navLinks = [...document.querySelectorAll('.lab-nav a')];
  let cleanups = [];

  const addCleanup = (fn) => cleanups.push(fn);
  const listen = (element, event, handler, options) => {
    element.addEventListener(event, handler, options);
    addCleanup(() => element.removeEventListener(event, handler, options));
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const readPoint = (event, element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
      localX: event.clientX - rect.left,
      localY: event.clientY - rect.top,
      rect
    };
  };
  const cancelAll = () => {
    cleanups.splice(0).forEach((cleanup) => {
      try { cleanup(); } catch { /* a stale stage is safe to ignore */ }
    });
  };

  function sizedCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return { ctx: canvas.getContext('2d'), width, height, ratio };
  }

  function canvasLoop(canvas, draw) {
    let frame = 0;
    const loop = (time) => {
      draw(time);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    addCleanup(() => cancelAnimationFrame(frame));
  }

  const artCards = Array.from({ length: 8 }, (_, index) => `<figure class="gallery-card" style="--index:${index}" aria-hidden="true"></figure>`).join('');
  const carouselCards = Array.from({ length: 12 }, (_, index) => `<article class="tumble-card" style="--tilt:${(index % 2 ? 1 : -1) * (4 + (index % 4) * 2)}deg" aria-label="原创艺术卡片 ${index + 1}"></article>`).join('');

  const components = {
    'circle-gallery': {
      n: '01', en: 'CIRCLE GALLERY', cn: '圆环画廊',
      html: () => `<div class="circle-gallery"><div class="gallery-ring" id="galleryRing">${artCards}</div><div class="gallery-center">ME.zip</div></div>`,
      mount() {
        const ring = document.getElementById('galleryRing');
        let rotation = -20;
        let lastX = 0;
        let velocity = 0;
        let dragging = false;
        let frame = 0;
        const paint = () => { ring.style.transform = `rotateY(${rotation}deg) rotateX(-7deg)`; };
        const settle = () => {
          if (!dragging && Math.abs(velocity) > .01) {
            rotation += velocity;
            velocity *= .93;
            paint();
            frame = requestAnimationFrame(settle);
          }
        };
        listen(stage, 'pointerdown', (event) => {
          dragging = true;
          lastX = event.clientX;
          velocity = 0;
          stage.setPointerCapture?.(event.pointerId);
        });
        listen(stage, 'pointermove', (event) => {
          if (!dragging) return;
          velocity = (event.clientX - lastX) * .55;
          rotation += velocity;
          lastX = event.clientX;
          paint();
        });
        const release = () => {
          if (!dragging) return;
          dragging = false;
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(settle);
        };
        listen(stage, 'pointerup', release);
        listen(stage, 'pointercancel', release);
        listen(stage, 'wheel', (event) => {
          event.preventDefault();
          rotation -= event.deltaY * .1;
          velocity = -event.deltaY * .012;
          paint();
        }, { passive: false });
        paint();
        addCleanup(() => cancelAnimationFrame(frame));
      }
    },
    'animated-list': {
      n: '02', en: 'ANIMATED LIST', cn: '动画列表',
      html: () => `<div class="animated-list"><div class="list-board" id="listBoard">
        ${['方向感', '保持好奇', '持续构建', '留一点空白'].map((label, index) => `<article class="list-row" data-item="${index}"><i class="list-orb"></i><div><strong>${label}</strong><br><span>ME.zip visual note ${index + 1}</span></div><button type="button">查看</button></article>`).join('')}
      </div></div>`,
      mount() {
        const board = document.getElementById('listBoard');
        [...board.children].forEach((row) => {
          listen(row, 'click', () => {
            [...board.children].forEach((other) => other.classList.remove('is-picked'));
            row.classList.add('is-picked');
            board.prepend(row);
          });
        });
      }
    },
    'comparison-slider': {
      n: '03', en: 'COMPARISON SLIDER', cn: '比较滑块',
      html: () => `<div class="comparison"><div class="comparison-visual"></div><div class="comparison-top" id="comparisonTop"></div><span class="comparison-label before">STRUCTURE</span><span class="comparison-label after">ATMOSPHERE</span><span class="comparison-knob" id="comparisonKnob">↔</span><input class="comparison-range" id="comparisonRange" type="range" min="0" max="100" value="52" aria-label="拖动比较两种视觉方案" /></div>`,
      mount() {
        const root = stage.querySelector('.comparison');
        const range = document.getElementById('comparisonRange');
        const top = document.getElementById('comparisonTop');
        const knob = document.getElementById('comparisonKnob');
        const render = () => {
          top.style.width = `${range.value}%`;
          knob.style.left = `${range.value}%`;
        };
        listen(range, 'input', render);
        let dragging = false;
        const setFromPointer = (event) => {
          const point = readPoint(event, root);
          range.value = String(Math.round(point.x * 100));
          render();
        };
        listen(root, 'pointerdown', (event) => {
          dragging = true;
          root.setPointerCapture?.(event.pointerId);
          setFromPointer(event);
        });
        listen(root, 'pointermove', (event) => { if (dragging) setFromPointer(event); });
        listen(root, 'pointerup', () => { dragging = false; });
        listen(root, 'pointercancel', () => { dragging = false; });
        render();
      }
    },
    'scroll-mask': {
      n: '04', en: 'SCROLL MASK', cn: '卷轴面具',
      html: () => `<div class="scroll-mask" id="maskScroll"><div class="mask-space"><div class="mask-word" id="maskWord">${'REVEAL'.split('').map((letter) => `<span>${letter}</span>`).join('')}</div><p class="mask-foot">在滚动里，让画面慢慢出现。</p></div></div>`,
      mount() {
        const scroll = document.getElementById('maskScroll');
        const chars = [...document.querySelectorAll('#maskWord span')];
        const render = () => {
          const progress = clamp(scroll.scrollTop / Math.max(1, scroll.scrollHeight - scroll.clientHeight), 0, 1);
          chars.forEach((char, index) => char.classList.toggle('is-revealed', progress * 1.45 > index / chars.length));
        };
        listen(scroll, 'scroll', render, { passive: true });
        render();
      }
    },
    'scroll-stack': {
      n: '05', en: 'SCROLL STACK', cn: '卷轴堆栈',
      html: () => `<div class="scroll-stack" id="stackScroll"><div class="stack-inner">${[
        ['#7559d3', '观察', '把你看到的细节，变成下一次更准确的判断。'],
        ['#d46194', '连接', '把每一段经验接到新的问题上。'],
        ['#1b8275', '构建', '让好想法有一个能被使用的形状。']
      ].map(([tone, heading, body], index) => `<article class="stack-card" style="--tone:${tone}" data-stack="${index}"><h3>${heading}</h3><p>${body}</p></article>`).join('')}</div></div>`,
      mount() {
        const scroll = document.getElementById('stackScroll');
        const cards = [...scroll.querySelectorAll('.stack-card')];
        const render = () => cards.forEach((card, index) => {
          const rect = card.getBoundingClientRect();
          const drift = clamp((72 - rect.top) / 280, 0, 1);
          card.style.transform = `translateY(${-drift * index * 18}px) scale(${1 - drift * index * .035}) rotate(${drift * index * -1.1}deg)`;
          card.style.filter = `saturate(${1 - drift * index * .12})`;
        });
        listen(scroll, 'scroll', render, { passive: true });
        render();
      }
    },
    watercolor: {
      n: '06', en: 'WATERCOLOR', cn: '水彩画',
      html: () => `<canvas class="watercolor-stage" id="watercolorCanvas" aria-label="水彩互动背景"></canvas><span class="watercolor-note">水色会跟着手势蔓延</span>`,
      mount() {
        const canvas = document.getElementById('watercolorCanvas');
        const image = new Image();
        image.src = './assets/water-ink.png';
        const blooms = [];
        let resizeNeeded = true;
        const draw = () => {
          const { ctx, width, height } = sizedCanvas(canvas);
          if (!ctx) return;
          ctx.clearRect(0, 0, width, height);
          if (image.complete) ctx.drawImage(image, 0, 0, width, height);
          blooms.forEach((bloom) => {
            bloom.life *= .985;
            bloom.radius += bloom.speed;
            const gradient = ctx.createRadialGradient(bloom.x, bloom.y, 0, bloom.x, bloom.y, bloom.radius);
            gradient.addColorStop(0, `hsla(${bloom.hue}, 92%, 72%, ${.27 * bloom.life})`);
            gradient.addColorStop(.52, `hsla(${bloom.hue + 30}, 78%, 60%, ${.1 * bloom.life})`);
            gradient.addColorStop(1, 'transparent');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(bloom.x, bloom.y, bloom.radius, 0, Math.PI * 2);
            ctx.fill();
          });
          for (let index = blooms.length - 1; index >= 0; index -= 1) if (blooms[index].life < .04) blooms.splice(index, 1);
        };
        listen(stage, 'pointermove', (event) => {
          const point = readPoint(event, stage);
          blooms.push({ x: point.x * canvas.width, y: point.y * canvas.height, radius: 8, speed: 1.2 + Math.random() * 1.7, life: 1, hue: 176 + Math.random() * 86 });
          if (blooms.length > 38) blooms.shift();
        });
        listen(window, 'resize', () => { resizeNeeded = true; });
        image.addEventListener('load', () => { resizeNeeded = true; });
        canvasLoop(canvas, draw);
      }
    },
    'neural-tunnel': {
      n: '07', en: 'NEURAL TUNNEL', cn: '神经隧道',
      html: () => `<canvas class="neural-stage" id="neuralCanvas" aria-label="神经隧道互动背景"></canvas>`,
      mount() {
        const canvas = document.getElementById('neuralCanvas');
        const rings = Array.from({ length: 25 }, (_, index) => ({ z: index / 25, phase: Math.random() * Math.PI * 2 }));
        let pointer = { x: 0, y: 0 };
        listen(stage, 'pointermove', (event) => { const point = readPoint(event, stage); pointer = { x: point.x * 2 - 1, y: point.y * 2 - 1 }; });
        canvasLoop(canvas, (time) => {
          const { ctx, width, height } = sizedCanvas(canvas);
          if (!ctx) return;
          ctx.fillStyle = '#06111d';
          ctx.fillRect(0, 0, width, height);
          const cx = width * (.5 + pointer.x * .08);
          const cy = height * (.5 + pointer.y * .08);
          const max = Math.max(width, height);
          ctx.lineWidth = Math.max(1, width / 800);
          rings.forEach((ring, ringIndex) => {
            ring.z -= .0026;
            if (ring.z < .03) ring.z += 1;
            const radius = (1 - ring.z) * max * .83;
            const alpha = clamp((1 - ring.z) * .62, .04, .58);
            ctx.strokeStyle = `hsla(${190 + ringIndex * 4 + Math.sin(time * .0006 + ring.phase) * 32}, 85%, 70%, ${alpha})`;
            ctx.beginPath();
            for (let point = 0; point <= 18; point += 1) {
              const angle = point / 18 * Math.PI * 2 + ring.phase + time * .00015;
              const wobble = radius * (1 + Math.sin(angle * 3 + time * .0015) * .12);
              const x = cx + Math.cos(angle) * wobble;
              const y = cy + Math.sin(angle) * wobble * .65;
              if (point === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
          });
          ctx.fillStyle = '#eafffb';
          ctx.shadowBlur = 18;
          ctx.shadowColor = '#7ffff0';
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(2, max * .006), 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        });
      }
    },
    'blur-highlight': {
      n: '08', en: 'BLUR HIGHLIGHT', cn: '模糊高光',
      html: () => `<div class="blur-highlight"><div class="blur-words" id="blurWords">${['把注意力', '放在真正', '重要的', '东西上'].map((word) => `<button type="button">${word}</button>`).join('')}</div></div>`,
      mount() {
        const words = document.getElementById('blurWords');
        [...words.children].forEach((word) => {
          const focus = () => { words.classList.add('is-focused'); [...words.children].forEach((other) => other.classList.toggle('is-active', other === word)); };
          listen(word, 'mouseenter', focus);
          listen(word, 'focus', focus);
          listen(word, 'click', focus);
        });
        listen(words, 'mouseleave', () => { words.classList.remove('is-focused'); [...words.children].forEach((word) => word.classList.remove('is-active')); });
      }
    },
    'text-scatter': {
      n: '09', en: 'TEXT SCATTER', cn: '文本散布',
      html: () => `<div class="scatter-stage"><div class="scatter-text" id="scatterText">${'UNFOLD'.split('').map((letter, index) => `<span style="--x:${(Math.random() * 2 - 1) * (58 + index * 5)}px;--y:${(Math.random() * 2 - 1) * 92}px;--r:${(Math.random() * 2 - 1) * 48}deg">${letter}</span>`).join('')}</div></div>`,
      mount() {
        const word = document.getElementById('scatterText');
        listen(word, 'pointerenter', () => word.classList.add('is-scattered'));
        listen(word, 'pointerleave', () => word.classList.remove('is-scattered'));
        listen(word, 'click', () => word.classList.toggle('is-scattered'));
      }
    },
    'speeding-text': {
      n: '10', en: 'SPEEDING TEXT', cn: '快速文本',
      html: () => `<div class="speed-stage"><div class="speed-lines"></div><div class="speed-text" id="speedText">FOCUS</div></div>`,
      mount() {
        const node = document.getElementById('speedText');
        const words = ['FOCUS', 'MOTION', 'FUTURE', 'BUILD'];
        let index = 0;
        const timer = window.setInterval(() => {
          index = (index + 1) % words.length;
          node.innerHTML = words[index].split('').map((letter) => `<span>${letter}</span>`).join('');
        }, 1450);
        addCleanup(() => clearInterval(timer));
      }
    },
    'particle-text': {
      n: '11', en: 'PARTICLE TEXT', cn: '粒子文本',
      html: () => `<canvas class="particle-stage" id="particleCanvas" aria-label="粒子组成文字的互动效果"></canvas>`,
      mount() {
        const canvas = document.getElementById('particleCanvas');
        let particles = [];
        let pointer = { x: -10000, y: -10000 };
        let currentWidth = 0;
        let currentHeight = 0;
        const build = () => {
          const { ctx, width, height } = sizedCanvas(canvas);
          if (!ctx || (width === currentWidth && height === currentHeight)) return;
          currentWidth = width;
          currentHeight = height;
          const offscreen = document.createElement('canvas');
          offscreen.width = width;
          offscreen.height = height;
          const octx = offscreen.getContext('2d');
          const fontSize = Math.min(width * .19, height * .29);
          octx.fillStyle = '#fff';
          octx.font = `900 ${fontSize}px Inter, sans-serif`;
          octx.textAlign = 'center';
          octx.textBaseline = 'middle';
          octx.fillText('ME.zip', width / 2, height / 2);
          const pixels = octx.getImageData(0, 0, width, height).data;
          particles = [];
          const gap = Math.max(4, Math.round(width / 210));
          for (let y = 0; y < height; y += gap) for (let x = 0; x < width; x += gap) {
            if (pixels[(y * width + x) * 4 + 3] > 128) particles.push({ x: x + (Math.random() - .5) * 75, y: y + (Math.random() - .5) * 75, tx: x, ty: y, size: 1 + Math.random() * 1.7 });
          }
        };
        listen(stage, 'pointermove', (event) => { const point = readPoint(event, stage); pointer = { x: point.x * canvas.width, y: point.y * canvas.height }; });
        listen(stage, 'pointerleave', () => { pointer = { x: -10000, y: -10000 }; });
        listen(window, 'resize', () => { currentWidth = 0; });
        canvasLoop(canvas, () => {
          build();
          const { ctx, width, height } = sizedCanvas(canvas);
          if (!ctx) return;
          ctx.clearRect(0, 0, width, height);
          particles.forEach((particle, index) => {
            const dx = particle.x - pointer.x;
            const dy = particle.y - pointer.y;
            const distance = Math.hypot(dx, dy) || 1;
            if (distance < 105) {
              particle.x += dx / distance * (106 - distance) * .22;
              particle.y += dy / distance * (106 - distance) * .22;
            }
            particle.x += (particle.tx - particle.x) * .064;
            particle.y += (particle.ty - particle.y) * .064;
            ctx.fillStyle = index % 7 === 0 ? '#f47ebb' : index % 5 === 0 ? '#65e6c8' : '#e6e7ff';
            ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
          });
        });
      }
    },
    'bending-marquee': {
      n: '12', en: 'BENDING MARQUEE', cn: '弯曲帐篷',
      html: () => `<div class="bending-stage"><svg viewBox="0 0 1000 620" role="img" aria-label="沿弯曲路径移动的文字"><defs><path id="marqueePath" d="M-180,312 C155,68 765,552 1190,308"/></defs><text><textPath id="marqueeText" href="#marqueePath" startOffset="0%">ME.zip · PERSONAL UNIVERSE · ALWAYS BECOMING · ME.zip · PERSONAL UNIVERSE · ALWAYS BECOMING · </textPath></text></svg></div>`,
      mount() {
        const path = document.getElementById('marqueeText');
        let start = 0;
        let slow = false;
        let frame = 0;
        const render = () => {
          start = (start + (slow ? .045 : .16)) % 100;
          path.setAttribute('startOffset', `${start}%`);
          frame = requestAnimationFrame(render);
        };
        listen(stage, 'pointerenter', () => { slow = true; });
        listen(stage, 'pointerleave', () => { slow = false; });
        frame = requestAnimationFrame(render);
        addCleanup(() => cancelAnimationFrame(frame));
      }
    },
    'staggered-text': {
      n: '13', en: 'STAGGERED TEXT', cn: '错开文本',
      html: () => `<div class="stagger-stage" id="staggerStage"><div class="stagger-lines">${['看见', '理解', '动手'].map((line, index) => `<span><i style="transition-delay:${index * 150}ms">${line}</i></span>`).join('')}</div></div>`,
      mount() {
        const root = document.getElementById('staggerStage');
        const timer = window.setTimeout(() => root.classList.add('is-in'), 160);
        listen(root, 'click', () => { root.classList.remove('is-in'); window.setTimeout(() => root.classList.add('is-in'), 80); });
        addCleanup(() => clearTimeout(timer));
      }
    },
    'tilted-tiles': {
      n: '14', en: 'TILTED TILES', cn: '倾斜瓷砖',
      html: () => `<div class="tilt-stage"><div class="tile-grid" id="tileGrid">${Array.from({ length: 9 }, (_, index) => `<i class="tile" style="--z:${(index % 3) * 12}px"></i>`).join('')}</div></div>`,
      mount() {
        const grid = document.getElementById('tileGrid');
        listen(stage, 'pointermove', (event) => {
          const point = readPoint(event, stage);
          grid.style.transform = `rotateX(${(point.y - .5) * -16}deg) rotateY(${(point.x - .5) * 21}deg)`;
        });
        listen(stage, 'pointerleave', () => { grid.style.transform = ''; });
      }
    },
    'simple-graph': {
      n: '15', en: 'SIMPLE GRAPH', cn: '简单图',
      html: () => `<div class="graph-stage"><span class="graph-caption">构建的节奏</span><svg class="simple-graph" viewBox="0 0 800 480" role="img" aria-label="互动折线图"><defs><linearGradient id="graph-gradient" x1="0" x2="1"><stop stop-color="#63e9c8"/><stop offset=".5" stop-color="#7c8dff"/><stop offset="1" stop-color="#f77fba"/></linearGradient></defs><path class="gridline" d="M60 90H760M60 180H760M60 270H760M60 360H760M120 50V410M270 50V410M420 50V410M570 50V410M720 50V410"/><path class="line" d="M60 350 C140 300 180 337 240 258 S350 286 410 196 S510 250 570 154 S680 171 740 83"/><g id="graphDots">${[[60,350],[240,258],[410,196],[570,154],[740,83]].map(([x,y]) => `<circle class="dot" cx="${x}" cy="${y}" r="9"></circle>`).join('')}</g></svg></div>`,
      mount() {
        [...document.querySelectorAll('#graphDots .dot')].forEach((dot) => {
          listen(dot, 'mouseenter', () => dot.setAttribute('r', '15'));
          listen(dot, 'mouseleave', () => dot.setAttribute('r', '9'));
        });
      }
    },
    'grid-rise': {
      n: '16', en: 'GRID RISE', cn: '网格上升',
      html: () => `<div class="grid-rise" id="gridRise">${Array.from({ length: 36 }, (_, index) => `<i class="rise-cell" style="--i:${index};--height:${22 + (index * 19) % 160}"></i>`).join('')}</div>`,
      mount() {
        const grid = document.getElementById('gridRise');
        listen(grid, 'pointermove', (event) => {
          const point = readPoint(event, grid);
          [...grid.children].forEach((cell, index) => {
            const col = index % 6;
            const row = Math.floor(index / 6);
            const distance = Math.hypot(col / 5 - point.x, row / 5 - point.y);
            cell.style.filter = `brightness(${1 + clamp(1 - distance * 2.3, 0, 1) * .76})`;
          });
        });
      }
    },
    'glass-cursor': {
      n: '17', en: 'GLASS CURSOR', cn: '玻璃光标',
      html: () => `<div class="cursor-stage" id="glassStage"><h3>把视线<br>留在这里</h3><i class="glass-orb" id="glassOrb"></i></div>`,
      mount() {
        const root = document.getElementById('glassStage');
        const orb = document.getElementById('glassOrb');
        listen(root, 'pointermove', (event) => {
          const point = readPoint(event, root);
          orb.style.left = `${point.localX}px`;
          orb.style.top = `${point.localY}px`;
        });
      }
    },
    'parallax-pills': {
      n: '18', en: 'PARALLAX PILLS', cn: '视差药丸',
      html: () => `<div class="pills-stage"><div class="pills-field" id="pillsField">${['观测', '连接', '构建', '复盘', '突破'].map((word, index) => `<span class="pill" data-depth="${.4 + index * .22}">${word}</span>`).join('')}</div></div>`,
      mount() {
        const field = document.getElementById('pillsField');
        const pills = [...field.querySelectorAll('.pill')];
        listen(field, 'pointermove', (event) => {
          const point = readPoint(event, field);
          const x = point.x - .5;
          const y = point.y - .5;
          pills.forEach((pill) => {
            const depth = Number(pill.dataset.depth);
            pill.style.transform = `translate(${x * -58 * depth}px, ${y * -45 * depth}px)`;
          });
        });
        listen(field, 'pointerleave', () => pills.forEach((pill) => { pill.style.transform = ''; }));
      }
    },
    'smooth-cursor': {
      n: '19', en: 'SMOOTH CURSOR', cn: '光滑光标',
      html: () => `<div class="cursor-stage" id="smoothStage"><h3>慢一点，<br>也会到。</h3><i class="smooth-ring" id="smoothRing"></i><i class="smooth-dot" id="smoothDot"></i></div>`,
      mount() {
        const root = document.getElementById('smoothStage');
        const dot = document.getElementById('smoothDot');
        const ring = document.getElementById('smoothRing');
        const target = { x: stage.clientWidth / 2, y: stage.clientHeight / 2 };
        const current = { x: target.x, y: target.y, ringX: target.x, ringY: target.y };
        let frame = 0;
        listen(root, 'pointermove', (event) => { const point = readPoint(event, root); target.x = point.localX; target.y = point.localY; });
        const render = () => {
          current.x += (target.x - current.x) * .42;
          current.y += (target.y - current.y) * .42;
          current.ringX += (target.x - current.ringX) * .12;
          current.ringY += (target.y - current.ringY) * .12;
          dot.style.left = `${current.x}px`; dot.style.top = `${current.y}px`;
          ring.style.left = `${current.ringX}px`; ring.style.top = `${current.ringY}px`;
          frame = requestAnimationFrame(render);
        };
        frame = requestAnimationFrame(render);
        addCleanup(() => cancelAnimationFrame(frame));
      }
    },
    'text-cube': {
      n: '20', en: 'TEXT CUBE', cn: '文本立方体',
      html: () => `<div class="cube-stage" id="cubeStage"><div class="text-cube" id="textCube">${['ME', 'ZIP', 'MAKE', 'MOVE', 'NOW', '∞'].map((word) => `<span class="cube-face">${word}</span>`).join('')}</div></div>`,
      mount() {
        const root = document.getElementById('cubeStage');
        const cube = document.getElementById('textCube');
        let idle = 0;
        let frame = 0;
        listen(root, 'pointermove', (event) => { const point = readPoint(event, root); cube.style.transform = `rotateX(${(point.y - .5) * -45}deg) rotateY(${(point.x - .5) * 52}deg)`; });
        listen(root, 'pointerleave', () => { cube.style.transform = ''; });
        const spin = () => { if (!root.matches(':hover')) { idle += .18; cube.style.transform = `rotateX(${-16 + Math.sin(idle * .01) * 5}deg) rotateY(${idle}deg)`; } frame = requestAnimationFrame(spin); };
        frame = requestAnimationFrame(spin);
        addCleanup(() => cancelAnimationFrame(frame));
      }
    },
    'user-cursor': {
      n: '21', en: 'USER CURSOR', cn: '用户光标',
      html: () => `<div class="user-cursor-stage" id="userCursorStage"><strong class="user-cursor-center">一起看见</strong>${[['阿乐','#71e3c9'],['Yuki','#f38ac0'],['Milo','#8da4ff']].map(([name,color], index) => `<span class="peer-cursor" data-i="${index}" style="--peer:${color};left:${20 + index * 24}%;top:${24 + index * 18}%"><i>${name}</i></span>`).join('')}</div>`,
      mount() {
        const root = document.getElementById('userCursorStage');
        const peers = [...root.querySelectorAll('.peer-cursor')];
        let pointer = { x: .5, y: .5 };
        listen(root, 'pointermove', (event) => { const point = readPoint(event, root); pointer = { x: point.x, y: point.y }; });
        const timer = window.setInterval(() => peers.forEach((peer, index) => {
          const x = clamp(pointer.x * 100 + (Math.random() - .5) * 26 + (index - 1) * 5, 4, 92);
          const y = clamp(pointer.y * 100 + (Math.random() - .5) * 22 + (index - 1) * 4, 8, 88);
          peer.style.transform = `translate(${x - Number(peer.style.left.replace('%',''))}%, ${y - Number(peer.style.top.replace('%',''))}%)`;
        }), 720);
        addCleanup(() => clearInterval(timer));
      }
    },
    circles: {
      n: '22', en: 'CIRCLES', cn: '圆圈',
      html: () => `<div class="circles-stage"><div class="circle-shell"><i class="circle"></i><i class="circle"></i><i class="circle"></i><i class="circle"></i><span>ORBIT</span></div></div>`,
      mount() { /* CSS-driven orbit is intentionally lightweight. */ }
    },
    'tumble-carousel': {
      n: '23', en: 'TUMBLE CAROUSEL', cn: '翻滚旋转木马',
      html: () => `<div class="carousel-stage"><div class="tumble-track" id="tumbleTrack">${carouselCards}</div></div>`,
      mount() {
        const track = document.getElementById('tumbleTrack');
        let x = -120;
        let originX = 0;
        let originOffset = x;
        let dragging = false;
        const paint = () => { track.style.transform = `translateX(${x}px)`; };
        listen(track, 'pointerdown', (event) => { dragging = true; originX = event.clientX; originOffset = x; track.classList.add('is-dragging'); track.setPointerCapture?.(event.pointerId); });
        listen(track, 'pointermove', (event) => { if (!dragging) return; x = originOffset + (event.clientX - originX); paint(); });
        const stop = () => { dragging = false; track.classList.remove('is-dragging'); };
        listen(track, 'pointerup', stop); listen(track, 'pointercancel', stop);
        paint();
      }
    }
  };

  function selectComponent() {
    const id = location.hash.replace('#', '') || 'circle-gallery';
    return components[id] ? id : 'circle-gallery';
  }

  function renderComponent() {
    const id = selectComponent();
    const component = components[id];
    cancelAll();
    stage.innerHTML = component.html();
    stage.className = 'demo-stage';
    stage.dataset.demo = id;
    title.textContent = component.cn;
    number.textContent = component.n;
    english.textContent = component.en;
    status.textContent = `${component.n} / 23 · 原创视觉版`;
    navLinks.forEach((link) => link.classList.toggle('is-active', link.dataset.demo === id));
    component.mount();
  }

  window.addEventListener('hashchange', renderComponent);
  renderComponent();
})();
