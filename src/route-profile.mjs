// intervals.icu activity streams -> elevation profile for grade-effort.mjs.
// Prefers `fixed_altitude` (intervals.icu's terrain-corrected elevation, public DEM data) over the
// watch's GPS/barometric `altitude`, as decided 2026-11-15 (docs/ALGORITHMS.md R1).
// Location (latlng) is not needed here and is not kept.

export const ALTITUDE_SOURCES = ['fixed_altitude', 'altitude'];
export const STREAM_TYPES = ['distance', ...ALTITUDE_SOURCES];

export function routeProfileFromStreams(rows) {
  const by = Object.fromEntries((Array.isArray(rows) ? rows : []).filter(r => r && typeof r.type === 'string' && Array.isArray(r.data)).map(r => [r.type, r.data]));
  const distance = by.distance;
  if (!distance) return null;
  for (const source of ALTITUDE_SOURCES) {
    const altitude = by[source];
    if (!altitude) continue;
    const points = [];
    let last = -Infinity;
    for (let i = 0; i < Math.min(distance.length, altitude.length); i++) {
      const d = distance[i], a = altitude[i];
      if (!Number.isFinite(d) || !Number.isFinite(a) || a < -500 || a > 9000 || d < last) continue;
      points.push({distance:d, altitude:a});
      last = d;
    }
    if (points.length >= 2 && points.at(-1).distance - points[0].distance >= 100) return {altitudeSource:source, points};
  }
  return null;
}
