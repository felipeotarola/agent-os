#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  opendir,
  readFile,
  readlink,
  realpath,
  rename,
  stat,
  statfs,
  unlink,
  writeFile
} from 'node:fs/promises';
import {
  dirname,
  isAbsolute,
  join,
  resolve,
  sep
} from 'node:path';
import { once } from 'node:events';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  isAllowedArchiveMember,
  verifySet
} from './verify-openclaw-backup.mjs';
import {
  assertTrustedDirectoryHierarchy,
  recoveryUid
} from './openclaw-backup-path-security.mjs';
import {
  BACKUP_MANIFEST_V1,
  BACKUP_MANIFEST_V2,
  BACKUP_PAYLOAD_V1,
  BACKUP_PAYLOAD_V2,
  HOST_RECOVERY_DESCRIPTORS,
  HOST_RECOVERY_POLICY,
  HOST_RECOVERY_SKIPPED_POLICY,
  HOST_ROOT_CRONTAB_REQUIRED,
  PATH_MANIFEST_ARCHIVE_PATH,
  PATH_MANIFEST_SCHEMA,
  containsAsciiControl,
  normalizePayloadClass
} from './openclaw-backup-schema.mjs';
import {
  verifyCapturedProductionData
} from './openclaw-backup-external.mjs';

const FINGERPRINT_PATTERN = /^(?:[0-9A-Fa-f]{40}|[0-9A-Fa-f]{64})$/;
const MAX_METADATA_BYTES = 16 * 1024 * 1024;
const MAX_PATH_MANIFEST_BYTES = 64 * 1024 * 1024;
const RESTORE_FREE_SPACE_FLOOR = 5 * 1024 * 1024 * 1024;

function usage() {
  return `Usage:
  node scripts/restore-openclaw-backup.mjs SET_DIRECTORY [options]

Default behavior is a non-mutating restore plan. --execute extracts only into
an existing empty inspection directory. It never writes to /root/.openclaw,
starts services, installs cron, applies host configuration, or connects to a
live PostgreSQL database.

Options:
  --execute                 Create a fenced inspection restore.
  --target PATH             Existing empty directory, mode 0700 or stricter.
  --signer FINGERPRINT      Exact trusted backup-origin signing identity.
  --allow-no-postgres       Accept an explicitly skipped PostgreSQL dump.
  --allow-no-production-data
                            Accept explicitly skipped Agent OS production data.
  --allow-best-effort       Accept a set created without quiesced writers.
  --json                    Emit machine-readable output.
  --help                    Show this help.

Environment fallback:
  OPENCLAW_BACKUP_GPG_SIGNER`;
}

function parseArgs(argv) {
  const options = {
    setDirectory: '',
    execute: false,
    target: '',
    signer: process.env.OPENCLAW_BACKUP_GPG_SIGNER || '',
    allowNoPostgres: false,
    allowNoProductionData: false,
    allowBestEffort: false,
    json: false,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const takeValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${argument}`);
      }
      index += 1;
      return value;
    };

    if (argument === '--execute') options.execute = true;
    else if (argument === '--target') options.target = takeValue();
    else if (argument === '--signer') options.signer = takeValue();
    else if (argument === '--allow-no-postgres') {
      options.allowNoPostgres = true;
    } else if (argument === '--allow-no-production-data') {
      options.allowNoProductionData = true;
    } else if (argument === '--allow-best-effort') {
      options.allowBestEffort = true;
    } else if (argument === '--json') options.json = true;
    else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (!argument.startsWith('--') && !options.setDirectory) {
      options.setDirectory = argument;
    } else {
      throw new Error(`Unknown or duplicate argument: ${argument}`);
    }
  }

  if (!options.help && !options.setDirectory) {
    throw new Error('A backup set directory is required');
  }
  if (
    !options.help &&
    options.execute &&
    (!options.target || !FINGERPRINT_PATTERN.test(options.signer))
  ) {
    throw new Error(
      '--execute requires --target and an exact trusted --signer fingerprint'
    );
  }
  return options;
}

async function readJsonFile(path, label) {
  const info = await lstat(path);
  if (
    info.isSymbolicLink() ||
    !info.isFile() ||
    info.size <= 0 ||
    info.size > MAX_METADATA_BYTES
  ) {
    throw new Error(`${label} is missing or invalid`);
  }
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

async function sha256File(path) {
  const handle = await open(path, 'r');
  const hash = createHash('sha256');
  try {
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      hash.update(chunk);
    }
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
}

function isWithin(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

async function validateEmptyTarget(targetPath, setDirectory) {
  const target = await realpath(resolve(targetPath));
  const info = await stat(target);
  if (
    !info.isDirectory() ||
    (info.mode & 0o077) !== 0 ||
    target === '/' ||
    target === '/root' ||
    target === '/root/.openclaw' ||
    isWithin('/root/.openclaw', target) ||
    isWithin(target, setDirectory) ||
    isWithin(setDirectory, target)
  ) {
    throw new Error(
      'Restore target must be an isolated directory with mode 0700 or stricter'
    );
  }
  await assertTrustedDirectoryHierarchy(target, {
    label: 'Restore target'
  });
  await assertTrustedDirectoryHierarchy(setDirectory, {
    label: 'Backup set'
  });
  const directory = await opendir(target);
  for await (const _entry of directory) {
    throw new Error('Restore target must be empty');
  }
  return target;
}

async function assertRestoreDiskBudget(target, manifest) {
  const filesystem = await statfs(target);
  const availableBytes = filesystem.bavail * filesystem.bsize;
  const requiredBytes =
    manifest.payloadBytesEstimate + RESTORE_FREE_SPACE_FLOOR;
  if (
    !Number.isSafeInteger(availableBytes) ||
    availableBytes < requiredBytes
  ) {
    throw new Error(
      'Restore target lacks the signed payload estimate plus the 5 GiB safety floor'
    );
  }
  return { availableBytes, requiredBytes };
}

function waitForChild(child, label, stderrChunks = []) {
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    child.once('error', () => {
      if (!settled) {
        settled = true;
        rejectPromise(new Error(`${label} could not start`));
      }
    });
    child.once('close', (code) => {
      if (!settled) {
        settled = true;
        if (code === 0) resolvePromise();
        else {
          const detail = Buffer.concat(stderrChunks)
            .toString('utf8')
            .trim()
            .slice(0, 4096);
          rejectPromise(
            new Error(`${label} failed${detail ? `: ${detail}` : ''}`)
          );
        }
      }
    });
  });
}

function samePinnedFileVersion(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

async function readVerifiedCiphertextChunk(
  setDirectory,
  chunk
) {
  const handle = await open(
    join(setDirectory, chunk.name),
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  const buffers = [];
  const hash = createHash('sha256');
  let bytes = 0;
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.uid !== BigInt(recoveryUid()) ||
      (before.mode & 0o077n) !== 0n ||
      before.size !== BigInt(chunk.bytes)
    ) {
      throw new Error('Ciphertext chunk ownership or mode is unsafe');
    }
    for await (const data of handle.createReadStream({
      autoClose: false,
      start: 0,
      end: chunk.bytes - 1
    })) {
      const buffer = Buffer.from(data);
      buffers.push(buffer);
      bytes += buffer.length;
      hash.update(buffer);
    }
    const after = await handle.stat({ bigint: true });
    if (
      bytes !== chunk.bytes ||
      hash.digest('hex') !== chunk.sha256 ||
      !samePinnedFileVersion(before, after)
    ) {
      throw new Error(
        'Ciphertext chunk changed before fenced extraction'
      );
    }
    return buffers;
  } finally {
    await handle.close();
  }
}

async function extractArchive(setDirectory, manifest, target) {
  const environment = { ...process.env, LC_ALL: 'C' };
  const commands = [
    {
      label: 'GPG archive decryption',
      command: 'gpg',
      args: ['--batch', '--no-tty', '--decrypt']
    },
    {
      label: 'zstd archive decompression',
      command: 'zstd',
      args: ['--decompress', '--stdout', '--quiet']
    },
    {
      label: 'tar fenced extraction',
      command: 'tar',
      args: [
        '--extract',
        '--file=-',
        '--directory',
        target,
        '--no-same-owner',
        '--no-same-permissions',
        '--keep-old-files',
        '--delay-directory-restore'
      ]
    }
  ];
  const children = commands.map(({ command, args }) =>
    spawn(command, args, {
      env: environment,
      stdio: ['pipe', 'pipe', 'pipe']
    })
  );
  const stderrChunks = children.map(() => []);
  for (const [index, child] of children.entries()) {
    child.stdin.on('error', () => {});
    child.stdout.on('error', () => {});
    let stderrBytes = 0;
    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= 4096) stderrChunks[index].push(chunk);
    });
  }
  children[0].stdout.pipe(children[1].stdin);
  children[1].stdout.pipe(children[2].stdin);
  children[2].stdout.resume();
  const completions = children.map((child, index) =>
    waitForChild(child, commands[index].label, stderrChunks[index])
  );

  try {
    for (const chunk of manifest.chunks) {
      const verifiedBuffers = await readVerifiedCiphertextChunk(
        setDirectory,
        chunk
      );
      for (const data of verifiedBuffers) {
        if (!children[0].stdin.write(data)) {
          await once(children[0].stdin, 'drain');
        }
      }
    }
    children[0].stdin.end();
  } catch (error) {
    children[0].stdin.destroy();
    for (const child of children) child.kill('SIGKILL');
    await Promise.allSettled(completions);
    throw error;
  }
  await Promise.all(completions);
}

function bytewisePathCompare(left, right) {
  return Buffer.compare(
    Buffer.from(left.path, 'utf8'),
    Buffer.from(right.path, 'utf8')
  );
}

function canonicalEntriesDigest(entries) {
  return createHash('sha256')
    .update(JSON.stringify(entries), 'utf8')
    .digest('hex');
}

function payloadEntryContentBytes(entries) {
  return entries.reduce(
    (total, entry) =>
      total +
      (entry.kind === 'file'
        ? entry.bytes
        : entry.kind === 'symlink'
          ? entry.targetBytes
          : 0),
    0
  );
}

function validatePayloadEntry(entry, payloadClass) {
  if (
    !entry ||
    typeof entry.path !== 'string' ||
    !entry.path ||
    entry.path.endsWith('/') ||
    entry.path.startsWith('/') ||
    entry.path === PATH_MANIFEST_ARCHIVE_PATH ||
    containsAsciiControl(entry.path) ||
    entry.path.split('/').some(
      (segment) =>
        !segment || segment === '.' || segment === '..'
    ) ||
    !['directory', 'file', 'symlink'].includes(entry.kind) ||
    !isAllowedArchiveMember(
      entry.kind === 'directory'
        ? `${entry.path}/`
        : entry.path
    ) ||
    (
      payloadClass === 'core' &&
      (
        entry.path === '.openclaw/browser' ||
        entry.path.startsWith('.openclaw/browser/')
      )
    )
  ) {
    throw new Error('Payload path manifest entry is invalid');
  }

  const keys = Object.keys(entry).toSorted();
  if (entry.kind === 'directory') {
    if (JSON.stringify(keys) !== '["kind","path"]') {
      throw new Error('Payload directory entry is invalid');
    }
    return { path: entry.path, kind: 'directory' };
  }
  if (entry.kind === 'file') {
    if (
      JSON.stringify(keys) !==
        '["bytes","kind","path","sha256"]' ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    ) {
      throw new Error('Payload file entry is invalid');
    }
    return {
      path: entry.path,
      kind: 'file',
      bytes: entry.bytes,
      sha256: entry.sha256
    };
  }
  if (
    JSON.stringify(keys) !==
      '["kind","path","targetBytes","targetSha256"]' ||
    !Number.isSafeInteger(entry.targetBytes) ||
    entry.targetBytes < 0 ||
    !/^[a-f0-9]{64}$/.test(entry.targetSha256)
  ) {
    throw new Error('Payload symbolic-link entry is invalid');
  }
  return {
    path: entry.path,
    kind: 'symlink',
    targetBytes: entry.targetBytes,
    targetSha256: entry.targetSha256
  };
}

async function stableExtractedFileEntry(path, archivePath) {
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  const hash = createHash('sha256');
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.size > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      throw new Error('Extracted payload file is invalid');
    }
    for await (const chunk of handle.createReadStream({
      autoClose: false
    })) {
      hash.update(chunk);
    }
    const after = await handle.stat({ bigint: true });
    if (!samePinnedFileVersion(before, after)) {
      throw new Error(
        'Extracted payload changed during verification'
      );
    }
    return {
      path: archivePath,
      kind: 'file',
      bytes: Number(after.size),
      sha256: hash.digest('hex')
    };
  } finally {
    await handle.close();
  }
}

async function stableExtractedSymlinkEntry(path, archivePath) {
  const before = await lstat(path, { bigint: true });
  if (!before.isSymbolicLink()) {
    throw new Error('Extracted symbolic link is invalid');
  }
  const target = await readlink(path);
  const after = await lstat(path, { bigint: true });
  if (!samePinnedFileVersion(before, after)) {
    throw new Error(
      'Extracted symbolic link changed during verification'
    );
  }
  return {
    path: archivePath,
    kind: 'symlink',
    targetBytes: Buffer.byteLength(target, 'utf8'),
    targetSha256: createHash('sha256')
      .update(target, 'utf8')
      .digest('hex')
  };
}

async function collectExtractedPayloadEntries(target) {
  const entries = [];

  async function walk(absoluteDirectory, relativeDirectory) {
    const directory = await opendir(absoluteDirectory);
    for await (const entry of directory) {
      const relativePath = relativeDirectory
        ? join(relativeDirectory, entry.name)
        : entry.name;
      const archivePath = relativePath.split(sep).join('/');
      if (archivePath === PATH_MANIFEST_ARCHIVE_PATH) continue;
      const absolutePath = join(absoluteDirectory, entry.name);
      const info = await lstat(absolutePath);
      if (
        !isAllowedArchiveMember(
          info.isDirectory()
            ? `${archivePath}/`
            : archivePath
        )
      ) {
        throw new Error(
          'Extracted payload contains a forbidden path'
        );
      }
      if (info.isDirectory()) {
        entries.push({ path: archivePath, kind: 'directory' });
        await walk(absolutePath, relativePath);
      } else if (info.isFile()) {
        entries.push(
          await stableExtractedFileEntry(
            absolutePath,
            archivePath
          )
        );
      } else if (info.isSymbolicLink()) {
        entries.push(
          await stableExtractedSymlinkEntry(
            absolutePath,
            archivePath
          )
        );
      } else {
        throw new Error(
          'Extracted payload contains an unsupported special file'
        );
      }
    }
  }

  await walk(target, '');
  entries.sort(bytewisePathCompare);
  return entries;
}

async function verifyExtractedPayloadManifest(
  target,
  outerManifest
) {
  if (outerManifest.schema === BACKUP_MANIFEST_V1) {
    return {
      verified: false,
      legacy: true,
      hostPolicy: null,
      entries: null
    };
  }
  if (outerManifest.schema !== BACKUP_MANIFEST_V2) {
    throw new Error('Unsupported backup manifest schema');
  }
  const summary = outerManifest.payloadManifest;
  const path = join(target, PATH_MANIFEST_ARCHIVE_PATH);
  const info = await lstat(path);
  if (
    info.isSymbolicLink() ||
    !info.isFile() ||
    info.size !== summary.bytes ||
    info.size <= 0 ||
    info.size > MAX_PATH_MANIFEST_BYTES ||
    (await sha256File(path)) !== summary.sha256
  ) {
    throw new Error(
      'Payload path manifest hash or size verification failed'
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error('Payload path manifest is not valid JSON');
  }
  const payloadClass = normalizePayloadClass(
    outerManifest.payloadClass
  );
  if (
    parsed?.schema !== PATH_MANIFEST_SCHEMA ||
    parsed.setId !== outerManifest.setId ||
    parsed.payloadClass !== payloadClass ||
    parsed.hostPolicy !== summary.hostPolicy ||
    !Array.isArray(parsed.entries) ||
    parsed.entries.length !== summary.entries
  ) {
    throw new Error('Payload path manifest contract is invalid');
  }

  const declaredEntries = parsed.entries.map((entry) =>
    validatePayloadEntry(entry, payloadClass)
  );
  for (let index = 1; index < declaredEntries.length; index += 1) {
    if (
      bytewisePathCompare(
        declaredEntries[index - 1],
        declaredEntries[index]
      ) >= 0
    ) {
      throw new Error(
        'Payload path manifest is unsorted or duplicated'
      );
    }
  }
  if (
    payloadEntryContentBytes(declaredEntries) !==
      summary.contentBytes
  ) {
    throw new Error(
      'Payload path manifest content-byte total is invalid'
    );
  }
  const actualEntries = await collectExtractedPayloadEntries(
    target
  );
  if (
    JSON.stringify(actualEntries) !==
    JSON.stringify(declaredEntries)
  ) {
    throw new Error(
      'Extracted payload does not match its signed path manifest'
    );
  }
  return {
    verified: true,
    legacy: false,
    hostPolicy: parsed.hostPolicy,
    entries: declaredEntries,
    entryCount: declaredEntries.length,
    contentBytes: summary.contentBytes
  };
}

async function quarantineAbsoluteSymlinks(target) {
  const quarantined = [];

  async function walk(absoluteDirectory, relativeDirectory) {
    const directory = await opendir(absoluteDirectory);
    for await (const entry of directory) {
      const relativePath = relativeDirectory
        ? join(relativeDirectory, entry.name)
        : entry.name;
      const archivePath = relativePath.split(sep).join('/');
      const absolutePath = join(absoluteDirectory, entry.name);
      const info = await lstat(absolutePath);
      if (info.isDirectory()) {
        await walk(absolutePath, relativePath);
      } else if (info.isSymbolicLink()) {
        const linkTarget = await readlink(absolutePath);
        if (isAbsolute(linkTarget)) {
          if (!isAllowedArchiveMember(archivePath)) {
            throw new Error(
              'Absolute symlink has a forbidden archive path'
            );
          }
          await unlink(absolutePath);
          quarantined.push({
            path: archivePath,
            target: linkTarget,
            restoreMode:
              'removed from fenced working tree; rebuild or relink manually after review'
          });
        }
      }
    }
  }

  await walk(target, '');
  quarantined.sort((left, right) =>
    left.path.localeCompare(right.path)
  );
  if (quarantined.length > 0) {
    const reportDirectory = join(
      target,
      'backup-meta',
      'quarantine',
      'restore-fenced'
    );
    await mkdir(reportDirectory, { recursive: true, mode: 0o700 });
    await writeFile(
      join(reportDirectory, 'absolute-symlinks.json'),
      `${JSON.stringify(quarantined, null, 2)}\n`,
      { mode: 0o600, flag: 'wx' }
    );
  }
  return quarantined;
}

async function validateExtractedTree(target) {
  let files = 0;
  let directories = 0;
  let safeSymlinks = 0;
  const hardlinks = new Map();

  async function walk(absoluteDirectory, relativeDirectory) {
    const directory = await opendir(absoluteDirectory);
    for await (const entry of directory) {
      const relativePath = relativeDirectory
        ? join(relativeDirectory, entry.name)
        : entry.name;
      const archivePath = relativePath.split(sep).join('/');
      const absolutePath = join(absoluteDirectory, entry.name);
      const info = await lstat(absolutePath);
      if (
        !isAllowedArchiveMember(
          info.isDirectory() ? `${archivePath}/` : archivePath
        )
      ) {
        throw new Error('Extracted archive contains a forbidden path');
      }

      if (info.isDirectory()) {
        directories += 1;
        await walk(absolutePath, relativePath);
      } else if (info.isSymbolicLink()) {
        const linkTarget = await readlink(absolutePath);
        if (isAbsolute(linkTarget)) {
          throw new Error('Extracted archive contains an absolute symlink');
        }
        const resolvedTarget = resolve(dirname(absolutePath), linkTarget);
        if (!isWithin(target, resolvedTarget)) {
          throw new Error(
            'Extracted archive contains an escaping symbolic link'
          );
        }
        safeSymlinks += 1;
      } else if (info.isFile()) {
        if (info.nlink > 1) {
          const key = `${info.dev}:${info.ino}`;
          const group = hardlinks.get(key) || {
            expectedLinks: info.nlink,
            paths: []
          };
          if (group.expectedLinks !== info.nlink) {
            throw new Error(
              'Extracted archive hard-link metadata is inconsistent'
            );
          }
          group.paths.push(archivePath);
          hardlinks.set(key, group);
        }
        files += 1;
      } else {
        throw new Error(
          'Extracted archive contains an unsupported special file'
        );
      }
    }
  }

  await walk(target, '');
  for (const group of hardlinks.values()) {
    if (group.paths.length !== group.expectedLinks) {
      throw new Error(
        'Extracted archive hard link escapes the fenced restore root'
      );
    }
  }
  return {
    files,
    directories,
    safeSymlinks,
    closedHardlinkGroups: hardlinks.size,
    hardlinkedFiles: [...hardlinks.values()].reduce(
      (total, group) => total + group.paths.length,
      0
    )
  };
}

function safeRelativePath(value, label) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\\') ||
    value.startsWith('/') ||
    value.split('/').some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        containsAsciiControl(segment)
    )
  ) {
    throw new Error(`${label} is not a safe relative path`);
  }
  return value;
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function sqliteQuickCheck(database) {
  const rows = database.prepare('PRAGMA quick_check').all();
  if (
    rows.length !== 1 ||
    !Object.values(rows[0] || {}).some((value) => value === 'ok')
  ) {
    throw new Error('Restored SQLite integrity check failed');
  }
}

function sqliteTableExists(database, tableName) {
  return Boolean(
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
      )
      .get(tableName)
  );
}

function sqliteTableColumns(database, tableName) {
  return new Set(
    database
      .prepare(`PRAGMA table_info(${tableName})`)
      .all()
      .map((row) => row.name)
  );
}

function scrubDeliveryQueue(database) {
  if (!sqliteTableExists(database, 'delivery_queue_entries')) {
    return null;
  }
  const before = database
    .prepare('SELECT COUNT(*) AS rows FROM delivery_queue_entries')
    .get();
  const result = database
    .prepare('DELETE FROM delivery_queue_entries')
    .run();
  const after = database
    .prepare('SELECT COUNT(*) AS rows FROM delivery_queue_entries')
    .get();
  if (Number(after.rows) !== 0) {
    throw new Error('Restored delivery queue was not fully scrubbed');
  }
  return {
    rowsBefore: Number(before.rows),
    rowsDeleted: Number(result.changes)
  };
}

function fenceCronJobs(database) {
  if (!sqliteTableExists(database, 'cron_jobs')) return null;
  const requiredColumns = new Set([
    'store_key',
    'job_id',
    'enabled',
    'next_run_at_ms',
    'running_at_ms',
    'job_json',
    'state_json'
  ]);
  const columns = sqliteTableColumns(database, 'cron_jobs');
  if ([...requiredColumns].some((column) => !columns.has(column))) {
    throw new Error('Cron table cannot be fenced safely');
  }
  const rows = database
    .prepare(
      'SELECT store_key, job_id, enabled, job_json FROM cron_jobs'
    )
    .all();
  let enabledBefore = 0;
  const update = database.prepare(
    `UPDATE cron_jobs
       SET enabled = 0,
           next_run_at_ms = NULL,
           running_at_ms = NULL,
           state_json = '{}',
           job_json = ?
     WHERE store_key = ? AND job_id = ?`
  );
  for (const row of rows) {
    if (Number(row.enabled) !== 0) enabledBefore += 1;
    let job;
    try {
      job = JSON.parse(row.job_json);
    } catch {
      throw new Error('Cron job JSON cannot be fenced safely');
    }
    if (!job || typeof job !== 'object' || Array.isArray(job)) {
      throw new Error('Cron job JSON cannot be fenced safely');
    }
    job.enabled = false;
    job.state = {};
    const result = update.run(
      JSON.stringify(job),
      row.store_key,
      row.job_id
    );
    if (Number(result.changes) !== 1) {
      throw new Error('Cron job fence update was incomplete');
    }
  }
  const unsafe = database
    .prepare(
      `SELECT COUNT(*) AS rows
         FROM cron_jobs
        WHERE enabled <> 0
           OR next_run_at_ms IS NOT NULL
           OR running_at_ms IS NOT NULL
           OR state_json <> '{}'`
    )
    .get();
  if (Number(unsafe.rows) !== 0) {
    throw new Error('Restored cron jobs remain executable');
  }
  for (const row of database
    .prepare('SELECT job_json FROM cron_jobs')
    .all()) {
    let job;
    try {
      job = JSON.parse(row.job_json);
    } catch {
      throw new Error('Fenced cron job JSON is invalid');
    }
    if (
      !job ||
      job.enabled !== false ||
      JSON.stringify(job.state) !== '{}'
    ) {
      throw new Error('Restored cron job JSON remains executable');
    }
  }
  return {
    rows: rows.length,
    enabledBefore,
    enabledAfter: 0
  };
}

async function materializeSqliteDatabases(
  target,
  backupMetadata,
  inventory
) {
  const { DatabaseSync } = await import('node:sqlite');
  if (
    !Array.isArray(backupMetadata.sqliteSnapshots) ||
    !Array.isArray(inventory.sqliteDatabases) ||
    backupMetadata.sqliteSnapshots.length !==
      inventory.sqliteDatabaseCount ||
    inventory.invalidDatabaseCandidates?.length !== 0 ||
    inventory.missingCriticalSqlitePaths?.length !== 0
  ) {
    throw new Error('SQLite coverage metadata is incomplete');
  }

  const inventoryPaths = new Set(
    inventory.sqliteDatabases.map((database) =>
      safeRelativePath(database.path, 'SQLite inventory path')
    )
  );
  const scrubEntries =
    backupMetadata.sideEffectQuarantine?.sqliteTables;
  if (!Array.isArray(scrubEntries)) {
    throw new Error('Side-effect SQLite quarantine metadata is missing');
  }
  const declaredPolicies = new Set();
  for (const entry of scrubEntries) {
    if (
      !['delivery_queue_entries', 'cron_jobs'].includes(
        entry.table
      ) ||
      !Number.isSafeInteger(entry.rowsAtBackup) ||
      entry.rowsAtBackup < 0 ||
      (entry.table === 'cron_jobs' &&
        (!Number.isSafeInteger(entry.enabledRowsAtBackup) ||
          entry.enabledRowsAtBackup < 0 ||
          entry.enabledRowsAtBackup > entry.rowsAtBackup))
    ) {
      throw new Error('Unsupported side-effect table quarantine policy');
    }
    const sourcePath = safeRelativePath(
      entry.sourcePath,
      'Side-effect SQLite source path'
    );
    const policy = `${sourcePath}\0${entry.table}`;
    if (declaredPolicies.has(policy)) {
      throw new Error('Duplicate side-effect SQLite quarantine policy');
    }
    declaredPolicies.add(policy);
  }

  const restoredPaths = new Set();
  const detectedPolicies = new Set();
  let scrubbedRows = 0;
  let deliveryQueueTablesScrubbed = 0;
  let cronTablesFenced = 0;
  let cronJobsFenced = 0;
  let enabledCronJobsDisabled = 0;
  for (const snapshot of backupMetadata.sqliteSnapshots) {
    const sourcePath = safeRelativePath(
      snapshot.sourcePath,
      'SQLite restore source path'
    );
    const archivePath = safeRelativePath(
      snapshot.archivePath,
      'SQLite snapshot archive path'
    );
    if (
      archivePath !== `sqlite/${sourcePath}` ||
      !inventoryPaths.has(sourcePath) ||
      restoredPaths.has(sourcePath) ||
      !Number.isSafeInteger(snapshot.bytes) ||
      snapshot.bytes <= 0 ||
      !/^[a-f0-9]{64}$/.test(snapshot.sha256)
    ) {
      throw new Error('SQLite restore mapping is invalid');
    }
    restoredPaths.add(sourcePath);

    const snapshotPath = join(target, 'backup-meta', archivePath);
    const snapshotInfo = await lstat(snapshotPath);
    if (
      snapshotInfo.isSymbolicLink() ||
      !snapshotInfo.isFile() ||
      snapshotInfo.size !== snapshot.bytes ||
      (await sha256File(snapshotPath)) !== snapshot.sha256
    ) {
      throw new Error('SQLite snapshot hash or size verification failed');
    }
    const snapshotDatabase = new DatabaseSync(snapshotPath, {
      readOnly: true,
      allowExtension: false
    });
    try {
      sqliteQuickCheck(snapshotDatabase);
    } finally {
      snapshotDatabase.close();
    }

    const destination = join(target, '.openclaw', sourcePath);
    if (await pathExists(destination)) {
      throw new Error(
        'Live SQLite file unexpectedly existed in the archive tree'
      );
    }
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    await copyFile(snapshotPath, destination, constants.COPYFILE_EXCL);
    await chmod(destination, 0o600);

    const restoredDatabase = new DatabaseSync(destination, {
      allowExtension: false
    });
    try {
      restoredDatabase.exec('BEGIN IMMEDIATE');
      try {
        const deliveryQueue = scrubDeliveryQueue(restoredDatabase);
        if (deliveryQueue) {
          detectedPolicies.add(
            `${sourcePath}\0delivery_queue_entries`
          );
          scrubbedRows += deliveryQueue.rowsDeleted;
          deliveryQueueTablesScrubbed += 1;
        }
        const cron = fenceCronJobs(restoredDatabase);
        if (cron) {
          detectedPolicies.add(`${sourcePath}\0cron_jobs`);
          cronTablesFenced += 1;
          cronJobsFenced += cron.rows;
          enabledCronJobsDisabled += cron.enabledBefore;
        }
        restoredDatabase.exec('COMMIT');
      } catch (error) {
        restoredDatabase.exec('ROLLBACK');
        throw error;
      }
      sqliteQuickCheck(restoredDatabase);
    } finally {
      restoredDatabase.close();
    }
  }
  if (
    restoredPaths.size !== inventoryPaths.size ||
    [...inventoryPaths].some((path) => !restoredPaths.has(path))
  ) {
    throw new Error('Not every inventoried SQLite database was restored');
  }
  if (
    [...declaredPolicies].some(
      (policy) => !detectedPolicies.has(policy)
    )
  ) {
    throw new Error(
      'Declared side-effect SQLite table was absent during restore'
    );
  }
  return {
    restored: restoredPaths.size,
    scrubbedDeliveryQueueRows: scrubbedRows,
    deliveryQueueTablesScrubbed,
    cronTablesFenced,
    cronJobsFenced,
    enabledCronJobsDisabled
  };
}

async function runPostgresList(path) {
  const child = spawn('pg_restore', ['--list', path], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, LC_ALL: 'C' }
  });
  child.stderr.resume();
  await waitForChild(child, 'PostgreSQL dump listing verification');
}

async function verifyPostgresDump(
  target,
  backupMetadata,
  allowNoPostgres
) {
  const postgres = backupMetadata.postgres;
  if (!postgres || typeof postgres.included !== 'boolean') {
    throw new Error('PostgreSQL backup metadata is missing');
  }
  if (!postgres.included) {
    if (!allowNoPostgres || postgres.reason !== 'explicitly_skipped') {
      throw new Error(
        'Backup set has no PostgreSQL dump; explicit recovery override required'
      );
    }
    return { included: false, verified: false };
  }
  if (
    postgres.archivePath !== 'postgres/agent-os.dump' ||
    postgres.format !== 'custom' ||
    !Number.isSafeInteger(postgres.bytes) ||
    postgres.bytes <= 5 ||
    !/^[a-f0-9]{64}$/.test(postgres.sha256)
  ) {
    throw new Error('PostgreSQL dump metadata is invalid');
  }
  const path = join(target, 'backup-meta', postgres.archivePath);
  const info = await lstat(path);
  if (
    info.isSymbolicLink() ||
    !info.isFile() ||
    info.size !== postgres.bytes ||
    (await sha256File(path)) !== postgres.sha256
  ) {
    throw new Error('PostgreSQL dump hash or size verification failed');
  }
  const handle = await open(path, 'r');
  try {
    const header = Buffer.alloc(5);
    await handle.read(header, 0, header.length, 0);
    if (header.toString('ascii') !== 'PGDMP') {
      throw new Error('PostgreSQL dump header verification failed');
    }
  } finally {
    await handle.close();
  }
  await runPostgresList(path);
  return { included: true, verified: true, bytes: info.size };
}

function rebaseHostEntries(entries, archivePrefix) {
  const matched = [];
  for (const entry of entries) {
    if (
      entry.path !== archivePrefix &&
      !entry.path.startsWith(`${archivePrefix}/`)
    ) {
      continue;
    }
    const suffix = entry.path.slice(archivePrefix.length);
    matched.push({
      ...entry,
      path: `item${suffix}`
    });
  }
  matched.sort(bytewisePathCompare);
  return matched;
}

function validateHostRecoveryMetadata(
  backupMetadata,
  payloadVerification
) {
  const hostRecovery = backupMetadata.hostRecovery;
  if (
    !hostRecovery ||
    hostRecovery.policy !== payloadVerification.hostPolicy ||
    !Array.isArray(hostRecovery.paths)
  ) {
    throw new Error('Host recovery metadata is invalid');
  }
  if (
    payloadVerification.hostPolicy ===
    HOST_RECOVERY_SKIPPED_POLICY
  ) {
    if (
      hostRecovery.mode !== 'skip' ||
      hostRecovery.paths.length !== 0 ||
      hostRecovery.rootCrontab !== null
    ) {
      throw new Error('Skipped host recovery metadata is invalid');
    }
    return {
      policy: HOST_RECOVERY_SKIPPED_POLICY,
      included: false,
      verifiedItems: 0,
      requiredItems: 0,
      rootCrontabVerified: false
    };
  }
  if (
    payloadVerification.hostPolicy !== HOST_RECOVERY_POLICY ||
    hostRecovery.mode !== 'include' ||
    hostRecovery.paths.length !==
      HOST_RECOVERY_DESCRIPTORS.length
  ) {
    throw new Error('Host recovery policy is invalid');
  }

  const items = new Map();
  for (const item of hostRecovery.paths) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      items.has(item.id)
    ) {
      throw new Error('Host recovery item metadata is invalid');
    }
    items.set(item.id, item);
  }

  let verifiedItems = 0;
  let requiredItems = 0;
  for (const descriptor of HOST_RECOVERY_DESCRIPTORS) {
    const item = items.get(descriptor.id);
    if (!item || item.required !== descriptor.required) {
      throw new Error('Host recovery item metadata is invalid');
    }
    if (descriptor.required) requiredItems += 1;
    if (!item.present) {
      if (
        descriptor.required ||
        Object.keys(item).some(
          (key) =>
            !['id', 'required', 'present'].includes(key)
        )
      ) {
        throw new Error(
          `Required host recovery item is missing: ${descriptor.id}`
        );
      }
      const absentPrefix =
        `backup-meta/host/files/${descriptor.id}`;
      if (
        payloadVerification.entries.some(
          (entry) =>
            entry.path === absentPrefix ||
            entry.path.startsWith(`${absentPrefix}/`)
        )
      ) {
        throw new Error('Absent host recovery item has payload data');
      }
      continue;
    }
    if (
      item.targetPath !== descriptor.path ||
      item.kind !== descriptor.kind ||
      item.archivePath !== `host/files/${descriptor.id}` ||
      !Number.isSafeInteger(item.entries) ||
      item.entries < 1 ||
      !Number.isSafeInteger(item.contentBytes) ||
      item.contentBytes < 0 ||
      !/^[a-f0-9]{64}$/.test(item.contentRootSha256)
    ) {
      throw new Error(
        `Host recovery item metadata is invalid: ${descriptor.id}`
      );
    }
    const rebased = rebaseHostEntries(
      payloadVerification.entries,
      `backup-meta/${item.archivePath}`
    );
    if (
      rebased.length !== item.entries ||
      rebased[0]?.kind !== descriptor.kind ||
      payloadEntryContentBytes(rebased) !== item.contentBytes ||
      canonicalEntriesDigest(rebased) !==
        item.contentRootSha256
    ) {
      throw new Error(
        `Host recovery item content is invalid: ${descriptor.id}`
      );
    }
    verifiedItems += 1;
  }

  const crontab = hostRecovery.rootCrontab;
  const crontabEntry = payloadVerification.entries.find(
    (entry) =>
      entry.path === 'backup-meta/host/root-crontab.txt'
  );
  if (
    HOST_ROOT_CRONTAB_REQUIRED &&
    (
      !crontab ||
      crontab.archivePath !== 'host/root-crontab.txt' ||
      !Number.isSafeInteger(crontab.bytes) ||
      crontab.bytes < 1 ||
      !/^[a-f0-9]{64}$/.test(crontab.sha256) ||
      crontabEntry?.kind !== 'file' ||
      crontabEntry.bytes !== crontab.bytes ||
      crontabEntry.sha256 !== crontab.sha256
    )
  ) {
    throw new Error(
      'Required host recovery item is missing: root_crontab'
    );
  }
  return {
    policy: HOST_RECOVERY_POLICY,
    included: true,
    verifiedItems,
    requiredItems,
    rootCrontabVerified: true
  };
}

async function quarantineLivePath(target, relativePath) {
  const source = join(target, '.openclaw', relativePath);
  if (!(await pathExists(source))) return null;
  const destination = join(
    target,
    'backup-meta',
    'quarantine',
    'restore-fenced',
    'openclaw',
    relativePath
  );
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  if (await pathExists(destination)) {
    throw new Error('Restore quarantine destination already exists');
  }
  await rename(source, destination);
  return relativePath;
}

async function fenceSideEffects(target, backupMetadata) {
  const moved = [];
  const cron = await quarantineLivePath(target, 'cron');
  if (cron) moved.push(cron);
  const deliveryQueue = await quarantineLivePath(
    target,
    'session-delivery-queue'
  );
  if (deliveryQueue) moved.push(deliveryQueue);

  const telegram = join(target, '.openclaw', 'telegram');
  if (await pathExists(telegram)) {
    const directory = await opendir(telegram);
    for await (const entry of directory) {
      if (entry.name.startsWith('ingress-spool-')) {
        const relativePath = `telegram/${entry.name}`;
        const movedPath = await quarantineLivePath(target, relativePath);
        if (movedPath) moved.push(movedPath);
      }
    }
  }

  const declaredPaths =
    backupMetadata.sideEffectQuarantine?.paths;
  if (!Array.isArray(declaredPaths)) {
    throw new Error('File side-effect quarantine metadata is missing');
  }
  for (const entry of declaredPaths) {
    const sourcePath = safeRelativePath(
      entry.sourcePath,
      'Quarantined source path'
    );
    const archivePath = safeRelativePath(
      entry.archivePath,
      'Quarantined archive path'
    );
    if (
      !archivePath.startsWith('quarantine/openclaw/') ||
      (await pathExists(join(target, '.openclaw', sourcePath))) ||
      !(await pathExists(join(target, 'backup-meta', archivePath)))
    ) {
      throw new Error('Declared side-effect quarantine is inconsistent');
    }
  }
  return moved;
}

async function executeRestore(options, setDirectory, manifest) {
  const target = await validateEmptyTarget(
    options.target,
    setDirectory
  );
  const diskBudget = await assertRestoreDiskBudget(target, manifest);
  const verification = await verifySet(setDirectory, {
    deep: true,
    signerFingerprint: options.signer
  });
  await extractArchive(setDirectory, manifest, target);
  const payloadVerification =
    await verifyExtractedPayloadManifest(target, manifest);

  const backupMetadata = await readJsonFile(
    join(target, 'backup-meta', 'backup.json'),
    'Internal backup metadata'
  );
  const inventory = await readJsonFile(
    join(target, 'backup-meta', 'inventory.json'),
    'Internal backup inventory'
  );
  const legacyPayload =
    backupMetadata.schema === BACKUP_PAYLOAD_V1 &&
    manifest.schema === BACKUP_MANIFEST_V1;
  const v2Payload =
    backupMetadata.schema === BACKUP_PAYLOAD_V2 &&
    manifest.schema === BACKUP_MANIFEST_V2;
  const outerPayloadClass = normalizePayloadClass(
    manifest.payloadClass,
    { legacyMissingAsCore: manifest.schema === BACKUP_MANIFEST_V1 }
  );
  const innerPayloadClass = normalizePayloadClass(
    backupMetadata.payloadClass,
    { legacyMissingAsCore: legacyPayload }
  );
  if (
    (!legacyPayload && !v2Payload) ||
    backupMetadata.setId !== manifest.setId ||
    innerPayloadClass !== outerPayloadClass ||
    backupMetadata.sourceArchiveRoot !== '.openclaw' ||
    !backupMetadata.runtimeVersions ||
    !backupMetadata.consistency ||
    backupMetadata.consistency.mode !==
      manifest.consistencyProof.mode
  ) {
    throw new Error('Internal backup metadata contract is invalid');
  }
  if (
    v2Payload &&
    (
      !payloadVerification.verified ||
      backupMetadata.pathManifest?.schema !==
        PATH_MANIFEST_SCHEMA ||
      backupMetadata.pathManifest?.archivePath !==
        PATH_MANIFEST_ARCHIVE_PATH ||
      backupMetadata.pathManifest?.hostPolicy !==
        manifest.payloadManifest.hostPolicy
    )
  ) {
    throw new Error(
      'Internal payload manifest binding is invalid'
    );
  }
  const hostRecovery = v2Payload
    ? validateHostRecoveryMetadata(
        backupMetadata,
        payloadVerification
      )
    : {
        policy: 'legacy-unverified',
        included: null,
        verifiedItems: 0,
        requiredItems: 0,
        rootCrontabVerified: false
      };
  let productionData = {
    included: false,
    reason: 'legacy-unverified',
    fullProductionRecovery: false
  };
  if (v2Payload) {
    const productionSummary =
      manifest.payloadComponents.agentOsProduction;
    if (
      !isDeepStrictEqual(
        backupMetadata.productionData,
        productionSummary
      )
    ) {
      throw new Error(
        'Agent OS production data metadata does not match its signed summary'
      );
    }
    productionData =
      await verifyCapturedProductionData({
        metadataRoot: join(target, 'backup-meta'),
        summary: productionSummary,
        expectedSetId: manifest.setId
      });
    if (
      !productionData.included &&
      !options.allowNoProductionData
    ) {
      throw new Error(
        'Backup set has no Agent OS production data; explicit recovery override required'
      );
    }
  }
  if (
    manifest.consistencyProof.mode !== 'quiesced' &&
    !options.allowBestEffort
  ) {
    throw new Error(
      'Backup was not quiesced; explicit recovery override required'
    );
  }

  const absoluteSymlinksQuarantined =
    await quarantineAbsoluteSymlinks(target);
  const extractedTree = await validateExtractedTree(target);
  const sqlite = await materializeSqliteDatabases(
    target,
    backupMetadata,
    inventory
  );
  const postgres = await verifyPostgresDump(
    target,
    backupMetadata,
    options.allowNoPostgres
  );
  const additionallyQuarantined = await fenceSideEffects(
    target,
    backupMetadata
  );
  const result = {
    schema: 'openclaw-fenced-restore/v1',
    ok: true,
    status: 'fenced-inspection-only',
    setId: manifest.setId,
    createdAt: new Date().toISOString(),
    target,
    signerFingerprint: options.signer.toUpperCase(),
    payloadClass: outerPayloadClass,
    transportVerification: verification.deepIntegrity,
    payloadVerification: {
      verified: payloadVerification.verified,
      entryCount: payloadVerification.entryCount || null,
      contentBytes: payloadVerification.contentBytes || null,
      hostPolicy: payloadVerification.hostPolicy
    },
    hostRecovery,
    productionData,
    diskBudget,
    extractedTree,
    absoluteSymlinksQuarantined:
      absoluteSymlinksQuarantined.length,
    sqlite,
    postgres,
    additionallyQuarantined,
    blockedActions: [
      'replace-live-openclaw',
      'restore-postgres-into-live-database',
      'restore-supabase-into-live-project',
      'automatically-recreate-supabase-auth-control-plane',
      'upload-restored-media',
      'install-host-configuration',
      'install-cron',
      'start-agents',
      'enable-channels',
      'start-browser',
      'open-restored-tabs',
      'network-unfence'
    ]
  };
  await writeFile(
    join(target, 'RESTORE_FENCED.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    { mode: 0o600, flag: 'wx' }
  );
  return result;
}

async function main() {
  process.umask(0o077);
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const setDirectory = await realpath(options.setDirectory);
  const outerVerification = await verifySet(setDirectory);
  const manifest = await readJsonFile(
    join(setDirectory, 'manifest.json'),
    'Outer backup manifest'
  );
  if (!options.execute) {
    const plan = {
      schema: 'openclaw-restore-plan/v1',
      mode: 'dry_run',
      setId: outerVerification.setId,
      ciphertextBytes: outerVerification.ciphertextBytes,
      payloadBytesEstimate: manifest.payloadBytesEstimate,
      targetConfigured: Boolean(options.target),
      signerConfigured: FINGERPRINT_PATTERN.test(options.signer),
      actions: [
        'pinned-signature-deep-verification',
        'trusted-owner-and-pinned-chunk-verification',
        'fenced-empty-root-extraction',
        'signed-path-manifest-exact-tree-verification',
        'staged-host-recovery-content-verification',
        'archive-path-and-link-validation',
        'absolute-symlink-quarantine',
        'all-sqlite-hash-quick-check-and-materialization',
        'delivery-queue-scrub',
        'sqlite-cron-disable-and-runtime-clear',
        'cron-and-ingress-quarantine',
        'postgres-dump-hash-and-list-verification'
      ],
      deniedByDesign: [
        'live-root-overwrite',
        'service-start',
        'channel-enable',
        'cron-install',
        'host-config-apply',
        'live-postgres-write'
      ]
    };
    process.stdout.write(
      options.json
        ? `${JSON.stringify(plan, null, 2)}\n`
        : `backup_restore_dry_run set=${plan.setId} target_configured=${plan.targetConfigured}\n`
    );
    return;
  }

  const result = await executeRestore(
    options,
    setDirectory,
    manifest
  );
  process.stdout.write(
    options.json
      ? `${JSON.stringify(result, null, 2)}\n`
      : `backup_restore_fenced_ok set=${result.setId} sqlite=${result.sqlite.restored} target=${result.target}\n`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    process.stderr.write(
      `openclaw_backup_restore_error: ${error.message}\n`
    );
    process.exitCode = 1;
  });
}
