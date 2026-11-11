const mountedMaps = new WeakMap();

export function clearRouteMap(container) {
  mountedMaps.get(container)?.();
  mountedMaps.delete(container);
  container.replaceChildren();
}

export function showRouteMap(container, route) {
  clearRouteMap(container);
  const leaflet = globalThis.L;
  if (!leaflet) {
    container.textContent = '地圖元件載入失敗，請重新整理後再試。';
    return;
  }

  const mapElement = document.createElement('div');
  mapElement.className = 'route-map';
  mapElement.setAttribute('role', 'region');
  mapElement.setAttribute('aria-label', 'GPS 軌跡地圖');
  const controls = document.createElement('div');
  controls.className = 'route-controls';
  const legend = document.createElement('span');
  legend.innerHTML = '<i class="route-start"></i> 起點 <i class="route-end"></i> 終點';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'secondary';
  toggle.textContent = '顯示街道底圖';
  toggle.setAttribute('aria-pressed', 'false');
  const status = document.createElement('p');
  status.className = 'small route-tile-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  controls.append(legend, toggle);
  container.append(mapElement, controls, status);

  const map = leaflet.map(mapElement, {minZoom:0, maxZoom:19, trackResize:false, scrollWheelZoom:false});
  const points = [];
  for (const [latitude, longitude] of route) {
    const previous = points.at(-1)?.[1] ?? longitude;
    points.push([latitude, longitude + 360 * Math.round((previous - longitude) / 360)]);
  }
  const bounds = leaflet.polyline(points, {color:'#22785a', weight:4}).addTo(map).getBounds();
  const fit = () => map.fitBounds(bounds, {padding:[22,22], maxZoom:17, animate:false});
  fit();
  const marker = {radius:6, color:'#fff', weight:2, fillOpacity:1};
  leaflet.circleMarker(points[0], {...marker, fillColor:'#22785a'}).bindTooltip('起點').addTo(map);
  leaflet.circleMarker(points.at(-1), {...marker, fillColor:'#b65329'}).bindTooltip('終點').addTo(map);

  const tiles = leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom:19,
    referrerPolicy:'strict-origin-when-cross-origin',
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });
  tiles.on('tileerror', () => {
    status.textContent = '部分街道底圖載入失敗，GPS 軌跡仍可查看。';
    status.hidden = false;
  });
  toggle.addEventListener('click', () => {
    const enabled = !map.hasLayer(tiles);
    status.hidden = true;
    if (enabled) tiles.addTo(map);
    else map.removeLayer(tiles);
    toggle.textContent = enabled ? '隱藏街道底圖' : '顯示街道底圖';
    toggle.setAttribute('aria-pressed', String(enabled));
  });

  const observer = new ResizeObserver(() => {
    if (mapElement.clientWidth && mapElement.clientHeight) map.invalidateSize({pan:false});
  });
  observer.observe(mapElement);
  mountedMaps.set(container, () => {observer.disconnect(); map.remove();});
}
