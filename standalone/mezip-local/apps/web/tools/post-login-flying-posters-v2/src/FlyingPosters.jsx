import { useEffect, useRef } from 'react';
import { Camera, Mesh, Plane, Program, Renderer, Texture, Transform } from 'ogl';

const vertexShader = `
precision highp float;

attribute vec3 position;
attribute vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uPosition;
uniform vec3 distortionAxis;
uniform vec3 rotationAxis;
uniform float uDistortion;

varying vec2 vUv;

float PI = 3.141592653589793238;

mat4 rotationMatrix(vec3 axis, float angle) {
  axis = normalize(axis);
  float s = sin(angle);
  float c = cos(angle);
  float oc = 1.0 - c;

  return mat4(
    oc * axis.x * axis.x + c,          oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
    oc * axis.x * axis.y + axis.z * s, oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
    oc * axis.z * axis.x - axis.y * s, oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
    0.0,                               0.0,                                0.0,                                1.0
  );
}

vec3 rotate(vec3 value, vec3 axis, float angle) {
  return (rotationMatrix(axis, angle) * vec4(value, 1.0)).xyz;
}

float quinticInOut(float value) {
  return value < 0.5
    ? 16.0 * pow(value, 5.0)
    : -0.5 * abs(pow(2.0 * value - 2.0, 5.0)) + 1.0;
}

void main() {
  vUv = uv;
  float norm = 0.5;
  vec3 newPosition = position;
  float offset = (dot(distortionAxis, position) + norm / 2.0) / norm;
  float localProgress = clamp(
    (fract(uPosition * 5.0 * 0.01) - 0.01 * uDistortion * offset) / (1.0 - 0.01 * uDistortion),
    0.0,
    2.0
  );
  localProgress = quinticInOut(localProgress) * PI;
  newPosition = rotate(newPosition, rotationAxis, localProgress);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform vec2 uImageSize;
uniform vec2 uPlaneSize;
uniform sampler2D tMap;

varying vec2 vUv;

void main() {
  float imageAspect = uImageSize.x / uImageSize.y;
  float planeAspect = uPlaneSize.x / uPlaneSize.y;
  vec2 scale = vec2(1.0, 1.0);

  if (planeAspect > imageAspect) {
    scale.x = imageAspect / planeAspect;
  } else {
    scale.y = planeAspect / imageAspect;
  }

  vec2 uv = vUv * scale + (1.0 - scale) * 0.5;
  gl_FragColor = texture2D(tMap, uv);
}
`;

const lerp = (start, end, amount) => start + (end - start) * amount;

const map = (value, min1, max1, min2, max2) => {
  const normalized = (value - min1) / (max1 - min1);
  return normalized * (max2 - min2) + min2;
};

const roundedRect = (context, x, y, width, height, radius) => {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
};

const wrapText = (context, text, maxWidth) => {
  const words = text.replace(/[“”]/g, '').split(' ');
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const createPosterTexture = (image, item) => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const width = 1200;
  const height = 1875;
  const cardX = 150;
  const cardY = 570;
  const cardWidth = 900;
  const cardHeight = 1245;

  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#f4eee5';
  context.shadowColor = 'rgba(168, 127, 255, 0.34)';
  context.shadowBlur = 28;
  context.font = 'italic 54px Georgia, "Times New Roman", serif';

  const lines = wrapText(context, item.quote, 980);
  const lineHeight = 66;
  const quoteHeight = lines.length * lineHeight;
  const quoteStart = 245 - quoteHeight / 2 + lineHeight / 2;
  lines.forEach((line, index) => {
    const prefix = index === 0 ? '“' : '';
    const suffix = index === lines.length - 1 ? '”' : '';
    context.fillText(`${prefix}${line}${suffix}`, width / 2, quoteStart + index * lineHeight);
  });

  context.shadowBlur = 14;
  context.fillStyle = 'rgba(224, 213, 198, 0.78)';
  context.font = '600 24px Inter, Arial, sans-serif';
  context.letterSpacing = '5px';
  context.fillText(`— ${item.author.toUpperCase()}`, width / 2, 445);
  context.letterSpacing = '0px';

  context.save();
  context.shadowColor = 'rgba(0, 0, 0, 0.72)';
  context.shadowBlur = 48;
  context.shadowOffsetY = 28;
  context.fillStyle = '#100b16';
  roundedRect(context, cardX, cardY, cardWidth, cardHeight, 36);
  context.fill();
  context.restore();

  context.save();
  roundedRect(context, cardX, cardY, cardWidth, cardHeight, 36);
  context.clip();
  const imageAspect = image.naturalWidth / image.naturalHeight;
  const cardAspect = cardWidth / cardHeight;
  let drawWidth = cardWidth;
  let drawHeight = cardHeight;
  let drawX = cardX;
  let drawY = cardY;

  if (imageAspect > cardAspect) {
    drawWidth = cardHeight * imageAspect;
    drawX = cardX - (drawWidth - cardWidth) / 2;
  } else {
    drawHeight = cardWidth / imageAspect;
    drawY = cardY - (drawHeight - cardHeight) / 2;
  }
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  context.restore();

  context.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  context.lineWidth = 2;
  roundedRect(context, cardX + 1, cardY + 1, cardWidth - 2, cardHeight - 2, 36);
  context.stroke();

  return canvas;
};

class Media {
  constructor({ gl, geometry, scene, screen, viewport, item, length, index, planeWidth, planeHeight, distortion }) {
    this.extra = 0;
    this.gl = gl;
    this.geometry = geometry;
    this.scene = scene;
    this.screen = screen;
    this.viewport = viewport;
    this.item = item;
    this.length = length;
    this.index = index;
    this.planeWidth = planeWidth;
    this.planeHeight = planeHeight;
    this.distortion = distortion;
    this.createShader();
    this.createMesh();
    this.onResize();
  }

  createShader() {
    const texture = new Texture(this.gl, { generateMipmaps: false });
    this.program = new Program(this.gl, {
      depthTest: false,
      depthWrite: false,
      transparent: true,
      fragment: fragmentShader,
      vertex: vertexShader,
      uniforms: {
        tMap: { value: texture },
        uPosition: { value: 0 },
        uPlaneSize: { value: [0, 0] },
        uImageSize: { value: [1200, 1875] },
        rotationAxis: { value: [0, 1, 0] },
        distortionAxis: { value: [1, 1, 0] },
        uDistortion: { value: this.distortion },
      },
      cullFace: false,
    });

    const image = new Image();
    image.src = this.item.image;
    image.onload = () => {
      texture.image = createPosterTexture(image, this.item);
      this.program.uniforms.uImageSize.value = [1200, 1875];
      window.dispatchEvent(new CustomEvent('poster-texture-ready'));
    };
  }

  createMesh() {
    this.plane = new Mesh(this.gl, { geometry: this.geometry, program: this.program });
    this.plane.setParent(this.scene);
  }

  setScale() {
    this.plane.scale.x = (this.viewport.width * this.planeWidth) / this.screen.width;
    this.plane.scale.y = (this.viewport.height * this.planeHeight) / this.screen.height;
    this.plane.position.x = 0;
    this.program.uniforms.uPlaneSize.value = [this.plane.scale.x, this.plane.scale.y];
  }

  onResize({ screen, viewport } = {}) {
    if (screen) this.screen = screen;
    if (viewport) this.viewport = viewport;
    this.setScale();
    this.padding = 4.25;
    this.height = this.plane.scale.y + this.padding;
    this.heightTotal = this.height * this.length;
    this.y = -this.heightTotal / 2 + (this.index + 0.5) * this.height;
  }

  update(scroll, shouldWrap = true) {
    this.plane.position.y = this.y - scroll.current - this.extra;
    const position = map(this.plane.position.y, -this.viewport.height, this.viewport.height, 5, 15);
    this.program.uniforms.uPosition.value = position;

    const topEdge = this.plane.position.y + this.plane.scale.y / 2;
    const bottomEdge = this.plane.position.y - this.plane.scale.y / 2;
    if (shouldWrap) {
      if (topEdge < -this.viewport.height / 2) this.extra -= this.heightTotal;
      else if (bottomEdge > this.viewport.height / 2) this.extra += this.heightTotal;
    }
  }
}

class CanvasScene {
  constructor({ container, canvas, items, planeWidth, planeHeight, distortion, scrollEase, cameraFov, cameraZ, finite = false, onProgress, onComplete }) {
    this.container = container;
    this.canvas = canvas;
    this.items = items;
    this.planeWidth = planeWidth;
    this.planeHeight = planeHeight;
    this.distortion = distortion;
    this.scroll = { ease: scrollEase, current: 0, target: 0, last: 0 };
    this.cameraFov = cameraFov;
    this.cameraZ = cameraZ;
    this.finite = finite;
    this.onProgress = onProgress;
    this.onComplete = onComplete;
    this.progressIndex = -1;
    this.completed = false;
    this.update = this.update.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);

    this.renderer = new Renderer({ canvas, alpha: true, antialias: true, dpr: Math.min(window.devicePixelRatio, 2) });
    this.gl = this.renderer.gl;
    this.gl.clearColor(0, 0, 0, 0);
    this.camera = new Camera(this.gl);
    this.camera.fov = this.cameraFov;
    this.camera.position.z = this.cameraZ;
    this.scene = new Transform();
    this.onResize();
    this.geometry = new Plane(this.gl, { heightSegments: 1, widthSegments: 100 });
    this.medias = this.items.map((item, index) => new Media({
      gl: this.gl,
      geometry: this.geometry,
      scene: this.scene,
      screen: this.screen,
      viewport: this.viewport,
      item,
      length: this.items.length,
      index,
      planeWidth: this.planeWidth,
      planeHeight: this.planeHeight,
      distortion: this.distortion,
    }));
    this.onResize();
    this.stepDistance = Math.abs((this.medias[1]?.y ?? 0) - (this.medias[0]?.y ?? 0)) || this.medias[0]?.height || 1;
    this.focusY = this.finite ? -this.viewport.height * 0.4 : 0;
    const initialOffset = (this.medias[0]?.y ?? 0) - this.focusY;
    this.startOffset = initialOffset;
    this.lastCardOffset = initialOffset + this.stepDistance * Math.max(0, this.items.length - 1);
    this.endOffset = this.lastCardOffset + this.stepDistance * 0.72;
    this.scroll.current = initialOffset;
    this.scroll.target = initialOffset;
    this.scroll.last = initialOffset;
    this.emitProgress();
    this.addEventListeners();
    this.update();
  }

  onResize() {
    const rect = this.container.getBoundingClientRect();
    this.screen = { width: rect.width, height: rect.height };
    this.renderer.setSize(this.screen.width, this.screen.height);
    this.camera.perspective({ aspect: this.gl.canvas.width / this.gl.canvas.height });
    const fov = (this.camera.fov * Math.PI) / 180;
    const height = 2 * Math.tan(fov / 2) * this.camera.position.z;
    this.viewport = { height, width: height * this.camera.aspect };
    if (this.medias) this.medias.forEach((media) => media.onResize({ screen: this.screen, viewport: this.viewport }));
  }

  onWheel(event) {
    if (this.finite) event.preventDefault();
    if (this.completed) return;
    const nextTarget = this.scroll.target + event.deltaY * (this.finite ? 0.012 : 0.005);
    this.scroll.target = this.finite ? Math.min(this.endOffset, Math.max(this.startOffset, nextTarget)) : nextTarget;
  }

  onPointerDown(event) {
    this.isDown = true;
    this.scroll.position = this.scroll.current;
    this.start = event.clientY;
    this.canvas.setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event) {
    if (!this.isDown) return;
    const nextTarget = this.scroll.position + (this.start - event.clientY) * 0.1;
    this.scroll.target = this.finite ? Math.min(this.endOffset, Math.max(this.startOffset, nextTarget)) : nextTarget;
  }

  onPointerUp() {
    this.isDown = false;
  }

  update() {
    this.scroll.current = lerp(this.scroll.current, this.scroll.target, this.scroll.ease);
    this.medias?.forEach((media) => media.update(this.scroll, !this.finite));
    if (this.finite) {
      this.emitProgress();
      if (!this.completed && this.scroll.target >= this.endOffset && this.scroll.current >= this.lastCardOffset + this.stepDistance * 0.38) {
        this.completed = true;
        this.onComplete?.();
      }
    }
    this.renderer.render({ scene: this.scene, camera: this.camera });
    this.scroll.last = this.scroll.current;
    this.frame = requestAnimationFrame(this.update);
  }

  emitProgress() {
    if (!this.finite || !this.stepDistance) return;
    const nextIndex = Math.min(this.items.length - 1, Math.max(0, Math.round((this.scroll.current - this.startOffset) / this.stepDistance)));
    if (nextIndex === this.progressIndex) return;
    this.progressIndex = nextIndex;
    this.onProgress?.(nextIndex);
  }

  addEventListeners() {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
  }
}

export default function FlyingPosters(props) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return undefined;
    const scene = new CanvasScene({
      container: containerRef.current,
      canvas: canvasRef.current,
      ...props,
    });
    return () => scene.destroy();
  }, [props.items, props.planeWidth, props.planeHeight, props.distortion, props.scrollEase, props.cameraFov, props.cameraZ, props.finite, props.onProgress, props.onComplete]);

  return (
    <div ref={containerRef} className="posters-container">
      <canvas ref={canvasRef} className="posters-canvas" aria-hidden="true" />
    </div>
  );
}
