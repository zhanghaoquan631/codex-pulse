/** Per-avatar garments. All dimensions use the avatar's metre-scale joint space. */
export const OUTFITS = Object.freeze([
  { id: 'casual', key: 'casual', label: '校园日常', name: '校园日常', description: '轻便开衫、休闲长裤与帆布鞋' },
  { id: 'sport', key: 'sport', label: '运动套装', name: '运动套装', description: '拉链运动上衣、侧边条纹长裤与运动鞋' },
  { id: 'formal', key: 'formal', label: '学院正装', name: '学院正装', description: '翻领西装、衬衫与深色长裤' },
  { id: 'winter', key: 'winter', label: '冬日外套', name: '冬日外套', description: '保暖棉服、针织围巾与长裤' },
]);

export const WARDROBE_COLORS = Object.freeze([
  { id: 'original', key: 'original', label: '角色原色', color: '#9a91ab' },
  { id: 'lilac', key: 'lilac', label: '丁香紫', color: '#A995BA', shade: '#847299' },
  { id: 'blue', key: 'blue', label: '晴空蓝', color: '#7F9FB6', shade: '#5C7D96' },
  { id: 'green', key: 'green', label: '鼠尾草绿', color: '#91A38A', shade: '#6C8166' },
  { id: 'orange', key: 'orange', label: '暖杏橙', color: '#D2A075', shade: '#AF7E54' },
  { id: 'navy', key: 'navy', label: '深海蓝', color: '#56677E', shade: '#3F5067' },
  { id: 'cream', key: 'cream', label: '奶油白', color: '#DAD2BC', shade: '#B8AF95' },
]);

const states = new WeakMap();
const mutableSlots = ['shirt', 'shirtShade', 'pants', 'undershirt', 'shoe', 'sole'];
const outfitIds = new Set(OUTFITS.map(outfit => outfit.id));
const hideClothingDetails = ['shirtPlacket', 'collarL', 'collarR', 'campusBadge', 'badgeMark',
  'scarfWrap', 'scarfTail', 'hood', 'hoodLaceL', 'hoodLaceR'];
const hideBagDetails = ['backpack', 'backpackPocket', 'bagSeam', 'strapL', 'strapR', 'strapTopL',
  'strapTopR', 'satchelStrap', 'satchel', 'satchelFlap', 'bookCover', 'bookPages'];

function ensureState(rig) {
  if (states.has(rig)) return states.get(rig);
  const state = { original: {}, copies: {}, originalMeshMaterials: new Map(),
    visibility: new Map(), groups: [], geometries: [], detailMaterials: [], disposed: false };
  for (const mesh of Object.values(rig.meshes)) {
    state.visibility.set(mesh, mesh.visible);
    state.originalMeshMaterials.set(mesh, mesh.material);
  }
  // Private copies also prevent recolouring peers if a caller has pooled materials.
  for (const slot of mutableSlots) {
    const original = rig.materials[slot];
    if (!original) continue;
    state.original[slot] = original;
    const copy = original.clone();
    copy.name = `wardrobe:${slot}`;
    state.copies[slot] = copy;
    rig.materials[slot] = copy;
    for (const mesh of Object.values(rig.meshes)) {
      if (mesh.material === original) mesh.material = copy;
    }
  }
  const previousDispose = rig.dispose;
  rig.dispose = function disposeWardrobeAvatar() {
    if (state.disposed) return;
    state.disposed = true;
    clearDetails(state);
    for (const [mesh, material] of state.originalMeshMaterials) mesh.material = material;
    for (const [slot, material] of Object.entries(state.original)) rig.materials[slot] = material;
    for (const material of Object.values(state.copies)) material.dispose();
    states.delete(rig);
    if (previousDispose) previousDispose.call(rig);
  };
  states.set(rig, state);
  return state;
}

function clearDetails(state) {
  for (const group of state.groups) group.removeFromParent();
  for (const geometry of state.geometries) geometry.dispose();
  for (const material of state.detailMaterials) material.dispose();
  state.groups.length = state.geometries.length = state.detailMaterials.length = 0;
}

/**
 * Apply an outfit to exactly one rig; returns that rig for chaining.
 * Keys: casual | sport | formal | winter. colorKey uses WARDROBE_COLORS.
 * Every call rebuilds only its optional clothing and restores baseline visibility
 * first, so sport → winter → casual gives the same result as fresh casual.
 * Invalid keys fall back to casual/original. Existing rig.dispose includes cleanup.
 */
export function applyOutfit(THREE, rig, outfitKey = 'casual', colorKey = 'original') {
  if (!rig?.joints?.torso || !rig.materials || !rig.meshes) {
    throw new TypeError('applyOutfit expects a rig returned by createAvatar');
  }
  const key = outfitIds.has(outfitKey) ? outfitKey : 'casual';
  const selectedColor = WARDROBE_COLORS.find(color => color.id === colorKey) || WARDROBE_COLORS[0];
  const state = ensureState(rig);
  clearDetails(state);
  for (const [mesh, visible] of state.visibility) mesh.visible = visible;
  for (const [slot, material] of Object.entries(state.copies)) material.copy(state.original[slot]);
  if (selectedColor.id !== 'original') {
    rig.materials.shirt.color.set(selectedColor.color);
    rig.materials.shirtShade.color.set(selectedColor.shade);
  }
  const hide = names => names.forEach(name => { if (rig.meshes[name]) rig.meshes[name].visible = false; });
  const set = (slot, color) => { if (rig.materials[slot]) rig.materials[slot].color.set(color); };
  const material = (slot, color) => {
    const item = rig.materials[slot].clone();
    if (color) item.color.set(color);
    state.detailMaterials.push(item);
    return item;
  };
  const cloth = material('shirt');
  const trim = material('shirtShade');
  const light = material('undershirt', '#F0E9D6');
  const dark = material('pants', '#535B68');
  const groups = new Map();
  const box = (name, joint, size, position, mat = cloth, rotation = [0, 0, 0]) => {
    let group = groups.get(joint);
    if (!group) {
      group = new THREE.Group();
      group.name = `wardrobe:${key}:${joint}`;
      group.userData.wardrobe = true;
      rig.joints[joint].add(group);
      groups.set(joint, group);
      state.groups.push(group);
    }
    const geometry = new THREE.BoxGeometry(...size);
    geometry.computeBoundingBox();
    state.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = `wardrobe:${name}`;
    mesh.position.fromArray(position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const sleeves = (padding = 0, cuffs = true) => {
    for (const side of ['L', 'R']) {
      box(`lowerSleeve${side}`, `lowerArm${side}`, [.146 + padding, .173, .16 + padding], [0, -.082, 0]);
      if (cuffs) box(`wristCuff${side}`, `lowerArm${side}`, [.15 + padding, .036, .164 + padding], [0, -.161, 0], trim);
    }
  };

  if (key === 'casual') {
    sleeves();
    // Small front patch pockets sit above the original shirt front.
    for (const sign of [-1, 1]) {
      box(`cardiganPocket${sign}`, 'torso', [.095, .079, .012], [sign * .113, .072, .161]);
      box(`cardiganPocketTrim${sign}`, 'torso', [.098, .012, .018], [sign * .113, .11, .166], trim);
    }
  } else if (key === 'sport') {
    hide(hideClothingDetails);
    hide(hideBagDetails);
    set('pants', '#596579');
    set('shoe', '#E0DDCE');
    set('sole', '#B8BCAF');
    sleeves();
    box('trackCollar', 'torso', [.205, .056, .179], [0, .331, .021], trim);
    box('trackZip', 'torso', [.013, .339, .012], [0, .164, .164], light);
    for (const [side, sign] of [['L', 1], ['R', -1]]) {
      box(`trackChest${side}`, 'torso', [.165, .025, .014], [sign * .12, .237, .165], light);
      box(`upperStripe${side}`, `upperArm${side}`, [.014, .216, .092], [sign * .09, -.102, 0], light);
      box(`lowerStripe${side}`, `lowerArm${side}`, [.014, .152, .081], [sign * .078, -.083, 0], light);
      box(`thighStripe${side}`, `upperLeg${side}`, [.013, .259, .034], [sign * .087, -.133, 0], light);
      box(`shinStripe${side}`, `lowerLeg${side}`, [.013, .268, .033], [sign * .082, -.134, 0], light);
    }
  } else if (key === 'formal') {
    hide(hideClothingDetails);
    hide(hideBagDetails);
    set('pants', '#505867');
    set('shoe', '#494D53');
    set('sole', '#74736E');
    sleeves(.003);
    box('blazerFront', 'torso', [.45, .358, .035], [0, .15, .154]);
    box('formalShirt', 'torso', [.121, .207, .016], [0, .24, .181], light);
    box('lapelL', 'torso', [.075, .186, .024], [.073, .233, .195], trim, [0, 0, -.27]);
    box('lapelR', 'torso', [.075, .186, .024], [-.073, .233, .195], trim, [0, 0, .27]);
    box('formalNeckBand', 'torso', [.036, .045, .019], [0, .316, .198], dark);
    box('formalTie', 'torso', [.032, .097, .018], [0, .253, .199], dark);
    box('blazerButton', 'torso', [.017, .018, .014], [0, .112, .183], dark);
    box('blazerPocket', 'torso', [.079, .016, .017], [.126, .088, .186], trim);
  } else if (key === 'winter') {
    hide(hideClothingDetails);
    hide(hideBagDetails);
    set('pants', '#626877');
    set('shoe', '#64615B');
    set('sole', '#AAA18C');
    sleeves(.025);
    box('pufferBody', 'torso', [.486, .392, .349], [0, .157, 0]);
    for (let row = 0; row < 3; row++) {
      box(`pufferSeamFront${row}`, 'torso', [.482, .011, .011], [0, .042 + row * .107, .18], trim);
      box(`pufferSeamBack${row}`, 'torso', [.482, .011, .011], [0, .042 + row * .107, -.18], trim);
    }
    box('pufferZip', 'torso', [.018, .356, .014], [0, .139, .188], trim);
    box('pufferHem', 'torso', [.488, .042, .354], [0, -.023, 0], trim);
    for (const side of ['L', 'R']) {
      box(`pufferUpperSleeve${side}`, `upperArm${side}`, [.195, .242, .221], [0, -.102, 0]);
    }
    box('winterScarf', 'torso', [.271, .091, .248], [0, .367, .023], light);
    box('winterScarfTail', 'torso', [.086, .185, .037], [-.071, .246, .205], light, [0, 0, -.09]);
    box('winterScarfFringe', 'torso', [.088, .018, .041], [-.079, .15, .206], trim, [0, 0, -.09]);
  }

  rig.outfitKey = key;
  rig.colorKey = selectedColor.id;
  rig.wardrobeGroups = state.groups;
  rig.group.userData.outfitKey = key;
  rig.group.userData.outfitColor = selectedColor.id;
  rig.group.updateWorldMatrix(true, true);
  return rig;
}
