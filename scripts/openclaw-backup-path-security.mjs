import { lstat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export function recoveryUid() {
  if (typeof process.getuid !== 'function') {
    throw new Error('Recovery requires a platform with Unix ownership');
  }
  return process.getuid();
}

export function assertTrustedDirectoryMetadata(
  info,
  {
    expectedUid,
    isLeaf,
    label = 'Recovery path'
  }
) {
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`${label} hierarchy contains a non-directory`);
  }

  if (isLeaf) {
    if (info.uid !== expectedUid) {
      throw new Error(`${label} must be owned by the recovery user`);
    }
  } else if (info.uid !== expectedUid && info.uid !== 0) {
    throw new Error(
      `${label} hierarchy contains a directory owned by an untrusted user`
    );
  }

  const writableByOthers = (info.mode & 0o022) !== 0;
  const sticky = (info.mode & 0o1000) !== 0;
  if (writableByOthers && (isLeaf || !sticky)) {
    throw new Error(
      `${label} hierarchy contains an untrusted writable directory`
    );
  }
}

export async function assertTrustedDirectoryHierarchy(
  path,
  { label = 'Recovery path' } = {}
) {
  const expectedUid = recoveryUid();
  const leaf = resolve(path);
  let current = leaf;

  while (true) {
    const info = await lstat(current);
    assertTrustedDirectoryMetadata(info, {
      expectedUid,
      isLeaf: current === leaf,
      label
    });
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
