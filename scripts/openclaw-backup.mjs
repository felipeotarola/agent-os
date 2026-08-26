#!/usr/bin/env node

import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  open,
  opendir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  lstat,
  stat,
  statfs,
  writeFile
} from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep
} from 'node:path';
import { constants, realpathSync } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import {
  BACKUP_MANIFEST_V2,
  BACKUP_PAYLOAD_V2,
  HOST_RECOVERY_DESCRIPTORS,
  HOST_RECOVERY_POLICY,
  HOST_RECOVERY_SKIPPED_POLICY,
  HOST_ROOT_CRONTAB_REQUIRED,
  PATH_MANIFEST_ARCHIVE_PATH,
  PATH_MANIFEST_SCHEMA,
  PRODUCTION_CAPTURE_V2,
  containsAsciiControl
} from './openclaw-backup-schema.mjs';
import {
  captureProductionData,
  checkProductionDataConfiguration,
  loadProductionDataConfiguration
} from './openclaw-backup-external.mjs';
import {
  assertNoActiveSwap,
  assertNoSwapTmpfs,
  assertTrustedDirectoryHierarchy,
  openPrivateLockFile
} from './openclaw-backup-path-security.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = '/root/.openclaw/workspace/agent-os';
const DEFAULT_SOURCE = '/root/.openclaw';
const DEFAULT_CHUNK_BYTES = 96 * 1024 * 1024;
const MIN_CHUNK_BYTES = 64 * 1024 * 1024;
const MAX_CHUNK_BYTES = 96 * 1024 * 1024;
const LOCK_ROOT = '/var/lib/openclaw-backup/state/locks';
const LOCK_NAME = 'creator.lock';
const PARTIAL_SET_PATTERN =
  /^\.[0-9]{8}T[0-9]{6}Z-[0-9a-f]{16}\.partial$/;
const SQLITE_SUFFIXES = ['-wal', '-shm', '-journal'];
const SQLITE_SNAPSHOT_SIZE_SUFFIXES = ['-wal', '-journal'];
const MIN_FREE_AFTER_BACKUP_BYTES = 5 * 1024 * 1024 * 1024;
const DEFAULT_PLAINTEXT_STAGING_ROOT =
  '/run/openclaw-backup-tmp';
const STAGING_FIXED_MARGIN_BYTES = 256 * 1024 * 1024;
const STAGING_DUMP_MARGIN_BYTES = 64 * 1024 * 1024;
const MAX_SESSION_JSONL_TAIL_BYTES = 8 * 1024 * 1024;
const MAX_PAYLOAD_PATH_ENTRIES = 200_000;
const MAX_PAYLOAD_PATH_BYTES = 48 * 1024 * 1024;
const MIN_EXECUTE_MEMORY_HEADROOM_KIB = 768 * 1024;
const DEFAULT_COMMAND_TIMEOUT_MS = 2 * 60 * 1000;
const POSTGRES_DUMP_TIMEOUT_MS = 20 * 60 * 1000;
const POSTGRES_VERIFY_TIMEOUT_MS = 10 * 60 * 1000;
const ARCHIVE_PIPELINE_TIMEOUT_MS = 60 * 60 * 1000;
const CODEX_PROCESS_PATTERN =
  '[/]codex( |$)|[/]codex-code-mode-host( |$)';
const TRACE_BACKUP_EXECUTION = process.env.OPENCLAW_BACKUP_TRACE === '1';
const EXTERNAL_PATHS_NOT_INCLUDED = [
  {
    path: 'Hetzner project, firewall, DNS, and account settings',
    reason: 'Provider control-plane state is not readable from the guest backup.'
  },
  {
    path: 'Vercel project, Blob store, environment, and firewall settings',
    reason: 'The independent recovery control plane must be exported from Vercel separately.'
  }
];
const QUARANTINE_RULE_IDS = new Set([
  'delivery_queue_quarantine',
  'telegram_ingress_spool_quarantine'
]);
const NON_WRITER_SYSTEM_TIMERS = new Set([
  'openclaw-backup-maintenance.timer',
  'openclaw-backup-healthcheck.timer'
]);

export function assertPathCollectionWithinLimits(
  entryCount,
  pathBytes,
  label = 'Backup payload'
) {
  if (
    !Number.isSafeInteger(entryCount) ||
    entryCount < 0 ||
    !Number.isSafeInteger(pathBytes) ||
    pathBytes < 0
  ) {
    throw new Error(`${label} path cardinality is invalid`);
  }
  if (
    entryCount > MAX_PAYLOAD_PATH_ENTRIES ||
    pathBytes > MAX_PAYLOAD_PATH_BYTES
  ) {
    throw new Error(
      `${label} exceeds the reviewed path cardinality ceiling`
    );
  }
}

function pathCardinalityGuard(label) {
  let entryCount = 0;
  let pathBytes = 0;
  return {
    account(path) {
      entryCount += 1;
      pathBytes += Buffer.byteLength(path, 'utf8');
      assertPathCollectionWithinLimits(
        entryCount,
        pathBytes,
        label
      );
    },
    snapshot() {
      return { entryCount, pathBytes };
    }
  };
}

export function isPotentialWriterTimerLine(line, scope) {
  const normalized = line.trim();
  if (
    !normalized ||
    !/(?:openclaw|agent-os|qaa|codex)/i.test(normalized)
  ) {
    return false;
  }
  const fields = normalized.split(/\s+/);
  const unit = fields.at(-2) || '';
  return !(
    scope === 'system' &&
    NON_WRITER_SYSTEM_TIMERS.has(unit)
  );
}

const REBUILDABLE_RULES = [
  {
    id: 'browser_profiles_default',
    description:
      'All browser profiles are excluded from Tier A by default; add a separately encrypted opt-in tier if login-session recovery is required.',
    matches: ({ segments }) => segments[0] === 'browser'
  },
  {
    id: 'dependency_tree',
    description: 'Installed dependency trees; restore from lockfiles.',
    matches: ({ segments }) => segments.includes('node_modules')
  },
  {
    id: 'next_build_output',
    description: 'Next.js build output; rebuild from source.',
    matches: ({ segments }) => segments.includes('.next')
  },
  {
    id: 'generic_cache',
    description: 'Generic package/tool caches.',
    matches: ({ segments }) =>
      segments.some((segment) => segment === '.cache' || segment === 'cache')
  },
  {
    id: 'prior_local_backups',
    description: 'Prior local backup copies; protected by their own retention.',
    matches: ({ segments }) => segments[0] === 'backups'
  },
  {
    id: 'delivery_queue_quarantine',
    description:
      'Session delivery queues are preserved under backup-meta/quarantine but never restored into the live tree automatically.',
    matches: ({ segments }) =>
      segments[0] === 'session-delivery-queue'
  },
  {
    id: 'telegram_ingress_spool_quarantine',
    description:
      'Telegram ingress spools are preserved under backup-meta/quarantine to prevent replay on restore.',
    matches: ({ segments }) =>
      segments[0] === 'telegram' &&
      segments[1]?.startsWith('ingress-spool-')
  },
  {
    id: 'codex_rollout_logs',
    description: 'Large rebuildable Codex rollout/log index databases.',
    matches: ({ segments, name }) =>
      segments.includes('codex-home') &&
      (name === 'logs_2.sqlite' ||
        name.startsWith('logs_2.sqlite-') ||
        name === 'logs_2.sqlite-wal' ||
        name === 'logs_2.sqlite-shm')
  },
  {
    id: 'codex_temp',
    description: 'Codex temporary files.',
    matches: ({ segments }) =>
      segments.includes('codex-home') && segments.includes('.tmp')
  },
  {
    id: 'qmd_index',
    description: 'QMD vector/search indexes; rebuild from source memory and sessions.',
    matches: ({ normalized }) => normalized.includes('/qmd/xdg-cache/')
  },
  {
    id: 'browser_runtime_artifacts',
    description:
      'Chromium runtime locks and debug-port state are never recoverable payload.',
    matches: ({ segments, name }) =>
      segments[0] === 'browser' &&
      (
        name === 'SingletonLock' ||
        name === 'SingletonCookie' ||
        name === 'SingletonSocket' ||
        name === 'DevToolsActivePort'
      )
  },
  {
    id: 'browser_cache',
    description: 'Chromium caches and downloaded optimization models.',
    matches: ({ segments }) => {
      if (segments[0] !== 'browser') return false;
      return segments.some(
        (segment) =>
          segment === 'Cache' ||
          segment === 'Code Cache' ||
          segment === 'GPUCache' ||
          segment === 'DawnWebGPUCache' ||
          segment === 'DawnGraphiteCache' ||
          segment === 'ShaderCache' ||
          segment === 'GrShaderCache' ||
          segment === 'GraphiteDawnCache' ||
          segment === 'component_crx_cache' ||
          segment === 'extensions_crx_cache' ||
          segment === 'optimization_guide_model_store' ||
          segment === 'TranslateKit' ||
          segment === 'WasmTtsEngine' ||
          segment === 'OnDeviceHeadSuggestModel' ||
          segment === 'CacheStorage' ||
          segment === 'Safe Browsing'
      );
    }
  },
  {
    id: 'runtime_ephemera',
    description: 'Sockets, PID files, and temporary runtime files.',
    matches: ({ name, isDirectory }) =>
      name.endsWith('.sock') ||
      name.endsWith('.pid') ||
      name.endsWith('.tmp') ||
      (isDirectory && (name === 'tmp' || name === '.tmp'))
  }
];

function activeRebuildableRules(includeBrowserProfiles) {
  return REBUILDABLE_RULES.filter(
    (rule) =>
      !(
        includeBrowserProfiles &&
        rule.id === 'browser_profiles_default'
      )
  );
}

function usage() {
  return `Usage:
  node scripts/openclaw-backup.mjs [options]

Default behavior is a read-only dry run. Nothing is written unless --execute is
present.

Options:
  --execute                 Create a backup set.
  --source PATH             OpenClaw home (default: /root/.openclaw).
  --output-dir PATH         Existing destination outside the source tree.
  --recipient FINGERPRINT   Exact 40- or 64-hex OpenPGP public-key fingerprint.
  --signer FINGERPRINT      Exact backup-origin signing-key fingerprint.
  --chunk-bytes N           Ciphertext chunk size, 64 MiB to 96 MiB.
  --postgres MODE           required (default), auto, or skip.
  --production-data MODE    required, auto (default), or skip for Agent OS
                            Supabase/Auth/Vercel media.
  --include-browser-profiles
                            Include durable browser state while fully quiesced.
  --host-recovery MODE      include (default) or skip external host files.
  --consistency MODE        quiesced (default) or best-effort.
  --plaintext-staging PATH  Dedicated noswap tmpfs root (default:
                            /run/openclaw-backup-tmp).
  --allow-same-device       Permit output on the source filesystem.
  --frozen-codex-scope UNIT Accept Codex only when every matching process is
                            inside this verified frozen systemd session scope.
  --json                    Emit machine-readable dry-run/result output.
  --help                    Show this help.

Environment fallbacks:
  OPENCLAW_BACKUP_OUTPUT_DIR
  OPENCLAW_BACKUP_GPG_RECIPIENT
  OPENCLAW_BACKUP_GPG_SIGNER
  OPENCLAW_BACKUP_PLAINTEXT_STAGING_ROOT
  OPENCLAW_BACKUP_FROZEN_CODEX_SCOPE
  OPENCLAW_BACKUP_PRODUCTION_DATA_MODE
  OPENCLAW_BACKUP_SUPABASE_ENV_FILE
  OPENCLAW_BACKUP_SUPABASE_POOLER_HOST
  OPENCLAW_BACKUP_SUPABASE_MANAGEMENT_TOKEN_FILE
  OPENCLAW_BACKUP_MEDIA_BLOB_HOST

Execute example:
  node scripts/openclaw-backup.mjs --execute \\
    --output-dir /mnt/offhost-staging \\
    --recipient 0123456789ABCDEF0123456789ABCDEF01234567 \\
    --signer FEDCBA9876543210FEDCBA9876543210FEDCBA98

The execute path uses tar -> zstd -> gpg -> split. It never writes a complete
plaintext archive or a complete ciphertext archive to disk. Temporary plaintext
includes consistent database exports, production Auth/media/control-plane data,
host recovery files, and quarantined queues. Execution requires a dedicated
noswap tmpfs and globally disabled swap for the full plaintext capture window.`;
}

export function parseArgs(argv) {
  const options = {
    execute: false,
    source: DEFAULT_SOURCE,
    outputDir: process.env.OPENCLAW_BACKUP_OUTPUT_DIR || '',
    recipient: process.env.OPENCLAW_BACKUP_GPG_RECIPIENT || '',
    signer: process.env.OPENCLAW_BACKUP_GPG_SIGNER || '',
    chunkBytes: DEFAULT_CHUNK_BYTES,
    postgres: 'required',
    productionData:
      process.env.OPENCLAW_BACKUP_PRODUCTION_DATA_MODE || 'auto',
    supabaseEnvFile:
      process.env.OPENCLAW_BACKUP_SUPABASE_ENV_FILE || '',
    supabasePoolerHost:
      process.env.OPENCLAW_BACKUP_SUPABASE_POOLER_HOST || '',
    supabaseManagementTokenFile:
      process.env
        .OPENCLAW_BACKUP_SUPABASE_MANAGEMENT_TOKEN_FILE || '',
    mediaBlobHost:
      process.env.OPENCLAW_BACKUP_MEDIA_BLOB_HOST || '',
    includeBrowserProfiles: false,
    hostRecovery: 'include',
    consistency: 'quiesced',
    plaintextStagingRoot:
      process.env.OPENCLAW_BACKUP_PLAINTEXT_STAGING_ROOT ||
      DEFAULT_PLAINTEXT_STAGING_ROOT,
    frozenCodexScope:
      process.env.OPENCLAW_BACKUP_FROZEN_CODEX_SCOPE || '',
    allowSameDevice: false,
    json: false,
    help: false,
    internalLocked: false
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
    else if (argument === '--source') options.source = takeValue();
    else if (argument === '--output-dir') options.outputDir = takeValue();
    else if (argument === '--recipient') options.recipient = takeValue();
    else if (argument === '--signer') options.signer = takeValue();
    else if (argument === '--chunk-bytes') {
      options.chunkBytes = Number.parseInt(takeValue(), 10);
    } else if (argument === '--postgres') options.postgres = takeValue();
    else if (argument === '--production-data') {
      options.productionData = takeValue();
    }
    else if (argument === '--include-browser-profiles') {
      options.includeBrowserProfiles = true;
    }
    else if (argument === '--host-recovery') {
      options.hostRecovery = takeValue();
    }
    else if (argument === '--consistency') {
      options.consistency = takeValue();
    }
    else if (argument === '--plaintext-staging') {
      options.plaintextStagingRoot = takeValue();
    }
    else if (argument === '--frozen-codex-scope') {
      options.frozenCodexScope = takeValue();
    }
    else if (argument === '--allow-same-device') options.allowSameDevice = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--internal-locked') options.internalLocked = true;
    else throw new Error(`Unknown option: ${argument}`);
  }

  if (!Number.isSafeInteger(options.chunkBytes)) {
    throw new Error('--chunk-bytes must be an integer');
  }
  if (
    options.chunkBytes < MIN_CHUNK_BYTES ||
    options.chunkBytes > MAX_CHUNK_BYTES
  ) {
    throw new Error('--chunk-bytes must be between 64 MiB and 96 MiB');
  }
  if (!['auto', 'required', 'skip'].includes(options.postgres)) {
    throw new Error('--postgres must be auto, required, or skip');
  }
  if (
    !['auto', 'required', 'skip'].includes(
      options.productionData
    )
  ) {
    throw new Error(
      '--production-data must be auto, required, or skip'
    );
  }
  if (!['include', 'skip'].includes(options.hostRecovery)) {
    throw new Error('--host-recovery must be include or skip');
  }
  if (!['quiesced', 'best-effort'].includes(options.consistency)) {
    throw new Error('--consistency must be quiesced or best-effort');
  }
  if (
    options.frozenCodexScope &&
    !/^session-[1-9][0-9]*\.scope$/.test(options.frozenCodexScope)
  ) {
    throw new Error(
      '--frozen-codex-scope must be an exact systemd session-N.scope unit'
    );
  }
  if (
    options.frozenCodexScope &&
    options.consistency !== 'quiesced'
  ) {
    throw new Error(
      '--frozen-codex-scope is valid only with quiesced consistency'
    );
  }
  if (
    options.includeBrowserProfiles &&
    options.consistency !== 'quiesced'
  ) {
    throw new Error(
      '--include-browser-profiles requires quiesced consistency'
    );
  }
  if (
    options.internalLocked &&
    process.env.OPENCLAW_BACKUP_LOCK_HELD !== '1'
  ) {
    throw new Error('Internal lock marker cannot be supplied directly');
  }

  return options;
}

function normalizedRelativePath(value) {
  return `/${value.split(sep).join('/')}/`;
}

export function rebuildableReason(
  relativePath,
  isDirectory = false,
  policy = {}
) {
  const segments = relativePath.split(sep).filter(Boolean);
  const name = segments.at(-1) || '';
  const context = {
    segments,
    name,
    isDirectory,
    normalized: normalizedRelativePath(relativePath)
  };
  return REBUILDABLE_RULES.find(
    (rule) =>
      !(
        rule.id === 'browser_profiles_default' &&
        policy.includeBrowserProfiles === true
      ) &&
      rule.matches(context)
  )?.id || null;
}

function looksLikeDatabasePath(name) {
  const lower = name.toLowerCase();
  return (
    lower.endsWith('.sqlite') ||
    lower.endsWith('.sqlite3') ||
    lower.endsWith('.db')
  );
}

async function hasSqliteHeader(path) {
  const handle = await open(path, 'r');
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return (
      bytesRead === header.length &&
      header.equals(Buffer.from('SQLite format 3\u0000', 'binary'))
    );
  } finally {
    await handle.close();
  }
}

async function sqliteSnapshotSizeEstimate(path, sourceBytes) {
  let estimate = sourceBytes;
  for (const suffix of SQLITE_SNAPSHOT_SIZE_SUFFIXES) {
    try {
      const info = await lstat(`${path}${suffix}`);
      if (info.isSymbolicLink() || !info.isFile()) {
        throw new Error(
          'SQLite journal hierarchy contains an unsafe entry'
        );
      }
      estimate += info.size;
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
  }
  if (!Number.isSafeInteger(estimate) || estimate < sourceBytes) {
    throw new Error('SQLite staging estimate is invalid');
  }
  return estimate;
}

async function directorySize(path) {
  const result = await runCapture('du', ['-sb', '--', path], {
    label: 'du inventory'
  });
  const bytes = Number.parseInt(result.stdout.split(/\s+/, 1)[0], 10);
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new Error('Inventory size calculation returned an invalid result');
  }
  return bytes;
}

async function collectTopLevelInventory(sourceRoot, policy) {
  const entries = [];
  const paths = pathCardinalityGuard('Top-level inventory');
  const directory = await opendir(sourceRoot);
  for await (const entry of directory) {
    if (entry.name.includes('\n') || entry.name.includes('\r')) {
      throw new Error('Newline-bearing paths are not supported');
    }
    paths.account(entry.name);
    const path = join(sourceRoot, entry.name);
    entries.push({
      name: entry.name,
      bytes: await directorySize(path),
      disposition: rebuildableReason(
        entry.name,
        entry.isDirectory(),
        policy
      )
        ? 'excluded'
        : 'protected_or_partially_excluded'
    });
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  return entries;
}

async function walkInventory(sourceRoot, policy = {}) {
  const excludedRoots = [];
  const sqliteDatabases = [];
  const invalidDatabaseCandidates = [];
  let includedBytesEstimate = 0;
  let includedFiles = 0;
  let includedDirectories = 0;
  let includedPathBytes = 0;
  const scannedPaths = pathCardinalityGuard('OpenClaw inventory');

  async function walk(absoluteDirectory, relativeDirectory) {
    const directory = await opendir(absoluteDirectory);
    for await (const entry of directory) {
      if (entry.name.includes('\n') || entry.name.includes('\r')) {
        throw new Error('Newline-bearing paths are not supported');
      }

      const relativePath = relativeDirectory
        ? join(relativeDirectory, entry.name)
        : entry.name;
      const absolutePath = join(absoluteDirectory, entry.name);
      scannedPaths.account(relativePath);
      const reason = rebuildableReason(
        relativePath,
        entry.isDirectory(),
        policy
      );

      if (reason) {
        const info = await lstat(absolutePath);
        excludedRoots.push({
          path: relativePath,
          reason,
          bytesIfFile: info.isFile() ? info.size : null,
          quarantineBytes: QUARANTINE_RULE_IDS.has(reason)
            ? await directorySize(absolutePath)
            : 0
        });
        continue;
      }

      if (entry.isDirectory()) {
        includedDirectories += 1;
        includedPathBytes += Buffer.byteLength(relativePath, 'utf8');
        await walk(absolutePath, relativePath);
        continue;
      }

      const info = await lstat(absolutePath);
      includedFiles += 1;
      includedPathBytes += Buffer.byteLength(relativePath, 'utf8');
      if (info.isFile()) includedBytesEstimate += info.size;

      if (
        info.isFile() &&
        (
          looksLikeDatabasePath(entry.name) ||
          (
            policy.includeBrowserProfiles === true &&
            relativePath.split(sep)[0] === 'browser'
          )
        )
      ) {
        if (await hasSqliteHeader(absolutePath)) {
          sqliteDatabases.push({
            absolutePath,
            relativePath,
            sourceBytes: info.size,
            stagingBytesEstimate:
              await sqliteSnapshotSizeEstimate(
                absolutePath,
                info.size
              )
          });
        } else if (looksLikeDatabasePath(entry.name)) {
          invalidDatabaseCandidates.push({
            path: relativePath,
            sourceBytes: info.size,
            reason: 'database-like path lacks a valid SQLite header'
          });
        }
      }
    }
  }

  await walk(sourceRoot, '');
  excludedRoots.sort((left, right) => left.path.localeCompare(right.path));
  sqliteDatabases.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
  invalidDatabaseCandidates.sort((left, right) =>
    left.path.localeCompare(right.path)
  );

  return {
    includedBytesEstimate,
    includedFiles,
    includedDirectories,
    includedPathBytes,
    excludedRoots,
    sqliteDatabases,
    invalidDatabaseCandidates
  };
}

async function collectProtectedTreeState(
  sourceRoot,
  policy = {}
) {
  const entries = [];
  const paths = pathCardinalityGuard('Protected tree state');

  async function walk(absoluteDirectory, relativeDirectory) {
    const directory = await opendir(absoluteDirectory);
    for await (const entry of directory) {
      if (entry.name.includes('\n') || entry.name.includes('\r')) {
        throw new Error('Newline-bearing paths are not supported');
      }
      const relativePath = relativeDirectory
        ? join(relativeDirectory, entry.name)
        : entry.name;
      const absolutePath = join(absoluteDirectory, entry.name);
      paths.account(relativePath);
      const reason = rebuildableReason(
        relativePath,
        entry.isDirectory(),
        policy
      );
      if (reason && !QUARANTINE_RULE_IDS.has(reason)) continue;

      const info = await lstat(absolutePath, { bigint: true });
      const state = {
        path: relativePath.split(sep).join('/'),
        kind: info.isDirectory()
          ? 'directory'
          : info.isSymbolicLink()
            ? 'symlink'
            : info.isFile()
              ? 'file'
              : 'other',
        dev: String(info.dev),
        ino: String(info.ino),
        mode: String(info.mode),
        uid: String(info.uid),
        gid: String(info.gid),
        size: String(info.size),
        nlink: String(info.nlink),
        mtimeNs: String(info.mtimeNs),
        ctimeNs: String(info.ctimeNs)
      };
      if (info.isSymbolicLink()) {
        state.linkTarget = await readlink(absolutePath);
      }
      entries.push(state);
      if (info.isDirectory()) {
        await walk(absolutePath, relativePath);
      }
    }
  }

  await walk(sourceRoot, '');
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return entries;
}

export function assertProtectedTreeSnapshotTransition(
  before,
  after,
  inventory
) {
  if (
    !Array.isArray(before) ||
    !Array.isArray(after) ||
    !Array.isArray(inventory?.sqliteDatabases) ||
    before.length !== after.length
  ) {
    throw new Error(
      'Protected OpenClaw tree changed during SQLite snapshots'
    );
  }
  const allowedSidecarFields = new Map();
  for (const database of inventory.sqliteDatabases) {
    const databasePath =
      database.relativePath.split(sep).join('/');
    allowedSidecarFields.set(
      `${databasePath}-shm`,
      new Set(['mtimeNs', 'ctimeNs'])
    );
    // SQLite recovery/open bookkeeping can update inode ctime without
    // changing WAL/journal contents, size, mtime or identity.
    allowedSidecarFields.set(
      `${databasePath}-wal`,
      new Set(['ctimeNs'])
    );
    allowedSidecarFields.set(
      `${databasePath}-journal`,
      new Set(['ctimeNs'])
    );
  }
  let allowedMetadataChanges = 0;
  for (let index = 0; index < before.length; index += 1) {
    const prior = before[index];
    const current = after[index];
    const mutableFields =
      allowedSidecarFields.get(prior?.path);
    if (
      prior?.path !== current?.path ||
      prior?.kind !== 'file' ||
      current?.kind !== 'file' ||
      !mutableFields
    ) {
      if (JSON.stringify(prior) !== JSON.stringify(current)) {
        throw new Error(
          'Protected OpenClaw tree changed during SQLite snapshots'
        );
      }
      continue;
    }
    const fields = new Set([
      ...Object.keys(prior),
      ...Object.keys(current)
    ]);
    for (const field of fields) {
      if (
        !mutableFields.has(field) &&
        prior[field] !== current[field]
      ) {
        throw new Error(
          'Protected OpenClaw tree changed during SQLite snapshots'
        );
      }
    }
    if (
      prior.mtimeNs !== current.mtimeNs ||
      prior.ctimeNs !== current.ctimeNs
    ) {
      allowedMetadataChanges += 1;
    }
  }
  return {
    allowedPaths: allowedSidecarFields.size,
    allowedMetadataChanges
  };
}

async function expectedCriticalSqlitePaths(sourceRoot) {
  const paths = [join('state', 'openclaw.sqlite')];
  const agentNames = [];
  const agentsRoot = join(sourceRoot, 'agents');
  const agents = await opendir(agentsRoot);
  for await (const entry of agents) {
    if (!entry.isDirectory()) continue;
    try {
      const agentRuntime = await lstat(
        join(agentsRoot, entry.name, 'agent')
      );
      if (agentRuntime.isDirectory()) agentNames.push(entry.name);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  agentNames.sort((left, right) => left.localeCompare(right));
  for (const agentName of agentNames) {
    const agentRoot = join('agents', agentName, 'agent');
    paths.push(join(agentRoot, 'openclaw-agent.sqlite'));

    // Codex state is optional for agents that have never initialized Codex or
    // whose runtime has been retired while its OpenClaw history is retained.
    // Once any member of the critical Codex database set exists, require the
    // complete set so a partially lost active runtime still fails closed.
    const codexPaths = [
      join(agentRoot, 'codex-home', 'state_5.sqlite'),
      join(agentRoot, 'codex-home', 'memories_1.sqlite'),
      join(agentRoot, 'codex-home', 'goals_1.sqlite')
    ];
    let codexStatePresent = false;
    for (const relativePath of codexPaths) {
      try {
        const info = await lstat(join(sourceRoot, relativePath));
        if (info.isFile()) codexStatePresent = true;
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    if (codexStatePresent) paths.push(...codexPaths);
  }
  return { agentNames, paths };
}

async function collectBrowserProfileCoverage(
  sourceRoot,
  sqliteDatabases,
  includeBrowserProfiles
) {
  if (!includeBrowserProfiles) {
    return {
      required: false,
      profileCount: 0,
      profiles: [],
      missingCriticalPaths: []
    };
  }
  const browserRoot = join(sourceRoot, 'browser');
  const sqlitePaths = new Set(
    sqliteDatabases.map((database) => database.relativePath)
  );
  const profiles = [];
  let directory;
  try {
    directory = await opendir(browserRoot);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        required: true,
        profileCount: 0,
        profiles: [],
        missingCriticalPaths: ['browser-profile-root']
      };
    }
    throw error;
  }
  for await (const entry of directory) {
    if (!entry.isDirectory() || containsAsciiControl(entry.name)) {
      continue;
    }
    const profileRoot = join(browserRoot, entry.name);
    let dataRoot = profileRoot;
    let dataRootRelative = join('browser', entry.name);
    let localState = join(dataRoot, 'Local State');
    try {
      const info = await lstat(localState);
      if (!info.isFile() || info.isSymbolicLink()) continue;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      dataRoot = join(profileRoot, 'user-data');
      dataRootRelative = join(
        'browser',
        entry.name,
        'user-data'
      );
      localState = join(dataRoot, 'Local State');
      try {
        const info = await lstat(localState);
        if (!info.isFile() || info.isSymbolicLink()) continue;
      } catch (nestedError) {
        if (nestedError?.code === 'ENOENT') continue;
        throw nestedError;
      }
    }
    const missing = [];
    for (const jsonPath of [
      'Local State',
      join('Default', 'Preferences')
    ]) {
      const path = join(dataRoot, jsonPath);
      try {
        const info = await lstat(path);
        if (
          info.isSymbolicLink() ||
          !info.isFile() ||
          info.size <= 0 ||
          info.size > 16 * 1024 * 1024
        ) {
          missing.push(jsonPath.split(sep).join('/'));
          continue;
        }
        JSON.parse(await readFile(path, 'utf8'));
      } catch {
        missing.push(jsonPath.split(sep).join('/'));
      }
    }
    for (const databaseName of [
      'Cookies',
      'Login Data',
      'History'
    ]) {
      const relativePath = join(
        dataRootRelative,
        'Default',
        databaseName
      );
      if (!sqlitePaths.has(relativePath)) {
        missing.push(`Default/${databaseName}`);
      }
    }
    profiles.push({
      name: entry.name,
      criticalPathsExpected: 5,
      criticalPathsCovered: 5 - missing.length,
      missing
    });
  }
  profiles.sort((left, right) =>
    Buffer.compare(
      Buffer.from(left.name, 'utf8'),
      Buffer.from(right.name, 'utf8')
    )
  );
  const missingCriticalPaths = profiles.flatMap((profile) =>
    profile.missing.map(
      (path) => `${profile.name}/${path}`
    )
  );
  if (profiles.length === 0) {
    missingCriticalPaths.push('browser-profile-discovery');
  }
  return {
    required: true,
    profileCount: profiles.length,
    profiles,
    missingCriticalPaths
  };
}

export async function buildInventory(sourceRoot, policy = {}) {
  const resolvedSource = await realpath(resolve(sourceRoot));
  const info = await stat(resolvedSource);
  if (!info.isDirectory()) throw new Error('Backup source is not a directory');

  const [topLevel, walked] = await Promise.all([
    collectTopLevelInventory(resolvedSource, policy),
    walkInventory(resolvedSource, policy)
  ]);
  const critical = await expectedCriticalSqlitePaths(resolvedSource);
  const browserProfiles = await collectBrowserProfileCoverage(
    resolvedSource,
    walked.sqliteDatabases,
    policy.includeBrowserProfiles === true
  );
  const discoveredSqlitePaths = new Set(
    walked.sqliteDatabases.map((database) => database.relativePath)
  );
  const missingCriticalSqlitePaths = critical.paths.filter(
    (path) => !discoveredSqlitePaths.has(path)
  );

  const excludedByReason = Object.fromEntries(
    REBUILDABLE_RULES.map((rule) => [
      rule.id,
      {
        description: rule.description,
        matchedRoots: 0,
        knownFileBytes: 0
      }
    ])
  );
  for (const exclusion of walked.excludedRoots) {
    const aggregate = excludedByReason[exclusion.reason];
    aggregate.matchedRoots += 1;
    aggregate.knownFileBytes += exclusion.bytesIfFile || 0;
  }

  return {
    schema: 'openclaw-backup-inventory/v1',
    scannedAt: new Date().toISOString(),
    sourceRoot: resolvedSource,
    archiveRoot: basename(resolvedSource),
    includedBytesEstimate: walked.includedBytesEstimate,
    includedFiles: walked.includedFiles,
    includedDirectories: walked.includedDirectories,
    includedPathBytes: walked.includedPathBytes,
    sqliteDatabaseCount: walked.sqliteDatabases.length,
    sqliteDatabases: walked.sqliteDatabases,
    invalidDatabaseCandidates: walked.invalidDatabaseCandidates,
    criticalAgentNames: critical.agentNames,
    expectedCriticalSqliteCount: critical.paths.length,
    missingCriticalSqlitePaths,
    browserProfiles,
    excludedRoots: walked.excludedRoots,
    excludedByReason,
    topLevel
  };
}

async function collectHostRecoveryInventory() {
  const paths = [];
  for (const descriptor of HOST_RECOVERY_DESCRIPTORS) {
    try {
      const info = await lstat(descriptor.path);
      paths.push({
        id: descriptor.id,
        path: descriptor.path,
        required: descriptor.required,
        expectedKind: descriptor.kind,
        present: true,
        kind: info.isDirectory()
          ? 'directory'
          : info.isSymbolicLink()
            ? 'symlink'
            : 'file',
        bytes: info.isDirectory()
          ? await directorySize(descriptor.path)
          : info.size
      });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      paths.push({
        id: descriptor.id,
        path: descriptor.path,
        required: descriptor.required,
        expectedKind: descriptor.kind,
        present: false,
        kind: null,
        bytes: 0
      });
    }
  }

  const rootCrontabResult = await readRootCrontab();
  const rootCrontab = {
    required: HOST_ROOT_CRONTAB_REQUIRED,
    present: rootCrontabResult.present,
    bytes: Buffer.byteLength(rootCrontabResult.contents, 'utf8'),
    sha256: rootCrontabResult.present
      ? createHash('sha256')
          .update(rootCrontabResult.contents, 'utf8')
          .digest('hex')
      : null
  };

  return { paths, rootCrontab };
}

async function readRootCrontab() {
  const result = await runCaptureStatus('crontab', ['-l'], {
    label: 'root crontab read'
  });
  if (result.code === 0) {
    return {
      present: result.stdout.trim().length > 0,
      contents: result.stdout
    };
  }
  if (
    result.code === 1 &&
    /no crontab for [^\s]+/i.test(result.stderr)
  ) {
    return { present: false, contents: '' };
  }
  throw new Error('Root crontab could not be read safely');
}

async function commandExists(command) {
  try {
    await runCapture('which', [command], {
      label: `${command} availability`
    });
    return true;
  } catch {
    return false;
  }
}

async function checkPostgres() {
  if (!(await commandExists('docker'))) {
    return { available: false, reason: 'docker_unavailable' };
  }
  try {
    const result = await runCapture(
      'docker',
      ['inspect', '--format', '{{.State.Running}}', 'agent-os-postgres'],
      { label: 'PostgreSQL container check' }
    );
    if (result.stdout.trim() !== 'true') {
      return { available: false, reason: 'not_running' };
    }
    const size = await runCapture(
      'docker',
      [
        'exec',
        'agent-os-postgres',
        'psql',
        '--no-psqlrc',
        '--tuples-only',
        '--no-align',
        '--quiet',
        '--username',
        'agent_os',
        '--dbname',
        'agent_os',
        '--command',
        'SELECT pg_database_size(current_database())'
      ],
      {
        label: 'PostgreSQL size preflight'
      }
    );
    const bytesEstimate = Number(size.stdout.trim());
    if (
      !Number.isSafeInteger(bytesEstimate) ||
      bytesEstimate < 1
    ) {
      return {
        available: false,
        reason: 'size_preflight_failed'
      };
    }
    return {
      available: true,
      reason: 'running',
      bytesEstimate
    };
  } catch {
    return { available: false, reason: 'container_check_failed' };
  }
}

function productionDataConfigurationOptions(options) {
  return {
    supabaseEnvFile: options.supabaseEnvFile,
    poolerHost: options.supabasePoolerHost,
    managementTokenFile:
      options.supabaseManagementTokenFile,
    mediaBlobHost: options.mediaBlobHost
  };
}

async function checkProductionDataPlan(options) {
  if (options.productionData === 'skip') {
    return {
      mode: 'skip',
      available: false,
      reason: 'explicitly_skipped'
    };
  }
  const configured = [
    options.supabaseEnvFile,
    options.supabasePoolerHost,
    options.supabaseManagementTokenFile,
    options.mediaBlobHost
  ].every(Boolean);
  if (!configured) {
    return {
      mode: options.productionData,
      available: false,
      reason: 'configuration_incomplete'
    };
  }
  try {
    return {
      mode: options.productionData,
      available: true,
      ...(await checkProductionDataConfiguration(
        productionDataConfigurationOptions(options)
      ))
    };
  } catch {
    return {
      mode: options.productionData,
      available: false,
      reason: 'configuration_or_client_invalid'
    };
  }
}

function plaintextStagingBudget({
  inventory,
  hostRecovery,
  postgres,
  productionData
}) {
  const sqliteBytes = inventory.sqliteDatabases.reduce(
    (total, database) =>
      total + database.stagingBytesEstimate,
    0
  );
  const quarantineBytes = inventory.excludedRoots.reduce(
    (total, exclusion) =>
      total + (exclusion.quarantineBytes || 0),
    0
  );
  const hostRecoveryBytes =
    hostRecovery.paths.reduce(
      (total, entry) =>
        total + (entry.present ? entry.bytes : 0),
      0
    ) +
    (hostRecovery.rootCrontab.present
      ? hostRecovery.rootCrontab.bytes
      : 0);
  const postgresBytes = postgres.available
    ? postgres.bytesEstimate + STAGING_DUMP_MARGIN_BYTES
    : 0;
  const productionBytes = productionData.available
    ? productionData.publicSchemaBytesEstimate +
      productionData.mediaDeclaredBytes +
      productionData.authBytesEstimate * 2 +
      productionData.authControlPlaneBytesEstimate * 2 +
      STAGING_DUMP_MARGIN_BYTES
    : 0;
  const archiveMetadataBytes =
    (inventory.includedFiles +
      inventory.includedDirectories +
      inventory.sqliteDatabases.length) *
      256 +
    inventory.includedPathBytes * 2;
  const requiredBytes =
    sqliteBytes +
    quarantineBytes +
    hostRecoveryBytes +
    postgresBytes +
    productionBytes +
    archiveMetadataBytes +
    STAGING_FIXED_MARGIN_BYTES;
  if (
    ![
      sqliteBytes,
      quarantineBytes,
      hostRecoveryBytes,
      postgresBytes,
      productionBytes,
      archiveMetadataBytes,
      requiredBytes
    ].every(
      (value) =>
        Number.isSafeInteger(value) && value >= 0
    ) ||
    requiredBytes <= 0
  ) {
    throw new Error(
      'Plaintext staging capacity estimate is invalid'
    );
  }
  return {
    schema: 'openclaw-backup-staging-budget/v1',
    requiredBytes,
    fixedSafetyBytes: STAGING_FIXED_MARGIN_BYTES,
    components: {
      sqliteBytes,
      quarantineBytes,
      hostRecoveryBytes,
      postgresBytes,
      productionBytes,
      archiveMetadataBytes
    }
  };
}

async function preflightTools() {
  const required = [
    'tar',
    'zstd',
    'gpg',
    'split',
    'flock',
    'du',
    'cp',
    'findmnt',
    'swapoff',
    'swapon'
  ];
  const availability = {};
  for (const command of required) {
    availability[command] = await commandExists(command);
  }
  return availability;
}

function publicInventory(inventory) {
  return {
    ...inventory,
    sqliteDatabases: inventory.sqliteDatabases.map((database) => ({
      path: database.relativePath,
      sourceBytes: database.sourceBytes,
      stagingBytesEstimate: database.stagingBytesEstimate
    }))
  };
}

async function buildPlan(options) {
  const [
    inventory,
    tools,
    discoveredHostRecovery,
    productionData
  ] = await Promise.all([
    buildInventory(options.source, {
      includeBrowserProfiles: options.includeBrowserProfiles
    }),
    preflightTools(),
    options.hostRecovery === 'include'
      ? collectHostRecoveryInventory()
      : Promise.resolve({
          paths: [],
          rootCrontab: {
            required: false,
            present: false,
            bytes: 0,
            sha256: null
          }
        }),
    checkProductionDataPlan(options)
  ]);
  const hostRecovery = {
    ...discoveredHostRecovery,
    mode: options.hostRecovery
  };
  const postgres =
    options.postgres === 'skip'
      ? { available: false, reason: 'explicitly_skipped' }
      : await checkPostgres(PROJECT_ROOT);
  const quiescencePreflight = await inspectQuiescence(
    'best-effort',
    inventory.sourceRoot,
    options.frozenCodexScope,
    options.includeBrowserProfiles
  );
  const stagingBudget = plaintextStagingBudget({
    inventory,
    hostRecovery,
    postgres,
    productionData
  });

  const plan = {
    schema: 'openclaw-backup-plan/v1',
    mode: options.execute ? 'execute_requested' : 'dry_run',
    payloadClass: options.includeBrowserProfiles
      ? 'core+browser'
      : 'core',
    inventory: publicInventory(inventory),
    rebuildableExclusions: activeRebuildableRules(
      options.includeBrowserProfiles
    ).map(({ id, description }) => ({ id, description })),
    applicationConsistency: {
      sqlite: 'node:sqlite online backup plus PRAGMA quick_check',
      postgres:
        postgres.available
          ? 'docker compose pg_dump custom format plus pg_restore listing check'
          : `not included: ${postgres.reason}`,
      ordinaryFiles:
        options.consistency === 'quiesced'
          ? 'execution requires known OpenClaw writers to be stopped before snapshots and tar'
          : 'explicit best-effort mode; tar detects read errors but cross-store point-in-time consistency is not guaranteed'
    },
    consistencyMode: options.consistency,
    frozenCodexScopeConfigured: options.frozenCodexScope || null,
    quiescencePreflight,
    pipeline: ['tar', 'zstd', 'gpg-public-recipient', 'split'],
    chunkBytes: options.chunkBytes,
    outputConfigured: Boolean(options.outputDir),
    recipientConfigured: Boolean(options.recipient),
    signerConfigured: Boolean(options.signer),
    plaintextStagingRoot: options.plaintextStagingRoot,
    plaintextStaging: stagingBudget,
    postgres,
    productionData,
    tools,
    noNetworkUpload: true,
    hostRecovery,
    externalPathsNotIncluded: EXTERNAL_PATHS_NOT_INCLUDED
  };
  Object.defineProperty(plan, '_inventory', {
    value: inventory,
    enumerable: false
  });
  return plan;
}

function printPlan(plan, asJson) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }

  const inventory = plan.inventory;
  process.stdout.write(
    [
      'OpenClaw backup dry run',
      `source: ${inventory.sourceRoot}`,
      `included estimate: ${formatBytes(inventory.includedBytesEstimate)}`,
      `included files: ${inventory.includedFiles}`,
      `SQLite snapshots planned: ${inventory.sqliteDatabaseCount}`,
      `critical SQLite coverage: ${inventory.expectedCriticalSqliteCount - inventory.missingCriticalSqlitePaths.length}/${inventory.expectedCriticalSqliteCount}`,
      `invalid database-like files: ${inventory.invalidDatabaseCandidates.length}`,
      `PostgreSQL: ${plan.postgres.available ? 'custom dump planned' : plan.postgres.reason}`,
      `Agent OS production data: ${plan.productionData.available ? 'Supabase/Auth/media capture planned' : plan.productionData.reason}`,
      `quiescence preflight: ${
        plan.quiescencePreflight.allKnownWritersStopped
          ? 'ready'
          : `blocked by ${plan.quiescencePreflight.checks
              .filter((check) => !check.stopped)
              .map((check) => check.target)
              .join(', ')}`
      }`,
      `host recovery paths: ${plan.hostRecovery.paths.filter((entry) => entry.present).length}/${plan.hostRecovery.paths.length} present`,
      `root crontab export: ${plan.hostRecovery.rootCrontab.present ? 'planned' : 'not present'}`,
      `ciphertext chunk size: ${formatBytes(plan.chunkBytes)}`,
      '',
      'Rebuildable exclusions:'
    ].join('\n')
  );
  process.stdout.write('\n');
  for (const [reason, detail] of Object.entries(
    inventory.excludedByReason
  )) {
    process.stdout.write(
      `- ${reason}: ${detail.matchedRoots} matched roots — ${detail.description}\n`
    );
  }
  process.stdout.write('\nTop-level inventory:\n');
  for (const entry of inventory.topLevel) {
    process.stdout.write(
      `- ${entry.name}: ${formatBytes(entry.bytes)} (${entry.disposition})\n`
    );
  }
  process.stdout.write(
    '\nDry run only. Add --execute, an output directory, and an exact GPG fingerprint to create a set.\n'
  );
}

function formatBytes(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function makeSetId(now = new Date(), random = randomBytes(8)) {
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  return `${timestamp}-${random.toString('hex')}`;
}

export async function validateRecipient(fingerprint) {
  if (!/^(?:[0-9A-Fa-f]{40}|[0-9A-Fa-f]{64})$/.test(fingerprint)) {
    throw new Error('Recipient must be an exact 40- or 64-hex GPG fingerprint');
  }
  const normalized = fingerprint.toUpperCase();
  const listing = await runCapture(
    'gpg',
    ['--batch', '--with-colons', '--list-keys', normalized],
    { label: 'GPG recipient lookup' }
  );
  const fingerprints = listing.stdout
    .split('\n')
    .filter((line) => line.startsWith('fpr:'))
    .map((line) => line.split(':')[9]?.toUpperCase())
    .filter(Boolean);
  if (!fingerprints.includes(normalized)) {
    throw new Error('The exact GPG recipient fingerprint was not found');
  }

  const secretListing = await runCapture(
    'gpg',
    ['--batch', '--no-autostart', '--with-colons', '--list-secret-keys'],
    { label: 'GPG secret-key boundary check' }
  );
  const secretFingerprints = secretListing.stdout
    .split('\n')
    .filter((line) => line.startsWith('fpr:'))
    .map((line) => line.split(':')[9]?.toUpperCase())
    .filter(Boolean);
  if (secretFingerprints.includes(normalized)) {
    throw new Error(
      'The recovery private key is present on this host; import only its public key'
    );
  }

  await runStreamingInput(
    'gpg',
    [
      '--batch',
      '--yes',
      '--no-tty',
      '--trust-model',
      'always',
      '--throw-keyids',
      '--compress-algo',
      'none',
      '--cipher-algo',
      'AES256',
      '--recipient',
      normalized,
      '--output',
      '/dev/null',
      '--encrypt'
    ],
    Buffer.alloc(0),
    'GPG recipient encryption test'
  );
}

export async function validateSigner(fingerprint, recipientFingerprint) {
  if (!/^(?:[0-9A-Fa-f]{40}|[0-9A-Fa-f]{64})$/.test(fingerprint)) {
    throw new Error('Signer must be an exact 40- or 64-hex GPG fingerprint');
  }
  const normalized = fingerprint.toUpperCase();
  if (normalized === recipientFingerprint.toUpperCase()) {
    throw new Error(
      'Backup signer and offline recovery recipient must be separate keys'
    );
  }
  const listing = await runCapture(
    'gpg',
    [
      '--batch',
      '--no-autostart',
      '--with-colons',
      '--list-secret-keys',
      normalized
    ],
    { label: 'GPG signing-key lookup' }
  );
  const fingerprints = listing.stdout
    .split('\n')
    .filter((line) => line.startsWith('fpr:'))
    .map((line) => line.split(':')[9]?.toUpperCase())
    .filter(Boolean);
  if (!fingerprints.includes(normalized)) {
    throw new Error('The exact backup signing private key was not found');
  }
  await runStreamingInput(
    'gpg',
    [
      '--batch',
      '--yes',
      '--no-tty',
      '--pinentry-mode',
      'error',
      '--local-user',
      normalized,
      '--output',
      '/dev/null',
      '--detach-sign'
    ],
    Buffer.alloc(0),
    'GPG signing-key test'
  );
  return normalized;
}

async function validateDestination(options, sourceRoot) {
  if (!options.outputDir) {
    throw new Error('--output-dir is required with --execute');
  }
  const outputRoot = await realpath(resolve(options.outputDir));
  await assertTrustedDirectoryHierarchy(outputRoot, {
    label: 'Encrypted backup output'
  });
  const outputInfo = await lstat(outputRoot);
  const expectedUid =
    typeof process.getuid === 'function' ? process.getuid() : -1;
  if (
    outputInfo.isSymbolicLink() ||
    !outputInfo.isDirectory() ||
    outputInfo.uid !== expectedUid ||
    (outputInfo.mode & 0o077) !== 0
  ) {
    throw new Error(
      'Encrypted backup output must be a private directory owned by the backup user'
    );
  }
  if (
    outputRoot === sourceRoot ||
    outputRoot.startsWith(`${sourceRoot}${sep}`)
  ) {
    throw new Error('Backup output must be outside the OpenClaw source tree');
  }

  const sourceInfo = await stat(sourceRoot);
  if (!options.allowSameDevice && sourceInfo.dev === outputInfo.dev) {
    throw new Error(
      'Backup output is on the source filesystem; use off-host storage or explicitly pass --allow-same-device'
    );
  }
  return outputRoot;
}

async function removeAbandonedPartialSets(outputRoot) {
  const expectedUid =
    typeof process.getuid === 'function' ? process.getuid() : -1;
  let removed = 0;
  const directory = await opendir(outputRoot);
  for await (const entry of directory) {
    if (!PARTIAL_SET_PATTERN.test(entry.name)) continue;
    const path = join(outputRoot, entry.name);
    const info = await lstat(path);
    if (
      entry.isSymbolicLink() ||
      !entry.isDirectory() ||
      info.isSymbolicLink() ||
      !info.isDirectory() ||
      info.uid !== expectedUid ||
      (info.mode & 0o077) !== 0 ||
      (await realpath(path)) !== path
    ) {
      throw new Error(
        'Abandoned partial backup set has unsafe metadata'
      );
    }
    await chmod(path, 0o700);
    await rm(path, { recursive: true, force: false });
    removed += 1;
  }
  return removed;
}

async function assertDiskBudget(outputRoot, plan) {
  const filesystem = await statfs(outputRoot);
  const availableBytes = filesystem.bavail * filesystem.bsize;
  const requiredBytes =
    plan._inventory.includedBytesEstimate +
    plan.plaintextStaging.requiredBytes +
    MIN_FREE_AFTER_BACKUP_BYTES;
  if (!Number.isSafeInteger(availableBytes) || availableBytes < requiredBytes) {
    throw new Error(
      `Insufficient output space: require approximately ${formatBytes(requiredBytes)} to preserve a 5 GiB safety floor`
    );
  }
  return { availableBytes, requiredBytes };
}

async function createPlaintextStagingDirectory(
  stagingRoot,
  requiredBytes
) {
  const root = await realpath(resolve(stagingRoot));
  await assertTrustedDirectoryHierarchy(root, {
    label: 'Plaintext staging root'
  });
  const info = await stat(root);
  const expectedUid =
    typeof process.getuid === 'function' ? process.getuid() : -1;
  if (
    !info.isDirectory() ||
    info.uid !== expectedUid ||
    (info.mode & 0o077) !== 0
  ) {
    throw new Error('Plaintext staging root is not a directory');
  }
  const mount = await assertNoSwapTmpfs(root);
  if (mount.mountPoint !== root) {
    throw new Error(
      'Plaintext staging root must be its dedicated noswap tmpfs mountpoint'
    );
  }
  await assertNoActiveSwap();
  if (
    !Number.isSafeInteger(requiredBytes) ||
    requiredBytes <= 0
  ) {
    throw new Error('Plaintext staging allowance is invalid');
  }
  const memory = await readFile('/proc/meminfo', 'utf8');
  const availableMatch = memory.match(
    /^MemAvailable:[ \t]+([0-9]+)[ \t]+kB$/m
  );
  const availableMemoryKib = Number(availableMatch?.[1]);
  const requiredMemoryKib =
    Math.ceil(requiredBytes / 1024) +
    MIN_EXECUTE_MEMORY_HEADROOM_KIB;
  if (
    !Number.isSafeInteger(availableMemoryKib) ||
    availableMemoryKib < requiredMemoryKib
  ) {
    throw new Error(
      'Physical memory cannot satisfy this execution plan plus the reviewed process headroom'
    );
  }
  const filesystem = await statfs(root);
  const availableBytes = filesystem.bavail * filesystem.bsize;
  if (
    !Number.isSafeInteger(availableBytes) ||
    availableBytes < requiredBytes
  ) {
    throw new Error(
      'Plaintext noswap tmpfs lacks the complete preflight staging allowance'
    );
  }
  const directory = await mkdtemp(join(root, 'openclaw-backup-'));
  await chmod(directory, 0o700);
  return directory;
}

function archivePath(relativePath) {
  return `.openclaw/${relativePath.split(sep).join('/')}`;
}

function escapeTarPattern(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('*', '\\*').replaceAll('?', '\\?').replaceAll('[', '\\[');
}

async function writeExclusionFile(path, inventory) {
  const paths = new Set();
  for (const exclusion of inventory.excludedRoots) {
    paths.add(archivePath(exclusion.path));
  }
  for (const database of inventory.sqliteDatabases) {
    const databasePath = archivePath(database.relativePath);
    paths.add(databasePath);
    for (const suffix of SQLITE_SUFFIXES) paths.add(`${databasePath}${suffix}`);
  }
  const body = [...paths]
    .sort()
    .map((value) => escapeTarPattern(value))
    .join('\n');
  await writePrivateFile(path, `${body}\n`);
}

function bytewisePathCompare(left, right) {
  return Buffer.compare(
    Buffer.from(left.path, 'utf8'),
    Buffer.from(right.path, 'utf8')
  );
}

function sameStableStat(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.size === right.size &&
    left.nlink === right.nlink &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

async function stableFileEntry(path, archivePathValue) {
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  const hash = createHash('sha256');
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('Backup payload contains an unsupported file');
    }
    for await (const chunk of handle.createReadStream({
      autoClose: false
    })) {
      hash.update(chunk);
    }
    const after = await handle.stat({ bigint: true });
    if (!sameStableStat(before, after)) {
      throw new Error('Backup payload file changed while it was hashed');
    }
    return {
      path: archivePathValue,
      kind: 'file',
      bytes: Number(after.size),
      sha256: hash.digest('hex')
    };
  } finally {
    await handle.close();
  }
}

async function stableSymlinkEntry(path, archivePathValue) {
  const before = await lstat(path, { bigint: true });
  if (!before.isSymbolicLink()) {
    throw new Error('Backup payload link changed while it was inspected');
  }
  const target = await readlink(path);
  const after = await lstat(path, { bigint: true });
  if (!sameStableStat(before, after)) {
    throw new Error('Backup payload link changed while it was inspected');
  }
  return {
    path: archivePathValue,
    kind: 'symlink',
    targetBytes: Buffer.byteLength(target, 'utf8'),
    targetSha256: createHash('sha256')
      .update(target, 'utf8')
      .digest('hex')
  };
}

async function collectArchiveEntries(
  absoluteRoot,
  archiveRoot,
  { exclude = () => false } = {}
) {
  const entries = [];
  const paths = pathCardinalityGuard('Archive entry collection');

  async function walk(path, archivePathValue, relativePath) {
    if (
      containsAsciiControl(archivePathValue) ||
      archivePathValue.startsWith('/') ||
      archivePathValue.split('/').some(
        (segment) =>
          !segment || segment === '.' || segment === '..'
      )
    ) {
      throw new Error('Backup payload path contract is invalid');
    }
    paths.account(archivePathValue);
    const info = await lstat(path);
    if (exclude(relativePath, info)) return;

    if (info.isDirectory()) {
      entries.push({ path: archivePathValue, kind: 'directory' });
      const directory = await opendir(path);
      for await (const entry of directory) {
        if (containsAsciiControl(entry.name)) {
          throw new Error(
            'Control-character-bearing paths are not supported'
          );
        }
        await walk(
          join(path, entry.name),
          `${archivePathValue}/${entry.name}`,
          relativePath
            ? join(relativePath, entry.name)
            : entry.name
        );
      }
      return;
    }
    if (info.isSymbolicLink()) {
      entries.push(
        await stableSymlinkEntry(path, archivePathValue)
      );
      return;
    }
    if (info.isFile()) {
      entries.push(await stableFileEntry(path, archivePathValue));
      return;
    }
    throw new Error('Backup payload contains an unsupported special file');
  }

  await walk(absoluteRoot, archiveRoot, '');
  entries.sort(bytewisePathCompare);
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1].path === entries[index].path) {
      throw new Error('Backup payload contains duplicate paths');
    }
  }
  return entries;
}

async function collectArchiveMetadataState(
  absoluteRoot,
  archiveRoot
) {
  const entries = [];
  const paths = pathCardinalityGuard(
    'Archive metadata collection'
  );

  async function walk(path, archivePathValue) {
    paths.account(archivePathValue);
    const info = await lstat(path, { bigint: true });
    const kind = info.isDirectory()
      ? 'directory'
      : info.isSymbolicLink()
        ? 'symlink'
        : info.isFile()
          ? 'file'
          : 'other';
    if (kind === 'other') {
      throw new Error(
        'Backup payload contains an unsupported special file'
      );
    }
    const entry = {
      path: archivePathValue,
      kind,
      mode: String(info.mode & 0o7777n),
      uid: String(info.uid),
      gid: String(info.gid),
      mtimeNs: String(info.mtimeNs)
    };
    if (kind === 'symlink') {
      entry.target = await readlink(path);
    }
    entries.push(entry);
    if (kind !== 'directory') return;

    const directory = await opendir(path);
    for await (const child of directory) {
      if (containsAsciiControl(child.name)) {
        throw new Error(
          'Control-character-bearing paths are not supported'
        );
      }
      await walk(
        join(path, child.name),
        `${archivePathValue}/${child.name}`
      );
    }
  }

  await walk(absoluteRoot, archiveRoot);
  entries.sort(bytewisePathCompare);
  return entries;
}

export async function collectOpenClawArchiveEntries(
  sourceRoot,
  inventory,
  policy = {}
) {
  const sqliteExclusions = new Set();
  for (const database of inventory.sqliteDatabases) {
    sqliteExclusions.add(database.relativePath);
    for (const suffix of SQLITE_SUFFIXES) {
      sqliteExclusions.add(`${database.relativePath}${suffix}`);
    }
  }
  return collectArchiveEntries(sourceRoot, '.openclaw', {
    exclude: (relativePath, info) => {
      if (!relativePath) return false;
      if (sqliteExclusions.has(relativePath)) return true;
      return Boolean(
        rebuildableReason(
          relativePath,
          info.isDirectory(),
          policy
        )
      );
    }
  });
}

function canonicalEntriesDigest(entries) {
  return createHash('sha256')
    .update(JSON.stringify(entries), 'utf8')
    .digest('hex');
}

function pathEntryContentBytes(entries) {
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

export async function snapshotSqliteDatabase(sourcePath, destinationPath) {
  const { DatabaseSync, backup } = await import('node:sqlite');
  await mkdir(dirname(destinationPath), { recursive: true, mode: 0o700 });
  async function createSnapshot(readOnly) {
    const source = new DatabaseSync(sourcePath, {
      open: true,
      readOnly,
      allowExtension: false
    });
    // node:sqlite backup() does not keep the event loop referenced.  The
    // production backup invokes this as its final active async operation, so
    // hold one explicit reference until SQLite settles instead of allowing
    // Node to exit successfully with an empty result document.
    const keepAlive = setInterval(() => {}, 1_000);
    try {
      await backup(source, destinationPath);
    } finally {
      clearInterval(keepAlive);
      source.close();
    }
  }
  try {
    await createSnapshot(true);
  } catch (readOnlyError) {
    // A stopped Chromium profile can retain a rollback journal.  SQLite must
    // recover that journal before it can take an online backup, which requires
    // a write-capable source handle.  The caller has already quiesced every
    // known writer, so retry only this recovery case with that handle.
    try {
      await createSnapshot(false);
    } catch (recoveryError) {
      throw new Error(
        `SQLite online backup failed for ${sourcePath} -> ${destinationPath}: ` +
          `read-only attempt: ${readOnlyError.message}; ` +
          `recovery attempt: ${recoveryError.message}`
      );
    }
  }
  await chmod(destinationPath, 0o600);

  const snapshot = new DatabaseSync(destinationPath, {
    open: true,
    readOnly: true,
    allowExtension: false
  });
  try {
    const rows = snapshot.prepare('PRAGMA quick_check').all();
    if (
      rows.length !== 1 ||
      !Object.values(rows[0] || {}).some((value) => value === 'ok')
    ) {
      throw new Error('SQLite snapshot integrity check failed');
    }
  } finally {
    snapshot.close();
  }
}

async function createSqliteSnapshots(inventory, metadataRoot) {
  const snapshots = [];
  for (const database of inventory.sqliteDatabases) {
    const destination = join(
      metadataRoot,
      'sqlite',
      database.relativePath
    );
    await snapshotSqliteDatabase(database.absolutePath, destination);
    const info = await stat(destination);
    if (info.size > database.stagingBytesEstimate) {
      throw new Error(
        'SQLite snapshot exceeded its execution-bound staging estimate'
      );
    }
    snapshots.push({
      sourcePath: database.relativePath,
      archivePath: relative(metadataRoot, destination).split(sep).join('/'),
      bytes: info.size,
      sha256: await hashFile(destination)
    });
  }
  return snapshots;
}

async function assertPlaintextStagingUsage(
  stagingRoot,
  maxBytes
) {
  const bytes = await directorySize(stagingRoot);
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    bytes > maxBytes
  ) {
    throw new Error(
      'Plaintext staging exceeded its execution-bound budget'
    );
  }
  return bytes;
}

export async function runBoundedCommandToFile(
  command,
  args,
  destination,
  options = {}
) {
  const output = await open(destination, 'wx', 0o600);
  // The stream owns the FileHandle and closes it when the pipeline settles.
  // autoClose:false leaves an active stream reference behind, causing a
  // subsequent FileHandle.close() to wait forever.
  const outputStream = output.createWriteStream();
  try {
    return await runToFile(
      command,
      args,
      outputStream,
      options
    );
  } finally {
    // Also cover failures that occur before pipeline() takes ownership.
    outputStream.destroy();
    await output.close();
  }
}

async function createPostgresDump(metadataRoot, mode, maxBytes) {
  if (mode === 'skip') {
    return { included: false, reason: 'explicitly_skipped' };
  }
  const status = await checkPostgres();
  if (!status.available) {
    if (mode === 'required') {
      throw new Error('PostgreSQL backup was required but the container is unavailable');
    }
    return { included: false, reason: status.reason };
  }

  const destination = join(metadataRoot, 'postgres', 'agent-os.dump');
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  await runBoundedCommandToFile(
    'docker',
    [
      'exec',
      '-i',
      'agent-os-postgres',
      'sh',
      '-c',
      'exec pg_dump -Fc --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"'
    ],
    destination,
    {
      label: 'PostgreSQL custom dump',
      maxBytes,
      timeoutMs: POSTGRES_DUMP_TIMEOUT_MS
    }
  );

  const dumpFile = await open(destination, 'r');
  const headerBuffer = Buffer.alloc(5);
  try {
    await dumpFile.read(headerBuffer, 0, 5, 0);
  } finally {
    await dumpFile.close();
  }
  const header = headerBuffer.toString('ascii');
  if (header !== 'PGDMP') {
    throw new Error('PostgreSQL custom dump header verification failed');
  }
  await verifyPostgresDump(destination);
  const info = await stat(destination);
  if (info.size > maxBytes) {
    throw new Error(
      'PostgreSQL dump exceeded its execution-bound staging estimate'
    );
  }
  return {
    included: true,
    archivePath: 'postgres/agent-os.dump',
    format: 'custom',
    bytes: info.size,
    sha256: await hashFile(destination)
  };
}

export async function runCommandFromFile(
  command,
  args,
  path,
  options = {}
) {
  const input = await open(path, 'r');
  const inputStream = input.createReadStream();
  try {
    await runFromFile(command, args, inputStream, options);
  } finally {
    inputStream.destroy();
    await input.close();
  }
}

async function verifyPostgresDump(path) {
  await runCommandFromFile(
    'docker',
    ['exec', '-i', 'agent-os-postgres', 'pg_restore', '--list'],
    path,
    {
      label: 'PostgreSQL dump verification',
      timeoutMs: POSTGRES_VERIFY_TIMEOUT_MS,
      allowEarlyConsumerClose: true
    }
  );
}

async function stageHostRecovery(metadataRoot, hostRecovery) {
  const stagedPaths = [];
  let rootCrontab = null;
  const policy =
    hostRecovery.mode === 'skip'
      ? HOST_RECOVERY_SKIPPED_POLICY
      : HOST_RECOVERY_POLICY;

  for (const planned of hostRecovery.paths) {
    if (!planned.present) {
      if (planned.required) {
        throw new Error(
          `Required host recovery item is missing: ${planned.id}`
        );
      }
      stagedPaths.push({
        id: planned.id,
        required: planned.required,
        present: false
      });
      continue;
    }

    const sourceEntriesBefore = await collectArchiveEntries(
      planned.path,
      'item'
    );
    const sourceMetadataBefore =
      await collectArchiveMetadataState(
        planned.path,
        'item'
      );
    const destination = join(
      metadataRoot,
      'host',
      'files',
      planned.id
    );
    await mkdir(dirname(destination), {
      recursive: true,
      mode: 0o700
    });
    await runCapture('cp', [
      '--archive',
      '--no-dereference',
      '--',
      planned.path,
      destination
    ], {
      label: 'Host recovery metadata-preserving staging'
    });
    const [
      sourceEntriesAfter,
      stagedEntries,
      sourceMetadataAfter,
      stagedMetadata
    ] = await Promise.all([
      collectArchiveEntries(planned.path, 'item'),
      collectArchiveEntries(destination, 'item'),
      collectArchiveMetadataState(planned.path, 'item'),
      collectArchiveMetadataState(destination, 'item')
    ]);
    const before = JSON.stringify(sourceEntriesBefore);
    const metadataBefore = JSON.stringify(
      sourceMetadataBefore
    );
    if (
      before !== JSON.stringify(sourceEntriesAfter) ||
      before !== JSON.stringify(stagedEntries) ||
      metadataBefore !== JSON.stringify(sourceMetadataAfter) ||
      metadataBefore !== JSON.stringify(stagedMetadata)
    ) {
      throw new Error(
        `Host recovery item changed while staged: ${planned.id}`
      );
    }
    const rootKind = sourceEntriesBefore[0]?.kind;
    if (
      rootKind !== planned.kind ||
      rootKind !== planned.expectedKind
    ) {
      throw new Error(
        `Host recovery item kind changed: ${planned.id}`
      );
    }
    stagedPaths.push({
      id: planned.id,
      targetPath: planned.path,
      required: planned.required,
      present: true,
      kind: rootKind,
      archivePath: `host/files/${planned.id}`,
      entries: sourceEntriesBefore.length,
      contentBytes: pathEntryContentBytes(sourceEntriesBefore),
      contentRootSha256: canonicalEntriesDigest(
        sourceEntriesBefore
      )
    });
  }

  if (hostRecovery.rootCrontab.present) {
    const result = await readRootCrontab();
    const contentsBytes = Buffer.byteLength(result.contents, 'utf8');
    const contentsSha256 = createHash('sha256')
      .update(result.contents, 'utf8')
      .digest('hex');
    if (
      !result.present ||
      contentsBytes !== hostRecovery.rootCrontab.bytes ||
      contentsSha256 !== hostRecovery.rootCrontab.sha256
    ) {
      throw new Error('Root crontab changed during backup preparation');
    }
    const destination = join(metadataRoot, 'host', 'root-crontab.txt');
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    await writePrivateFile(destination, result.contents);
    rootCrontab = {
      archivePath: 'host/root-crontab.txt',
      bytes: contentsBytes,
      sha256: contentsSha256,
      restoreMode:
        'review manually, then install with crontab only after outbound services are fenced'
    };
  } else if (
    hostRecovery.mode === 'include' &&
    HOST_ROOT_CRONTAB_REQUIRED
  ) {
    throw new Error(
      'Required host recovery item is missing: root_crontab'
    );
  }

  return {
    mode: hostRecovery.mode,
    policy,
    paths: stagedPaths,
    rootCrontab,
    notIncluded: EXTERNAL_PATHS_NOT_INCLUDED
  };
}

async function validateQuarantineSource(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) {
    throw new Error('Queue quarantine refuses symbolic links');
  }
  if (info.isDirectory()) {
    const directory = await opendir(path);
    for await (const entry of directory) {
      if (entry.name.includes('\n') || entry.name.includes('\r')) {
        throw new Error('Newline-bearing queue paths are not supported');
      }
      await validateQuarantineSource(join(path, entry.name));
    }
    return;
  }
  if (!info.isFile()) {
    throw new Error('Queue quarantine contains an unsupported special file');
  }
}

async function stageQuarantinedPaths(sourceRoot, inventory, metadataRoot) {
  const staged = [];
  for (const exclusion of inventory.excludedRoots) {
    if (!QUARANTINE_RULE_IDS.has(exclusion.reason)) continue;
    const source = join(sourceRoot, exclusion.path);
    await validateQuarantineSource(source);
    const sourceEntriesBefore = await collectArchiveEntries(
      source,
      'item'
    );
    const destination = join(
      metadataRoot,
      'quarantine',
      'openclaw',
      exclusion.path
    );
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    await cp(source, destination, {
      recursive: true,
      force: false,
      errorOnExist: true,
      preserveTimestamps: true,
      verbatimSymlinks: true
    });
    const [sourceEntriesAfter, stagedEntries] = await Promise.all([
      collectArchiveEntries(source, 'item'),
      collectArchiveEntries(destination, 'item')
    ]);
    const before = JSON.stringify(sourceEntriesBefore);
    if (
      before !== JSON.stringify(sourceEntriesAfter) ||
      before !== JSON.stringify(stagedEntries)
    ) {
      throw new Error(
        'Side-effect quarantine changed while it was staged'
      );
    }
    staged.push({
      sourcePath: exclusion.path.split(sep).join('/'),
      archivePath: relative(metadataRoot, destination)
        .split(sep)
        .join('/'),
      reason: exclusion.reason,
      bytes: await directorySize(destination),
      entries: sourceEntriesBefore.length,
      contentRootSha256: canonicalEntriesDigest(
        sourceEntriesBefore
      ),
      restoreMode: 'forensic quarantine only; never auto-promote'
    });
  }
  return staged;
}

async function inspectSideEffectTables(sqliteSnapshots, metadataRoot) {
  const { DatabaseSync } = await import('node:sqlite');
  const findings = [];
  const globalSnapshot = sqliteSnapshots.find(
    (snapshot) => snapshot.sourcePath === join('state', 'openclaw.sqlite')
  );
  if (!globalSnapshot) return findings;

  const database = new DatabaseSync(
    join(metadataRoot, globalSnapshot.archivePath),
    { readOnly: true, allowExtension: false }
  );
  try {
    const deliveryQueueTable = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'delivery_queue_entries'"
      )
      .get();
    if (deliveryQueueTable) {
      const row = database
        .prepare('SELECT COUNT(*) AS rows FROM delivery_queue_entries')
        .get();
      findings.push({
        sourcePath: globalSnapshot.sourcePath.split(sep).join('/'),
        table: 'delivery_queue_entries',
        rowsAtBackup: Number(row.rows),
        restoreMode:
          'delete all rows from the restored working copy before gateway start; preserve this original snapshot for forensics'
      });
    }
    const cronTable = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cron_jobs'"
      )
      .get();
    if (cronTable) {
      const row = database
        .prepare(
          'SELECT COUNT(*) AS rows, SUM(CASE WHEN enabled <> 0 THEN 1 ELSE 0 END) AS enabledRows FROM cron_jobs'
        )
        .get();
      findings.push({
        sourcePath: globalSnapshot.sourcePath.split(sep).join('/'),
        table: 'cron_jobs',
        rowsAtBackup: Number(row.rows),
        enabledRowsAtBackup: Number(row.enabledRows || 0),
        restoreMode:
          'set enabled false and clear pending/running runtime state in the restored working copy; preserve this original snapshot for forensics'
      });
    }
  } finally {
    database.close();
  }
  return findings;
}

async function firstCommandLine(command, args, options = {}) {
  const result = await runCaptureStatus(command, args, options);
  if (result.code !== 0) return null;
  return result.stdout.split('\n')[0]?.trim() || null;
}

async function collectRuntimeVersions(payloadClass) {
  let osRelease = {};
  try {
    const body = await readFile('/etc/os-release', 'utf8');
    const parsed = {};
    for (const line of body.split('\n')) {
      const match = /^([A-Z_]+)=(.*)$/.exec(line);
      if (!match) continue;
      parsed[match[1]] = match[2].replace(/^"|"$/g, '');
    }
    osRelease = {
      id: parsed.ID || null,
      versionId: parsed.VERSION_ID || null,
      prettyName: parsed.PRETTY_NAME || null
    };
  } catch {
    osRelease = { id: null, versionId: null, prettyName: null };
  }

  const [
    kernel,
    openclaw,
    tarVersion,
    zstdVersion,
    gpgVersion,
    postgresVersion,
    postgresImage,
    agentOsCommit,
    chromeVersion
  ] = await Promise.all([
    firstCommandLine('uname', ['-srmo']),
    firstCommandLine('openclaw', ['--version']),
    firstCommandLine('tar', ['--version']),
    firstCommandLine('zstd', ['--version']),
    firstCommandLine('gpg', ['--version']),
    firstCommandLine(
      'docker',
      [
        'compose',
        'exec',
        '-T',
        'postgres',
        'postgres',
        '--version'
      ],
      { cwd: PROJECT_ROOT }
    ),
    firstCommandLine(
      'docker',
      [
        'inspect',
        'agent-os-postgres',
        '--format',
        '{{.Config.Image}}|{{.Image}}'
      ]
    ),
    firstCommandLine('git', ['rev-parse', 'HEAD'], {
      cwd: PROJECT_ROOT
    }),
    firstCommandLine('google-chrome', ['--version'])
  ]);

  const hashIfPresent = async (path) => {
    try {
      return await hashFile(path);
    } catch {
      return null;
    }
  };
  return {
    capturedAt: new Date().toISOString(),
    os: osRelease,
    kernel,
    node: {
      version: process.version,
      platform: process.platform,
      architecture: process.arch
    },
    openclaw,
    tools: {
      tar: tarVersion,
      zstd: zstdVersion,
      gpg: gpgVersion
    },
    postgres: {
      version: postgresVersion,
      imageAndDigest: postgresImage
    },
    browser: {
      payloadClass,
      chrome: chromeVersion,
      passwordStore: 'basic',
      runtimeLocksExcluded: true
    },
    agentOs: {
      gitCommit: agentOsCommit,
      packageLockSha256: await hashIfPresent(
        join(PROJECT_ROOT, 'package-lock.json')
      ),
      composeSha256: await hashIfPresent(
        join(PROJECT_ROOT, 'docker-compose.yml')
      )
    }
  };
}

async function writePrivateFile(path, contents) {
  await writeFile(path, contents, { mode: 0o600, flag: 'wx' });
  await chmod(path, 0o600);
}

async function createInternalMetadata({
  setId,
  payloadClass,
  inventory,
  metadataRoot,
  sqliteSnapshots,
  postgres,
  productionData,
  hostRecovery,
  quarantinedPaths,
  sideEffectTables,
  consistency,
  runtimeVersions
}) {
  const safeInventory = publicInventory(inventory);
  await writePrivateFile(
    join(metadataRoot, 'inventory.json'),
    `${JSON.stringify(safeInventory, null, 2)}\n`
  );
  await writePrivateFile(
    join(metadataRoot, 'backup.json'),
    `${JSON.stringify(
      {
        schema: BACKUP_PAYLOAD_V2,
        setId,
        payloadClass,
        createdAt: new Date().toISOString(),
        sourceArchiveRoot: '.openclaw',
        sqliteRestoreMode:
          'restore each backup-meta/sqlite archivePath to its sourcePath',
        sqliteSnapshots,
        postgres,
        productionData,
        sideEffectQuarantine: {
          paths: quarantinedPaths,
          sqliteTables: sideEffectTables
        },
        consistency,
        runtimeVersions,
        rebuildableExclusions: activeRebuildableRules(
          payloadClass === 'core+browser'
        ).map(
          ({ id, description }) => ({ id, description })
        ),
        pathManifest: {
          schema: PATH_MANIFEST_SCHEMA,
          archivePath: PATH_MANIFEST_ARCHIVE_PATH,
          hostPolicy: hostRecovery.policy
        },
        hostRecovery
      },
      null,
      2
    )}\n`
  );
}

async function createPayloadPathManifest({
  setId,
  payloadClass,
  sourceEntries,
  metadataRoot,
  hostPolicy
}) {
  const metadataEntries = await collectArchiveEntries(
    metadataRoot,
    'backup-meta',
    {
      exclude: (_relativePath, _info) => false
    }
  );
  const entries = [...sourceEntries, ...metadataEntries].sort(
    bytewisePathCompare
  );
  assertPathCollectionWithinLimits(
    entries.length,
    entries.reduce(
      (total, entry) =>
        total + Buffer.byteLength(entry.path, 'utf8'),
      0
    ),
    'Payload manifest'
  );
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1].path === entries[index].path) {
      throw new Error('Backup payload manifest paths are not unique');
    }
  }
  if (
    entries.some(
      (entry) => entry.path === PATH_MANIFEST_ARCHIVE_PATH
    )
  ) {
    throw new Error('Backup payload manifest cannot list itself');
  }

  const payloadManifest = {
    schema: PATH_MANIFEST_SCHEMA,
    setId,
    payloadClass,
    hostPolicy,
    entries
  };
  const path = join(metadataRoot, 'path-manifest.json');
  await writePrivateFile(
    path,
    `${JSON.stringify(payloadManifest)}\n`
  );
  const info = await stat(path);
  return {
    schema: PATH_MANIFEST_SCHEMA,
    archivePath: PATH_MANIFEST_ARCHIVE_PATH,
    bytes: info.size,
    sha256: await hashFile(path),
    entries: entries.length,
    contentBytes: pathEntryContentBytes(entries),
    hostPolicy,
    entriesRootSha256: canonicalEntriesDigest(entries),
    expectedArchivePaths: [
      ...entries.map((entry) => entry.path),
      PATH_MANIFEST_ARCHIVE_PATH
    ].sort((left, right) =>
      Buffer.compare(
        Buffer.from(left, 'utf8'),
        Buffer.from(right, 'utf8')
      )
    )
  };
}

async function assertDatabaseSetStable(
  sourceRoot,
  priorInventory,
  policy
) {
  const current = await walkInventory(sourceRoot, policy);
  const priorPaths = priorInventory.sqliteDatabases.map(
    (database) => database.relativePath
  );
  const currentPaths = current.sqliteDatabases.map(
    (database) => database.relativePath
  );
  if (JSON.stringify(priorPaths) !== JSON.stringify(currentPaths)) {
    throw new Error('SQLite database path set changed during backup preparation');
  }
}

async function inspectFrozenCodexScope(scope, pids) {
  if (!scope || pids.length === 0) {
    return { accepted: false, state: 'not-configured' };
  }
  if (!/^session-[1-9][0-9]*\.scope$/.test(scope)) {
    return { accepted: false, state: 'invalid-scope' };
  }
  const properties = await runCaptureStatus('systemctl', [
    'show',
    scope,
    '--property=ActiveState',
    '--property=ControlGroup',
    '--property=FreezerState'
  ]);
  if (properties.code !== 0) {
    return { accepted: false, state: 'scope-check-failed' };
  }
  const values = Object.fromEntries(
    properties.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf('=');
        return separator > 0
          ? [line.slice(0, separator), line.slice(separator + 1)]
          : ['', ''];
      })
      .filter(([key]) => key)
  );
  const controlGroup = values.ControlGroup || '';
  if (
    values.ActiveState !== 'active' ||
    values.FreezerState !== 'frozen' ||
    !controlGroup.startsWith('/') ||
    controlGroup.includes('..')
  ) {
    return { accepted: false, state: 'scope-not-frozen' };
  }
  let events;
  try {
    events = await readFile(
      join('/sys/fs/cgroup', controlGroup, 'cgroup.events'),
      'utf8'
    );
  } catch {
    return { accepted: false, state: 'cgroup-events-unavailable' };
  }
  if (!events.split('\n').includes('frozen 1')) {
    return { accepted: false, state: 'cgroup-not-fully-frozen' };
  }
  for (const pid of pids) {
    if (!/^[1-9][0-9]*$/.test(pid)) {
      return { accepted: false, state: 'invalid-codex-pid' };
    }
    let cgroup;
    try {
      cgroup = await readFile(`/proc/${pid}/cgroup`, 'utf8');
    } catch {
      return { accepted: false, state: 'codex-process-raced' };
    }
    const unified = cgroup
      .split('\n')
      .find((line) => line.startsWith('0::'))
      ?.slice(3);
    if (
      !unified ||
      (unified !== controlGroup &&
        !unified.startsWith(`${controlGroup}/`))
    ) {
      return { accepted: false, state: 'codex-outside-frozen-scope' };
    }
  }
  const repeated = await runCaptureStatus('pgrep', [
    '-f',
    CODEX_PROCESS_PATTERN
  ]);
  const expectedPids = [...pids].sort();
  const repeatedPids =
    repeated.code === 0
      ? repeated.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .sort()
      : [];
  if (
    repeated.code !== 0 ||
    JSON.stringify(repeatedPids) !== JSON.stringify(expectedPids)
  ) {
    return { accepted: false, state: 'codex-process-set-changed' };
  }
  let finalEvents;
  try {
    finalEvents = await readFile(
      join('/sys/fs/cgroup', controlGroup, 'cgroup.events'),
      'utf8'
    );
  } catch {
    return { accepted: false, state: 'final-cgroup-check-failed' };
  }
  if (!finalEvents.split('\n').includes('frozen 1')) {
    return { accepted: false, state: 'cgroup-thawed-during-check' };
  }
  return {
    accepted: true,
    state: `fully-frozen:${scope}`
  };
}

export async function inspectBrowserWriters(sourceRoot) {
  const browserRoot = resolve(sourceRoot, 'browser');
  const writerPids = new Set();
  let scanFailures = 0;
  const proc = await opendir('/proc');
  for await (const entry of proc) {
    if (!entry.isDirectory() || !/^[1-9][0-9]*$/.test(entry.name)) {
      continue;
    }
    const pid = entry.name;
    let args;
    try {
      args = (await readFile(`/proc/${pid}/cmdline`))
        .toString('utf8')
        .split('\0')
        .filter(Boolean);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      scanFailures += 1;
      continue;
    }
    let processCwd = '';
    if (args.length > 0) {
      try {
        processCwd = await readlink(`/proc/${pid}/cwd`);
        if (
          processCwd === browserRoot ||
          processCwd.startsWith(`${browserRoot}${sep}`)
        ) {
          writerPids.add(pid);
        }
      } catch (error) {
        if (error?.code !== 'ENOENT') scanFailures += 1;
      }
      try {
        const maps = await readFile(`/proc/${pid}/maps`, 'utf8');
        if (Buffer.byteLength(maps, 'utf8') > 16 * 1024 * 1024) {
          scanFailures += 1;
        } else if (
          maps.split('\n').some((line) => {
            const pathStart = line.indexOf('/');
            if (pathStart === -1) return false;
            const mappedPath = line
              .slice(pathStart)
              .replace(/ \(deleted\)$/, '');
            return (
              mappedPath === browserRoot ||
              mappedPath.startsWith(`${browserRoot}${sep}`)
            );
          })
        ) {
          writerPids.add(pid);
        }
      } catch (error) {
        if (error?.code !== 'ENOENT') scanFailures += 1;
      }
    }
    for (let index = 0; index < args.length; index += 1) {
      let userDataDir = '';
      if (args[index] === '--user-data-dir') {
        userDataDir = args[index + 1] || '';
      } else if (args[index].startsWith('--user-data-dir=')) {
        userDataDir = args[index].slice('--user-data-dir='.length);
      }
      if (!userDataDir) continue;
      if (!isAbsolute(userDataDir)) {
        try {
          processCwd ||= await readlink(`/proc/${pid}/cwd`);
        } catch (error) {
          if (error?.code !== 'ENOENT') scanFailures += 1;
          continue;
        }
      }
      const resolvedUserDataDir = resolve(
        isAbsolute(userDataDir) ? '/' : processCwd,
        userDataDir
      );
      if (
        resolvedUserDataDir === browserRoot ||
        resolvedUserDataDir.startsWith(`${browserRoot}${sep}`)
      ) {
        writerPids.add(pid);
      }
    }

    let descriptors;
    try {
      descriptors = await opendir(`/proc/${pid}/fd`);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      scanFailures += 1;
      continue;
    }
    try {
      for await (const descriptor of descriptors) {
        let target;
        try {
          target = await readlink(`/proc/${pid}/fd/${descriptor.name}`);
        } catch (error) {
          if (error?.code !== 'ENOENT') scanFailures += 1;
          continue;
        }
        const normalizedTarget = target.replace(/ \(deleted\)$/, '');
        if (
          isAbsolute(normalizedTarget) &&
          (
            normalizedTarget === browserRoot ||
            normalizedTarget.startsWith(`${browserRoot}${sep}`)
          )
        ) {
          writerPids.add(pid);
        }
      }
    } finally {
      await descriptors.close().catch(() => {});
    }
  }
  return {
    stopped: writerPids.size === 0 && scanFailures === 0,
    state:
      scanFailures > 0
        ? 'process-or-fd-scan-failed'
        : writerPids.size > 0
          ? `${writerPids.size}-browser-tree-users`
          : 'none',
    checkExitCode: scanFailures > 0 ? 1 : 0
  };
}

export async function inspectQuiescence(
  mode,
  sourceRoot,
  frozenCodexScope = '',
  includeBrowserProfiles = false
) {
  const checks = [];
  for (const [scope, unit] of [
    ['user', 'openclaw-gateway.service'],
    ['system', 'qaa-sladdis-web-runner.service'],
    ['system', 'cron.service']
  ]) {
    const args =
      scope === 'user'
        ? ['--user', 'is-active', unit]
        : ['is-active', unit];
    const result = await runCaptureStatus('systemctl', args);
    const state = result.stdout.trim();
    const stopped = ['inactive', 'failed', 'unknown'].includes(state);
    checks.push({
      kind: 'systemd',
      scope,
      target: unit,
      state: state || 'unavailable',
      stopped,
      checkExitCode: result.code
    });
  }
  const bridge = await runCaptureStatus(
    'pgrep',
    ['-f', '(^|[ /])bridge/server\\.mjs($| )']
  );
  checks.push({
    kind: 'process',
    target: 'bridge/server.mjs',
    state: bridge.code === 1 ? 'not-running' : 'running-or-check-failed',
    stopped: bridge.code === 1,
    checkExitCode: bridge.code
  });

  if (includeBrowserProfiles) {
    let browserWriters;
    try {
      browserWriters = await inspectBrowserWriters(sourceRoot);
    } catch {
      browserWriters = {
        stopped: false,
        state: 'process-or-fd-scan-failed',
        checkExitCode: 1
      };
    }
    checks.push({
      kind: 'browser-processes-and-fds',
      target: 'browser-profile-tree-users',
      ...browserWriters
    });
  }

  const codex = await runCaptureStatus('pgrep', [
    '-f',
    CODEX_PROCESS_PATTERN
  ]);
  const codexPids =
    codex.code === 0
      ? codex.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
      : [];
  const frozenCodex =
    codex.code === 0
      ? await inspectFrozenCodexScope(
          frozenCodexScope,
          codexPids
        )
      : { accepted: false, state: 'not-running' };
  checks.push({
    kind: 'process',
    target: 'codex-processes',
    state:
      codex.code === 1
        ? 'not-running'
        : codex.code === 0 && frozenCodex.accepted
          ? frozenCodex.state
          : 'running-or-check-failed',
    stopped:
      codex.code === 1 ||
      (codex.code === 0 && frozenCodex.accepted),
    checkExitCode: codex.code
  });

  for (const scope of ['system', 'user']) {
    const timerArgs =
      scope === 'user'
        ? ['--user', 'list-timers', '--no-legend', '--no-pager']
        : ['list-timers', '--no-legend', '--no-pager'];
    const timers = await runCaptureStatus('systemctl', timerArgs);
    const matchingTimers =
      timers.code === 0
        ? timers.stdout
            .split('\n')
            .map((line) => line.trim())
            .filter((line) =>
              isPotentialWriterTimerLine(line, scope)
            )
        : [];
    checks.push({
      kind: 'systemd-timers',
      scope,
      target: `${scope}-automation-timers`,
      state:
        timers.code === 0
          ? matchingTimers.length === 0
            ? 'none'
            : `${matchingTimers.length}-matching`
          : 'check-failed',
      stopped: timers.code === 0 && matchingTimers.length === 0,
      checkExitCode: timers.code
    });
  }

  const dockerPs = await runCaptureStatus('docker', [
    'ps',
    '--quiet',
    '--filter',
    'status=running'
  ]);
  let writableContainers = [];
  let dockerInspectCode = dockerPs.code;
  const containerIds =
    dockerPs.code === 0
      ? dockerPs.stdout.split('\n').map((line) => line.trim()).filter(Boolean)
      : [];
  if (dockerPs.code === 0 && containerIds.length > 0) {
    const inspected = await runCaptureStatus('docker', [
      'inspect',
      '--format',
      '{{.Name}}\t{{json .Mounts}}',
      ...containerIds
    ]);
    dockerInspectCode = inspected.code;
    if (inspected.code === 0) {
      writableContainers = inspected.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .flatMap((line) => {
          const separatorIndex = line.indexOf('\t');
          if (separatorIndex < 1) return ['unparseable-container'];
          const name = line.slice(0, separatorIndex).replace(/^\//, '');
          let mounts;
          try {
            mounts = JSON.parse(line.slice(separatorIndex + 1));
          } catch {
            return [`${name}:unparseable-mounts`];
          }
          const writesSource = Array.isArray(mounts)
            ? mounts.some(
                (mount) =>
                  mount?.RW === true &&
                  typeof mount.Source === 'string' &&
                  (mount.Source === sourceRoot ||
                    mount.Source.startsWith(`${sourceRoot}${sep}`))
              )
            : true;
          return writesSource ? [name] : [];
        });
    }
  }
  checks.push({
    kind: 'containers',
    target: 'docker-rw-openclaw-mounts',
    state:
      dockerPs.code === 0 && dockerInspectCode === 0
        ? writableContainers.length === 0
          ? 'none'
          : writableContainers.join(',')
        : 'check-failed',
    stopped:
      dockerPs.code === 0 &&
      dockerInspectCode === 0 &&
      writableContainers.length === 0,
    checkExitCode:
      dockerPs.code === 0 ? dockerInspectCode : dockerPs.code
  });

  const blockers = checks.filter((check) => !check.stopped);
  if (mode === 'quiesced' && blockers.length > 0) {
    throw new Error(
      `Quiesced consistency required, but writers are active or unverifiable: ${blockers.map((item) => item.target).join(', ')}`
    );
  }
  return {
    mode,
    checkedAt: new Date().toISOString(),
    checks,
    allKnownWritersStopped: blockers.length === 0,
    crossStoreConsistency:
      mode === 'quiesced'
        ? 'known writers stopped'
        : 'not guaranteed; explicitly accepted for this set'
  };
}

async function collectSessionJsonlState(sourceRoot) {
  const sessions = [];
  const agentsRoot = join(sourceRoot, 'agents');
  const paths = pathCardinalityGuard('Session JSONL scan');

  async function walk(directoryPath) {
    const directory = await opendir(directoryPath);
    for await (const entry of directory) {
      const path = join(directoryPath, entry.name);
      const relativePath = relative(sourceRoot, path)
        .split(sep)
        .join('/');
      if (containsAsciiControl(relativePath)) {
        throw new Error(
          'Control-character-bearing paths are not supported'
        );
      }
      paths.account(relativePath);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        const info = await stat(path, { bigint: true });
        if (
          info.size <= 0n ||
          info.size > BigInt(Number.MAX_SAFE_INTEGER)
        ) {
          throw new Error('Session JSONL has an invalid size');
        }
        const tailBytes = Number(
          info.size < BigInt(MAX_SESSION_JSONL_TAIL_BYTES)
            ? info.size
            : BigInt(MAX_SESSION_JSONL_TAIL_BYTES)
        );
        const handle = await open(path, 'r');
        const tail = Buffer.alloc(tailBytes);
        try {
          await handle.read(
            tail,
            0,
            tailBytes,
            Number(info.size) - tailBytes
          );
        } finally {
          await handle.close();
        }
        if (tail.at(-1) !== 0x0a) {
          throw new Error('Session JSONL does not end with a complete line');
        }
        const withoutFinalNewline = tail.subarray(0, -1);
        const previousNewline =
          withoutFinalNewline.lastIndexOf(0x0a);
        if (
          previousNewline === -1 &&
          info.size > BigInt(tailBytes)
        ) {
          throw new Error(
            'Session JSONL final line exceeds the bounded validator'
          );
        }
        const line = withoutFinalNewline
          .subarray(previousNewline + 1)
          .toString('utf8')
          .replace(/\r$/, '');
        try {
          JSON.parse(line);
        } catch {
          throw new Error('Session JSONL final line is not valid JSON');
        }
        sessions.push({
          path: relativePath,
          bytes: Number(info.size),
          mtimeNs: info.mtimeNs.toString(),
          finalLineSha256: createHash('sha256')
            .update(line, 'utf8')
            .digest('hex')
        });
      }
    }
  }

  await walk(agentsRoot);
  sessions.sort((left, right) => left.path.localeCompare(right.path));
  return sessions;
}

async function streamEncryptedArchive({
  sourceRoot,
  metadataRoot,
  exclusionFile,
  recipient,
  chunkBytes,
  chunkPrefix,
  tarIndexPath,
  expectedArchivePaths
}) {
  const sourceParent = dirname(sourceRoot);
  const sourceName = basename(sourceRoot);
  if (sourceName !== '.openclaw') {
    throw new Error('Execute source basename must be .openclaw');
  }

  const tarArgs = [
    '--create',
    '--file=-',
    '--numeric-owner',
    '--acls',
    '--xattrs',
    '--sparse',
    '--one-file-system',
    '--verbose',
    '--quoting-style=literal',
    `--index-file=${tarIndexPath}`,
    `--exclude-from=${exclusionFile}`,
    '-C',
    sourceParent,
    sourceName,
    '-C',
    dirname(metadataRoot),
    basename(metadataRoot)
  ];

  const commands = [
    {
      name: 'tar',
      command: 'tar',
      args: tarArgs
    },
    {
      name: 'zstd',
      command: 'zstd',
      args: ['--compress', '-8', '--threads=0', '--stdout', '--quiet']
    },
    {
      name: 'gpg',
      command: 'gpg',
      args: [
        '--batch',
        '--yes',
        '--no-tty',
        '--trust-model',
        'always',
        '--throw-keyids',
        '--recipient',
        recipient.toUpperCase(),
        '--output',
        '-',
        '--encrypt'
      ]
    },
    {
      name: 'split',
      command: 'split',
      args: [
        `--bytes=${chunkBytes}`,
        '--numeric-suffixes=0',
        '--suffix-length=5',
        '--additional-suffix=.gpg',
        '-',
        chunkPrefix
      ]
    }
  ];

  const children = commands.map(({ command, args }) =>
    spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, LC_ALL: 'C' }
    })
  );
  for (const child of children) {
    child.stdin?.on('error', () => {});
    child.stdout?.on('error', () => {});
    child.stderr?.on('error', () => {});
  }
  children[0].stdout.pipe(children[1].stdin);
  children[1].stdout.pipe(children[2].stdin);
  children[2].stdout.pipe(children[3].stdin);

  const completions = children.map((child, index) =>
    waitForChild(child, commands[index].name, {
      discardStdout: index === 3,
      timeoutMs: ARCHIVE_PIPELINE_TIMEOUT_MS
    })
  );
  let results;
  try {
    results = await Promise.all(completions);
  } catch (error) {
    for (const child of children) {
      child.kill('SIGKILL');
    }
    await Promise.allSettled(completions);
    throw error;
  }
  const failed = results.find((result) => result.code !== 0);
  if (failed) {
    throw new Error(`${failed.name} pipeline stage failed`);
  }
  await assertTarIndexMatches(tarIndexPath, expectedArchivePaths);
}

async function assertTarIndexMatches(path, expectedArchivePaths) {
  const info = await lstat(path);
  if (
    info.isSymbolicLink() ||
    !info.isFile() ||
    info.size <= 0 ||
    info.size > 64 * 1024 * 1024
  ) {
    throw new Error('Tar membership index is missing or invalid');
  }
  await chmod(path, 0o600);
  const body = await readFile(path, 'utf8');
  const lines = body.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const actual = lines.map((line) =>
    line.endsWith('/') ? line.slice(0, -1) : line
  );
  if (
    actual.some(
      (entry) => !entry || containsAsciiControl(entry)
    ) ||
    new Set(actual).size !== actual.length ||
    actual.length !== expectedArchivePaths.length
  ) {
    throw new Error('Tar membership does not match the payload manifest');
  }
  const actualSorted = [...actual].sort((left, right) =>
    Buffer.compare(
      Buffer.from(left, 'utf8'),
      Buffer.from(right, 'utf8')
    )
  );
  if (
    JSON.stringify(actualSorted) !==
    JSON.stringify(expectedArchivePaths)
  ) {
    throw new Error('Tar membership does not match the payload manifest');
  }
}

async function encryptSmallFileForRecipient(
  sourcePath,
  destinationPath,
  recipient,
  signer
) {
  await runCapture(
    'gpg',
    [
      '--batch',
      '--yes',
      '--no-tty',
      '--trust-model',
      'always',
      '--throw-keyids',
      '--compress-algo',
      'none',
      '--cipher-algo',
      'AES256',
      '--recipient',
      recipient.toUpperCase(),
      '--local-user',
      signer.toUpperCase(),
      '--output',
      destinationPath,
      '--sign',
      '--encrypt',
      sourcePath
    ],
    { label: 'encrypted remote manifest creation' }
  );
  await chmod(destinationPath, 0o600);
}

function productionDataSummary(productionData) {
  if (!productionData?.included) {
    return {
      schema: PRODUCTION_CAPTURE_V2,
      included: false,
      reason: productionData?.reason || 'not_captured'
    };
  }
  return {
    schema: productionData.schema,
    included: true,
    captureId: productionData.captureId,
    projectRefSha256: productionData.projectRefSha256,
    publicDump: productionData.publicDump,
    auth: productionData.auth,
    authControlPlane: productionData.authControlPlane,
    media: productionData.media,
    recoveryCapabilities:
      productionData.recoveryCapabilities,
    recoveryLimitations:
      productionData.recoveryLimitations
  };
}

async function buildOuterManifest(
  partialDirectory,
  setId,
  payloadClass,
  chunkBytes,
  recipient,
  signer,
  plaintextStagingDirectory,
  payloadBytesEstimate,
  consistencyProof,
  payloadManifest,
  productionData
) {
  const directory = await opendir(partialDirectory);
  const chunks = [];
  for await (const entry of directory) {
    if (
      entry.isFile() &&
      entry.name.startsWith('openclaw-backup.part-') &&
      entry.name.endsWith('.gpg')
    ) {
      const path = join(partialDirectory, entry.name);
      const info = await stat(path);
      chunks.push({
        name: entry.name,
        bytes: info.size,
        sha256: await hashFile(path)
      });
    }
  }
  chunks.sort((left, right) => left.name.localeCompare(right.name));
  if (chunks.length === 0) throw new Error('Encrypted pipeline produced no chunks');

  const remoteManifest = {
    schema: BACKUP_MANIFEST_V2,
    setId,
    payloadClass,
    completedAt: new Date().toISOString(),
    archive: 'tar',
    compression: 'zstd',
    encryption: 'openpgp-public-recipient',
    recipientFingerprint: recipient.toUpperCase(),
    signerFingerprint: signer.toUpperCase(),
    consistencyProof,
    payloadManifest: {
      schema: payloadManifest.schema,
      archivePath: payloadManifest.archivePath,
      bytes: payloadManifest.bytes,
      sha256: payloadManifest.sha256,
      entries: payloadManifest.entries,
      contentBytes: payloadManifest.contentBytes,
      hostPolicy: payloadManifest.hostPolicy
    },
    payloadComponents: {
      agentOsProduction:
        productionDataSummary(productionData)
    },
    payloadBytesEstimate,
    chunkBytes,
    totalBytes: chunks.reduce((total, chunk) => total + chunk.bytes, 0),
    chunks
  };
  const remoteManifestSource = join(
    plaintextStagingDirectory,
    'remote-manifest.json'
  );
  const encryptedManifestPath = join(
    partialDirectory,
    'manifest.json.gpg'
  );
  await writePrivateFile(
    remoteManifestSource,
    `${JSON.stringify(remoteManifest, null, 2)}\n`
  );
  await encryptSmallFileForRecipient(
    remoteManifestSource,
    encryptedManifestPath,
    recipient,
    signer
  );
  const encryptedManifestInfo = await stat(encryptedManifestPath);
  const manifest = {
    ...remoteManifest,
    encryptedManifest: {
      name: basename(encryptedManifestPath),
      bytes: encryptedManifestInfo.size,
      sha256: await hashFile(encryptedManifestPath)
    }
  };
  await writePrivateFile(
    join(partialDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  return manifest;
}

async function sealCompletedSet(partialDirectory, manifest) {
  for (const name of [
    'manifest.json',
    manifest.encryptedManifest.name,
    ...manifest.chunks.map((chunk) => chunk.name)
  ]) {
    await chmod(join(partialDirectory, name), 0o400);
  }
  await chmod(partialDirectory, 0o500);
}

export async function hashFile(path) {
  const handle = await open(path, 'r');
  const hash = createHash('sha256');
  try {
    for await (const chunk of handle.createReadStream()) {
      hash.update(chunk);
    }
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
}

async function executeBackup(options, plan) {
  const trace = (stage) => {
    if (TRACE_BACKUP_EXECUTION) {
      process.stderr.write(`openclaw_backup_trace: ${stage}\n`);
    }
  };
  const sourceRoot = await realpath(resolve(options.source));
  const inventoryPolicy = {
    includeBrowserProfiles: options.includeBrowserProfiles
  };
  const outputRoot = await validateDestination(options, sourceRoot);
  const abandonedPartialSetsRemoved =
    await removeAbandonedPartialSets(outputRoot);
  await assertDiskBudget(outputRoot, plan);
  const missingTools = Object.entries(plan.tools)
    .filter(([, available]) => !available)
    .map(([name]) => name);
  if (missingTools.length > 0) {
    throw new Error(`Required backup tools are unavailable: ${missingTools.join(', ')}`);
  }
  if (plan._inventory.invalidDatabaseCandidates.length > 0) {
    throw new Error(
      'Database-like files with invalid SQLite headers were found'
    );
  }
  if (plan._inventory.missingCriticalSqlitePaths.length > 0) {
    throw new Error(
      `Critical SQLite coverage is incomplete: ${plan._inventory.missingCriticalSqlitePaths.join(', ')}`
    );
  }
  if (
    options.includeBrowserProfiles &&
    plan._inventory.browserProfiles.missingCriticalPaths.length > 0
  ) {
    throw new Error(
      'Critical browser profile recovery coverage is incomplete'
    );
  }
  if (
    options.productionData === 'required' &&
    !plan.productionData.available
  ) {
    throw new Error(
      'Agent OS production data capture was required but its preflight failed'
    );
  }
  await validateRecipient(options.recipient);
  const signer = await validateSigner(options.signer, options.recipient);
  const consistency = await inspectQuiescence(
    options.consistency,
    sourceRoot,
    options.frozenCodexScope,
    options.includeBrowserProfiles
  );
  const protectedTreeStateInitial =
    options.consistency === 'quiesced'
      ? await collectProtectedTreeState(
        sourceRoot,
        inventoryPolicy
      )
      : null;
  let protectedTreeStateBefore =
    protectedTreeStateInitial;
  let sqliteSnapshotSidecarMetadataChanges = 0;
  const sourceEntriesBefore =
    await collectOpenClawArchiveEntries(
      sourceRoot,
      plan._inventory,
      inventoryPolicy
    );
  const sessionStateBefore = await collectSessionJsonlState(sourceRoot);
  consistency.sessionJsonl = {
    filesChecked: sessionStateBefore.length,
    completeFinalJsonLines: true,
    stableThroughArchiveRequired: options.consistency === 'quiesced'
  };
  if (options.postgres === 'required' && !plan.postgres.available) {
    throw new Error('PostgreSQL was required but is not available');
  }

  const setId = makeSetId();
  const partialDirectory = join(outputRoot, `.${setId}.partial`);
  const finalDirectory = join(outputRoot, setId);
  const plaintextStagingDirectory =
    await createPlaintextStagingDirectory(
      options.plaintextStagingRoot,
      plan.plaintextStaging.requiredBytes
    );
  const metadataRoot = join(
    plaintextStagingDirectory,
    'backup-meta'
  );
  const exclusionFile = join(
    plaintextStagingDirectory,
    'tar-excludes.txt'
  );
  const tarIndexPath = join(
    plaintextStagingDirectory,
    'tar-members.index'
  );
  await mkdir(partialDirectory, { mode: 0o700 });
  await mkdir(metadataRoot, { recursive: true, mode: 0o700 });

  try {
    trace('write-exclusions');
    await writeExclusionFile(exclusionFile, plan._inventory);
    trace('sqlite-snapshots:start');
    const sqliteSnapshots = await createSqliteSnapshots(
      plan._inventory,
      metadataRoot
    );
    trace('sqlite-snapshots:complete');
    if (options.consistency === 'quiesced') {
      trace('protected-tree-post-sqlite:start');
      const protectedTreeStateAfterSqlite =
        await collectProtectedTreeState(
          sourceRoot,
          inventoryPolicy
        );
      const snapshotTransition =
        assertProtectedTreeSnapshotTransition(
          protectedTreeStateInitial,
          protectedTreeStateAfterSqlite,
          plan._inventory
        );
      sqliteSnapshotSidecarMetadataChanges =
        snapshotTransition.allowedMetadataChanges;
      protectedTreeStateBefore =
        protectedTreeStateAfterSqlite;
      trace('protected-tree-post-sqlite:complete');
    }
    trace('staging-usage:after-sqlite:start');
    await assertPlaintextStagingUsage(
      plaintextStagingDirectory,
      plan.plaintextStaging.requiredBytes
    );
    trace('staging-usage:after-sqlite:complete');
    trace('postgres-dump:start');
    const postgres = await createPostgresDump(
      metadataRoot,
      options.postgres,
      plan.plaintextStaging.components.postgresBytes
    );
    trace('postgres-dump:complete');
    await assertPlaintextStagingUsage(
      plaintextStagingDirectory,
      plan.plaintextStaging.requiredBytes
    );
    let productionData = {
      schema: PRODUCTION_CAPTURE_V2,
      included: false,
      reason:
        options.productionData === 'skip'
          ? 'explicitly_skipped'
          : plan.productionData.reason
    };
    if (plan.productionData.available) {
      const configuration =
        await loadProductionDataConfiguration(
          productionDataConfigurationOptions(options)
        );
      productionData = {
        included: true,
        ...(await captureProductionData({
          metadataRoot,
          captureId: setId,
          configuration,
          limits: {
            publicSchemaBytes:
              plan.productionData.publicSchemaBytesEstimate,
            publicDumpBytes:
              plan.productionData.publicSchemaBytesEstimate +
              STAGING_DUMP_MARGIN_BYTES,
            authBytes:
              plan.productionData.authBytesEstimate * 2,
            authControlPlaneBytes:
              plan.productionData
                .authControlPlaneBytesEstimate * 2,
            mediaRows: plan.productionData.mediaRows,
            mediaObjects: plan.productionData.mediaObjects,
            mediaBytes:
              plan.productionData.mediaDeclaredBytes
          }
        }))
      };
      await assertPlaintextStagingUsage(
        plaintextStagingDirectory,
        plan.plaintextStaging.requiredBytes
      );
    }
    const quarantinedPaths = await stageQuarantinedPaths(
      sourceRoot,
      plan._inventory,
      metadataRoot
    );
    await assertPlaintextStagingUsage(
      plaintextStagingDirectory,
      plan.plaintextStaging.requiredBytes
    );
    const sideEffectTables = await inspectSideEffectTables(
      sqliteSnapshots,
      metadataRoot
    );
    const runtimeVersions = await collectRuntimeVersions(
      plan.payloadClass
    );
    const hostRecovery = await stageHostRecovery(
      metadataRoot,
      plan.hostRecovery
    );
    await assertPlaintextStagingUsage(
      plaintextStagingDirectory,
      plan.plaintextStaging.requiredBytes
    );
    await createInternalMetadata({
      setId,
      payloadClass: plan.payloadClass,
      inventory: plan._inventory,
      metadataRoot,
      sqliteSnapshots,
      postgres,
      productionData,
      hostRecovery,
      quarantinedPaths,
      sideEffectTables,
      consistency,
      runtimeVersions
    });
    await assertPlaintextStagingUsage(
      plaintextStagingDirectory,
      plan.plaintextStaging.requiredBytes
    );
    const payloadManifest = await createPayloadPathManifest({
      setId,
      payloadClass: plan.payloadClass,
      sourceEntries: sourceEntriesBefore,
      metadataRoot,
      hostPolicy: hostRecovery.policy
    });
    await assertPlaintextStagingUsage(
      plaintextStagingDirectory,
      plan.plaintextStaging.requiredBytes
    );
    await assertDatabaseSetStable(
      sourceRoot,
      plan._inventory,
      inventoryPolicy
    );
    await streamEncryptedArchive({
      sourceRoot,
      metadataRoot,
      exclusionFile,
      recipient: options.recipient,
      chunkBytes: options.chunkBytes,
      chunkPrefix: join(partialDirectory, 'openclaw-backup.part-'),
      tarIndexPath,
      expectedArchivePaths:
        payloadManifest.expectedArchivePaths
    });
    const [sourceEntriesAfter, metadataEntriesAfter] =
      await Promise.all([
        collectOpenClawArchiveEntries(
          sourceRoot,
          plan._inventory,
          inventoryPolicy
        ),
        collectArchiveEntries(metadataRoot, 'backup-meta', {
          exclude: (relativePath) =>
            relativePath === 'path-manifest.json'
        })
      ]);
    const entriesAfter = [
      ...sourceEntriesAfter,
      ...metadataEntriesAfter
    ].sort(bytewisePathCompare);
    if (
      canonicalEntriesDigest(sourceEntriesAfter) !==
        canonicalEntriesDigest(sourceEntriesBefore) ||
      canonicalEntriesDigest(entriesAfter) !==
        payloadManifest.entriesRootSha256
    ) {
      throw new Error(
        'Backup payload changed while the encrypted archive was created'
      );
    }
    const pathManifestPath = join(
      metadataRoot,
      'path-manifest.json'
    );
    const pathManifestInfo = await stat(pathManifestPath);
    if (
      pathManifestInfo.size !== payloadManifest.bytes ||
      (await hashFile(pathManifestPath)) !==
        payloadManifest.sha256
    ) {
      throw new Error(
        'Backup payload manifest changed during archive creation'
      );
    }
    let consistencyProof = {
      mode: options.consistency,
      writersChecked: consistency.checks.length,
      writersStoppedBefore: consistency.allKnownWritersStopped,
      writersStoppedAfter: null,
      protectedEntriesChecked: 0,
      protectedTreeStable: null
    };
    if (options.consistency === 'quiesced') {
      const sessionStateAfter =
        await collectSessionJsonlState(sourceRoot);
      if (
        JSON.stringify(sessionStateAfter) !==
        JSON.stringify(sessionStateBefore)
      ) {
        throw new Error(
          'Session JSONL state changed during quiesced backup'
        );
      }
      const consistencyAfter = await inspectQuiescence(
        'quiesced',
        sourceRoot,
        options.frozenCodexScope,
        options.includeBrowserProfiles
      );
      const protectedTreeStateAfter =
        await collectProtectedTreeState(
          sourceRoot,
          inventoryPolicy
        );
      if (
        JSON.stringify(protectedTreeStateAfter) !==
        JSON.stringify(protectedTreeStateBefore)
      ) {
        throw new Error(
          'Protected OpenClaw tree changed during quiesced backup'
        );
      }
      consistencyProof = {
        mode: 'quiesced',
        writersChecked: consistency.checks.length,
        writersStoppedBefore: true,
        writersStoppedAfter:
          consistencyAfter.allKnownWritersStopped,
        protectedEntriesChecked:
          protectedTreeStateAfter.length,
        sqliteSnapshotSidecarMetadataChanges,
        protectedTreeStable: true
      };
    }
    const manifest = await buildOuterManifest(
      partialDirectory,
      setId,
      plan.payloadClass,
      options.chunkBytes,
      options.recipient,
      signer,
      plaintextStagingDirectory,
      plan._inventory.includedBytesEstimate +
        quarantinedPaths.reduce(
          (total, entry) => total + entry.bytes,
          0
        ) +
        plan.hostRecovery.paths.reduce(
          (total, entry) =>
            total + (entry.present ? entry.bytes : 0),
          0
        ) +
        (postgres.included ? postgres.bytes : 0) +
        (
          productionData.included
            ? productionData.publicDump.bytes +
              productionData.auth.bytes +
              productionData.authControlPlane.totalBytes +
              productionData.media.inventoryBytes +
              productionData.media.totalBytes
            : 0
        ),
      consistencyProof,
      payloadManifest,
      productionData
    );
    await rm(plaintextStagingDirectory, {
      recursive: true,
      force: false
    });
    await sealCompletedSet(partialDirectory, manifest);
    await rename(partialDirectory, finalDirectory);
    return {
      schema: 'openclaw-backup-result/v1',
      ok: true,
      setId,
      directory: finalDirectory,
      chunks: manifest.chunks.length,
      ciphertextBytes: manifest.totalBytes,
      payloadClass: manifest.payloadClass,
      payloadManifestEntries:
        manifest.payloadManifest.entries,
      productionData:
        manifest.payloadComponents.agentOsProduction,
      verification:
        'Run scripts/verify-openclaw-backup.mjs on the completed set before upload.',
      abandonedPartialSetsRemoved
    };
  } catch (error) {
    await rm(plaintextStagingDirectory, {
      recursive: true,
      force: true
    }).catch(() => {});
    await rm(partialDirectory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function relaunchUnderLock(argv) {
  const lockHandle = await openPrivateLockFile(
    LOCK_ROOT,
    LOCK_NAME,
    { label: 'Backup creator lock' }
  );
  let result;
  try {
    const child = spawn(
      'flock',
      [
        '--exclusive',
        '--nonblock',
        '--conflict-exit-code',
        '75',
        '3',
        process.execPath,
        SCRIPT_PATH,
        ...argv,
        '--internal-locked'
      ],
      {
        stdio: ['inherit', 'inherit', 'inherit', lockHandle.fd],
        env: {
          ...process.env,
          OPENCLAW_BACKUP_LOCK_HELD: '1'
        }
      }
    );
    result = await waitForChild(child, 'backup lock', {
      inheritStdio: true
    });
  } finally {
    await lockHandle.close();
  }
  if (result.code === 75) {
    throw new Error('Another OpenClaw backup holds the execution lock');
  }
  process.exitCode = result.code;
}

async function runCapture(command, args, options = {}) {
  const result = await runCaptureStatus(command, args, options);
  if (result.code !== 0) {
    throw new Error(`${options.label || command} failed`);
  }
  return {
    stdout: result.stdout,
    stderr: result.stderr
  };
}

async function runCaptureStatus(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, LC_ALL: 'C' }
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on('data', (chunk) => stdout.push(chunk));
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  const result = await waitForChild(child, options.label || command, {
    timeoutMs:
      options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS
  });
  return {
    code: result.code,
    stdout: Buffer.concat(stdout).toString('utf8'),
    stderr: Buffer.concat(stderr).toString('utf8')
  };
}

async function runStreamingInput(command, args, input, label) {
  const child = spawn(command, args, {
    stdio: ['pipe', 'ignore', 'pipe'],
    env: { ...process.env, LC_ALL: 'C' }
  });
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  const result = await waitForChild(child, label, {
    timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS
  });
  if (result.code !== 0) throw new Error(`${label} failed`);
}

async function runToFile(command, args, outputStream, options = {}) {
  const maxBytes = options.maxBytes;
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1
  ) {
    throw new Error('Bounded command output limit is invalid');
  }
  const child = spawn(command, args, {
    cwd: options.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, LC_ALL: 'C' }
  });
  child.stdout.on('error', () => {});
  // The stream pipeline can be the only remaining asynchronous activity after
  // the child process has spawned. Keep Node referenced until both the child
  // and its output stream have settled; otherwise Node may exit successfully
  // with an incomplete capture and no result document.
  const keepAlive = setInterval(() => {}, 1_000);
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        callback(
          new Error('Command output exceeded its staging limit')
        );
      } else {
        callback(null, chunk);
      }
    }
  });
  try {
    const completion = waitForChild(
      child,
      options.label || command,
      {
        timeoutMs:
          options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS
      }
    );
    const transfer = pipeline(
      child.stdout,
      limiter,
      outputStream
    ).catch((error) => {
      child.kill('SIGKILL');
      throw error;
    });
    const [completionResult, transferResult] =
      await Promise.allSettled([completion, transfer]);
    if (transferResult.status === 'rejected') {
      throw new Error(
        `${options.label || command} exceeded its bounded output contract`
      );
    }
    if (completionResult.status === 'rejected') {
      throw completionResult.reason;
    }
    const result = completionResult.value;
    if (result.code !== 0) throw new Error(`${options.label || command} failed`);
    return bytes;
  } finally {
    clearInterval(keepAlive);
  }
}

async function runFromFile(command, args, inputStream, options = {}) {
  const label = options.label || command;
  const allowEarlyConsumerClose =
    options.allowEarlyConsumerClose === true;
  const child = spawn(command, args, {
    cwd: options.cwd,
    stdio: ['pipe', 'ignore', 'pipe'],
    env: { ...process.env, LC_ALL: 'C' }
  });
  child.stdin.on('error', () => {});
  const keepAlive = setInterval(() => {}, 1_000);
  try {
    const completion = waitForChild(child, label, {
      timeoutMs: options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS
    });
    const transfer = pipeline(inputStream, child.stdin).catch(
      (error) => {
        if (
          !allowEarlyConsumerClose ||
          !isExpectedConsumerClose(error)
        ) {
          child.kill('SIGKILL');
        }
        throw error;
      }
    );
    const [completionResult, transferResult] =
      await Promise.allSettled([completion, transfer]);
    if (completionResult.status === 'rejected') {
      throw completionResult.reason;
    }
    const result = completionResult.value;
    if (result.code !== 0) {
      throw new Error(`${label} failed`);
    }
    if (
      transferResult.status === 'rejected' &&
      (
        !allowEarlyConsumerClose ||
        !isExpectedConsumerClose(transferResult.reason)
      )
    ) {
      const code = transferResult.reason?.code;
      throw new Error(
        `${label} input stream failed${code ? ` (${code})` : ''}`,
        { cause: transferResult.reason }
      );
    }
  } finally {
    clearInterval(keepAlive);
  }
}

function isExpectedConsumerClose(error) {
  return (
    error?.code === 'EPIPE' ||
    error?.code === 'ERR_STREAM_PREMATURE_CLOSE'
  );
}

function waitForChild(child, name, options = {}) {
  if (
    options.timeoutMs !== undefined &&
    (
      !Number.isSafeInteger(options.timeoutMs) ||
      options.timeoutMs < 1
    )
  ) {
    throw new Error(`${name} timeout is invalid`);
  }
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let timedOut = false;
    let timeoutHandle;
    let killHandle;
    // A spawned process is not sufficient to keep every Node runtime path
    // referenced. Preserve the parent event loop until its exit status has
    // been observed, otherwise an awaiting caller can be abandoned silently.
    const keepAlive = setInterval(() => {}, 1_000);
    const clearTimers = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (killHandle) clearTimeout(killHandle);
      clearInterval(keepAlive);
    };
    child.once('error', () => {
      if (!settled) {
        settled = true;
        clearTimers();
        rejectPromise(new Error(`${name} could not start`));
      }
    });
    child.once('close', (code, signal) => {
      if (!settled) {
        settled = true;
        clearTimers();
        if (timedOut) {
          rejectPromise(
            new Error(`${name} exceeded its stage deadline`)
          );
        } else {
          resolvePromise({
            name,
            code: Number.isInteger(code) ? code : 1,
            signal
          });
        }
      }
    });
    if (options.timeoutMs !== undefined) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        killHandle = setTimeout(() => {
          child.kill('SIGKILL');
        }, 5_000);
        killHandle.unref();
      }, options.timeoutMs);
      timeoutHandle.unref();
    }
    if (!options.inheritStdio) {
      child.stderr?.resume();
      if (options.discardStdout) child.stdout?.resume();
    }
  });
}

async function main() {
  process.umask(0o077);
  const options = parseArgs(process.argv.slice(2));
  const maintenanceLockHeld =
    process.env.OPENCLAW_BACKUP_LOCK_HELD === '1';
  if (options.internalLocked !== maintenanceLockHeld) {
    throw new Error(
      'Backup lock marker and internal-lock option must agree exactly'
    );
  }
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (options.execute && !maintenanceLockHeld) {
    await relaunchUnderLock(process.argv.slice(2));
    return;
  }

  const plan = await buildPlan(options);
  if (!options.execute) {
    printPlan(plan, options.json);
    return;
  }
  const result = await executeBackup(options, plan);
  process.stdout.write(
    options.json
      ? `${JSON.stringify(result, null, 2)}\n`
      : `backup_ok set=${result.setId} chunks=${result.chunks} ciphertext_bytes=${result.ciphertextBytes}\n`
  );
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  // An unresolved promise alone does not keep Node alive. Hold one top-level
  // reference until main has produced a result or an error so a future
  // asynchronous lifecycle regression cannot silently exit with status 0.
  const mainKeepAlive = setInterval(() => {}, 1_000);
  main()
    .catch((error) => {
      process.stderr.write(`openclaw_backup_error: ${error.message}\n`);
      process.exitCode = 1;
    })
    .finally(() => {
      clearInterval(mainKeepAlive);
    });
}
