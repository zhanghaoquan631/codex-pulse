/**
 * Original paper-and-ink battle effects. DOM, textures, audio and renderer free.
 * World convention: +Y up. Event xyz is the impact/muzzle/feet world position.
 * Optional event groundY anchors floor dust; elevated requests a roof marker.
 * All buffers/geometries/materials are owned here. At most five draw calls.
 */
export const BATTLE_FEEDBACK = Object.freeze({
  muzzle: Object.freeze({ recoil: .012, duration: .12, trauma: .045 }),
  shotgun: Object.freeze({ recoil: .033, duration: .21, trauma: .12 }),
  hit: Object.freeze({ recoil: 0, duration: .07, trauma: .025 }),
  kill: Object.freeze({ recoil: 0, duration: .16, trauma: .05 }),
  bossKill: Object.freeze({ recoil: 0, duration: .38, trauma: .18 }),
  spawn: Object.freeze({ recoil: 0, duration: .2, trauma: 0 }),
  bossSpawn: Object.freeze({ recoil: 0, duration: .32, trauma: .12 }),
  enemyShot: Object.freeze({ recoil: 0, duration: .1, trauma: 0 }),
});

const INK = 0x28567d, RED = 0xb12d38, GOLD = 0xc07b30, PAPER = 0xf1e5bf;
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const random = (a, b) => a + Math.random() * (b - a);

export function createBattleVFX({ THREE, scene }) {
  if (!THREE?.InstancedMesh || !scene?.add) throw new TypeError('BattleVFX requires THREE and a scene.');
  let disposed = false, clock = 0;
  const root = new THREE.Group();
  root.name = 'Original pooled battle ink';
  scene.add(root);
  const dummy = new THREE.Object3D();
  const cameraQuaternion = new THREE.Quaternion(), cameraPosition = new THREE.Vector3();
  const rotation = new THREE.Quaternion(), yawRotation = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1), yAxis = new THREE.Vector3(0, 1, 0), xAxis = new THREE.Vector3(1, 0, 0);
  const direction = new THREE.Vector3(), color = new THREE.Color();
  const ribbonSide = new THREE.Vector3(), ribbonNormal = new THREE.Vector3(), toCamera = new THREE.Vector3();
  const ribbonBasis = new THREE.Matrix4();

  function geometry(triangles) {
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(triangles.flat(2), 3));
    result.computeBoundingSphere();
    return result;
  }
  function triangle(out, a, b, c) { out.push([a, b, c]); }
  function quad(out, a, b, c, d) { triangle(out, a, b, c); triangle(out, a, c, d); }
  function ribbon(out, ax, ay, bx, by, width) {
    const length = Math.hypot(bx - ax, by - ay) || 1;
    const dx = (by - ay) / length * width, dy = -(bx - ax) / length * width;
    quad(out, [ax + dx, ay + dy, 0], [ax - dx, ay - dy, 0],
      [bx - dx, by - dy, 0], [bx + dx, by + dy, 0]);
  }
  function starGeometry() {
    const out = [], count = 16;
    for (let i = 0; i < count; i++) {
      const angle = i / count * TAU, next = (i + 1) / count * TAU;
      const r = i % 2 ? .24 : .86 + .14 * Math.sin(i * 2.1) ** 2;
      const r2 = (i + 1) % 2 ? .24 : .86 + .14 * Math.sin((i + 1) * 2.1) ** 2;
      ribbon(out, Math.cos(angle) * r, Math.sin(angle) * r,
        Math.cos(next) * r2, Math.sin(next) * r2, .022);
    }
    return geometry(out);
  }
  function ringGeometry() {
    const out = [], count = 52;
    for (let i = 0; i < count; i++) {
      if (i % 17 === 0 || i % 17 === 1) continue;
      const a = i / count * TAU, b = (i + 1) / count * TAU;
      const r = 1 + Math.sin(a * 7 + .8) * .015 + Math.cos(a * 11) * .009;
      const r2 = 1 + Math.sin(b * 7 + .8) * .015 + Math.cos(b * 11) * .009;
      ribbon(out, Math.cos(a) * r, Math.sin(a) * r, Math.cos(b) * r2, Math.sin(b) * r2, .013);
    }
    return geometry(out);
  }
  function paperGeometry() {
    const out = [];
    quad(out, [-.43, -.47, -.045], [.43, -.4, 0], [.33, .13, .05], [-.5, .08, .02]);
    quad(out, [-.5, .08, .02], [.33, .13, .05], [.47, .46, -.04], [-.3, .5, 0]);
    return geometry(out);
  }
  function chevronGeometry() {
    const out = [];
    ribbon(out, -.5, .44, 0, 0, .04); ribbon(out, 0, 0, .5, .44, .04);
    ribbon(out, -.34, .78, 0, .47, .028); ribbon(out, 0, .47, .34, .78, .028);
    return geometry(out);
  }

  const vertexShader = `
    attribute vec4 fxColor;
    varying vec4 vFxColor;
    varying vec3 vFxLocal;
    void main() {
      vFxColor = fxColor;
      vFxLocal = position;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }
  `;
  const fragmentShader = `
    varying vec4 vFxColor;
    varying vec3 vFxLocal;
    void main() {
      vec3 paint = vFxColor.rgb;
      #ifdef PAPER_CHIP
        float hatch = step(.82, fract((vFxLocal.x + vFxLocal.y * .68) * 9.0));
        float edge = smoothstep(.31, .43, abs(vFxLocal.x));
        paint = mix(vec3(.89, .85, .73), paint, max(.18 + hatch * .57, edge));
      #endif
      gl_FragColor = vec4(paint, vFxColor.a);
      #include <colorspace_fragment>
    }
  `;
  function batch(name, capacity, shape) {
    const tint = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    tint.setUsage(THREE.DynamicDrawUsage);
    shape.setAttribute('fxColor', tint);
    const material = new THREE.ShaderMaterial({
      name: `Pooled ink ${name}`, vertexShader, fragmentShader,
      defines: name === 'paper' ? { PAPER_CHIP: 1 } : {},
      transparent: true, depthWrite: false, depthTest: true,
      side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false,
    });
    const mesh = new THREE.InstancedMesh(shape, material, capacity);
    mesh.name = `Battle ${name} pool`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    root.add(mesh);
    const particles = Array.from({ length: capacity }, () => ({ life: 0 }));
    return { name, mesh, tint, particles, cursor: 0, capacity };
  }
  const batches = {
    star: batch('star', 24, starGeometry()),
    ring: batch('ring', 48, ringGeometry()),
    streak: batch('streak', 160, geometry([[[-.5, 0, 0], [.5, 0, 0], [0, 1, 0]]])),
    paper: batch('paper', 144, paperGeometry()),
    marker: batch('marker', 24, chevronGeometry()),
  };
  const batchList = Object.values(batches);

  function spawn(kind, args) {
    const b = batches[kind];
    let item = null;
    // Reuse an expired item first; under sustained bursts recycle the oldest.
    for (let n = 0; n < b.capacity; n++) {
      const candidate = b.particles[b.cursor];
      b.cursor = (b.cursor + 1) % b.capacity;
      if (candidate.life <= 0) { item = candidate; break; }
    }
    if (!item) item = b.particles.reduce((oldest, candidate) => candidate.birth < oldest.birth ? candidate : oldest);
    color.set(args.color ?? INK);
    Object.assign(item, {
      birth: clock, life: .4, total: .4, delay: 0,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      sx: 1, sy: 1, grow: 0, gravity: 0, drag: 0,
      angle: 0, spin: 0, mode: 'billboard',
      dx: 0, dy: 0, dz: 1, floor: -Infinity,
      opacity: .85, bounce: 0, bounceUsed: false,
      r: color.r, g: color.g, b: color.b,
    }, args);
    item.total = item.life;
    return item;
  }
  function ring(x, y, z, radius, life, tint, options = {}) {
    return spawn('ring', { x, y, z, sx: radius, sy: radius, life, color: tint, ...options });
  }
  function fragments(x, y, z, count, speed, tint, options = {}) {
    for (let i = 0; i < count; i++) {
      const a = random(0, TAU), horizontal = random(.35, 1) * speed;
      const size = random(.1, .22) * (options.size || 1);
      spawn('paper', { x, y, z, vx: Math.cos(a) * horizontal, vz: Math.sin(a) * horizontal,
        vy: random(.6, 1.6) * speed, sx: size, sy: size * random(.8, 1.5),
        life: random(.45, .85), gravity: 10, drag: 1.2, color: i % 3 ? tint : PAPER,
        angle: random(0, TAU), spin: random(-9, 9), mode: 'tumble', bounce: .23,
        ...options });
    }
  }
  function rays(x, y, z, count, radius, tint, options = {}) {
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU + random(-.15, .15);
      const dx = Math.cos(a), dz = Math.sin(a), dy = random(-.1, .65);
      const length = random(.35, .9) * radius, speed = random(.8, 2.3) * radius;
      spawn('streak', { x: x + dx * radius * .15, y, z: z + dz * radius * .15,
        dx, dy, dz, vx: dx * speed, vy: dy * speed, vz: dz * speed,
        sx: random(.013, .035), sy: length, life: random(.15, .33),
        color: tint, mode: 'direction', opacity: .8, ...options });
    }
  }
  function floorBurst(x, groundY, z, size, tint, boss = false, delay = 0) {
    ring(x, groundY + .035, z, size * .28, boss ? .7 : .5, tint,
      { mode: 'floor', grow: size * 3, opacity: .66, delay });
    ring(x, groundY + .045, z, size * .22, .48, tint,
      { mode: 'floor', grow: size * 2, opacity: .32, delay: delay + .045, angle: .19 });
    rays(x, groundY + .07, z, boss ? 15 : 7, size * .8, tint,
      { dy: .02, vy: .08, opacity: .42, delay });
  }
  function muzzle(event, enemy = false) {
    const x = finite(event.x), y = finite(event.y), z = finite(event.z);
    const shotgun = event.weaponId === 'shotgun', size = shotgun ? .48 : .29;
    direction.set(finite(event.dirX), finite(event.dirY), finite(event.dirZ, 1));
    if (direction.lengthSq() < 1e-6) direction.set(0, 0, 1);
    direction.normalize();
    const tint = event.color ?? (enemy ? RED : GOLD);
    for (let i = 0; i < 2; i++) spawn('star', { x, y, z,
      sx: size * (i ? .62 : 1), sy: size * (i ? .62 : 1),
      life: i ? .075 : .115, color: i ? INK : tint,
      angle: random(0, .5) + i * .4, spin: i ? -4 : 3, grow: 1.2,
      opacity: i ? .82 : .95 });
    ring(x + direction.x * .18, y + direction.y * .18, z + direction.z * .18,
      size * .35, .24, INK, { grow: 1.1, opacity: .27,
        vx: direction.x * .9, vy: direction.y * .9 + .35, vz: direction.z * .9,
        mode: 'normal', dx: direction.x, dy: direction.y, dz: direction.z });
    const count = shotgun ? 7 : enemy ? 5 : 4;
    for (let i = 0; i < count; i++) {
      const spread = shotgun ? .34 : .15;
      const dx = direction.x + random(-spread, spread), dy = direction.y + random(-spread, spread);
      const dz = direction.z + random(-spread, spread);
      spawn('streak', { x, y, z, dx, dy, dz, vx: dx * 6, vy: dy * 6, vz: dz * 6,
        sx: .02, sy: random(.16, .5), life: random(.055, .11), color: tint,
        mode: 'direction', opacity: .9 });
    }
    return enemy ? BATTLE_FEEDBACK.enemyShot : shotgun ? BATTLE_FEEDBACK.shotgun : BATTLE_FEEDBACK.muzzle;
  }

  /** Emit once per logical event; never once per frame while the event lives. */
  function emit(event = {}) {
    if (disposed) return null;
    const x = finite(event.x), y = finite(event.y), z = finite(event.z);
    const groundY = finite(event.groundY, Math.min(y, 0));
    const boss = !!event.boss;
    switch (event.type) {
      case 'muzzle': return muzzle(event);
      case 'enemy-shot': return muzzle(event, true);
      case 'hit': {
        const tint = event.color ?? INK;
        rays(x, y, z, event.weaponId === 'shotgun' ? 8 : 5, .45, tint);
        fragments(x, y, z, 5, 1.45, tint, { floor: groundY + .025, life: .36, size: .68 });
        ring(x, y, z, .11, .17, tint, { grow: 1.8, opacity: .65 });
        return BATTLE_FEEDBACK.hit;
      }
      case 'kill': {
        const tint = event.color ?? (boss ? GOLD : INK), size = boss ? 1.9 : .8;
        // The center remains hollow. Most debris moves away and below the target.
        rays(x, y, z, boss ? 25 : 13, size, tint);
        fragments(x, y, z, boss ? 34 : 17, boss ? 3.6 : 2.2, tint,
          { floor: groundY + .035, size: boss ? 1.5 : 1, life: boss ? 1.05 : .7 });
        ring(x, y, z, size * .28, .3, tint, { grow: size * 4, opacity: .68 });
        ring(x, y, z, size * .22, .45, tint, { grow: size * 2.4, opacity: .35, delay: .055 });
        floorBurst(x, groundY, z, size, tint, boss, .075);
        return boss ? BATTLE_FEEDBACK.bossKill : BATTLE_FEEDBACK.kill;
      }
      case 'spawn':
      case 'boss-spawn': {
        const isBoss = boss || event.type === 'boss-spawn';
        const size = isBoss ? 1.7 : .7, tint = event.color ?? (isBoss ? GOLD : RED);
        floorBurst(x, y, z, size, tint, isBoss);
        ring(x, y + .03, z, size * 1.8, isBoss ? .85 : .58, tint,
          { mode: 'floor', grow: -size * 1.5, opacity: .65 });
        fragments(x, y + .1, z, isBoss ? 18 : 7, 1.2, tint,
          { gravity: -.8, vy: isBoss ? 2 : 1, floor: y, life: .55, size: .7 });
        // A vertical, camera-facing chevron identifies roof and corner arrivals.
        spawn('marker', { x, y: y + (isBoss ? 3.7 : 2.25), z,
          sx: isBoss ? 1.25 : event.elevated ? .86 : .6,
          sy: isBoss ? 1.25 : event.elevated ? .86 : .6,
          life: isBoss ? 1.75 : event.elevated ? 1.6 : .95,
          color: tint, mode: 'marker', opacity: .85 });
        return isBoss ? BATTLE_FEEDBACK.bossSpawn : BATTLE_FEEDBACK.spawn;
      }
      default: return null;
    }
  }

  function update(dt, camera) {
    if (disposed) return;
    dt = clamp(finite(dt), 0, .08);
    clock += dt;
    if (camera?.getWorldQuaternion) camera.getWorldQuaternion(cameraQuaternion);
    if (camera?.getWorldPosition) camera.getWorldPosition(cameraPosition);
    for (const b of batchList) {
      let count = 0;
      for (const p of b.particles) {
        if (p.life <= 0) continue;
        if (p.delay > 0) { p.delay -= dt; continue; }
        p.life -= dt;
        if (p.life <= 0) continue;
        const age = p.total - p.life;
        const damping = Math.exp(-p.drag * dt);
        p.vx *= damping; p.vz *= damping;
        p.vy -= p.gravity * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < p.floor) {
          p.y = p.floor;
          p.vy = p.bounceUsed ? 0 : Math.abs(p.vy) * p.bounce;
          p.bounceUsed = true; p.vx *= .55; p.vz *= .55;
        }
        p.angle += p.spin * dt;
        dummy.position.set(p.x, p.y + (p.mode === 'marker' ? Math.sin(age * 10) * .07 : 0), p.z);
        const scale = Math.max(.008, 1 + p.grow * age);
        dummy.scale.set(p.sx * scale, p.sy * scale, p.mode === 'tumble' ? p.sx * scale : 1);
        switch (p.mode) {
          case 'floor':
            dummy.quaternion.setFromAxisAngle(xAxis, -Math.PI / 2);
            rotation.setFromAxisAngle(zAxis, p.angle); dummy.quaternion.multiply(rotation);
            break;
          case 'direction':
            direction.set(p.dx, p.dy, p.dz).normalize();
            // The ribbon's long axis follows the travel vector; its face turns
            // toward the camera as much as possible without losing that axis.
            toCamera.copy(cameraPosition).sub(dummy.position).normalize();
            ribbonSide.crossVectors(direction, toCamera);
            if (ribbonSide.lengthSq() < .0001) ribbonSide.crossVectors(direction, Math.abs(direction.y) > .9 ? xAxis : yAxis);
            ribbonSide.normalize();
            ribbonNormal.crossVectors(ribbonSide, direction).normalize();
            ribbonBasis.makeBasis(ribbonSide, direction, ribbonNormal);
            dummy.quaternion.setFromRotationMatrix(ribbonBasis);
            break;
          case 'normal':
            direction.set(p.dx, p.dy, p.dz).normalize();
            dummy.quaternion.setFromUnitVectors(zAxis, direction);
            break;
          case 'tumble':
            dummy.quaternion.copy(cameraQuaternion);
            rotation.setFromAxisAngle(zAxis, p.angle); dummy.quaternion.multiply(rotation);
            yawRotation.setFromAxisAngle(yAxis, age * p.spin * .65); dummy.quaternion.multiply(yawRotation);
            break;
          default:
            dummy.quaternion.copy(cameraQuaternion);
            rotation.setFromAxisAngle(zAxis, p.angle); dummy.quaternion.multiply(rotation);
        }
        dummy.updateMatrix();
        b.mesh.setMatrixAt(count, dummy.matrix);
        // A quiet tail avoids hard particle disappearance; no additive whiteout.
        let alpha = p.opacity * Math.min(1, p.life / Math.min(.23, p.total * .72));
        if (p.mode === 'marker') alpha *= .74 + .26 * Math.sin(age * 13) ** 2;
        if (camera && p.mode !== 'marker') {
          const distance = cameraPosition.distanceTo(dummy.position);
          alpha *= clamp((distance - .12) / .2, 0, 1);
        }
        b.tint.setXYZW(count, p.r, p.g, p.b, alpha);
        count++;
      }
      b.mesh.count = count;
      if (count) { b.mesh.instanceMatrix.needsUpdate = true; b.tint.needsUpdate = true; }
    }
  }

  function clear() {
    for (const b of batchList) {
      for (const p of b.particles) p.life = 0;
      b.mesh.count = 0;
    }
  }
  function dispose() {
    if (disposed) return;
    clear();
    root.removeFromParent();
    for (const b of batchList) {
      b.mesh.geometry.dispose();
      b.mesh.material.dispose();
      b.mesh.dispose?.();
    }
    root.clear();
    disposed = true;
  }
  return Object.freeze({ emit, update, clear, dispose });
}
