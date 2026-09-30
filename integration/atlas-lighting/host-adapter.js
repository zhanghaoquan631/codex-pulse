// The existing hosted scene, performance gates, and community bridge stay intact.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Called by the pinned host runtime after assembly.
function pulseLightingInstall() {
  ge.add(qe.target);
  const lanterns = new Set(), glass = new Set(), banks = new Set(), shallows = new Set();
  const matches = (material, hex) => material?.color?.getHexString() === hex;
  ge.traverse(mesh => {
    if (!mesh.isMesh) return;
    let names = mesh.name;
    for (let parent = mesh.parent; parent && parent !== ge; parent = parent.parent) names += '/' + parent.name;
    if (/woodland|urban-infill|building|city-roof|forest|tree/i.test(names)) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (matches(material, 'ffc270')) lanterns.add(material);
      if (matches(material, '507779')) glass.add(material);
      if (matches(material, '8da482')) banks.add(material);
      if (matches(material, '72b8b6')) shallows.add(material);
    }
  });
  for (const tile of jd) { tile.castShadow = true; tile.receiveShadow = true; }
  const colorPair = (items, day, night) => {
    const a = new qt(day), b = new qt(night);
    return amount => { for (const material of items) material.color.copy(a).lerp(b, amount); };
  };
  const bankLight = colorPair(banks, '#8da482', '#47675c');
  const shallowLight = colorPair(shallows, '#72b8b6', '#326e78');
  const landmarks = { setLight(night, dusk) {
    for (const material of lanterns) material.emissiveIntensity = .12 + .68 * dusk + 1.7 * night;
    for (const material of glass) { material.emissive.set('#e8b366').multiplyScalar(night); material.emissiveIntensity = .55; }
    for (const model of si.models) if (model.rotor) {
      model.rotor.visible = night > .02;
      model.rotor.traverse(mesh => { if (mesh.material?.transparent) mesh.material.opacity = .2 * night; });
    }
  } };
  const environment = { setLight(night) { bankLight(night); shallowLight(night); } };
  const sky = pulseCreateLivingSky({
    scene: ge, camera: Kt, sun: qe, hemisphere: Vs, renderer: ln, materials: Fi,
    floor: Io, nightGroup: $r, starField: Yr, landmarkMaterials: Fy,
    localLandmarks: landmarks, regionalEnvironment: environment,
    setPeriod: value => Jr(value, true), reducedMotion: Us,
  });
  sky.update(0);
  nh();
  return sky;
}
