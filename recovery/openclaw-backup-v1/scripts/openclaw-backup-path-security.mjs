import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

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

export async function openPrivateLockFile(
  lockRoot,
  lockName,
  { label = 'Backup lock' } = {}
) {
  if (
    resolve(lockRoot) !== lockRoot ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(lockName)
  ) {
    throw new Error(`${label} path is invalid`);
  }
  try {
    await mkdir(lockRoot, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  await assertTrustedDirectoryHierarchy(lockRoot, {
    label: `${label} directory`
  });
  const expectedUid = recoveryUid();
  const directoryInfo = await lstat(lockRoot);
  if (
    directoryInfo.isSymbolicLink() ||
    !directoryInfo.isDirectory() ||
    directoryInfo.uid !== expectedUid ||
    (directoryInfo.mode & 0o777) !== 0o700
  ) {
    throw new Error(`${label} directory is unsafe`);
  }

  let handle;
  try {
    handle = await open(
      join(lockRoot, lockName),
      constants.O_CREAT |
        constants.O_RDWR |
        constants.O_NOFOLLOW,
      0o600
    );
    const info = await handle.stat();
    if (
      !info.isFile() ||
      info.uid !== expectedUid ||
      (info.mode & 0o777) !== 0o600 ||
      info.nlink !== 1 ||
      info.size !== 0
    ) {
      throw new Error(`${label} file is unsafe`);
    }
    return handle;
  } catch (error) {
    await handle?.close().catch(() => {});
    throw error;
  }
}

function decodeMountInfoPath(value) {
  return value
    .replaceAll('\\040', ' ')
    .replaceAll('\\011', '\t')
    .replaceAll('\\012', '\n')
    .replaceAll('\\134', '\\');
}

export function assertNoSwapTmpfsMountInfo(
  mountInfo,
  canonical,
  { label = 'Plaintext staging path' } = {}
) {
  let selected = null;
  for (const line of mountInfo.trimEnd().split('\n')) {
    const fields = line.split(' ');
    const separator = fields.indexOf('-');
    if (separator < 6 || fields.length < separator + 4) {
      throw new Error('Kernel mount metadata is invalid');
    }
    const mountPoint = decodeMountInfoPath(fields[4]);
    if (
      canonical !== mountPoint &&
      !canonical.startsWith(`${mountPoint}/`)
    ) {
      continue;
    }
    if (
      selected !== null &&
      mountPoint === selected.mountPoint
    ) {
      throw new Error(
        `${label} has an ambiguous stacked mountpoint`
      );
    }
    if (
      selected === null ||
      mountPoint.length > selected.mountPoint.length
    ) {
      selected = {
        mountPoint,
        filesystem: fields[separator + 1],
        options: new Set([
          ...fields[5].split(','),
          ...fields[separator + 3].split(',')
        ])
      };
    }
  }
  if (
    selected === null ||
    selected.filesystem !== 'tmpfs' ||
    !selected.options.has('rw') ||
    !selected.options.has('nosuid') ||
    !selected.options.has('nodev') ||
    !selected.options.has('noexec') ||
    !selected.options.has('noswap')
  ) {
    throw new Error(
      `${label} must be on a private rw,nosuid,nodev,noexec,noswap tmpfs`
    );
  }
  return {
    path: canonical,
    mountPoint: selected.mountPoint
  };
}

export async function assertNoSwapTmpfs(
  path,
  { label = 'Plaintext staging path' } = {}
) {
  const canonical = await realpath(resolve(path));
  const mountInfo = await readFile(
    '/proc/self/mountinfo',
    'utf8'
  );
  return assertNoSwapTmpfsMountInfo(
    mountInfo,
    canonical,
    { label }
  );
}

export async function assertNoActiveSwap() {
  const rows = (await readFile('/proc/swaps', 'utf8'))
    .trimEnd()
    .split('\n');
  if (
    rows.length !== 1 ||
    !/^Filename\s+Type\s+Size\s+Used\s+Priority$/.test(
      rows[0].trim()
    )
  ) {
    throw new Error(
      'Plaintext capture requires every swap device to be disabled'
    );
  }
}
