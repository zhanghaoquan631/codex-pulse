export function seededRandom(seed = 20260928) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

export function distanceToSegment(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / length)) : 0;
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

export function createSpatialIndex(cellSize = .25) {
  const cells = new Map();
  function insert(item, minX, minZ, maxX, maxZ) {
    for (let x = Math.floor(minX / cellSize); x <= Math.floor(maxX / cellSize); x++) {
      for (let z = Math.floor(minZ / cellSize); z <= Math.floor(maxZ / cellSize); z++) {
        const key = `${x},${z}`; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(item);
      }
    }
  }
  return { insert, at: (x, z) => cells.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`) || [] };
}

export function makeExclusions(data) {
  const roads = createSpatialIndex(), buildings = createSpatialIndex();
  for (const [kind, bridge, points] of data.roads) {
    const width = ['motorway', 'trunk', 'primary'].includes(kind) ? .032 : .022;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      roads.insert({ a, b, width, bridge }, Math.min(a[0], b[0]) - width, Math.min(a[1], b[1]) - width, Math.max(a[0], b[0]) + width, Math.max(a[1], b[1]) + width);
    }
  }
  for (const [x, z, w, d, angle] of data.buildings) {
    const radius = Math.hypot(w, d) / 2 + .04;
    buildings.insert({ x, z, w, d, angle }, x - radius, z - radius, x + radius, z + radius);
  }
  return {
    roadAt: (x, z, pad = 0) => roads.at(x, z).some(r => distanceToSegment(x, z, r.a, r.b) < r.width + pad),
    buildingAt: (x, z, pad = .025) => buildings.at(x, z).some(b => {
      const dx = x - b.x, dz = z - b.z, c = Math.cos(b.angle), s = Math.sin(b.angle);
      return Math.abs(dx * c - dz * s) < b.w / 2 + pad && Math.abs(dx * s + dz * c) < b.d / 2 + pad;
    })
  };
}

// Distinct local compositions. Coordinates are illustrative scenery, not surveyed floor plans.
export const siteDesigns = [
  { theme: 'island-gardens', radius: .52, route: [[-.8,.2],[-.65,-.6],[.15,-.8],[.78,-.25],[.7,.65],[-.2,.8]], buildings: [[-.35,-.18,.38,.26,'villa'],[.38,.12,.28,.36,'villa'],[-.3,.43,.28,.2,'music']], activity: 'music', tree: 'banyan' },
  { theme: 'arcade-street', radius: .63, route: [[-.87,-.24],[.87,-.24],[.87,.24],[-.87,.24]], buildings: [-.72,-.36,0,.36,.72].flatMap(x => [[x,-.52,.3,.32,'arcade'],[x,.52,.3,.32,'arcade']]), activity: 'tea', tree: 'flower' },
  { theme: 'harbour-studios', radius: .26, route: [[-.8,.5],[-.8,-.65],[.05,-.7],[.7,-.25],[.7,.52]], buildings: [[-.38,-.22,.48,.3,'studio'],[.31,.16,.27,.4,'studio']], activity: 'paint', tree: 'palm' },
  { theme: 'seaside-terrace', radius: .25, route: [[-.83,.3],[-.5,-.4],[.12,-.65],[.7,-.22],[.8,.4],[0,.55]], buildings: [[-.2,-.12,.17,.13,'kiosk']], activity: 'photo', tree: 'palm' },
  { theme: 'campus-courtyard', radius: .18, route: [[-.78,-.65],[.78,-.65],[.78,.6],[-.78,.6]], buildings: [[-.43,-.05,.33,.65,'campus'],[.43,-.05,.33,.65,'campus'],[0,-.74,.48,.15,'campus']], activity: 'read', tree: 'banyan' },
  { theme: 'temple-garden', radius: .18, route: [[-.8,.65],[-.8,-.65],[.75,-.65],[.75,.65]], buildings: [[0,-.5,.7,.29,'temple'],[0,.05,.53,.3,'temple']], activity: 'greet', tree: 'banyan' },
  { theme: 'botanical-trails', radius: .68, route: [[-.8,.2],[-.45,-.7],[.3,-.62],[.8,.15],[.4,.72],[-.4,.78]], buildings: [[0,0,.42,.3,'glasshouse']], activity: 'garden', tree: 'mixed' },
  { theme: 'village-lanes', radius: .62, route: [[-.78,-.65],[.2,-.72],[.72,-.35],[.72,.65],[-.7,.65]], buildings: [[-.4,-.26,.32,.32,'village'],[.28,-.23,.28,.34,'village'],[-.18,.28,.3,.25,'village']], activity: 'market', tree: 'flower' },
  { theme: 'beach-promenade', radius: .8, route: [[-.83,.0],[-.65,-.6],[.65,-.6],[.8,.05],[.6,.64],[-.5,.65]], buildings: [[0,-.17,.34,.22,'kiosk']], activity: 'volleyball', tree: 'palm' },
  { theme: 'coastal-cycleway', radius: .72, route: [[-.85,-.1],[-.4,-.65],[.35,-.5],[.8,.18],[.4,.67],[-.35,.55]], buildings: [[0,0,.28,.18,'kiosk']], activity: 'cycle', tree: 'palm' },
  { theme: 'school-waterfront', radius: .95, route: [[-.82,-.65],[.75,-.65],[.8,.4],[.1,.78],[-.75,.5]], buildings: [[-.48,-.08,.3,.62,'campus'],[.4,-.05,.45,.3,'jimei']], activity: 'read', tree: 'banyan' },
  { theme: 'bay-city-park', radius: .9, route: [[-.8,-.5],[.25,-.72],[.8,-.15],[.55,.65],[-.6,.7]], buildings: [[-.3,-.05,.3,.26,'tower'],[.28,.12,.28,.24,'tower']], activity: 'fitness', tree: 'mixed' }
];

export function chooseSiteAnchor(place, index, { places, waterAt, heightAt, exclusions,occupied=[] }) {
  const design = siteDesigns[index];
  const nearest = Math.min(...places.filter(p => p !== place).map(p => Math.hypot(p.x - place.x, p.z - place.z)));
  // Keep a usable micro-scene even when two coastal attractions are close
  // together. Roads and water still decide which props can be placed below.
  let radius = Math.min(design.radius, Math.max(nearest * .42, .18));
  let best = { x: place.x, z: place.z, score: -Infinity };
  const valid=(x,z)=>waterAt(x,z)===null&&!exclusions?.roadAt(x,z,.02)&&!exclusions?.buildingAt(x,z,.025);
  const searchRadius=waterAt(place.x,place.z)!==null?Math.max(radius*1.6,1.4):radius*.8;
  for (let i = 0; i < 301; i++) {
    const a = i * 2.39996323, d = i ? Math.sqrt(i / 300) * searchRadius : 0;
    const x = place.x + Math.cos(a) * d, z = place.z + Math.sin(a) * d;
    if (waterAt(x, z) !== null) continue;
    let score = -d * 5;
    if(occupied.some(a=>Math.hypot(a.x-x,a.z-z)<(radius+a.radius)*1.12))score-=100;
    for (const [dx, dz] of design.route) score += valid(x + dx * radius, z + dz * radius) ? 1 : -3;
    for(const [dx,dz,w,h] of design.buildings)score+=valid(x+dx*radius,z+dz*radius)?1:-1;
    score-=Math.abs(heightAt(x-radius*.5,z)-heightAt(x+radius*.5,z))*3;
    if (score > best.score) best = { x, z, score };
  }
  return { ...best, radius, y: heightAt(best.x, best.z), theme: design.theme, design };
}
