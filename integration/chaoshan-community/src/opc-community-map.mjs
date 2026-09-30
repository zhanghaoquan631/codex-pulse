import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './opc-community-map.css';

const validPoint = item => item && typeof item.id === 'string' && Number.isFinite(item.lat) && Number.isFinite(item.lng) && Math.abs(item.lat) <= 85 && Math.abs(item.lng) <= 180;
const boardClass = item => item.board === 'red' ? 'recommended' : item.board === 'black' ? 'observe' : 'neutral';
let landPromise;
function loadLand() {
  if (!landPromise) landPromise = fetch('/local-apps/chaoshan-atlas/data/community-map-land.geojson').then(response => {
    if (!response.ok) throw new Error('地理轮廓加载失败');
    return response.json();
  }).catch(error => { landPromise = null; throw error; });
  return landPromise;
}

/** Source coordinates remain unchanged. This map is an overview, not navigation. */
export function mountCommunityMap(host, {communities = [], onSelect = () => {}} = {}) {
  let items = [], selectedId = null, disposed = false, shownMarkers = [], frame = 0;
  let tileLoaded = 0, tileErrors = 0, landReady = false, tileFallback = false;
  host.classList.add('opc-community-map');
  host.innerHTML = `<div class="opc-community-map-top"><div><span class="opc-community-map-kicker">COMMUNITY ATLAS</span><h2>在地图上，找到新的连接。</h2></div><button type="button" class="opc-community-map-fit">查看全部社区 ↗</button></div><div class="opc-community-map-canvas" role="region" aria-label="全国社区分布地图，方向键移动，加减号缩放" tabindex="0"></div><div class="opc-community-map-bottom"><div class="opc-community-map-legend"><span><i class="recommended"></i>推荐关注</span><span><i class="observe"></i>入驻前留意</span><span class="opc-community-map-count"></span></div><div class="opc-community-map-status" role="status" aria-live="polite">正在载入地图…</div></div><p class="opc-community-map-note">位置来自 BetterOPC 公开资料；原始坐标系未声明，仅供分布概览。点击标记查看社区，地址与导航请向运营方核实。</p>`;
  const canvas = host.querySelector('.opc-community-map-canvas');
  const status = host.querySelector('.opc-community-map-status');
  const count = host.querySelector('.opc-community-map-count');
  const map = L.map(canvas, {zoomControl: false, scrollWheelZoom: false, maxZoom: 17, minZoom: 3, keyboard: true, worldCopyJump: false}).setView([30, 111], 4);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a>');
  L.control.zoom({position: 'topright', zoomInTitle: '放大地图', zoomOutTitle: '缩小地图'}).addTo(map);
  map.createPane('localLand');
  map.getPane('localLand').style.zIndex = '150';
  const markers = L.layerGroup().addTo(map);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, updateWhenIdle: true, keepBuffer: 1,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
  });

  function updateStatus() {
    if (disposed) return;
    if (tileFallback) status.textContent = landReady ? '街道底图暂不可用 · 已显示本地地理轮廓' : '街道底图暂不可用 · 社区标记仍可浏览';
    else if (tileErrors) status.textContent = '部分底图尚未载入 · 已保留轮廓与社区标记';
    else if (tileLoaded) status.textContent = '拖动探索 · 点击 + / − 缩放';
    else status.textContent = landReady ? '地理轮廓已就绪 · 正在载入街道底图' : '正在载入地图…';
  }
  function useFallback() {
    if (disposed || tileFallback) return;
    tileFallback = true;
    map.removeLayer(tiles);
    updateStatus();
  }
  tiles.on('tileload', () => { tileLoaded++; updateStatus(); });
  tiles.on('tileerror', () => { tileErrors++; if (tileErrors >= 4 && !tileLoaded) useFallback(); else updateStatus(); });
  tiles.addTo(map);
  const fallbackTimer = setTimeout(() => { if (!tileLoaded) useFallback(); }, 12000);
  loadLand().then(geojson => {
    if (disposed) return;
    L.geoJSON(geojson, {pane: 'localLand', interactive: false, style: {color: '#a9bdab', weight: 1, fillColor: '#e6ebdb', fillOpacity: 1}, attribution: '<a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener noreferrer">Natural Earth</a> · 地理轮廓示意'}).addTo(map);
    landReady = true;
    updateStatus();
  }).catch(() => { if (!disposed) { status.textContent = '地理轮廓暂不可用 · 可继续浏览社区标记'; } });

  function selectItem(item) {
    selectedId = item.id;
    updateSelected();
    onSelect(item.id);
  }
  function updateSelected() {
    for (const {marker, group} of shownMarkers) {
      const active = group.some(item => item.id === selectedId);
      marker.getElement()?.classList.toggle('is-selected', active);
      marker.getElement()?.setAttribute('aria-pressed', String(active));
      marker.setZIndexOffset(active ? 500 : 0);
    }
  }
  function makeGroupList(group) {
    const element = document.createElement('div');
    element.className = 'opc-community-map-group-list';
    const label = document.createElement('strong');
    label.textContent = `附近 ${group.length} 个社区`;
    element.append(label);
    for (const item of group) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${item.city} · ${item.name}`;
      button.onclick = () => { selectItem(item); map.closePopup(); };
      element.append(button);
    }
    return element;
  }
  function drawMarkers() {
    if (disposed) return;
    markers.clearLayers();
    shownMarkers = [];
    const groups = [];
    // Group screen-nearby markers; stored community coordinates are never moved.
    for (const item of items) {
      const point = map.latLngToContainerPoint([item.lat, item.lng]);
      const nearby = groups.find(group => group.point.distanceTo(point) < 42);
      if (nearby) nearby.items.push(item);
      else groups.push({point, items: [item]});
    }
    for (const {items: group} of groups) {
      const cluster = group.length > 1;
      const point = cluster ? L.latLngBounds(group.map(item => [item.lat, item.lng])).getCenter() : [group[0].lat, group[0].lng];
      const tone = group.every(item => boardClass(item) === boardClass(group[0])) ? boardClass(group[0]) : 'mixed';
      const title = cluster ? `${[...new Set(group.map(item => item.city))].join('、')}附近 ${group.length} 个社区，点击展开` : `${group[0].city} · ${group[0].name}，点击查看`;
      const marker = L.marker(point, {keyboard: true, title, alt: title, riseOnHover: true, icon: L.divIcon({className: `opc-community-map-marker ${tone}${cluster ? ' is-cluster' : ''}`, html: `<span>${cluster ? group.length : ''}</span>`, iconSize: cluster ? [38, 38] : [24, 24], iconAnchor: cluster ? [19, 19] : [12, 12]})});
      const tooltip = document.createElement('span');
      tooltip.textContent = title.replace('，点击查看', '').replace('，点击展开', '');
      marker.bindTooltip(tooltip, {direction: 'top', offset: [0, -12], className: 'opc-community-map-tooltip'});
      marker.on('click', () => {
        if (!cluster) { selectItem(group[0]); return; }
        const bounds = L.latLngBounds(group.map(item => [item.lat, item.lng]));
        const nextZoom = Math.min(map.getBoundsZoom(bounds, false, L.point(80, 80)), 15);
        if (nextZoom > map.getZoom() && bounds.getNorthEast().distanceTo(bounds.getSouthWest()) > 20) map.fitBounds(bounds, {padding: [50, 50], maxZoom: nextZoom, animate: false});
        else L.popup({maxWidth: 310}).setLatLng(point).setContent(makeGroupList(group)).openOn(map);
      });
      marker.addTo(markers);
      marker.getElement()?.setAttribute('aria-label', title);
      marker.getElement()?.setAttribute('role', 'button');
      marker.getElement()?.addEventListener('keydown', event => { if (event.key === ' ') { event.preventDefault(); marker.fire('click'); } });
      shownMarkers.push({marker, group});
    }
    updateSelected();
  }
  function scheduleDraw() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(drawMarkers);
  }
  function fit() {
    if (disposed) return;
    if (items.length) map.fitBounds(L.latLngBounds(items.map(item => [item.lat, item.lng])), {padding: [45, 45], maxZoom: items.length === 1 ? 11 : 8, animate: false});
    else map.setView([30, 111], 4, {animate: false});
    drawMarkers();
  }
  function setItems(nextItems = []) {
    if (disposed) return;
    items = nextItems.filter(validPoint);
    if (!items.some(item => item.id === selectedId)) selectedId = null;
    const missing = nextItems.length - items.length;
    count.textContent = `${items.length} 个地图标记${missing ? ` · ${missing} 个地点未提供有效坐标` : ''}`;
    host.classList.toggle('is-empty', !items.length);
    fit();
  }
  function focus(id) {
    const item = items.find(item => item.id === id);
    if (!item || disposed) return false;
    selectedId = id;
    map.setView([item.lat, item.lng], Math.max(map.getZoom(), 12), {animate: false});
    drawMarkers();
    shownMarkers.find(({group}) => group.some(candidate => candidate.id === id))?.marker.openTooltip();
    return true;
  }
  function invalidate() {
    if (disposed) return;
    map.invalidateSize({pan: false});
    scheduleDraw();
  }
  map.on('moveend zoomend', scheduleDraw);
  const resizeObserver = new ResizeObserver(invalidate);
  resizeObserver.observe(canvas);
  host.querySelector('.opc-community-map-fit').onclick = fit;
  setItems(communities);
  return {
    setItems, focus, fit, invalidate,
    getState: () => ({ready: !disposed, itemCount: items.length, markerCount: shownMarkers.length, selectedId, zoom: disposed ? null : map.getZoom(), tileLoaded, tileErrors, landReady, tileFallback}),
    destroy() { if (disposed) return; disposed = true; clearTimeout(fallbackTimer); cancelAnimationFrame(frame); resizeObserver.disconnect(); map.remove(); host.replaceChildren(); host.classList.remove('opc-community-map'); },
  };
}
