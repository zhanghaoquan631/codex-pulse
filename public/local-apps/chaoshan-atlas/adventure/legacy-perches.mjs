/** Original combat staging for the three previously shipped mapped chapters.
 * No geographic feature is moved. These four box stacks are fictional props.
 * Existing Guangji flat task-room roof is used; sloping pavilion roofs are not.
 * Enrich before AdventureGame normalizes the level. Safe to apply repeatedly.
 */
const specifications = {
  guangji: {
    sites: [
      { id: 'gq-task-roof-watch-n', x: 77.5, z: 22.1, y: 5.035, supportId: 'gq-task-roof', observer: { x: 65, z: 18 } },
      { id: 'gq-task-roof-watch-s', x: 77.5, z: 31.9, y: 5.035, supportId: 'gq-task-roof', observer: { x: 65, z: 29 } },
    ],
  },
  'jieyang-tower': {
    stands: [
      { id: 'jy-festival-boxes-east', x: 63, z: -12 },
      { id: 'jy-festival-boxes-west', x: 35, z: -34 },
    ],
    sites: [
      { id: 'jy-east-box-watch', x: 63, z: -12, y: 2.835, supportId: 'jy-festival-boxes-east', observer: { x: 65, z: -25 } },
      { id: 'jy-west-box-watch', x: 35, z: -34, y: 2.835, supportId: 'jy-festival-boxes-west', observer: { x: 48, z: -27 } },
    ],
  },
  lighthouse: {
    stands: [
      { id: 'na-roadside-boxes-north', x: 40, z: -4 },
      { id: 'na-roadside-boxes-south', x: 41, z: 31 },
    ],
    sites: [
      { id: 'na-north-box-watch', x: 40, z: -4, y: 2.835, supportId: 'na-roadside-boxes-north', observer: { x: 49, z: -15 } },
      { id: 'na-south-box-watch', x: 41, z: 31, y: 2.835, supportId: 'na-roadside-boxes-south', observer: { x: 31, z: 18 } },
    ],
  },
};

export function enrichLegacyPerches(rawLevel) {
  const spec = specifications[rawLevel.id];
  if (!spec) return rawLevel;
  const ids = new Set((spec.stands || []).map(item => item.id));
  const siteIds = new Set(spec.sites.map(item => item.id));
  return {
    ...rawLevel,
    walls: [
      ...(rawLevel.walls || []).filter(item => !ids.has(item.id)),
      ...(spec.stands || []).map(item => ({ ...item, w: 3, d: 3, baseY: 0, height: 2.8,
        rotation: 0, kind: 'game-stand', fictional: true,
        label: '临时木箱垛 · 游戏设施', visual: 'stacked-wood-crates' })),
    ],
    spawnSites: [
      ...(rawLevel.spawnSites || []).filter(item => !siteIds.has(item.id)),
      ...spec.sites.map(({ observer, ...site }) => ({ ...site, kind: 'roof', fictional: true,
        perchLabel: rawLevel.id === 'guangji' ? '任务房屋顶' : '路边木箱垛' })),
    ],
  };
}

// Static sight witnesses for the integration check; not a gameplay target list.
export const LEGACY_PERCH_WITNESSES = Object.freeze(Object.fromEntries(
  Object.entries(specifications).map(([id, spec]) => [id, spec.sites.map(site => ({
    siteId: site.id, observer: { ...site.observer },
  }))]),
));

/** Optional shared-world hook. Skip game-stand in the generic wall renderer,
 * then invoke once with the same helpers passed to drawGuangji / drawNanao.
 * The helper box() takes base Y, not center Y. A normalized collider's baseY
 * already includes terrain; its group must therefore use baseY exactly once.
 */
export function drawLegacyPerches({ THREE, root, level, box, stroke, colors, tagStructure }) {
  for (const item of level.walls || []) {
    if (item.kind !== 'game-stand' || item.visual !== 'stacked-wood-crates') continue;
    const group = new THREE.Group();
    group.name = item.id;
    group.position.set(item.x, item.baseY ?? 0, item.z);
    group.rotation.y = item.rotation || 0;
    group.userData = { fictional: true, supportId: item.id, topY: (item.baseY ?? 0) + item.height };
    root.add(group);
    tagStructure?.(group,item.id);
    box(0, 0, 0, item.w, item.height, item.d, colors.wood, group);
    const halfW = item.w / 2, halfD = item.d / 2, split = item.height / 2;
    // Two tiers and four X-braced side faces read as a stack of wooden crates.
    for (const side of [-1, 1]) {
      const z = side * (halfD + .008), x = side * (halfW + .008);
      stroke([[-halfW, split, z], [halfW, split, z]], group, false);
      stroke([[x, split, -halfD], [x, split, halfD]], group, false);
      for (let tier = 0; tier < 2; tier++) {
        const bottom = tier * split + .14, top = (tier + 1) * split - .14;
        stroke([[-halfW + .14, bottom, z], [halfW - .14, top, z]], group, false);
        stroke([[halfW - .14, bottom, z], [-halfW + .14, top, z]], group, false);
        stroke([[x, bottom, -halfD + .14], [x, top, halfD - .14]], group, false);
        stroke([[x, bottom, halfD - .14], [x, top, -halfD + .14]], group, false);
      }
    }
  }
}
