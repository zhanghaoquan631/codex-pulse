import tracks from './tracks.mjs';

export { tracks };
export const TRACK_IDS = Object.freeze(Object.keys(tracks));
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const wrap = (v, length) => ((v % length) + length) % length;
const xyz = p => Array.isArray(p) ? { x: p[0], y: p[1] || 0, z: p[2] } : p;

export function getTrack(trackId) {
  const track = tracks[trackId];
  if (!track) throw new RangeError(`Unknown track: ${trackId}`);
  return track;
}

function interpolated(track, distance) {
  const s = wrap(distance, track.length), points = track.points;
  let lo = 0, hi = points.length;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1;
    if (points[mid].s <= s) lo = mid; else hi = mid;
  }
  const a = points[lo], b = points[(lo + 1) % points.length];
  const endS = lo + 1 < points.length ? b.s : track.length;
  const alpha = (s - a.s) / (endS - a.s);
  const lerp = key => a[key] + (b[key] - a[key]) * alpha;
  return { s, segment: lo, x: lerp('x'), y: lerp('y'), z: lerp('z'),
    width: lerp('width'), leftWidth: lerp('leftWidth'), rightWidth: lerp('rightWidth'),
    curvature: lerp('curvature'), bankSlope: lerp('bankSlope') };
}

function orientation(tangent, bankSlope = 0) {
  const horizontal = Math.hypot(tangent.x, tangent.z);
  const right = { x: tangent.z / horizontal, y: 0, z: -tangent.x / horizontal };
  const tiltedRight = { x: right.x, y: bankSlope, z: right.z };
  const dot = tiltedRight.x*tangent.x + tiltedRight.y*tangent.y + tiltedRight.z*tangent.z;
  tiltedRight.x -= dot*tangent.x; tiltedRight.y -= dot*tangent.y; tiltedRight.z -= dot*tangent.z;
  const rightLength = Math.hypot(tiltedRight.x,tiltedRight.y,tiltedRight.z);
  tiltedRight.x /= rightLength; tiltedRight.y /= rightLength; tiltedRight.z /= rightLength;
  const up = { x: tangent.y * tiltedRight.z - tangent.z * tiltedRight.y,
    y: tangent.z * tiltedRight.x - tangent.x * tiltedRight.z,
    z: tangent.x * tiltedRight.y - tangent.y * tiltedRight.x };
  const m11 = tiltedRight.x, m12 = up.x, m13 = tangent.x;
  const m21 = tiltedRight.y, m22 = up.y, m23 = tangent.y;
  const m31 = tiltedRight.z, m32 = up.z, m33 = tangent.z;
  const trace = m11 + m22 + m33;
  let x, y, z, w;
  if (trace > 0) {
    const s = .5 / Math.sqrt(trace + 1);
    w = .25 / s; x = (m32 - m23) * s; y = (m13 - m31) * s; z = (m21 - m12) * s;
  } else if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    w = (m32 - m23) / s; x = .25 * s; y = (m12 + m21) / s; z = (m13 + m31) / s;
  } else if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    w = (m13 - m31) / s; x = (m12 + m21) / s; y = .25 * s; z = (m23 + m32) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
    w = (m21 - m12) / s; x = (m13 + m31) / s; y = (m23 + m32) / s; z = .25 * s;
  }
  return { right, up, quaternion: { x, y, z, w } };
}

/** Metres are along the measured closed route; vehicle local forward is +Z.
 * Positive lateral goes right. Position.y includes the original vehicle body
 * height, so a cloned original car can use the returned pose directly. */
export function sampleTrack(trackId, progressMeters, lateral = 0) {
  if (!Number.isFinite(progressMeters) || !Number.isFinite(lateral)) throw new TypeError('Finite track coordinates required');
  const track = getTrack(trackId), point = interpolated(track, progressMeters);
  const before = interpolated(track, progressMeters - 3), after = interpolated(track, progressMeters + 3);
  const dx = after.x - before.x, dy = after.y - before.y, dz = after.z - before.z;
  const norm = Math.hypot(dx, dy, dz), tangent = { x: dx / norm, y: dy / norm, z: dz / norm };
  const { right, up, quaternion } = orientation(tangent, point.bankSlope);
  return {
    trackId, progress: progressMeters, s: point.s, lap: Math.floor(progressMeters / track.length),
    segment: point.segment,
    position: { x: point.x + right.x * lateral, y: point.y + point.bankSlope * lateral, z: point.z + right.z * lateral },
    quaternion, tangent, right, up, heading: Math.atan2(tangent.x, tangent.z),
    curvature: point.curvature, bankSlope: point.bankSlope, width: point.width, leftWidth: point.leftWidth, rightWidth: point.rightWidth,
  };
}

/** Nearest horizontal road-center projection. aroundDistance selects the
 * equivalent lap nearest that progress and restricts branch search to +/-
 * max(100 m, 8% lap), avoiding adjacent hairpins being mistaken for shortcuts.
 * Pass no aroundDistance for initial acquisition, e.g. after joining a race. */
export function projectTrack(trackId, position, aroundDistance) {
  const track = getTrack(trackId), p = xyz(position);
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) throw new TypeError('Finite world X/Z required');
  const haveAround = Number.isFinite(aroundDistance);
  const searchRadius = Math.max(100, track.length * .08);
  let best;
  for (let i = 0; i < track.points.length; i++) {
    const a = track.points[i], b = track.points[(i + 1) % track.points.length];
    const segmentLength = (i + 1 < track.points.length ? b.s : track.length) - a.s;
    const lapOffset = haveAround ? Math.round((aroundDistance - a.s) / track.length) * track.length : 0;
    if (haveAround && Math.abs(a.s + lapOffset - aroundDistance) > searchRadius + segmentLength) continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
    const x = a.x + dx * t, z = a.z + dz * t;
    const distanceSquared = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (best && distanceSquared >= best.distanceSquared) continue;
    const s = a.s + segmentLength * t;
    const progress = haveAround ? s + Math.round((aroundDistance - s) / track.length) * track.length : wrap(s, track.length);
    best = { s: wrap(s, track.length), progress, distanceSquared, segment: i, x, z };
  }
  if (!best) throw new RangeError('No track segment available');
  const pose = sampleTrack(trackId, best.progress);
  const lateral = (p.x - best.x) * pose.right.x + (p.z - best.z) * pose.right.z;
  return { ...pose, progress: best.progress, s: best.s, lateral,
    distance: Math.sqrt(best.distanceSquared), distanceSquared: best.distanceSquared,
    heightError: Number.isFinite(p.y) ? p.y - pose.position.y - pose.bankSlope * lateral : 0,
    onTrack: lateral >= -pose.leftWidth && lateral <= pose.rightWidth,
  };
}
