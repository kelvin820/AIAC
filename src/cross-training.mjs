// Cross-training substitution: turn a planned running session into a treadmill, bike or elliptical
// session with duration, heart-rate (or pace) targets, how much it substitutes and what it misses.
//
// Rules are docs/ALGORITHMS.md R15 and R16 (first version, approved 2026-11-15). Every result carries
// the rule id, the factors used and how strong the evidence is, so the AI coach can explain how the
// numbers were made and post-run calibration (R17) can revise them later.
import {INTENSITY} from './workout-structure.mjs';

export const RULE_VERSION = 'R16-v1';

// Plan day type -> intensity key in INTENSITY.
const KIND = {Recovery:'recovery', Zone2:'easy', Indoor:'easy', 'Long Run':'easy', Tempo:'tempo', Interval:'interval'};
// Sessions a substitute can fully replace; the rest only partly.
const FULL = new Set(['Recovery', 'Zone2', 'Indoor']);

export const MODES = {
  treadmill: {label:'跑步機', timeFactor:1, hr:'run', evidence:'研究：Jones & Doust（1996）1% 坡度最接近戶外平路的能量成本'},
  'bike-indoor': {label:'室內腳踏車', timeFactor:1.5, hr:'bike', evidence:'經驗法則（跑 60 分 ≈ 騎 90 分），無對照研究，之後依跑後資料校正'},
  'bike-outdoor': {label:'戶外腳踏車', timeFactor:1.5, hr:'bike', evidence:'經驗法則（跑 60 分 ≈ 騎 90 分），無對照研究，之後依跑後資料校正'},
  elliptical: {label:'滑步機', timeFactor:1, hr:'run', evidence:'研究：滑步機與跑步機的最大攝氧量、最大心率與 %心率儲備／%攝氧量關係相近'},
};

// Bike threshold HR is usually lower than running; without a measured value use run threshold − 10 (R16, to verify).
export const BIKE_HR_OFFSET = 10;

function runThreshold(athlete) {
  if (athlete?.lthr) return {value:athlete.lthr, note:'跑步乳酸閾值心率'};
  if (athlete?.maxHeartRate) return {value:Math.round(athlete.maxHeartRate * 0.9), note:'以最大心率 90% 估算的跑步閾值心率'};
  return null;
}

function hrThreshold(mode, athlete) {
  const run = runThreshold(athlete);
  if (MODES[mode].hr === 'run') return run;
  if (athlete?.bikeLthr) return {value:athlete.bikeLthr, note:'騎車乳酸閾值心率'};
  if (!run) return null;
  return {value:run.value - BIKE_HR_OFFSET, note:`騎車閾值心率未設定，以${run.note} − ${BIKE_HR_OFFSET} 估算`};
}

const round5 = n => Math.max(5, Math.round(n / 5) * 5);
const pace = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// session: {type, minutes} from a plan day; mode: a key of MODES.
export function substitute(session, mode, athlete = {}) {
  const spec = MODES[mode];
  if (!spec) throw Error('不支援的替代方式');
  if (!session || session.type === 'Rest' || !(session.minutes > 0)) return null;
  const kind = KIND[session.type] ?? 'easy';
  const z = INTENSITY[kind];
  const minutes = round5(session.minutes * spec.timeFactor);
  const coverage = mode === 'treadmill' || FULL.has(session.type) ? 'full' : 'partial';

  const threshold = hrThreshold(mode, athlete);
  const target = threshold
    ? {kind:'hr', low:Math.round(threshold.value * z.hr[0]), high:Math.round(threshold.value * z.hr[1]), basis:threshold.note}
    : {kind:'rpe', low:z.rpe[0], high:z.rpe[1], basis:'沒有心率閾值，用自覺強度（1–10）'};
  if (mode === 'treadmill' && athlete?.thresholdPaceSecPerKm) {
    const t = athlete.thresholdPaceSecPerKm;
    target.pace = {low:Math.round(t * z.pace[0]), high:Math.round(t * z.pace[1]), basis:'依臨界配速'};
  }

  const tips = [];
  if (mode === 'treadmill') tips.push('記得把跑步機坡度設 1%，才接近戶外平路的強度。');
  if (mode === 'elliptical') tips.push('同樣用力下，滑步機的心率可能比跑步高一些，以心率上限為準、不要硬追。');
  if (mode === 'bike-outdoor') tips.push('戶外騎車滑行、等紅燈時強度會掉，以踩踏時間為準。');
  if (mode !== 'treadmill' && MODES[mode].hr === 'bike' && !athlete?.bikeLthr && threshold) tips.push('騎車心率區間是估算，在個人資料填上騎車閾值心率會更準。');

  const missing = coverage === 'full' ? [] : [
    '跑步經濟性（跑步專項的動作效率）',
    '腿部承受落地衝擊的適應',
    ...(kind === 'interval' || kind === 'tempo' ? ['跑步專項的速度與配速感'] : []),
    ...(session.type === 'Long Run' ? ['長時間跑步的肌肉耐力'] : []),
  ];

  const parts = [`原本 ${session.minutes} 分鐘${z.label}跑`];
  parts.push(spec.timeFactor === 1 ? `${spec.label}時間相同（${minutes} 分鐘）` : `${spec.label}時間 × ${spec.timeFactor} = ${minutes} 分鐘`);
  parts.push(target.kind === 'hr' ? `心率 ${target.low}–${target.high} bpm（${target.basis} × ${z.hr[0]}–${z.hr[1]}）` : `自覺強度 ${target.low}–${target.high}`);
  if (target.pace) parts.push(`配速 ${pace(target.pace.low)}–${pace(target.pace.high)} /km`);

  return {
    mode, label:spec.label, sessionType:session.type, intensity:kind,
    minutes, target, coverage, missing, tips,
    rule:{id:RULE_VERSION, timeFactor:spec.timeFactor, evidence:spec.evidence},
    howCalculated:parts.join('；') + `。依據：${spec.evidence}。`,
  };
}

// All supported substitutes for one session, for the "今天不想跑" picker.
export function substitutes(session, athlete = {}) {
  if (!session || session.type === 'Rest' || !(session.minutes > 0)) return [];
  return Object.keys(MODES).map(mode => substitute(session, mode, athlete));
}
