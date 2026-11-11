import {importActivities} from './activity-core.mjs';

const day = 86400;
const windowSeconds = 7 * day;
const intervalMs = 15 * 60 * 1000;

export function stravaSyncDue(settings, now = Date.now()) {
  return settings.status !== 'reauthorize' && (!settings.nextSync || Date.parse(settings.nextSync) <= now);
}

export function syncStravaIfDue(store, strava, now = Date.now()) {
  if (!strava.configured() || !strava.connected() || !stravaSyncDue(store.get().connections.strava, now)) return;
  return syncStrava(store, strava, now);
}

export async function syncStrava(store, strava, now = Date.now(), {backfill = false} = {}) {
  const state = store.get();
  const settings = state.connections.strava;
  if (settings.status === 'reauthorize') throw Error('Strava 授權已失效，請重新登入授權。');
  if (settings.status === 'rate-limited' && !stravaSyncDue(settings, now)) throw Error('Strava 已達請求上限，請等到下次重試時間。');

  const current = Math.floor(now / 1000);
  const cursor = Number.isSafeInteger(settings.cursor) && settings.cursor <= current ? settings.cursor : null;
  const after = backfill ? current - 30 * day : cursor === null ? current - windowSeconds : cursor - day;
  const before = backfill || cursor === null ? current + 1 : Math.min(current + 1, cursor + windowSeconds);
  settings.lastAttempt = new Date(now).toISOString();
  let result;
  try {
    result = await strava.sync(state.context.timezone, after, before);
    if (!result.complete) throw Error('這個時間區間的活動量超過單次讀取上限。');
  } catch (error) {
    const auth = error.status === 401 || error.status === 403;
    const rateLimited = error.status === 429;
    settings.status = auth ? 'reauthorize' : rateLimited ? 'rate-limited' : 'retry';
    settings.nextSync = auth ? null : new Date(Date.now() + Math.max(intervalMs, error.retryAfterMs || 0)).toISOString();
    settings.lastError = auth ? 'Strava 授權已失效，請重新登入授權。'
      : rateLimited ? 'Strava 已達請求上限，稍後自動重試。'
      : result?.complete === false ? '活動量超過單次讀取上限，已保留同步進度。' : 'Strava 暫時無法讀取，稍後自動重試。';
    await store.save(state);
    throw Error(settings.lastError);
  }

  const imported = importActivities(state, result.activities);
  settings.cursor = backfill && cursor !== null && cursor < after ? cursor : before - 1;
  settings.lastSync = new Date().toISOString();
  const catchingUp = settings.cursor < current;
  settings.status = catchingUp ? 'catching-up' : 'synced';
  settings.nextSync = new Date(Date.now() + (catchingUp ? 30_000 : intervalMs)).toISOString();
  delete settings.lastError;
  const saved = await store.save(state);
  return {state:saved, imported, complete:before > current};
}
