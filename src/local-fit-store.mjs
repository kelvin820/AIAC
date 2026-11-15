import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';

export function localFitStore(dataDir) {
  const directory = resolve(dataDir, 'uploads');
  function pathFor(hash) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw Error('FIT 檔案識別碼不正確。');
    return join(directory, hash + '.fit');
  }
  return {
    async read(hash) {
      try {
        return await readFile(pathFor(hash));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        throw Error('本機沒有原始 FIT，請重新匯入。');
      }
    },
    async save(hash, bytes) {
      const path = pathFor(hash);
      await mkdir(directory, {recursive:true});
      await writeFile(path, bytes, {mode:0o600});
    },
    async clear() {
      await rm(directory, {recursive:true, force:true});
    }
  };
}
