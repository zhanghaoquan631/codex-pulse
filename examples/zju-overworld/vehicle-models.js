/**
 * Procedural campus vehicles. No imports, textures, DOM, lights, or network access.
 * createVehicle(THREE, key, optionalPaintColor) ->
 * { group, type, length, width, height, wheelRadius, wheels, seatPositions, dispose }
 * Metres. Vehicle front is local +Z, up is +Y, and tyres touch Y=0.
 * wheels are THREE.Group objects with their axle along local X:
 *   wheel.rotation.x += travelledMetres / wheel.userData.radius;
 * Static components are merged by material. Wheels remain independently rotatable.
 */

export const VEHICLE_TYPES = Object.freeze({
  bicycle: Object.freeze({ label: '自行车', paint: '#468c8a', nominalLength: 1.90, nominalWidth: 0.64, wheelRadius: 0.34, wheelbase: 1.16, seats: 1, recommendedSpeed: 3.2 }),
  'e-bike': Object.freeze({ label: '电动自行车', paint: '#e7ddbd', nominalLength: 1.87, nominalWidth: 0.72, wheelRadius: 0.265, wheelbase: 1.08, seats: 1, recommendedSpeed: 4.4 }),
  sedan: Object.freeze({ label: '轿车', paint: '#7894a4', nominalLength: 4.52, nominalWidth: 2.08, wheelRadius: 0.335, wheelbase: 2.72, seats: 5, recommendedSpeed: 6.5 }),
  van: Object.freeze({ label: '后勤厢式车', paint: '#e3e7e5', nominalLength: 4.95, nominalWidth: 2.20, wheelRadius: 0.35, wheelbase: 2.92, seats: 2, recommendedSpeed: 5.2 }),
  shuttle: Object.freeze({ label: '校园巴士', paint: '#e8eee9', nominalLength: 6.34, nominalWidth: 2.51, wheelRadius: 0.405, wheelbase: 3.76, seats: 11, recommendedSpeed: 4.5 }),
  cart: Object.freeze({ label: '校园服务车', paint: '#739482', nominalLength: 3.30, nominalWidth: 1.52, wheelRadius: 0.255, wheelbase: 1.89, seats: 2, recommendedSpeed: 3.4 }),
});

const C = Object.freeze({ tyre: '#252c2e', tread: '#333b3d', metal: '#a9b6b8', darkMetal: '#465459', chrome: '#d0dcde', trim: '#344249', seats: '#45545c', seatLight: '#7d898a', floor: '#505b5c', cream: '#ebe9df', whiteLamp: '#fff3cc', redLamp: '#cf5148', amber: '#eeb05d', blue: '#517a92', green: '#52817a' });

class Batch {
  constructor(THREE) { this.THREE = THREE; this.parts = []; }

  add(geometry, color, position, rotation) {
    const T = this.THREE;
    if (rotation) geometry.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(...rotation)));
    if (position) geometry.translate(...position);
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!flat.attributes.normal) flat.computeVertexNormals();
    this.parts.push({ position: flat.attributes.position.array.slice(), normal: flat.attributes.normal.array.slice(), color: new T.Color(color) });
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
  }

  finish(parent, material, name, castShadow = true) {
    if (!this.parts.length) return null;
    const T = this.THREE;
    const size = this.parts.reduce((sum, part) => sum + part.position.length, 0);
    const positions = new Float32Array(size), normals = new Float32Array(size), colors = new Float32Array(size);
    let offset = 0;
    for (const part of this.parts) {
      positions.set(part.position, offset);
      normals.set(part.normal, offset);
      for (let j = offset; j < offset + part.position.length; j += 3) {
        colors[j] = part.color.r; colors[j + 1] = part.color.g; colors[j + 2] = part.color.b;
      }
      offset += part.position.length;
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new T.BufferAttribute(normals, 3));
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new T.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = castShadow;
    parent.add(mesh);
    this.parts.length = 0;
    return mesh;
  }
}

class Builder {
  constructor(T, paint, group) {
    this.T = T; this.paint = paint; this.group = group;
    this.body = new Batch(T); this.glass = new Batch(T); this.lamps = new Batch(T);
    this.materials = {
      body: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0.14 }),
      glass: new T.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.43, roughness: 0.15, metalness: 0.12, depthWrite: false, side: T.DoubleSide }),
      lamps: new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    };
    this.wheels = []; this.seatPositions = [];
  }

  box(w, h, d, x, y, z, color = this.paint, batch = this.body, rotation) {
    batch.add(new this.T.BoxGeometry(w, h, d), color, [x, y, z], rotation);
  }

  pipe(a, b, radius, color = C.metal, batch = this.body, sides = 7) {
    const T = this.T, from = new T.Vector3(...a), to = new T.Vector3(...b), delta = to.clone().sub(from);
    const length = delta.length();
    if (length < 0.00001) return;
    const geometry = new T.CylinderGeometry(radius, radius, length, sides, 1);
    geometry.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize()));
    batch.add(geometry, color, from.add(to).multiplyScalar(0.5).toArray());
  }

  torus(radius, tube, x, y, z, color, batch = this.body, rotation = [0, 0, 0], arc = Math.PI * 2, radial = 16) {
    batch.add(new this.T.TorusGeometry(radius, tube, 5, radial, arc), color, [x, y, z], rotation);
  }

  cylinder(radius, depth, x, y, z, color, batch = this.body, rotation = [0, 0, Math.PI / 2], sides = 14) {
    batch.add(new this.T.CylinderGeometry(radius, radius, depth, sides, 1), color, [x, y, z], rotation);
  }

  quad(a, b, c, d, color, batch = this.body) {
    const geometry = new this.T.BufferGeometry();
    geometry.setAttribute('position', new this.T.Float32BufferAttribute([...a, ...b, ...d, ...b, ...c, ...d], 3));
    geometry.computeVertexNormals();
    batch.add(geometry, color);
  }

  // A continuous extrusion with genuine wheel openings in its silhouette.
  shell(topProfile, width, bottom, wheelZ, wheelRadius, color = this.paint) {
    const T = this.T, shape = new T.Shape(), back = topProfile[0][0], front = topProfile.at(-1)[0];
    shape.moveTo(-back, bottom);
    for (const [z, y] of topProfile) shape.lineTo(-z, y);
    shape.lineTo(-front, bottom);
    const arch = wheelRadius + 0.075;
    for (const z of [...wheelZ].sort((a, b) => b - a)) {
      shape.lineTo(-(z + arch), bottom);
      shape.lineTo(-(z + arch), wheelRadius);
      for (let i = 1; i <= 16; i++) {
        const angle = (i / 16) * Math.PI;
        shape.lineTo(-(z + Math.cos(angle) * arch), wheelRadius + Math.sin(angle) * arch);
      }
      shape.lineTo(-(z - arch), bottom);
    }
    shape.lineTo(-back, bottom);
    shape.closePath();
    const geometry = new T.ExtrudeGeometry(shape, { depth: width, steps: 1, bevelEnabled: false, curveSegments: 8 });
    geometry.rotateY(Math.PI / 2);
    geometry.translate(-width / 2, 0, 0);
    this.body.add(geometry, color);
  }

  // Independent wheel pivot. Geometry is permanently aligned to the X axle.
  wheel(x, z, radius, width, bicycle = false, front = false) {
    const T = this.T, root = new T.Group(), batch = new Batch(T);
    root.name = `${front ? 'Front' : 'Rear'} ${x < 0 ? 'left' : x > 0 ? 'right' : 'centre'} wheel`;
    root.position.set(x, radius, z);
    root.userData = { radius, axle: 'x', front };
    if (bicycle) {
      this.torus(radius - width * 0.5, width * 0.5, 0, 0, 0, C.tyre, batch, [0, Math.PI / 2, 0], Math.PI * 2, 24);
      this.torus(radius - width * 1.1, width * 0.15, 0, 0, 0, C.chrome, batch, [0, Math.PI / 2, 0], Math.PI * 2, 24);
      this.cylinder(0.038, width * 1.8, 0, 0, 0, C.metal, batch, undefined, 10);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        this.pipe([0, 0, 0], [0, Math.sin(a) * (radius - width * 1.1), Math.cos(a) * (radius - width * 1.1)], 0.005, C.metal, batch, 4);
      }
      this.box(width * 0.5, 0.016, 0.045, 0, radius * 0.65, 0, C.amber, batch);
    } else {
      const points = [[0.56 * radius, -width * 0.50], [0.85 * radius, -width * 0.50], [radius, -width * 0.32], [radius, width * 0.32], [0.85 * radius, width * 0.50], [0.56 * radius, width * 0.50]].map(p => new T.Vector2(...p));
      batch.add(new T.LatheGeometry(points, 20), C.tyre, [0, 0, 0], [0, 0, Math.PI / 2]);
      this.cylinder(radius * 0.62, width * 1.015, 0, 0, 0, C.metal, batch, undefined, 16);
      for (const side of [-1, 1]) {
        this.cylinder(radius * 0.35, 0.012, side * width * 0.52, 0, 0, C.darkMetal, batch, undefined, 10);
        this.cylinder(radius * 0.17, 0.018, side * width * 0.55, 0, 0, C.chrome, batch, undefined, 10);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          this.pipe([side * width * 0.53, Math.sin(a) * radius * 0.25, Math.cos(a) * radius * 0.25], [side * width * 0.53, Math.sin(a) * radius * 0.55, Math.cos(a) * radius * 0.55], radius * 0.045, C.chrome, batch, 5);
        }
      }
    }
    batch.finish(root, this.materials.body, 'Tyre, rim and spokes');
    this.group.add(root); this.wheels.push(root);
    return root;
  }

  seats(x, y, z, width = 0.47, color = C.seats) {
    this.box(width, 0.16, 0.48, x, y, z, color);
    this.box(width, 0.50, 0.13, x, y + 0.29, z - 0.20, color, this.body, [-0.08, 0, 0]);
    this.box(width * 0.52, 0.18, 0.14, x, y + 0.61, z - 0.18, color);
    this.box(width * 0.6, 0.17, 0.32, x, y - 0.16, z, C.darkMetal);
    this.seatPositions.push(new this.T.Vector3(x, y + 0.13, z - 0.02));
  }

  steering(x, y, z, radius = 0.17) {
    this.pipe([x, y - 0.3, z + 0.17], [x, y, z], 0.027, C.trim);
    this.torus(radius, 0.018, x, y, z, C.trim, this.body, [-0.45, 0, 0], Math.PI * 2, 14);
    this.pipe([x - radius, y, z], [x + radius, y, z], 0.012, C.trim);
    this.pipe([x, y, z], [x, y - radius * 0.8, z + 0.04], 0.012, C.trim);
  }

  mirror(x, y, z, width = 0.12, height = 0.11) {
    this.pipe([x * 0.88, y - 0.04, z + 0.06], [x, y, z], 0.017, C.trim);
    this.box(width, height, 0.065, x, y, z, this.paint);
    this.box(width * 0.84, height * 0.79, 0.006, x, y, z - 0.035, '#a7bbc1');
  }

  finish() {
    this.body.finish(this.group, this.materials.body, 'Merged body, trim and interior');
    this.glass.finish(this.group, this.materials.glass, 'Glazing', false);
    this.lamps.finish(this.group, this.materials.lamps, 'Headlights, tail lights and reflectors', false);
  }
}

function buildBicycle(b) {
  const rear = -0.58, front = 0.58, r = 0.34;
  b.wheel(0, rear, r, 0.046, true); b.wheel(0, front, r, 0.046, true, true);
  const crank = [0, 0.34, -0.10], saddleTube = [0, 0.85, -0.30], headTop = [0, 0.89, 0.36], headLow = [0, 0.61, 0.44];
  b.pipe(crank, saddleTube, 0.023, b.paint);
  b.pipe(saddleTube, headTop, 0.021, b.paint);
  b.pipe(crank, headLow, 0.025, b.paint);
  b.pipe(headLow, headTop, 0.027, b.paint);
  for (const side of [-1, 1]) {
    b.pipe([side * 0.047, r, rear], saddleTube, 0.014, b.paint);
    b.pipe([side * 0.047, r, rear], crank, 0.014, b.paint);
    b.pipe([side * 0.037, r, front], [side * 0.032, 0.66, 0.43], 0.018, C.metal);
  }
  b.pipe([0, 0.82, -0.30], [0, 0.98, -0.33], 0.016, C.metal);
  b.box(0.20, 0.055, 0.27, 0, 0.99, -0.31, C.tyre);
  b.pipe(headTop, [0, 1.065, 0.38], 0.016, C.metal);
  b.pipe([-0.31, 1.07, 0.43], [0.31, 1.07, 0.43], 0.015, C.metal);
  for (const side of [-1, 1]) b.pipe([side * 0.22, 1.07, 0.43], [side * 0.32, 1.07, 0.43], 0.022, C.tyre);
  b.cylinder(0.099, 0.026, -0.073, 0.34, -0.10, C.darkMetal);
  b.cylinder(0.033, 0.028, -0.065, r, rear, C.darkMetal);
  b.pipe([-0.077, 0.435, -0.10], [-0.070, 0.372, rear], 0.009, C.darkMetal);
  b.pipe([-0.077, 0.247, -0.10], [-0.070, 0.310, rear], 0.009, C.darkMetal);
  for (const side of [-1, 1]) {
    b.pipe([side * 0.11, 0.34, -0.10], [side * 0.11, 0.34 + side * 0.105, -0.10 + side * 0.05], 0.012, C.metal);
    b.box(0.13, 0.028, 0.075, side * 0.155, 0.34 + side * 0.105, -0.10 + side * 0.05, C.tyre);
    b.pipe([side * 0.11, 0.73, -0.40], [side * 0.042, 0.37, rear], 0.009, C.darkMetal);
  }
  b.box(0.25, 0.024, 0.41, 0, 0.742, -0.59, C.darkMetal);
  for (let i = -1; i <= 1; i++) b.box(0.014, 0.01, 0.39, i * 0.08, 0.76, -0.59, C.metal);
  b.cylinder(0.046, 0.035, 0, 0.82, 0.47, C.whiteLamp, b.lamps, [Math.PI / 2, 0, 0], 12);
  b.box(0.065, 0.05, 0.025, 0, 0.735, -0.81, C.redLamp, b.lamps);
  b.seatPositions.push(new b.T.Vector3(0, 1.03, -0.31));
}

function buildEBike(b) {
  const r = 0.265;
  b.wheel(0, -0.54, r, 0.083, true); b.wheel(0, 0.54, r, 0.083, true, true);
  b.box(0.34, 0.075, 0.74, 0, 0.32, -0.015, b.paint);
  b.box(0.29, 0.022, 0.55, 0, 0.37, 0.025, C.trim);
  b.box(0.29, 0.36, 0.34, 0, 0.575, -0.35, b.paint);
  b.box(0.17, 0.26, 0.035, 0, 0.575, -0.532, C.trim);
  b.box(0.35, 0.085, 0.61, 0, 0.836, -0.31, C.tyre);
  b.box(0.21, 0.055, 0.14, 0, 0.72, -0.67, C.redLamp, b.lamps);
  b.box(0.38, 0.028, 0.28, 0, 0.675, -0.65, C.metal);
  b.pipe([0, 0.36, 0.30], [0, 0.89, 0.39], 0.06, b.paint);
  b.box(0.32, 0.39, 0.065, 0, 0.60, 0.35, b.paint, b.body, [0.13, 0, 0]);
  b.pipe([0, 0.82, 0.38], [0, 1.04, 0.40], 0.023, C.metal);
  b.pipe([-0.34, 1.05, 0.45], [0.34, 1.05, 0.45], 0.020, C.metal);
  for (const side of [-1, 1]) {
    b.pipe([side * 0.23, 1.05, 0.45], [side * 0.35, 1.05, 0.45], 0.026, C.tyre);
    b.pipe([side * 0.060, r, 0.54], [side * 0.055, 0.70, 0.43], 0.026, b.paint);
    b.pipe([side * 0.065, r, -0.54], [side * 0.10, 0.59, -0.23], 0.020, C.darkMetal);
    b.pipe([side * 0.27, 1.06, 0.46], [side * 0.31, 1.23, 0.43], 0.009, C.metal);
    b.box(0.105, 0.071, 0.028, side * 0.31, 1.25, 0.43, C.trim);
    b.box(0.091, 0.056, 0.004, side * 0.31, 1.25, 0.413, '#b5c8cc');
  }
  b.box(0.17, 0.09, 0.08, 0, 0.984, 0.48, C.cream);
  b.box(0.135, 0.06, 0.006, 0, 0.987, 0.524, C.whiteLamp, b.lamps);
  // Open wire basket, recognizable from both street and aerial viewpoints.
  const x = 0.21, back = 0.58, front = 0.89, low = 0.69, high = 0.94;
  b.box(0.42, 0.021, 0.31, 0, low, 0.735, C.darkMetal);
  for (const y of [low + 0.07, low + 0.15, high]) {
    b.pipe([-x, y, back], [x, y, back], 0.009, C.darkMetal);
    b.pipe([-x, y, front], [x, y, front], 0.009, C.darkMetal);
    b.pipe([-x, y, back], [-x, y, front], 0.009, C.darkMetal);
    b.pipe([x, y, back], [x, y, front], 0.009, C.darkMetal);
  }
  for (const xx of [-x, -0.07, 0.07, x]) for (const z of [back, front]) b.pipe([xx, low, z], [xx, high, z], 0.008, C.darkMetal);
  b.box(0.21, 0.065, 0.20, 0, 0.738, 0.73, '#bbd0c5');
  b.seatPositions.push(new b.T.Vector3(0, 0.90, -0.26));
}

function buildSedan(b) {
  const r = 0.335, rear = -1.37, front = 1.35;
  b.shell([[-2.18, 0.69], [-1.96, 0.82], [-1.03, 0.87], [0.77, 0.89], [1.76, 0.80], [2.18, 0.68]], 1.78, 0.28, [rear, front], r);
  b.box(1.28, 0.13, 3.98, 0, 0.28, 0, C.trim);
  for (const x of [-0.845, 0.845]) {
    b.wheel(x, rear, r, 0.22); b.wheel(x, front, r, 0.22, false, true);
    b.box(0.035, 0.057, 1.85, x * 1.071, 0.39, 0, C.trim);
  }
  b.box(1.79, 0.15, 0.13, 0, 0.425, 2.19, C.trim);
  b.box(1.79, 0.15, 0.13, 0, 0.425, -2.19, C.trim);
  b.box(0.74, 0.18, 0.055, 0, 0.595, 2.19, C.darkMetal);
  for (let i = -2; i <= 2; i++) b.box(0.027, 0.14, 0.012, i * 0.12, 0.595, 2.222, C.metal);
  b.box(0.32, 0.11, 0.020, 0, 0.447, 2.269, C.blue);
  b.box(0.32, 0.11, 0.020, 0, 0.447, -2.269, C.blue);
  for (const x of [-0.63, 0.63]) {
    b.box(0.35, 0.115, 0.038, x, 0.603, 2.175, C.whiteLamp, b.lamps);
    b.box(0.33, 0.12, 0.038, x, 0.603, -2.175, C.redLamp, b.lamps);
  }
  b.box(1.37, 0.105, 1.17, 0, 1.465, -0.27, b.paint);
  const frontBottom = 0.82, frontTop = 0.28, rearBottom = -1.12, rearTop = -0.86;
  b.quad([-0.795, 0.91, frontBottom], [0.795, 0.91, frontBottom], [0.67, 1.42, frontTop], [-0.67, 1.42, frontTop], '#9eb8c3', b.glass);
  b.quad([0.79, 0.90, rearBottom], [-0.79, 0.90, rearBottom], [-0.67, 1.41, rearTop], [0.67, 1.41, rearTop], '#8ba9b5', b.glass);
  for (const side of [-1, 1]) {
    const lo = side * 0.80, hi = side * 0.675;
    b.pipe([lo, 0.90, frontBottom], [hi, 1.43, frontTop], 0.036, b.paint);
    b.pipe([lo, 0.89, rearBottom], [hi, 1.43, rearTop], 0.046, b.paint);
    b.pipe([side * 0.803, 0.90, -0.35], [hi, 1.44, -0.35], 0.034, C.trim);
    b.pipe([lo, 0.912, rearBottom], [lo, 0.912, frontBottom], 0.018, C.chrome);
    b.quad([lo, 0.93, 0.77], [lo, 0.93, -0.31], [hi, 1.405, -0.31], [hi, 1.405, 0.27], '#8cabb8', b.glass);
    b.quad([lo, 0.93, -0.39], [lo, 0.93, -1.08], [hi, 1.405, -0.84], [hi, 1.405, -0.39], '#8cabb8', b.glass);
    for (const z of [0.12, -0.83]) b.box(0.028, 0.035, 0.16, side * 0.897, 0.805, z, C.chrome);
    b.pipe([side * 0.902, 0.47, -0.36], [side * 0.902, 0.84, -0.36], 0.006, C.trim, b.body, 4);
    b.mirror(side * 0.982, 0.978, 0.66, 0.15, 0.11);
  }
  b.box(1.56, 0.13, 0.27, 0, 0.91, 0.60, C.trim);
  for (const x of [-0.43, 0.43]) b.seats(x, 0.61, 0.045, 0.47);
  for (const x of [-0.48, 0, 0.48]) b.seats(x, 0.62, -0.65, 0.42);
  b.box(0.18, 0.24, 0.59, 0, 0.585, 0.0, C.trim);
  b.steering(-0.43, 1.008, 0.46, 0.16);
  b.pipe([-0.59, 0.938, 0.80], [-0.15, 1.012, 0.70], 0.011, C.trim);
  b.pipe([0.02, 0.938, 0.80], [0.43, 1.012, 0.70], 0.011, C.trim);
}

function buildVan(b) {
  const r = 0.35, rear = -1.50, front = 1.42;
  b.shell([[-2.36, 0.86], [-1.75, 0.89], [0.47, 0.89], [1.94, 0.99], [2.36, 0.84]], 1.89, 0.30, [rear, front], r);
  b.box(1.35, 0.14, 4.47, 0, 0.30, 0, C.trim);
  for (const x of [-0.91, 0.91]) { b.wheel(x, rear, r, 0.245); b.wheel(x, front, r, 0.245, false, true); }
  // Enclosed cargo body, with side rails and twin rear doors.
  b.box(1.89, 1.26, 2.69, 0, 1.505, -0.985, b.paint);
  b.box(1.87, 0.095, 4.02, 0, 2.13, -0.35, b.paint);
  b.box(1.84, 0.12, 0.72, 0, 1.00, 1.90, b.paint);
  for (const side of [-1, 1]) {
    b.box(0.015, 0.16, 2.60, side * 0.952, 1.13, -0.99, C.green);
    b.box(0.022, 0.12, 3.82, side * 0.953, 0.58, -0.09, C.trim);
    b.box(0.014, 0.016, 1.63, side * 0.953, 1.78, -0.45, '#b1bcba');
    b.box(0.026, 0.06, 0.21, side * 0.969, 1.26, -0.10, C.trim);
    b.box(0.045, 0.80, 0.10, side * 0.89, 1.69, 0.43, b.paint);
    b.pipe([side * 0.90, 1.10, 2.10], [side * 0.84, 2.075, 1.57], 0.049, b.paint);
    b.pipe([side * 0.90, 1.12, 0.49], [side * 0.90, 1.12, 2.06], 0.023, C.trim);
    b.quad([side * 0.897, 1.16, 0.50], [side * 0.895, 1.16, 2.045], [side * 0.834, 2.04, 1.56], [side * 0.862, 2.04, 0.50], '#96b2bd', b.glass);
    b.mirror(side * 1.035, 1.49, 1.74, 0.13, 0.24);
    b.box(0.016, 0.04, 0.16, side * 0.953, 1.055, 0.68, C.trim);
  }
  b.quad([-0.875, 1.16, 2.09], [0.875, 1.16, 2.09], [0.82, 2.04, 1.57], [-0.82, 2.04, 1.57], '#aac1ca', b.glass);
  b.box(1.89, 0.19, 0.15, 0, 0.51, 2.355, C.trim);
  b.box(1.91, 0.20, 0.20, 0, 0.51, -2.375, C.trim);
  b.box(0.73, 0.22, 0.022, 0, 0.775, 2.367, C.darkMetal);
  for (let i = 0; i < 3; i++) b.box(0.69, 0.016, 0.008, 0, 0.71 + i * 0.063, 2.383, C.metal);
  for (const x of [-0.70, 0.70]) {
    b.box(0.30, 0.205, 0.035, x, 0.735, 2.359, C.whiteLamp, b.lamps);
    b.box(0.13, 0.47, 0.04, x * 1.15, 1.02, -2.349, C.redLamp, b.lamps);
  }
  b.box(0.022, 1.20, 0.025, 0, 1.485, -2.341, '#a4b1b0');
  for (const x of [-0.43, 0.43]) {
    b.box(0.12, 0.04, 0.030, x * 0.25, 1.43, -2.367, C.trim);
    for (const y of [1.14, 1.86]) b.box(0.085, 0.11, 0.038, x * 1.97, y, -2.351, C.metal);
    b.seats(x, 0.76, 1.03, 0.51);
  }
  b.box(1.68, 0.20, 0.36, 0, 1.17, 1.80, C.trim);
  b.steering(-0.43, 1.37, 1.62, 0.19);
  b.box(0.35, 0.13, 0.024, 0, 0.55, 2.447, C.blue);
  b.box(0.35, 0.13, 0.024, 0, 0.68, -2.396, C.blue);
  b.pipe([-0.74, 1.19, 2.073], [-0.25, 1.31, 1.995], 0.012, C.trim);
  b.pipe([0.05, 1.19, 2.073], [0.56, 1.31, 1.995], 0.012, C.trim);
}

function buildShuttle(b) {
  const r = 0.405, rear = -1.94, front = 1.82;
  b.shell([[-3.08, 0.99], [-2.68, 1.01], [2.70, 1.01], [3.08, 0.96]], 2.12, 0.30, [rear, front], r);
  b.box(1.63, 0.16, 5.83, 0, 0.30, -0.02, C.trim);
  for (const x of [-1.00, 1.00]) { b.wheel(x, rear, r, 0.285); b.wheel(x, front, r, 0.285, false, true); }
  b.box(2.15, 0.18, 5.75, 0, 2.72, -0.10, b.paint);
  b.box(1.31, 0.18, 1.29, 0, 2.90, -0.85, '#c5d1ce');
  for (let i = -3; i <= 3; i++) b.box(0.87, 0.012, 0.023, 0, 2.996, -0.85 + i * 0.125, C.darkMetal);
  for (const side of [-1, 1]) {
    b.box(0.08, 0.25, 5.69, side * 1.045, 1.08, -0.11, C.green);
    b.box(0.095, 0.11, 5.72, side * 1.04, 2.52, -0.11, C.trim);
    b.box(0.056, 0.10, 5.43, side * 1.068, 0.54, -0.16, C.trim);
    for (const z of [-2.89, -1.73, -0.55, 0.63, 1.73]) {
      b.box(0.08, 1.36, 0.072, side * 1.038, 1.81, z, b.paint);
    }
    for (const [from, to] of [[-2.84, -1.78], [-1.68, -0.60], [-0.50, 0.58], [0.68, 1.69]]) {
      b.quad([side * 1.044, 1.23, from], [side * 1.044, 1.23, to], [side * 1.044, 2.46, to], [side * 1.044, 2.46, from], '#86a8b6', b.glass);
      b.pipe([side * 1.05, 2.20, from], [side * 1.05, 2.20, to], 0.012, C.trim);
    }
    b.pipe([side * 1.032, 1.12, 3.02], [side * 0.952, 2.57, 2.73], 0.064, b.paint);
    b.pipe([side * 1.032, 1.14, -3.03], [side * 1.015, 2.58, -2.94], 0.065, b.paint);
    b.mirror(side * 1.169, 2.12, 2.71, 0.17, 0.29);
    for (const z of [-2.9, 0.12, 2.57]) b.box(0.011, 0.073, 0.13, side * 1.092, 0.98, z, C.amber, b.lamps);
  }
  // Front entry at the right side: low glass panels, centre seam and step.
  b.box(0.077, 2.0, 0.072, 1.047, 1.47, 2.00, C.trim);
  b.box(0.079, 0.10, 1.04, 1.047, 0.47, 2.20, C.trim);
  for (const [from, to] of [[1.79, 1.96], [2.05, 2.65]]) b.quad([1.051, 0.53, from], [1.051, 0.53, to], [1.022, 2.43, to], [1.037, 2.43, from], '#7b9ead', b.glass);
  b.box(0.42, 0.10, 0.88, 0.85, 0.39, 2.18, C.metal);
  b.quad([-1.002, 1.17, 3.026], [1.002, 1.17, 3.026], [0.926, 2.45, 2.769], [-0.926, 2.45, 2.769], '#9fbac6', b.glass);
  b.quad([1.006, 1.27, -3.041], [-1.006, 1.27, -3.041], [-0.97, 2.46, -2.959], [0.97, 2.46, -2.959], '#8aaab6', b.glass);
  b.box(2.13, 0.20, 0.12, 0, 0.59, 3.10, C.trim);
  b.box(2.13, 0.20, 0.13, 0, 0.58, -3.10, C.trim);
  b.box(2.02, 0.18, 0.09, 0, 1.06, 3.01, C.green);
  b.box(1.89, 0.16, 0.12, 0, 2.60, 2.80, C.trim);
  // Small geometric ZJU destination display; no canvas or font dependency.
  const letters = ['111101010100111', '001001001101111', '101101101101111'];
  for (let k = 0; k < letters.length; k++) for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) {
    if (letters[k][row * 3 + col] === '1') b.box(0.037, 0.020, 0.012, -0.26 + k * 0.21 + col * 0.049, 2.65 - row * 0.026, 2.868, C.amber, b.lamps);
  }
  for (const x of [-0.80, 0.80]) {
    b.box(0.30, 0.14, 0.031, x, 0.865, 3.085, C.whiteLamp, b.lamps);
    b.box(0.17, 0.36, 0.028, x * 1.16, 0.885, -3.088, C.redLamp, b.lamps);
  }
  b.box(0.38, 0.14, 0.020, 0, 0.66, 3.175, C.blue);
  b.box(0.38, 0.14, 0.020, 0, 0.66, -3.178, C.blue);
  // Six passenger seats, a four-seat rear row, and a dedicated driver seat.
  for (const z of [-1.58, -0.50, 0.58]) for (const x of [-0.60, 0.60]) {
    b.seats(x, 0.90, z, 0.64, '#5b8f91');
    b.pipe([x, 1.53, z - 0.28], [x, 1.64, z - 0.28], 0.025, C.metal);
  }
  for (const x of [-0.72, -0.25, 0.25, 0.72]) b.seats(x, 0.91, -2.54, 0.42, '#5b8f91');
  b.seats(-0.51, 0.91, 2.02, 0.54, C.seats);
  b.box(1.07, 0.22, 0.40, -0.40, 1.29, 2.66, C.trim);
  b.steering(-0.51, 1.47, 2.47, 0.20);
  for (const z of [-1.76, 0.49, 1.76]) b.pipe([0.34, 0.50, z], [0.34, 2.45, z], 0.027, '#d5c590');
  b.pipe([0.34, 2.37, -2.51], [0.34, 2.37, 2.10], 0.023, '#d5c590');
  b.pipe([-0.82, 1.205, 3.028], [-0.31, 1.40, 2.99], 0.014, C.trim);
  b.pipe([0.02, 1.205, 3.028], [0.58, 1.40, 2.99], 0.014, C.trim);
}

function buildCart(b) {
  const r = 0.255, rear = -1.04, front = 0.85;
  b.box(1.29, 0.13, 2.75, 0, 0.30, -0.07, C.trim);
  b.shell([[-1.52, 0.68], [-0.81, 0.69], [0.43, 0.71], [1.05, 0.83], [1.46, 0.72]], 1.24, 0.28, [rear, front], r);
  for (const x of [-0.61, 0.61]) { b.wheel(x, rear, r, 0.20); b.wheel(x, front, r, 0.20, false, true); }
  b.box(1.30, 0.095, 0.53, 0, 0.817, 1.10, b.paint);
  b.box(1.38, 0.10, 0.14, 0, 0.43, 1.49, C.trim);
  b.box(1.38, 0.10, 0.14, 0, 0.42, -1.56, C.trim);
  b.box(1.10, 0.055, 0.72, 0, 0.68, -1.13, '#8b9690');
  for (const side of [-1, 1]) {
    b.box(0.075, 0.34, 0.84, side * 0.60, 0.85, -1.10, b.paint);
    b.box(0.087, 0.032, 0.88, side * 0.60, 1.032, -1.10, C.chrome);
    b.pipe([side * 0.61, 0.72, 0.64], [side * 0.57, 1.89, 0.41], 0.032, C.trim);
    b.pipe([side * 0.61, 0.68, -0.57], [side * 0.57, 1.89, -0.57], 0.032, C.trim);
    b.pipe([side * 0.54, 1.07, -0.32], [side * 0.54, 1.07, 0.19], 0.028, C.trim);
    b.pipe([side * 0.54, 0.73, 0.19], [side * 0.54, 1.07, 0.19], 0.028, C.trim);
    b.box(0.15, 0.078, 0.75, side * 0.674, 0.40, 0.0, C.trim);
  }
  b.box(1.23, 0.34, 0.065, 0, 0.85, -1.52, b.paint);
  b.box(1.24, 0.032, 0.081, 0, 1.032, -1.52, C.chrome);
  b.box(1.44, 0.095, 1.51, 0, 1.935, -0.045, C.cream);
  b.box(0.98, 0.12, 0.46, 0, 0.83, -0.07, C.seats);
  b.box(0.98, 0.42, 0.13, 0, 1.09, -0.29, C.seats);
  b.seatPositions.push(new b.T.Vector3(-0.27, 0.92, -0.07), new b.T.Vector3(0.27, 0.92, -0.07));
  b.box(1.05, 0.12, 0.27, 0, 1.05, 0.53, C.trim);
  b.steering(-0.28, 1.18, 0.38, 0.16);
  b.quad([-0.556, 1.10, 0.581], [0.556, 1.10, 0.581], [0.53, 1.81, 0.439], [-0.53, 1.81, 0.439], '#bed0d3', b.glass);
  for (const x of [-0.45, 0.45]) {
    b.box(0.20, 0.105, 0.023, x, 0.625, 1.469, C.whiteLamp, b.lamps);
    b.box(0.17, 0.09, 0.027, x, 0.686, -1.56, C.redLamp, b.lamps);
  }
  b.cylinder(0.083, 0.09, 0, 2.01, -0.34, C.trim, b.body, [0, 0, 0], 12);
  b.cylinder(0.072, 0.085, 0, 2.09, -0.34, C.amber, b.lamps, [0, 0, 0], 12);
  // Utility load: two restrained storage crates in the open rear bed.
  for (const x of [-0.28, 0.27]) {
    b.box(0.44, 0.28, 0.44, x, 0.858, -1.11, x < 0 ? '#c5bda2' : '#899c96');
    b.box(0.045, 0.018, 0.46, x, 1.008, -1.11, C.trim);
    b.box(0.18, 0.023, 0.01, x, 0.90, -0.886, C.trim);
  }
}

const BUILDERS = Object.freeze({ bicycle: buildBicycle, 'e-bike': buildEBike, sedan: buildSedan, van: buildVan, shuttle: buildShuttle, cart: buildCart });

export function createVehicle(THREE, typeKey = 'sedan', color) {
  if (!THREE?.Group || !THREE?.MeshStandardMaterial) throw new TypeError('createVehicle requires the Three.js namespace as its first argument.');
  const type = typeKey === 'ebike' ? 'e-bike' : typeKey;
  if (!Object.prototype.hasOwnProperty.call(VEHICLE_TYPES, type)) throw new RangeError(`Unknown vehicle type: ${typeKey}`);
  const metadata = VEHICLE_TYPES[type], group = new THREE.Group();
  group.name = metadata.label;
  group.userData.vehicleType = type;
  group.userData.forwardAxis = '+Z';
  const builder = new Builder(THREE, color ?? metadata.paint, group);
  BUILDERS[type](builder);
  builder.finish();
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group, true), dimensions = bounds.getSize(new THREE.Vector3());
  const resourceSet = { geometries: new Set(), materials: new Set(Object.values(builder.materials)) };
  group.traverse(object => {
    if (object.geometry) resourceSet.geometries.add(object.geometry);
    if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) resourceSet.materials.add(material);
  });
  let disposed = false;
  return {
    group, type,
    length: dimensions.z, width: dimensions.x, height: dimensions.y,
    bounds, wheelRadius: metadata.wheelRadius,
    wheels: builder.wheels,
    seatPositions: builder.seatPositions,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const geometry of resourceSet.geometries) geometry.dispose();
      for (const material of resourceSet.materials) material.dispose();
      group.clear();
      resourceSet.geometries.clear(); resourceSet.materials.clear();
    },
  };
}
