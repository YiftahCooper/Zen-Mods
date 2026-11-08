import {mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
export async function scratchDirectory(prefix) {
  const root=path.resolve(import.meta.dirname,'../../.backup-scratch/tests');
  await mkdir(root,{recursive:true});
  return mkdtemp(path.join(root,prefix));
}
