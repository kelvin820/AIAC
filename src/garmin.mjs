import yauzl from 'yauzl';
import {dateAt} from './activity-core.mjs';

const base = 'https://personal.connectapi.garmin.com';
export const fitLimit = 20 * 1024 * 1024;

async function readDownload(response) {
 const chunks = [];
 let length = 0;
 for await (const chunk of response.body) {
  length += chunk.length;
  if (length > fitLimit) throw Error('Garmin 活動檔案超過 20 MB。');
  chunks.push(chunk);
 }
 return Buffer.concat(chunks);
}

function unzipFit(buffer) {
 return new Promise((resolve, reject) => {
  yauzl.fromBuffer(buffer, {lazyEntries:true}, (error, zip) => {
   if (error) return reject(error);
   zip.on('error', reject);
   zip.once('end', () => resolve(null));
   zip.on('entry', entry => {
    if (!/\.fit$/i.test(entry.fileName)) return zip.readEntry();
    if (entry.uncompressedSize > fitLimit) {
     zip.close();
     return reject(Error('Garmin FIT 解壓後超過 20 MB。'));
    }
    zip.openReadStream(entry, async (streamError, stream) => {
     try {
      if (streamError) throw streamError;
      resolve(await readDownload({body:stream}));
     } catch (error) {
      reject(error);
     } finally {
      zip.close();
     }
    });
   });
   zip.readEntry();
  });
 });
}

export function createGarmin(apiKey) {
 let token;
 let expiresAt = 0;
 const configured = () => Boolean(apiKey?.trim());

 async function request(path, options) {
  const response = await fetch(base + path, {...options, redirect:'error', signal:AbortSignal.timeout(20000)});
  return response;
 }

 async function get(path, accept = 'application/json') {
  if (!configured()) throw Error('請在本機 .env 設定 GARMIN_PERSONAL_API_KEY，再重啟 AIAC。');
  if (!token || expiresAt <= Date.now() / 1000 + 60) {
   const response = await request('/personalapitoken-service/personal-api/personal-api-key/token', {
    method:'POST', headers:{Authorization:'ApiKey '+apiKey.trim()},
   });
   if (!response.ok) {
    if ([400,401,403].includes(response.status)) {
     throw Object.assign(Error('Garmin 拒絕此金鑰。請確認有效期限，必要時更換本機 .env 的金鑰並重啟 AIAC。'),{code:'GARMIN_KEY_REJECTED'});
    }
    throw Error(`Garmin 金鑰驗證暫時失敗（HTTP ${response.status}）。`);
   }
   const accessToken = (await response.text()).trim();
   const expiration = JSON.parse(Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString()).exp;
   if (!Number.isFinite(expiration)) throw Error('Garmin 回傳的授權期限格式不正確。');
   token = accessToken;
   expiresAt = expiration;
  }
  const response = await request(path, {headers:{Authorization:'Bearer '+token, Accept:accept}});
  if (response.status === 401) token = undefined;
  return response;
 }

 return {
  configured,
  async list(timezone, start) {
   const now = Date.now();
   const query = new URLSearchParams({
    start:String(start), limit:'30', startDate:dateAt(now - 30 * 86400000, timezone), endDate:dateAt(now, timezone),
   });
   const response = await get('/activitylist-service/activities/search/activities?'+query);
   if (!response.ok) throw Error(`Garmin 活動清單讀取失敗（HTTP ${response.status}）。`);
   const rows = await response.json();
   if (!Array.isArray(rows)) throw Error('Garmin 活動清單格式不正確。');
   return rows;
  },
  async fit(id) {
   if (!/^[1-9]\d*$/.test(id)) throw Error('Garmin 活動 ID 不正確。');
   const response = await get('/download-service/files/activity/'+id, 'application/zip, application/x-zip-compressed, application/octet-stream');
   if (response.status === 404) return null;
   if (!response.ok) throw Error(`Garmin 活動檔案下載失敗（HTTP ${response.status}）。`);
   const buffer = await readDownload(response);
   return buffer.toString('ascii', 8, 12) === '.FIT' ? buffer : unzipFit(buffer);
  },
 };
}
