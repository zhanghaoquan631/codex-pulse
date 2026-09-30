import * as THREE from 'three';

const coordinate = value => typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;

// Keep the geographic check separate from projection and terrain sampling. In
// particular, heightAt clamps to the terrain edge and must not validate a place.
export function validateAtlasCoordinates(place, {toWorld, inBounds}) {
  const lng = coordinate(place?.lng), lat = coordinate(place?.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    return {ok: false, code: 'INVALID_COORDINATES', reason: '请填写有效的经纬度。'};
  }
  const [x, z] = toWorld(lng, lat);
  if (!Number.isFinite(x) || !Number.isFinite(z) || !inBounds(x, z)) {
    return {ok: false, code: 'OUTSIDE_ATLAS', reason: '此地点在当前潮汕三维地图范围外，可在社区列表中查看。', lng, lat};
  }
  return {ok: true, lng, lat, x, z};
}

export function createAtlasCommunityBridge({camera, layer, toWorld, inBounds, heightAt, focus, labelsVisible}) {
  const pins = new Map(), projected = new THREE.Vector3();
  let selectedId = null, rejected = [];
  const style = document.createElement('style');
  style.id = 'opc-map-pin-style';
  style.textContent = `
    .opc-map-pin{position:absolute;left:0;top:0;transform:translate(-50%,-100%);display:flex;align-items:center;gap:6px;max-width:190px;padding:7px 10px;border:1px solid #ffffffcc;border-radius:11px;background:#137765;color:#fff;box-shadow:0 4px 14px #103d3638;pointer-events:auto;font:600 12px/1.4 system-ui,sans-serif;white-space:nowrap;z-index:12;cursor:pointer}
    .opc-map-pin:after{content:'';position:absolute;left:50%;bottom:-5px;width:9px;height:9px;background:inherit;transform:translateX(-50%) rotate(45deg);border-right:1px solid #ffffffcc;border-bottom:1px solid #ffffffcc}
    .opc-map-pin span:last-child{overflow:hidden;text-overflow:ellipsis}
    .opc-map-pin:hover,.opc-map-pin.selected{background:#dd7641;z-index:13;box-shadow:0 4px 20px #98522244}
    .opc-map-pin:focus-visible{outline:3px solid #f6c179;outline-offset:4px}
    .opc-map-pin[hidden]{display:none!important}
  `;
  document.getElementById(style.id)?.remove();
  document.head.append(style);

  function clearSelection() {
    selectedId = null;
    for (const {button} of pins.values()) button.classList.remove('selected');
  }

  function focusCoordinates(place) {
    const result = validateAtlasCoordinates(place, {toWorld, inBounds});
    if (!result.ok) return result;
    const name = String(place?.name || '社区地点').slice(0, 100);
    focus({...result, name, id: place?.id == null ? null : String(place.id)});
    selectedId = place?.id == null ? null : String(place.id);
    for (const [id, {button}] of pins) button.classList.toggle('selected', id === selectedId);
    return {...result, id: selectedId, name};
  }

  function setCustomPlaces(places) {
    if (!Array.isArray(places)) return {ok: false, code: 'INVALID_PLACES', reason: '地点数据必须是数组。'};
    const next = new Map();
    rejected = [];
    for (const place of places) {
      const id = place?.id == null ? '' : String(place.id).trim();
      if (!id || id.length > 180) { rejected.push({id, code: 'INVALID_ID', reason: '地点需要唯一标识。'}); continue; }
      const result = validateAtlasCoordinates(place, {toWorld, inBounds});
      if (!result.ok) { rejected.push({id, ...result}); continue; }
      next.set(id, {id, name: String(place.name || '社区地点').slice(0, 100), lng: result.lng, lat: result.lat, x: result.x, z: result.z});
    }
    for (const [id, pin] of pins) if (!next.has(id)) { pin.button.remove(); pins.delete(id); }
    for (const [id, place] of next) {
      let pin = pins.get(id);
      if (!pin) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'opc-map-pin'; button.hidden = true;
        button.dataset.placeId = id;
        const symbol = document.createElement('span'), title = document.createElement('span');
        symbol.textContent = '◎'; symbol.setAttribute('aria-hidden', 'true');
        button.append(symbol, title);
        button.addEventListener('pointerdown', event => event.stopPropagation());
        button.addEventListener('click', event => {
          event.stopPropagation();
          focusCoordinates(pins.get(id).place);
          window.dispatchEvent(new CustomEvent('opc:open-place', {detail: {id}}));
        });
        pin = {button, title}; pins.set(id, pin); layer.append(button);
      }
      pin.place = place;
      pin.position = new THREE.Vector3(place.x, heightAt(place.x, place.z) + .06, place.z);
      pin.title.textContent = place.name;
      pin.button.title = place.name + ' · 查看社区地点';
      pin.button.setAttribute('aria-label', place.name + '，定位并查看详情');
      pin.button.classList.toggle('selected', selectedId === id);
    }
    if (selectedId && !next.has(selectedId)) selectedId = null;
    return {ok: true, placed: pins.size, rejected: rejected.map(item => ({...item}))};
  }

  function update() {
    if (!pins.size) return;
    const enabled = labelsVisible() && !document.body.classList.contains('scene-clean');
    const obstacles = [...document.querySelectorAll('.brand,.top-actions,.explore,.location-card,.map-controls,.bottom-center,[data-map-obstacle]')]
      .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
      .map(el => el.getBoundingClientRect());
    const occupied = [];
    // An active marker takes precedence if multiple places share coordinates.
    const ordered = [...pins.values()].sort((a, b) => Number(b.place.id === selectedId) - Number(a.place.id === selectedId));
    for (const pin of ordered) {
      projected.copy(pin.position).project(camera);
      const x = (projected.x * .5 + .5) * innerWidth, y = (-projected.y * .5 + .5) * innerHeight;
      const w = Math.min(190, Math.max(85, pin.place.name.length * 12 + 42));
      const box = {left: x - w / 2, right: x + w / 2, top: y - 37, bottom: y + 7};
      const overlaps = r => box.right > r.left && box.left < r.right && box.bottom > r.top && box.top < r.bottom;
      const show = enabled && projected.z > -1 && projected.z < 1 && box.left > 8 && box.right < innerWidth - 8 && box.top > 8 && box.bottom < innerHeight - 8 && !obstacles.some(overlaps) && !occupied.some(overlaps);
      pin.button.hidden = !show;
      if (show) {
        pin.button.style.left = x + 'px'; pin.button.style.top = y + 'px'; occupied.push(box);
      }
    }
  }

  const getCustomPlaces = () => [...pins.values()].map(({place}) => ({id: place.id, name: place.name, lng: place.lng, lat: place.lat}));
  const getState = () => ({placed: pins.size, visible: [...pins.values()].filter(pin => !pin.button.hidden).length, selectedId, rejected: rejected.map(item => ({...item})), places: getCustomPlaces()});
  return {focusCoordinates, setCustomPlaces, getCustomPlaces, getState, clearSelection, update};
}
