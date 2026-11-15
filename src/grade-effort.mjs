// Equal-effort pacing over a route from its elevation profile (docs/ALGORITHMS.md R1, approved direction 2026-11-15).
//
// Energy cost of running on a slope: Minetti et al. (2002), "Energy cost of walking and running at extreme
// uphill and downhill slopes", J Appl Physiol 93:1039–1046:
//   Cr(i) = 155.4 i^5 − 30.4 i^4 − 43.3 i^3 + 46.3 i^2 + 19.5 i + 3.6   (J/kg/m, i = grade as a fraction)
// A segment's equal-effort pace = flat target pace × Cr(i) / Cr(0). Downhill speed-up is capped at 10%
// (AIAC's own limit: real runners brake on descents; to be calibrated by R17).
// Average altitude is reported for R13 but no altitude correction is applied yet.

export const RULE_VERSION = 'R1-v1';
export const SEGMENT_METERS = 100;
export const RESAMPLE_METERS = 10;
export const SMOOTH_METERS = 50;      // centred moving average window (each side)
export const MAX_GRADE = 0.45;        // range of the Minetti data
export const DOWNHILL_FLOOR = 0.9;    // pace multiplier never below this (≤10% faster than flat)

export function minettiCost(grade) {
  const i = Math.max(-MAX_GRADE, Math.min(MAX_GRADE, grade));
  return 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6;
}

// Pace multiplier for a grade (>1 slower, <1 faster), with the downhill floor.
export function paceFactor(grade) {
  return Math.max(DOWNHILL_FLOOR, minettiCost(grade) / minettiCost(0));
}

// points: [{distance, altitude}] with cumulative distance in metres. Returns altitude every RESAMPLE_METERS, smoothed.
export function smoothProfile(points) {
  const pts = (points ?? []).filter(p => Number.isFinite(p?.distance) && Number.isFinite(p?.altitude)).sort((a, b) => a.distance - b.distance);
  if (pts.length < 2) return [];
  const start = pts[0].distance, end = pts.at(-1).distance;
  const samples = [];
  let j = 0;
  for (let d = start; d <= end + 1e-9; d += RESAMPLE_METERS) {
    while (j < pts.length - 2 && pts[j + 1].distance < d) j++;
    const a = pts[j], b = pts[j + 1];
    const t = b.distance > a.distance ? (d - a.distance) / (b.distance - a.distance) : 0;
    samples.push({distance:d - start, altitude:a.altitude + Math.max(0, Math.min(1, t)) * (b.altitude - a.altitude)});
  }
  if (samples.at(-1).distance < end - start) samples.push({distance:end - start, altitude:pts.at(-1).altitude});
  const k = Math.round(SMOOTH_METERS / RESAMPLE_METERS);
  return samples.map((s, i) => {
    const win = samples.slice(Math.max(0, i - k), i + k + 1);
    return {distance:s.distance, altitude:win.reduce((sum, w) => sum + w.altitude, 0) / win.length};
  });
}

const altitudeAt = (profile, d) => {
  const i = profile.findIndex(p => p.distance >= d);
  if (i <= 0) return profile[Math.max(0, i)].altitude;
  const a = profile[i - 1], b = profile[i];
  return a.altitude + (d - a.distance) / (b.distance - a.distance) * (b.altitude - a.altitude);
};

// Route analysis for a flat target pace (seconds per km).
export function routeEffort(points, flatPaceSecPerKm) {
  const profile = smoothProfile(points);
  if (!profile.length || !(flatPaceSecPerKm > 0)) return null;
  const total = profile.at(-1).distance;
  const segments = [];
  for (let from = 0; from < total - 1e-9; from += SEGMENT_METERS) {
    const to = Math.min(total, from + SEGMENT_METERS);
    const length = to - from;
    const grade = length > 0 ? (altitudeAt(profile, to) - altitudeAt(profile, from)) / length : 0;
    const factor = paceFactor(grade);
    segments.push({from, to, grade, factor, pace:flatPaceSecPerKm * factor, seconds:flatPaceSecPerKm * factor * length / 1000});
  }
  let gain = 0, loss = 0, altSum = 0;
  for (let i = 1; i < profile.length; i++) {
    const diff = profile[i].altitude - profile[i - 1].altitude;
    if (diff > 0) gain += diff; else loss -= diff;
    altSum += (profile[i].altitude + profile[i - 1].altitude) / 2 * (profile[i].distance - profile[i - 1].distance);
  }
  const splits = [];
  for (let km = 0; km * 1000 < total - 1e-9; km++) {
    const lo = km * 1000, hi = Math.min(total, lo + 1000);
    let seconds = 0;
    for (const s of segments) {
      const overlap = Math.max(0, Math.min(hi, s.to) - Math.max(lo, s.from));
      seconds += s.pace * overlap / 1000;
    }
    splits.push({km:km + 1, meters:hi - lo, pace:Math.round(seconds / ((hi - lo) / 1000)), seconds:Math.round(seconds)});
  }
  const seconds = segments.reduce((sum, s) => sum + s.seconds, 0);
  const equivalentFlatMeters = segments.reduce((sum, s) => sum + s.factor * (s.to - s.from), 0);
  return {
    rule:RULE_VERSION,
    distanceMeters:Math.round(total),
    gainMeters:Math.round(gain), lossMeters:Math.round(loss),
    averageAltitude:Math.round(altSum / total),
    equivalentFlatMeters:Math.round(equivalentFlatMeters),
    flatPace:flatPaceSecPerKm,
    predictedSeconds:Math.round(seconds),
    splits,
    segments,
    howCalculated:`坡度依 Minetti 等人（2002）的跑步能量成本曲線換算；高度每 ${RESAMPLE_METERS} m 取樣、前後 ${SMOOTH_METERS} m 平滑，每 ${SEGMENT_METERS} m 算一次坡度；下坡最多比平路快 ${Math.round((1 - DOWNHILL_FLOOR) * 100)}%（AIAC 自訂）。尚未加入海拔修正。`,
  };
}
