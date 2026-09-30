import {findPath} from './pathfinding.js?v=11';

// Plain geometry only. Share this environment with the controller so planning
// and execution use the same clearance, bridge and terrain rules.
const BIN_SIZE = 32;
const INDOOR_BOUNDS = [-15.6, -17.6, 15.6, 17.6];
const CLEARANCE = [[0, 0], [.4, 0], [-.4, 0], [0, .4], [0, -.4]];
const empty = [];
function inside(x, z, p) {
  let result = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}
function contains(f, x, z) {
  return x >= f.box[0] && x <= f.box[2] && z >= f.box[1] && z <= f.box[3]
    && inside(x, z, f.p) && !(f.h || empty).some(h => inside(x, z, h));
}
function insert(bins, box, margin, item) {
  for (let x = Math.floor((box[0] - margin) / BIN_SIZE); x <= Math.floor((box[2] + margin) / BIN_SIZE); x++) {
    for (let z = Math.floor((box[1] - margin) / BIN_SIZE); z <= Math.floor((box[3] + margin) / BIN_SIZE); z++) {
      const key = x + ',' + z;
      let bin = bins.get(key);
      if (!bin) bins.set(key, bin = []);
      bin.push(item);
    }
  }
}
function segmentDistance(x, z, s) {
  const t = Math.max(0, Math.min(1, ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.lengthSquared));
  return Math.hypot(x - s.ax - t * s.dx, z - s.az - t * s.dz);
}

/**
 * createNavigationEnvironment({bounds, world:{buildings, waters, roads}})
 * or createNavigationEnvironment({indoor:{colliders, floor}, bounds?}).
 * indoor.floor is a zero-based floor index (the controller's currentFloor).
 * Geometry: polygon p:[[x,z],...], holes h, box:[x0,z0,x1,z1];
 * roads use p, width, tags.bridge. No THREE objects or functions are required.
 */
export function createNavigationEnvironment({bounds, world, indoor} = {}) {
  if (indoor) {
    const floorY = (indoor.floor ?? 0) * 3.6;
    const colliders = (indoor.colliders || empty).filter(c => floorY + 1.5 > c.minY + .05 && floorY < c.maxY - .05);
    return {
      bounds: bounds || INDOOR_BOUNDS.slice(),
      walkable(x, z) {
        if (!Number.isFinite(x) || !Number.isFinite(z) || x < -15.6 || x > 15.6 || z < -17.6 || z > 17.6) return false;
        return !colliders.some(c => x > c.x0 - .32 && x < c.x1 + .32 && z > c.z0 - .32 && z < c.z1 + .32);
      },
      cost: () => 1,
      stats: {binSize: BIN_SIZE, activeColliders: colliders.length}
    };
  }
  if (!world) throw new TypeError('Navigation needs world geometry or an indoor collider snapshot.');
  bounds = bounds || world.bounds;
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite)) throw new TypeError('Navigation needs finite bounds [minX,minZ,maxX,maxZ].');
  const featureBins = new Map(), roadBins = new Map();
  for (const f of world.buildings || empty) insert(featureBins, f.box, 1, {f, water: false});
  for (const f of world.waters || empty) insert(featureBins, f.box, 1, {f, water: true});
  let segmentCount = 0;
  for (const road of world.roads || empty) {
    const radius = (road.width || 4) / 2;
    if (!(radius > 0)) continue;
    for (let i = 1; i < road.p.length; i++) {
      const a = road.p[i - 1], b = road.p[i], dx = b[0] - a[0], dz = b[1] - a[1];
      const segment = {ax: a[0], az: a[1], dx, dz, lengthSquared: dx * dx + dz * dz || 1,
        radius, bridgeRadius: road.tags?.bridge === 'yes' ? radius - .45 : 0};
      insert(roadBins, [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])], radius, segment);
      segmentCount++;
    }
  }
  // findPath asks walkable then cost for the same sample: reuse bin lookup.
  let lastCellX = NaN, lastCellZ = NaN, features = empty, roads = empty;
  function query(x, z) {
    const cellX = Math.floor(x / BIN_SIZE), cellZ = Math.floor(z / BIN_SIZE);
    if (cellX !== lastCellX || cellZ !== lastCellZ) {
      lastCellX = cellX; lastCellZ = cellZ;
      const key = cellX + ',' + cellZ;
      features = featureBins.get(key) || empty;
      roads = roadBins.get(key) || empty;
    }
  }
  return {
    bounds,
    walkable(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z) || x < bounds[0] || x > bounds[2] || z < bounds[1] || z > bounds[3]) return false;
      query(x, z);
      for (const {f, water} of features) {
        if (water) {
          if (contains(f, x, z) && !roads.some(s => s.bridgeRadius > 0 && segmentDistance(x, z, s) < s.bridgeRadius)) return false;
        } else {
          for (const [dx, dz] of CLEARANCE) if (contains(f, x + dx, z + dz)) return false;
        }
      }
      return true;
    },
    cost(x, z) {
      query(x, z);
      return roads.some(s => segmentDistance(x, z, s) < s.radius) ? 1 : 1.35;
    },
    stats: {binSize: BIN_SIZE, featureBins: featureBins.size, roadBins: roadBins.size, roadSegments: segmentCount}
  };
}

/** Synchronous pure entry point for Node audits; call via Worker on the page. */
export function planNavigation(request) {
  const env = createNavigationEnvironment(request);
  const indoor = !!request.indoor;
  // Campus clicks can land on isolated dry islands. Search out of the clicked
  // component first, then restore the public start -> goal ordering.
  const reverse = request.reverseSearch ?? !indoor;
  const result = findPath(reverse ? request.goal : request.start, reverse ? request.start : request.goal, {
    bounds: env.bounds, walkable: env.walkable, cost: env.cost,
    cellSize: request.cellSize ?? (indoor ? .45 : 2),
    sampleStep: request.sampleStep ?? (indoor ? .15 : .4),
    maxVisited: request.maxVisited ?? 300000,
    heuristicWeight: request.heuristicWeight ?? 1.3,
    maxMilliseconds: request.maxMilliseconds ?? 10000,
    validationStep: request.validationStep ?? .08
  });
  if (reverse) {
    if (result.status === 'ok') result.path.reverse();
    else if (result.status === 'blocked-start') {
      result.status = 'blocked-goal';
      result.reason = 'The goal is obstructed. Use an exterior entrance landing for a building target.';
    } else if (result.status === 'blocked-goal') {
      result.status = 'blocked-start';
      result.reason = 'The start is obstructed. Resolve a valid ground position before planning.';
    }
  }
  return result;
}

// Importing this module in the browser main thread does not register a handler.
// A worker request always receives {id,result}, including invalid input/errors.
if (typeof self !== 'undefined' && typeof self.document === 'undefined'
    && typeof self.addEventListener === 'function' && typeof self.postMessage === 'function') {
  self.addEventListener('message', ({data}) => {
    let result;
    try { result = planNavigation(data); }
    catch (error) {
      result = {status: 'error', path: [], length: 0, cost: Infinity, visited: 0,
        terrainQueries: 0, walkableQueries: 0, reason: String(error?.message || error)};
    }
    self.postMessage({id: data?.id, result});
  });
}
