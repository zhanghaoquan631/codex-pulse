/**
 * Dependency-free, synchronous A* navigation in world X/Z metres.
 * findPath(start, goal, { bounds:[minX,minZ,maxX,maxZ], walkable(x,z),
 *   cost(x,z)=1, cellSize=2.5 }) -> { status, path, length, cost, visited, reason }.
 * Cost is a traversal multiplier >=1, e.g. footpaths 1, roads 1.3, grass 4.
 * The caller owns clearance, bridge exceptions, building entrances and live doors.
 * All grid edges, endpoint connectors and smoothing shortcuts are sampled.
 * A point callback cannot prove clearance against sub-sample obstacles: use a
 * footprint-aware walkable callback and sampleStep <= the runtime movement step.
 */

const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const point = p => Array.isArray(p) ? { x: Number(p[0]), z: Number(p.length > 2 ? p[2] : p[1]) } : { x: Number(p?.x), z: Number(p?.z) };
const finite = p => Number.isFinite(p.x) && Number.isFinite(p.z);
const inside = (p, b) => p.x >= b[0] && p.z >= b[1] && p.x <= b[2] && p.z <= b[3];

class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  get minimum() { return this.items[0]?.f ?? Infinity; }
  swap(a, b) { const items = this.items, temporary = items[a]; items[a] = items[b]; items[b] = temporary; items[a].heapIndex = a; items[b].heapIndex = b; }
  bubble(index) {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.items[parent].f <= this.items[index].f) break;
      this.swap(parent, index); index = parent;
    }
  }
  push(node) { node.heapIndex = this.items.length; this.items.push(node); this.bubble(node.heapIndex); }
  decrease(node) { this.bubble(node.heapIndex); }
  pop() {
    const root = this.items[0], tail = this.items.pop();
    root.heapIndex = -1;
    if (this.items.length) {
      this.items[0] = tail; tail.heapIndex = 0;
      let index = 0;
      while (true) {
        let best = index, left = index * 2 + 1, right = left + 1;
        if (left < this.items.length && this.items[left].f < this.items[best].f) best = left;
        if (right < this.items.length && this.items[right].f < this.items[best].f) best = right;
        if (best === index) break;
        this.swap(index, best); index = best;
      }
    }
    return root;
  }
}

export function isSegmentWalkable(from, to, walkable, sampleStep = 0.16, bounds) {
  const a = point(from), b = point(to);
  if (!finite(a) || !finite(b) || typeof walkable !== 'function' || !(sampleStep > 0)) return false;
  const count = Math.max(1, Math.ceil(distance(a, b) / sampleStep));
  for (let i = 0; i <= count; i++) {
    const t = i / count, p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    if (bounds && !inside(p, bounds) || !walkable(p.x, p.z)) return false;
  }
  return true;
}

export function findPath(startInput, goalInput, options = {}) {
  const start = point(startInput), goal = point(goalInput), bounds = options.bounds;
  const walkable = options.walkable, terrainCost = typeof options.cost === 'function' ? options.cost : () => 1;
  const cellSize = options.cellSize ?? 2.5, sampleStep = options.sampleStep ?? Math.min(0.16, cellSize / 4);
  const validationStep = Math.min(sampleStep, options.validationStep ?? 0.08);
  const heuristicWeight = options.heuristicWeight ?? 1;
  const maxMilliseconds = options.maxMilliseconds ?? Infinity;
  const clock = () => globalThis.performance?.now?.() ?? Date.now();
  const deadline = Number.isFinite(maxMilliseconds) ? clock() + maxMilliseconds : Infinity;
  let timedOut = false;
  const timeExceeded = () => timedOut || (deadline !== Infinity && clock() >= deadline);
  const maxVisited = options.maxVisited ?? 250000, maxNodes = options.maxNodes ?? 700000;
  const connectorRadius = options.connectorRadius ?? cellSize * 2.1;
  const smoothingRatio = options.smoothingCostRatio ?? 1.035;
  let visited = 0, terrainQueries = 0, walkableQueries = 0;
  const failed = (status, reason) => ({ status, path: [], length: 0, cost: Infinity, visited, reason, terrainQueries, walkableQueries });
  const timeLimit = () => failed('limit', 'Planning time budget reached. Retry asynchronously or with a coarser grid.');
  if (!finite(start) || !finite(goal) || !Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite) || bounds[2] <= bounds[0] || bounds[3] <= bounds[1] || typeof walkable !== 'function' || !(cellSize > 0) || !(sampleStep > 0) || !(connectorRadius >= 0) || !(maxVisited > 0) || !(maxNodes > 0) || !Number.isFinite(heuristicWeight) || heuristicWeight < 1) return failed('invalid', 'Invalid coordinates, bounds, callback or grid options.');
  if (!inside(start, bounds) || !inside(goal, bounds)) return failed('out-of-bounds', 'Start or goal is outside the navigation bounds.');
  const terrain = (x, z) => {
    walkableQueries++;
    if (!walkable(x, z)) return Infinity;
    terrainQueries++;
    const cost = Number(terrainCost(x, z));
    return Number.isFinite(cost) ? Math.max(1, cost) : Infinity;
  };
  const startCost = terrain(start.x, start.z), goalCost = terrain(goal.x, goal.z);
  const lineClear = (a, b) => isSegmentWalkable(a, b, walkable, validationStep, bounds);
  if (!Number.isFinite(startCost)) return failed('blocked-start', 'The start is obstructed. Resolve a valid ground position before planning.');
  if (!Number.isFinite(goalCost)) return failed('blocked-goal', 'The goal is obstructed. Use an exterior entrance landing for a building target.');
  if (distance(start, goal) < 0.000001) return { status: 'ok', path: [start], length: 0, cost: 0, visited: 0, reason: null, terrainQueries, walkableQueries };

  const segmentCost = (a, b, aCost) => {
    const length = distance(a, b), count = Math.max(1, Math.ceil(length / sampleStep));
    let previous = aCost ?? terrain(a.x, a.z), sum = 0;
    if (!Number.isFinite(previous)) return Infinity;
    for (let i = 1; i <= count; i++) {
      if ((i & 31) === 0 && timeExceeded()) { timedOut = true; return Infinity; }
      const t = i / count, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const current = terrain(x, z);
      if (!Number.isFinite(current)) return Infinity;
      sum += (previous + current) * 0.5;
      previous = current;
    }
    return sum * length / count;
  };
  const cols = Math.floor((bounds[2] - bounds[0]) / cellSize) + 1, rows = Math.floor((bounds[3] - bounds[1]) / cellSize) + 1;
  if (!Number.isSafeInteger(cols * rows) || cols * rows > 100000000) return failed('grid-too-large', 'Use a larger cellSize or tighter bounds.');
  const nodes = new Map(), edges = new Map();
  let exhaustedNodes = false;
  const nodeAt = (ix, iz) => {
    if (ix < 0 || iz < 0 || ix >= cols || iz >= rows) return null;
    const id = iz * cols + ix;
    if (nodes.has(id)) return nodes.get(id);
    if (nodes.size >= maxNodes) { exhaustedNodes = true; return null; }
    const x = bounds[0] + ix * cellSize, z = bounds[1] + iz * cellSize;
    const node = { id, ix, iz, x, z, terrain: terrain(x, z), g: Infinity, f: Infinity, parent: null, closed: false, heapIndex: -1 };
    nodes.set(id, node); return node;
  };
  const edgeCost = (a, b) => {
    const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
    if (edges.has(key)) return edges.get(key);
    let value = segmentCost(a, b, a.terrain);
    if (options._strictEdges && Number.isFinite(value) && !lineClear(a, b)) value = Infinity;
    edges.set(key, value); return value;
  };
  const connectors = exact => {
    const cx = Math.round((exact.x - bounds[0]) / cellSize), cz = Math.round((exact.z - bounds[1]) / cellSize), steps = Math.ceil(connectorRadius / cellSize), result = [];
    for (let dz = -steps; dz <= steps; dz++) for (let dx = -steps; dx <= steps; dx++) {
      const node = nodeAt(cx + dx, cz + dz);
      if (!node || !Number.isFinite(node.terrain) || distance(exact, node) > connectorRadius) continue;
      const cost = segmentCost(exact, node);
      if (Number.isFinite(cost) && lineClear(exact, node)) result.push({ node, cost });
    }
    return result;
  };
  const startConnections = connectors(start), goalConnections = connectors(goal);
  if (timeExceeded()) return timeLimit();
  if (!startConnections.length) return failed('unreachable', 'No clear connector from the exact start to the grid. Try a finer cellSize.');
  if (!goalConnections.length) return failed('unreachable', 'No clear connector from the grid to the exact goal. Try a finer cellSize.');
  const ends = new Map(goalConnections.map(({ node, cost }) => [node.id, cost])), open = new MinHeap();
  // Weight 1 is admissible; weights above 1 trade optimal cost for faster search.
  for (const { node, cost } of startConnections) {
    if (cost >= node.g) continue;
    node.g = cost; node.f = cost + distance(node, goal) * heuristicWeight; node.parent = null; open.push(node);
  }
  let bestEnd = null, bestCost = Infinity;
  while (open.size) {
    if ((visited & 63) === 0 && timeExceeded()) return timeLimit();
    if (open.minimum >= bestCost) break;
    if (visited >= maxVisited || exhaustedNodes) return failed('limit', 'Search budget reached. Retry with a larger cellSize or higher maxVisited/maxNodes.');
    const current = open.pop();
    if (current.closed) continue;
    current.closed = true; visited++;
    if (ends.has(current.id) && current.g + ends.get(current.id) < bestCost) {
      bestEnd = current; bestCost = current.g + ends.get(current.id);
    }
    for (const [dx, dz] of DIRECTIONS) {
      const next = nodeAt(current.ix + dx, current.iz + dz);
      if (!next || next.closed || !Number.isFinite(next.terrain)) continue;
      if (dx && dz) {
        const sideA = nodeAt(current.ix + dx, current.iz), sideB = nodeAt(current.ix, current.iz + dz);
        if (!sideA || !sideB || !Number.isFinite(sideA.terrain) || !Number.isFinite(sideB.terrain)) continue;
      }
      // Reject edges crossing an obstacle even when both grid endpoints are free.
      const step = edgeCost(current, next);
      if (!Number.isFinite(step)) continue;
      const candidate = current.g + step;
      if (candidate >= next.g - 1e-9) continue;
      next.g = candidate; next.f = candidate + distance(next, goal) * heuristicWeight; next.parent = current;
      if (next.heapIndex < 0) open.push(next); else open.decrease(next);
    }
  }
  if (!bestEnd) return failed('unreachable', 'No connected walkable route exists at this grid resolution.');
  const chain = [];
  for (let node = bestEnd; node; node = node.parent) chain.push({ x: node.x, z: node.z });
  chain.reverse();
  const coarse = [start, ...chain, goal].filter((p, index, all) => index === 0 || distance(p, all[index - 1]) > 0.000001);
  const raw = [coarse[0]];
  // Fine-check only the chosen corridor, then repair occasional coarse-grid
  // corner aliases locally. This avoids fine-testing every explored grid edge.
  for (let i = 1; i < coarse.length; i++) {
    if (timeExceeded()) return timeLimit();
    const a = coarse[i - 1], b = coarse[i];
    if (lineClear(a, b)) { raw.push(b); continue; }
    if (options._strictEdges) return failed('refine', 'A grid edge fails fine clearance validation.');
    const pad = Math.max(2, cellSize * 3);
    const localBounds = [Math.max(bounds[0], Math.min(a.x, b.x) - pad), Math.max(bounds[1], Math.min(a.z, b.z) - pad), Math.min(bounds[2], Math.max(a.x, b.x) + pad), Math.min(bounds[3], Math.max(a.z, b.z) + pad)];
    const repair = findPath(a, b, { ...options, bounds: localBounds, cellSize: cellSize / 3, connectorRadius: cellSize, heuristicWeight: Math.max(1.1, heuristicWeight), maxVisited: 3000, maxNodes: 6000, maxMilliseconds: deadline === Infinity ? Infinity : Math.max(1, deadline - clock()), _strictEdges: true });
    if (repair.status !== 'ok') return failed('refine', 'A coarse-grid corner needs a finer route search.');
    raw.push(...repair.path.slice(1));
  }
  // First remove only collinear points, preserving their exact traversed corridor.
  const turns = [raw[0]];
  for (let i = 1; i < raw.length - 1; i++) {
    const a = turns.at(-1), b = raw[i], c = raw[i + 1];
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    const forward = (b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z);
    if (Math.abs(cross) > 1e-7 || forward < 0) turns.push(b);
  }
  turns.push(raw.at(-1));
  const prefix = [0];
  for (let i = 1; i < turns.length; i++) prefix[i] = prefix[i - 1] + segmentCost(turns[i - 1], turns[i]);
  if (timeExceeded()) return timeLimit();
  if (!Number.isFinite(prefix.at(-1))) return failed('changed', 'Walkability changed while planning; retry against a stable callback.');
  const path = [turns[0]], lookahead = Math.max(1, options.smoothLookahead ?? 18);
  let index = 0, totalCost = 0;
  while (index < turns.length - 1) {
    if (timeExceeded()) return timeLimit();
    let chosen = index + 1, chosenCost = prefix[chosen] - prefix[index];
    for (let next = Math.min(turns.length - 1, index + lookahead); next > index + 1; next--) {
      const direct = segmentCost(turns[index], turns[next]);
      if (timeExceeded()) return timeLimit();
      // Avoid smoothing a road-following path into a shortcut across expensive grass.
      if (Number.isFinite(direct) && direct <= (prefix[next] - prefix[index]) * smoothingRatio + 0.0001 && lineClear(turns[index], turns[next])) { chosen = next; chosenCost = direct; break; }
    }
    path.push(turns[chosen]); totalCost += chosenCost; index = chosen;
  }
  let length = 0;
  for (let i = 1; i < path.length; i++) {
    if (timeExceeded()) return timeLimit();
    if (!lineClear(path[i - 1], path[i])) return failed('refine', 'Final segment validation failed. Retry with a finer cellSize and sampleStep.');
    length += distance(path[i - 1], path[i]);
  }
  return { status: 'ok', path, length, cost: totalCost, visited, reason: null, terrainQueries, walkableQueries, rawPointCount: raw.length, gridCellSize: cellSize, heuristicWeight };
}
