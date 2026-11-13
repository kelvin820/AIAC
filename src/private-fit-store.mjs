import {put, get, list, del} from '@vercel/blob';

export function privateFitStore(token) {
  const prefix = 'aiac/fit/';
  function pathname(hash) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw Error('FIT 檔案識別碼不正確。');
    return prefix + hash + '.fit';
  }
  function requireToken() {
    if (!token) throw Error('雲端原始 FIT 儲存尚未設定。');
  }
  return {
    async read(hash) {
      requireToken();
      const blob = await get(pathname(hash), {token, access:'private', useCache:false});
      if (!blob?.stream) throw Error('找不到原始 FIT，請重新匯入。');
      return Buffer.from(await new Response(blob.stream).arrayBuffer());
    },
    async save(hash, bytes) {
      requireToken();
      await put(pathname(hash),bytes,{token,access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/octet-stream'});
    },
    async clear() {
      if (!token) return;
      // List afresh after removing each batch so deleted objects cannot move the cursor.
      for (;;) {
        const {blobs} = await list({token,prefix,limit:100});
        if (!blobs.length) return;
        await del(blobs.map(blob=>blob.url),{token});
      }
    }
  };
}
