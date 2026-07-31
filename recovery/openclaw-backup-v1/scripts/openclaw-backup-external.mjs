/* eslint-disable no-control-regex -- Intentional trust-boundary validation. */

import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  opendir,
  readFile,
  realpath,
  stat,
  statfs,
  unlink,
  writeFile
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import {
  assertNoActiveSwap,
  assertNoSwapTmpfs,
  assertTrustedDirectoryHierarchy
} from './openclaw-backup-path-security.mjs';
import {
  PRODUCTION_CAPTURE_V1,
  PRODUCTION_CAPTURE_V2,
  PRODUCTION_RECOVERY_LIMITATIONS,
  SUPABASE_AUTH_CONTROL_PLANE_ENDPOINTS,
  SUPABASE_AUTH_CONTROL_PLANE_RESPONSE_SCHEMA,
  SUPABASE_AUTH_CONTROL_PLANE_SCHEMA,
  validateAuthControlPlaneSummary,
  validateProductionDataSummary
} from './openclaw-backup-schema.mjs';

export const PINNED_POSTGRES_IMAGE =
  'postgres@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193';
export const PINNED_SUPABASE_CA_FILE =
  '/etc/openclaw-backup/supabase-prod-ca-2021.crt';
export const PINNED_SUPABASE_CA_SHA256 =
  '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7';
const CONTAINER_SUPABASE_CA_FILE =
  '/etc/ssl/certs/supabase-prod-ca-2021.crt';
const MAX_MANAGEMENT_RESPONSE_BYTES = 32 * 1024 * 1024;
const MAX_AUTH_CONTROL_PLANE_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_AUTH_CONTROL_PLANE_TOTAL_BYTES = 16 * 1024 * 1024;
const AUTH_CONTROL_PLANE_TIMEOUT_MS = 30 * 1000;
const SNAPSHOT_STARTUP_TIMEOUT_MS = 60 * 1000;
const SNAPSHOT_LIFETIME_TIMEOUT_MS = 90 * 60 * 1000;
const SNAPSHOT_CLOSE_TIMEOUT_MS = 30 * 1000;
const PUBLIC_DUMP_TIMEOUT_MS = 20 * 60 * 1000;
const PUBLIC_DUMP_VERIFY_TIMEOUT_MS = 10 * 60 * 1000;
const CLIENT_IMAGE_INSPECT_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_EXPORTER_OUTPUT_BYTES = 32 * 1024 * 1024;
const MAX_TOC_BYTES = 16 * 1024 * 1024;
const MAX_MEDIA_OBJECT_BYTES = 256 * 1024 * 1024;
const MAX_MEDIA_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const SAFE_TABLE_PATTERN = /^[a-z_][a-z0-9_]*$/;
const SET_ID_PATTERN = /^\d{8}T\d{6}Z-[0-9a-f]{16}$/;
const SUPABASE_MANAGEMENT_ORIGIN = 'https://api.supabase.com';
const LINUX_TMPFS_MAGIC = 0x01021994;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .toSorted()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256Text(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function sha256File(path) {
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
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

async function readPrivateFile(path, label) {
  if (!isAbsolute(path)) {
    throw new Error(`${label} path must be absolute`);
  }
  await assertTrustedDirectoryHierarchy(dirname(path), {
    label: `${label} parent`
  });
  const info = await lstat(path);
  const expectedUid =
    typeof process.getuid === 'function' ? process.getuid() : -1;
  if (
    info.isSymbolicLink() ||
    !info.isFile() ||
    info.uid !== expectedUid ||
    (info.mode & 0o077) !== 0 ||
    info.size <= 0 ||
    info.size > 1024 * 1024
  ) {
    throw new Error(`${label} file is missing or unsafe`);
  }
  return readFile(path, 'utf8');
}

async function assertPrivateTmpfsMetadataRoot(metadataRoot) {
  if (!isAbsolute(metadataRoot)) {
    throw new Error(
      'Production metadata root must be an absolute path'
    );
  }
  const root = await realpath(metadataRoot);
  await assertTrustedDirectoryHierarchy(root, {
    label: 'Production metadata root'
  });
  const info = await stat(root);
  const expectedUid =
    typeof process.getuid === 'function' ? process.getuid() : -1;
  const filesystem = await statfs(root);
  if (
    !info.isDirectory() ||
    info.uid !== expectedUid ||
    (info.mode & 0o077) !== 0 ||
    Number(filesystem.type) !== LINUX_TMPFS_MAGIC
  ) {
    throw new Error(
      'Production metadata root must be a private tmpfs directory'
    );
  }
  await assertNoSwapTmpfs(root, {
    label: 'Production metadata root'
  });
  await assertNoActiveSwap();
  return root;
}

function parseEnvFile(body) {
  const values = new Map();
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match || values.has(match[1])) {
      throw new Error('Supabase environment contract is invalid');
    }
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (/[\r\n\u0000]/.test(value)) {
      throw new Error('Supabase environment value is invalid');
    }
    values.set(match[1], value);
  }
  return values;
}

export async function loadProductionDataConfiguration({
  supabaseEnvFile,
  poolerHost,
  managementTokenFile,
  mediaBlobHost
}) {
  const environment = parseEnvFile(
    await readPrivateFile(
      supabaseEnvFile,
      'Supabase environment'
    )
  );
  const databaseUrlValue = environment.get('DATABASE_URL');
  const supabaseUrlValue =
    environment.get('SUPABASE_URL') ||
    environment.get('NEXT_PUBLIC_SUPABASE_URL');
  if (!databaseUrlValue || !supabaseUrlValue) {
    throw new Error('Supabase environment is incomplete');
  }
  let databaseUrl;
  let supabaseUrl;
  try {
    databaseUrl = new URL(databaseUrlValue);
    supabaseUrl = new URL(supabaseUrlValue);
  } catch {
    throw new Error('Supabase endpoint configuration is invalid');
  }
  const projectRef = supabaseUrl.hostname.split('.')[0];
  if (
    supabaseUrl.protocol !== 'https:' ||
    supabaseUrl.username ||
    supabaseUrl.password ||
    supabaseUrl.port ||
    supabaseUrl.pathname !== '/' ||
    supabaseUrl.search ||
    supabaseUrl.hash ||
    !PROJECT_REF_PATTERN.test(projectRef) ||
    supabaseUrl.hostname !== `${projectRef}.supabase.co` ||
    databaseUrl.protocol !== 'postgresql:' ||
    databaseUrl.hostname !== `db.${projectRef}.supabase.co` ||
    databaseUrl.port !== '5432' ||
    databaseUrl.pathname !== '/postgres' ||
    databaseUrl.hash ||
    !databaseUrl.username ||
    !databaseUrl.password ||
    /[\u0000-\u001f\u007f]/.test(
      `${decodeURIComponent(databaseUrl.username)}${decodeURIComponent(databaseUrl.password)}`
    )
  ) {
    throw new Error('Supabase endpoint configuration is outside policy');
  }
  if (
    !/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(poolerHost) ||
    !/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(
      mediaBlobHost
    )
  ) {
    throw new Error('External production host pin is invalid');
  }
  const managementToken = (
    await readPrivateFile(
      managementTokenFile,
      'Supabase management token'
    )
  ).trim();
  if (
    managementToken.length < 32 ||
    managementToken.length > 4096 ||
    /[\s\u0000-\u001f\u007f]/.test(managementToken)
  ) {
    throw new Error('Supabase management token is malformed');
  }
  const caInfo = await lstat(PINNED_SUPABASE_CA_FILE);
  if (
    caInfo.isSymbolicLink() ||
    !caInfo.isFile() ||
    caInfo.uid !== 0 ||
    (caInfo.mode & 0o022) !== 0 ||
    caInfo.size !== 1367 ||
    await sha256File(PINNED_SUPABASE_CA_FILE) !==
      PINNED_SUPABASE_CA_SHA256
  ) {
    throw new Error('Pinned Supabase root certificate is unsafe');
  }
  return {
    projectRef,
    poolerHost,
    mediaBlobHost,
    database: 'postgres',
    username:
      `${decodeURIComponent(databaseUrl.username)}.${projectRef}`,
    password: decodeURIComponent(databaseUrl.password),
    managementToken,
    caFile: PINNED_SUPABASE_CA_FILE,
    postgresImage: PINNED_POSTGRES_IMAGE
  };
}

function childCompletion(
  child,
  label,
  stderrChunks = [],
  timeoutMs
) {
  if (
    timeoutMs !== undefined &&
    (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1
    )
  ) {
    throw new Error(`${label} timeout is invalid`);
  }
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let timedOut = false;
    let timeoutHandle;
    let killHandle;
    const clearTimers = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (killHandle) clearTimeout(killHandle);
    };
    child.once('error', () => {
      if (!settled) {
        settled = true;
        clearTimers();
        rejectPromise(new Error(`${label} could not start`));
      }
    });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimers();
      if (timedOut) {
        rejectPromise(
          new Error(`${label} exceeded its stage deadline`)
        );
      } else if (code === 0) resolvePromise();
      else {
        const detail = Buffer.concat(stderrChunks)
          .toString('utf8')
          .replace(/[^\x20-\x7e]/g, ' ')
          .slice(0, 512);
        rejectPromise(
          new Error(`${label} failed${detail ? `: ${detail}` : ''}`)
        );
      }
    });
    if (timeoutMs !== undefined) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        killHandle = setTimeout(
          () => child.kill('SIGKILL'),
          5_000
        );
        killHandle.unref();
      }, timeoutMs);
      timeoutHandle.unref();
    }
  });
}

function isExpectedConsumerClose(error) {
  return (
    error?.code === 'EPIPE' ||
    error?.code === 'ERR_STREAM_PREMATURE_CLOSE'
  );
}

export function databaseDockerArgs(configuration, tool, toolArgs) {
  return [
    'run',
    '--rm',
    '-i',
    '--mount',
    `type=bind,src=${configuration.caFile},dst=${CONTAINER_SUPABASE_CA_FILE},readonly`,
    PINNED_POSTGRES_IMAGE,
    'sh',
    '-ceu',
    `IFS= read -r PGPASSWORD; export PGPASSWORD PGSSLMODE=verify-full PGSSLROOTCERT=${CONTAINER_SUPABASE_CA_FILE}; exec "$@"`,
    'openclaw-backup-db-tool',
    tool,
    '--host',
    configuration.poolerHost,
    '--port',
    '5432',
    '--username',
    configuration.username,
    '--dbname',
    configuration.database,
    ...toolArgs
  ];
}

function attachBoundedStderr(child) {
  const chunks = [];
  let bytes = 0;
  child.stderr.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes <= 4096) chunks.push(Buffer.from(chunk));
  });
  return chunks;
}

async function beginExportedSnapshot(configuration) {
  const child = spawn(
    'docker',
    databaseDockerArgs(configuration, 'psql', [
      '--no-psqlrc',
      '--set',
      'ON_ERROR_STOP=1',
      '--tuples-only',
      '--no-align',
      '--quiet'
    ]),
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const stderrChunks = attachBoundedStderr(child);
  child.stdin.on('error', () => {});
  const completion = childCompletion(
    child,
    'Supabase snapshot exporter',
    stderrChunks,
    SNAPSHOT_LIFETIME_TIMEOUT_MS
  );
  let outputBytes = 0;
  let remainder = '';
  let snapshotId = null;
  let publicSchemaBytes = null;
  const mediaRows = [];
  let inMedia = false;
  let readySettled = false;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolvePromise, rejectPromise) => {
    resolveReady = resolvePromise;
    rejectReady = rejectPromise;
  });
  const rejectBeforeReady = (error) => {
    if (!readySettled) {
      readySettled = true;
      rejectReady(error);
    }
  };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (data) => {
    outputBytes += Buffer.byteLength(data, 'utf8');
    if (outputBytes > MAX_EXPORTER_OUTPUT_BYTES) {
      child.kill('SIGKILL');
      rejectBeforeReady(
        new Error('Supabase snapshot exporter output exceeded its cap')
      );
      return;
    }
    const lines = `${remainder}${data}`.split('\n');
    remainder = lines.pop() || '';
    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '');
      if (line.startsWith('__OPENCLAW_SNAPSHOT__')) {
        snapshotId = line.slice('__OPENCLAW_SNAPSHOT__'.length);
      } else if (
        line.startsWith('__OPENCLAW_PUBLIC_BYTES__')
      ) {
        const value = line.slice(
          '__OPENCLAW_PUBLIC_BYTES__'.length
        );
        if (!/^[0-9]+$/.test(value)) {
          rejectBeforeReady(
            new Error(
              'Supabase public schema size estimate is invalid'
            )
          );
        } else {
          publicSchemaBytes = Number(value);
        }
      } else if (line === '__OPENCLAW_MEDIA_BEGIN__') {
        inMedia = true;
      } else if (line === '__OPENCLAW_MEDIA_END__') {
        inMedia = false;
      } else if (line === '__OPENCLAW_READY__') {
        if (
          !snapshotId ||
          !/^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$/.test(
            snapshotId
          ) ||
          !Number.isSafeInteger(publicSchemaBytes) ||
          publicSchemaBytes < 0
        ) {
          rejectBeforeReady(
            new Error('Supabase exported snapshot identifier is invalid')
          );
        } else if (!readySettled) {
          readySettled = true;
          resolveReady();
        }
      } else if (inMedia && line) {
        if (
          !/^[a-f0-9]+$/.test(line) ||
          line.length % 2 !== 0
        ) {
          rejectBeforeReady(
            new Error('Supabase media inventory stream is invalid')
          );
          continue;
        }
        try {
          mediaRows.push(
            JSON.parse(Buffer.from(line, 'hex').toString('utf8'))
          );
        } catch {
          rejectBeforeReady(
            new Error('Supabase media inventory row is invalid')
          );
        }
      }
    }
  });
  completion.catch(rejectBeforeReady);
  child.stdin.write(`${configuration.password}\n`);
  child.stdin.write(
    [
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;',
      "SELECT '__OPENCLAW_SNAPSHOT__' || pg_export_snapshot();",
      "SELECT '__OPENCLAW_PUBLIC_BYTES__' || COALESCE(SUM(pg_total_relation_size(format('%I.%I', schemaname, tablename)::regclass)), 0) FROM pg_tables WHERE schemaname = 'public';",
      '\\echo __OPENCLAW_MEDIA_BEGIN__',
      "COPY (SELECT encode(convert_to(to_jsonb(asset)::text, 'UTF8'), 'hex') FROM public.content_media_assets AS asset ORDER BY asset.id) TO STDOUT;",
      '\\echo __OPENCLAW_MEDIA_END__',
      '\\echo __OPENCLAW_READY__',
      ''
    ].join('\n')
  );
  const startupTimeout = setTimeout(() => {
    rejectBeforeReady(
      new Error('Supabase snapshot exporter startup timed out')
    );
  }, SNAPSHOT_STARTUP_TIMEOUT_MS);
  try {
    await ready;
  } catch (error) {
    if (!child.stdin.destroyed) {
      child.stdin.end('ROLLBACK;\n\\q\n');
    }
    const killTimeout = setTimeout(
      () => child.kill('SIGKILL'),
      2000
    );
    try {
      await completion;
    } catch {
      // The bounded startup failure remains authoritative.
    } finally {
      clearTimeout(killTimeout);
    }
    throw error;
  } finally {
    clearTimeout(startupTimeout);
  }
  return {
    child,
    completion,
    snapshotId,
    publicSchemaBytes,
    mediaRows,
    async close() {
      if (!child.stdin.destroyed) {
        child.stdin.end('ROLLBACK;\n\\q\n');
      }
      let closeTimedOut = false;
      let killTimeout;
      const timeout = setTimeout(() => {
        closeTimedOut = true;
        child.kill('SIGTERM');
        killTimeout = setTimeout(
          () => child.kill('SIGKILL'),
          5_000
        );
        killTimeout.unref();
      }, SNAPSHOT_CLOSE_TIMEOUT_MS);
      timeout.unref();
      try {
        await completion;
      } catch (error) {
        if (closeTimedOut) {
          throw new Error(
            'Supabase snapshot exporter close exceeded its stage deadline',
            { cause: error }
          );
        }
        throw error;
      } finally {
        clearTimeout(timeout);
        if (killTimeout) clearTimeout(killTimeout);
      }
    },
    async abort() {
      if (!child.stdin.destroyed) {
        child.stdin.end('ROLLBACK;\n\\q\n');
      }
      const timeout = setTimeout(() => child.kill('SIGKILL'), 2000);
      try {
        await completion;
      } catch {
        // The original capture error remains authoritative.
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

async function createSupabasePublicDump(
  configuration,
  snapshotId,
  destination,
  maxBytes
) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error('Supabase public dump byte limit is invalid');
  }
  await mkdir(dirname(destination), {
    recursive: true,
    mode: 0o700
  });
  const output = await open(destination, 'wx', 0o600);
  const child = spawn(
    'docker',
    databaseDockerArgs(configuration, 'pg_dump', [
      '--format=custom',
      '--schema=public',
      '--no-owner',
      '--no-privileges',
      '--no-subscriptions',
      '--no-publications',
      `--snapshot=${snapshotId}`
    ]),
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const stderrChunks = attachBoundedStderr(child);
  child.stdin.on('error', () => {});
  const completion = childCompletion(
    child,
    'Supabase public dump',
    stderrChunks,
    PUBLIC_DUMP_TIMEOUT_MS
  );
  child.stdin.end(`${configuration.password}\n`);
  let bytes = 0;
  try {
    for await (const chunk of child.stdout) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        child.kill('SIGKILL');
        await completion.catch(() => {});
        throw new Error(
          'Supabase public dump exceeded its staging limit'
        );
      }
      await output.write(chunk);
    }
    await completion;
  } catch (error) {
    child.kill('SIGKILL');
    await completion.catch(() => {});
    throw error;
  } finally {
    await output.close();
  }
  await chmod(destination, 0o600);
}

export async function verifySupabasePublicDump(destination) {
  const header = Buffer.alloc(5);
  // Open the dump once, without following links, before starting Docker.
  // Reopening after spawn leaves a race where an attacker can replace the
  // path and an O_NOFOLLOW failure strands pg_restore waiting on stdin.
  const dump = await open(
    destination,
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  let dumpStream;
  try {
    await dump.read(header, 0, header.length, 0);
    if (header.toString('ascii') !== 'PGDMP') {
      throw new Error('Supabase public dump header is invalid');
    }

    const child = spawn(
      'docker',
      [
        'run',
        '--rm',
        '--interactive',
        '--network',
        'none',
        '--read-only',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--pids-limit',
        '64',
        PINNED_POSTGRES_IMAGE,
        'pg_restore',
        '--list'
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );
    child.stdin.on('error', () => {});
    const stderrChunks = attachBoundedStderr(child);
    const completion = childCompletion(
      child,
      'Supabase public dump listing',
      stderrChunks,
      PUBLIC_DUMP_VERIFY_TIMEOUT_MS
    );
    const chunks = [];
    let bytes = 0;
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_TOC_BYTES) child.kill('SIGKILL');
      else chunks.push(Buffer.from(chunk));
    });
    try {
      dumpStream = dump.createReadStream({ start: 0 });
      const transfer = pipeline(dumpStream, child.stdin).catch(
        (error) => {
          // pg_restore --list only needs the archive header and TOC. For a
          // dump with data blocks it can exit 0 before consuming every byte,
          // which can close its stdin with either EPIPE or Node's
          // ERR_STREAM_PREMATURE_CLOSE depending on event timing. Both remain
          // conditional on child exit 0 and a valid policy-approved TOC.
          if (!isExpectedConsumerClose(error)) {
            child.kill('SIGKILL');
          }
          throw error;
        }
      );
      const [transferResult, completionResult] =
        await Promise.allSettled([transfer, completion]);
      if (completionResult.status === 'rejected') {
        throw completionResult.reason;
      }
      if (
        transferResult.status === 'rejected' &&
        !isExpectedConsumerClose(transferResult.reason)
      ) {
        const code = transferResult.reason?.code;
        throw new Error(
          `Supabase public dump stream failed${code ? ` (${code})` : ''}`,
          { cause: transferResult.reason }
        );
      }
    } catch (error) {
      child.kill('SIGKILL');
      child.stdin.destroy();
      await completion.catch(() => {});
      throw error;
    }
    if (bytes <= 0 || bytes > MAX_TOC_BYTES) {
      throw new Error('Supabase public dump TOC is invalid');
    }
    const toc = Buffer.concat(chunks).toString('utf8');
    const entries = toc
      .split('\n')
      .filter((line) => line && !line.startsWith(';'));
    if (
      entries.length < 1 ||
      entries.some(
        (line) =>
          /\bauth\b/i.test(line) ||
          /\bACL\b/.test(line) ||
          /\bOWNER\b/.test(line) ||
          /\bPUBLICATION\b/.test(line) ||
          /\bSUBSCRIPTION\b/.test(line)
      )
    ) {
      throw new Error('Supabase public dump TOC violates policy');
    }
    return {
      tocSha256: sha256Text(toc),
      tocEntries: entries.length
    };
  } finally {
    dumpStream?.destroy();
    await dump.close();
  }
}

async function readBoundedJsonResponse(
  response,
  maxBytes = MAX_MANAGEMENT_RESPONSE_BYTES
) {
  const declared = response.headers.get('content-length');
  const contentType = normalizedContentType(
    response.headers.get('content-type')
  );
  if (
    contentType !== 'application/json' ||
    declared !== null &&
    (
      !/^[0-9]+$/.test(declared) ||
      Number(declared) > maxBytes
    )
  ) {
    await response.body?.cancel().catch(() => {});
    throw new Error('Supabase management response contract is invalid');
  }
  if (!response.body) {
    throw new Error('Supabase management response is invalid');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let byteCount = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      byteCount += chunk.length;
      if (byteCount > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(
          'Supabase management response exceeded its cap'
        );
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks, byteCount);
  if (
    bytes.length <= 0 ||
    bytes.length > maxBytes
  ) {
    throw new Error('Supabase management response is invalid');
  }
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('Supabase management response is not JSON');
  }
}

function assertManagementConfiguration(configuration) {
  if (
    !configuration ||
    !PROJECT_REF_PATTERN.test(configuration.projectRef) ||
    typeof configuration.managementToken !== 'string' ||
    configuration.managementToken.length < 32 ||
    configuration.managementToken.length > 4096 ||
    /[\s\u0000-\u001f\u007f]/.test(
      configuration.managementToken
    )
  ) {
    throw new Error('Supabase management configuration is invalid');
  }
}

function managementEndpoint(projectRef, endpointPath) {
  if (
    !PROJECT_REF_PATTERN.test(projectRef) ||
    typeof endpointPath !== 'string' ||
    !/^[a-z0-9][a-z0-9/-]*$/.test(endpointPath) ||
    endpointPath.includes('//')
  ) {
    throw new Error('Supabase management endpoint is invalid');
  }
  const endpoint = new URL(
    `/v1/projects/${projectRef}/${endpointPath}`,
    SUPABASE_MANAGEMENT_ORIGIN
  );
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.hostname !== 'api.supabase.com' ||
    endpoint.port ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.origin !== SUPABASE_MANAGEMENT_ORIGIN
  ) {
    throw new Error('Supabase management endpoint is outside policy');
  }
  return endpoint.href;
}

async function managementQuery(configuration, query) {
  assertManagementConfiguration(configuration);
  const normalizedQuery = String(query || '').trim();
  if (
    !/^SELECT\b/i.test(normalizedQuery) ||
    /;|--|\/\*/.test(normalizedQuery)
  ) {
    throw new Error('Supabase management query is not read-only');
  }
  const endpoint = managementEndpoint(
    configuration.projectRef,
    'database/query/read-only'
  );
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(30 * 1000),
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${configuration.managementToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ query: normalizedQuery })
    });
  } catch {
    throw new Error('Supabase management query failed');
  }
  if (response.status !== 200 && response.status !== 201) {
    await response.body?.cancel().catch(() => {});
    throw new Error('Supabase management query failed');
  }
  const value = await readBoundedJsonResponse(response);
  if (!Array.isArray(value)) {
    throw new Error('Supabase management query result is invalid');
  }
  return value;
}

export async function exportAuthData(configuration) {
  const schemaRows = await managementQuery(
    configuration,
    `SELECT table_name, column_name, ordinal_position, data_type, udt_name,
            is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'auth'
      ORDER BY table_name, ordinal_position`
  );
  const tables = [
    ...new Set(
      schemaRows.map((row) => row.table_name)
    )
  ];
  if (
    tables.length < 2 ||
    !tables.includes('users') ||
    !tables.includes('identities') ||
    tables.some(
      (table) =>
        typeof table !== 'string' ||
        !SAFE_TABLE_PATTERN.test(table)
    )
  ) {
    throw new Error('Supabase Auth schema inventory is invalid');
  }
  const union = tables
    .map(
      (table) =>
        `SELECT '${table}'::text AS table_name,
                COALESCE(
                  (SELECT jsonb_agg(to_jsonb(value) ORDER BY to_jsonb(value)::text)
                     FROM auth."${table}" AS value),
                  '[]'::jsonb
                ) AS rows`
    )
    .join('\nUNION ALL\n');
  const dataRows = await managementQuery(
    configuration,
    `SELECT table_name, rows
       FROM (${union}) AS auth_export
      ORDER BY table_name`
  );
  if (
    dataRows.length !== tables.length ||
    dataRows.some(
      (entry, index) =>
        entry.table_name !== tables[index] ||
        !Array.isArray(entry.rows)
    )
  ) {
    throw new Error('Supabase Auth data export is incomplete');
  }
  const users = dataRows.find(
    (entry) => entry.table_name === 'users'
  )?.rows.length;
  return canonicalize({
    schema: 'openclaw-supabase-auth-export/v1',
    projectRefSha256: sha256Text(configuration.projectRef),
    columns: schemaRows,
    tables: dataRows,
    tableCount: tables.length,
    userCount: users
  });
}

function validateOpaqueJsonMetadata(value) {
  if (
    value === null ||
    typeof value !== 'object'
  ) {
    throw new Error(
      'Supabase Auth control-plane response is invalid'
    );
  }
  const stack = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    nodes += 1;
    if (nodes > 100000 || current.depth > 32) {
      throw new Error(
        'Supabase Auth control-plane response is too complex'
      );
    }
    if (current.value === null) continue;
    if (typeof current.value === 'string') {
      if (
        Buffer.byteLength(current.value, 'utf8') >
        1024 * 1024
      ) {
        throw new Error(
          'Supabase Auth control-plane string is too large'
        );
      }
      continue;
    }
    if (typeof current.value === 'number') {
      if (!Number.isFinite(current.value)) {
        throw new Error(
          'Supabase Auth control-plane number is invalid'
        );
      }
      continue;
    }
    if (typeof current.value === 'boolean') continue;
    if (typeof current.value !== 'object') {
      throw new Error(
        'Supabase Auth control-plane value is invalid'
      );
    }
    if (Array.isArray(current.value)) {
      for (const entry of current.value) {
        stack.push({
          value: entry,
          depth: current.depth + 1
        });
      }
      continue;
    }
    for (const [key, entry] of Object.entries(current.value)) {
      if (
        !key ||
        Buffer.byteLength(key, 'utf8') > 4096 ||
        /[\u0000-\u001f\u007f]/.test(key)
      ) {
        throw new Error(
          'Supabase Auth control-plane object key is invalid'
        );
      }
      stack.push({
        value: entry,
        depth: current.depth + 1
      });
    }
  }
  return value;
}

function jsonPointerSegment(value) {
  return String(value)
    .replaceAll('~', '~0')
    .replaceAll('/', '~1');
}

function findUnrestorableControlPlanePaths(value) {
  const paths = [];
  const inspect = (entry, path) => {
    if (entry === null) {
      paths.push(path || '/');
      return;
    }
    if (
      typeof entry === 'string' &&
      (
        /\*{3,}|•{3,}/u.test(entry) ||
        /^(?:<|\[)?redacted(?:>|\])?$/i.test(entry)
      )
    ) {
      paths.push(path || '/');
      return;
    }
    if (Array.isArray(entry)) {
      entry.forEach((child, index) =>
        inspect(child, `${path}/${index}`)
      );
      return;
    }
    if (entry && typeof entry === 'object') {
      for (const [key, child] of Object.entries(entry)) {
        inspect(
          child,
          `${path}/${jsonPointerSegment(key)}`
        );
      }
    }
  };
  inspect(value, '');
  return paths.toSorted((left, right) =>
    Buffer.compare(
      Buffer.from(left, 'utf8'),
      Buffer.from(right, 'utf8')
    )
  );
}

async function fetchAuthControlPlaneResponse(
  configuration,
  descriptor,
  signal
) {
  const endpoint = managementEndpoint(
    configuration.projectRef,
    descriptor.endpointPath
  );
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      signal,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${configuration.managementToken}`
      }
    });
  } catch {
    throw new Error(
      'Supabase Auth control-plane request failed'
    );
  }
  if (!descriptor.allowedStatuses.includes(response.status)) {
    await response.body?.cancel().catch(() => {});
    throw new Error(
      'Supabase Auth control-plane request failed'
    );
  }
  if (response.status === 404) {
    await response.body?.cancel().catch(() => {});
    return {
      descriptor,
      httpStatus: 404,
      response: null,
      unrestorablePaths: []
    };
  }
  const value = await readBoundedJsonResponse(
    response,
    MAX_AUTH_CONTROL_PLANE_RESPONSE_BYTES
  );
  validateOpaqueJsonMetadata(value);
  return {
    descriptor,
    httpStatus: response.status,
    response: value,
    unrestorablePaths:
      findUnrestorableControlPlanePaths(value)
  };
}

async function fetchSupabaseAuthControlPlane(configuration) {
  assertManagementConfiguration(configuration);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    AUTH_CONTROL_PLANE_TIMEOUT_MS
  );
  timeout.unref?.();
  const requests = SUPABASE_AUTH_CONTROL_PLANE_ENDPOINTS.map(
    (descriptor) =>
      fetchAuthControlPlaneResponse(
        configuration,
        descriptor,
        controller.signal
      )
  );
  try {
    const responses = await Promise.all(requests);
    const totalResponseBytes = responses.reduce(
      (total, result) =>
        total +
        Buffer.byteLength(
          canonicalJson({
            id: result.descriptor.id,
            httpStatus: result.httpStatus,
            unrestorablePaths: result.unrestorablePaths,
            response: result.response
          }),
          'utf8'
        ),
      0
    );
    if (
      !Number.isSafeInteger(totalResponseBytes) ||
      totalResponseBytes <= 0 ||
      totalResponseBytes >
        MAX_AUTH_CONTROL_PLANE_TOTAL_BYTES
    ) {
      throw new Error(
        'Supabase Auth control-plane responses exceeded their aggregate cap'
      );
    }
    return responses;
  } catch {
    controller.abort();
    await Promise.allSettled(requests);
    throw new Error(
      'Supabase Auth control-plane capture failed'
    );
  } finally {
    clearTimeout(timeout);
  }
}

function canonicalAuthControlPlaneSnapshot(responses) {
  return canonicalJson(
    responses.map((result) => ({
      id: result.descriptor.id,
      endpointPath: result.descriptor.endpointPath,
      httpStatus: result.httpStatus,
      unrestorablePaths: result.unrestorablePaths,
      response: result.response
    }))
  );
}

function assertMatchingAuthControlPlaneSnapshots(before, after) {
  if (
    canonicalAuthControlPlaneSnapshot(before) !==
    canonicalAuthControlPlaneSnapshot(after)
  ) {
    throw new Error(
      'Supabase Auth control-plane metadata changed during production capture'
    );
  }
}

function authControlPlaneRootSha256(artifacts) {
  const leaves = artifacts.map((artifact) =>
    sha256Text(
      canonicalJson({
        id: artifact.id,
        endpointPath: artifact.endpointPath,
        httpStatus: artifact.httpStatus,
        unrestorableValueCount:
          artifact.unrestorableValueCount,
        bytes: artifact.bytes,
        sha256: artifact.sha256
      })
    )
  );
  return sha256Text(`${leaves.join('\n')}\n`);
}

async function writeSupabaseAuthControlPlane({
  metadataRoot,
  captureId,
  configuration,
  responses,
  maxBytes = MAX_AUTH_CONTROL_PLANE_TOTAL_BYTES
}) {
  if (!SET_ID_PATTERN.test(captureId)) {
    throw new Error(
      'Supabase Auth control-plane capture ID is invalid'
    );
  }
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > MAX_AUTH_CONTROL_PLANE_TOTAL_BYTES
  ) {
    throw new Error(
      'Supabase Auth control-plane execution limit is invalid'
    );
  }
  const capturedAt = new Date().toISOString();
  const projectRefSha256 = sha256Text(
    configuration.projectRef
  );
  const prepared = responses.map(
    ({
      descriptor,
      httpStatus,
      response,
      unrestorablePaths
    }) => {
      const body = {
        schema:
          SUPABASE_AUTH_CONTROL_PLANE_RESPONSE_SCHEMA,
        captureId,
        projectRefSha256,
        endpointId: descriptor.id,
        endpointPath: descriptor.endpointPath,
        method: 'GET',
        httpStatus,
        capturedAt,
        unrestorablePaths,
        response
      };
      const source = `${canonicalJson(body)}\n`;
      return {
        descriptor,
        body,
        source,
        sourceBytes: Buffer.byteLength(source, 'utf8')
      };
    }
  );
  const totalPreparedBytes = prepared.reduce(
    (total, artifact) => total + artifact.sourceBytes,
    0
  );
  if (
    !Number.isSafeInteger(totalPreparedBytes) ||
    totalPreparedBytes <= 0 ||
    totalPreparedBytes > maxBytes
  ) {
    throw new Error(
      'Supabase Auth control-plane capture exceeded its cap'
    );
  }
  const destinationRoot = join(
    metadataRoot,
    'external',
    'agent-os-production',
    'auth-control-plane'
  );
  await mkdir(destinationRoot, {
    recursive: true,
    mode: 0o700
  });
  const artifacts = [];
  for (const artifact of prepared) {
    const path = join(
      destinationRoot,
      artifact.descriptor.archiveName
    );
    await writeFile(path, artifact.source, {
      mode: 0o600,
      flag: 'wx'
    });
    await chmod(path, 0o600);
    const info = await stat(path);
    if (info.size !== artifact.sourceBytes) {
      throw new Error(
        'Supabase Auth control-plane write was incomplete'
      );
    }
    artifacts.push({
      id: artifact.descriptor.id,
      endpointPath: artifact.descriptor.endpointPath,
      archivePath: relative(metadataRoot, path)
        .split(sep)
        .join('/'),
      httpStatus: artifact.body.httpStatus,
      unrestorableValueCount:
        artifact.body.unrestorablePaths.length,
      bytes: info.size,
      sha256: await sha256File(path)
    });
  }
  const summary = {
    schema: SUPABASE_AUTH_CONTROL_PLANE_SCHEMA,
    consistency: 'canonical-before-after',
    artifactCount: artifacts.length,
    unrestorableValueCount: artifacts.reduce(
      (total, artifact) =>
        total + artifact.unrestorableValueCount,
      0
    ),
    totalBytes: artifacts.reduce(
      (total, artifact) => total + artifact.bytes,
      0
    ),
    rootSha256: authControlPlaneRootSha256(artifacts),
    artifacts
  };
  validateAuthControlPlaneSummary(summary);
  return summary;
}

export async function captureSupabaseAuthControlPlane({
  metadataRoot,
  captureId,
  configuration
}) {
  if (!SET_ID_PATTERN.test(captureId)) {
    throw new Error(
      'Supabase Auth control-plane capture ID is invalid'
    );
  }
  const privateMetadataRoot =
    await assertPrivateTmpfsMetadataRoot(metadataRoot);
  const before =
    await fetchSupabaseAuthControlPlane(configuration);
  const after =
    await fetchSupabaseAuthControlPlane(configuration);
  assertMatchingAuthControlPlaneSnapshots(before, after);
  return writeSupabaseAuthControlPlane({
    metadataRoot: privateMetadataRoot,
    captureId,
    configuration,
    responses: before
  });
}

function validateMediaUrl(rawUrl, expectedHost) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Production media URL is invalid');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== expectedHost ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith('/') ||
    url.pathname === '/'
  ) {
    throw new Error('Production media URL is outside the pinned store');
  }
  return url;
}

async function collectWithConcurrency(
  values,
  concurrency,
  worker
) {
  const results = Array.from({ length: values.length });
  let nextIndex = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(values[index]);
      }
    }
  );
  await Promise.all(runners);
  return results;
}

async function headMediaObjectSize(url) {
  const response = await fetch(url, {
    method: 'HEAD',
    redirect: 'error',
    signal: AbortSignal.timeout(30 * 1000)
  });
  if (!response.ok) {
    throw new Error(
      'Production media size preflight failed'
    );
  }
  const length = response.headers.get('content-length');
  if (
    length === null ||
    !/^[0-9]+$/.test(length) ||
    !Number.isSafeInteger(Number(length)) ||
    Number(length) < 0 ||
    Number(length) > MAX_MEDIA_OBJECT_BYTES
  ) {
    throw new Error(
      'Production media HEAD size is invalid'
    );
  }
  return Number(length);
}

function normalizedContentType(value) {
  return String(value || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
}

async function downloadMediaObject(
  url,
  destinationRoot,
  expectedContentTypes,
  declaredBytes,
  remainingBytes
) {
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(2 * 60 * 1000)
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw new Error('Production media object could not be downloaded');
  }
  const responseType = normalizedContentType(
    response.headers.get('content-type')
  );
  if (
    !responseType ||
    (
      expectedContentTypes.size > 0 &&
      !expectedContentTypes.has(responseType)
    )
  ) {
    await response.body.cancel().catch(() => {});
    throw new Error('Production media content type changed');
  }
  const declaredLength = response.headers.get('content-length');
  if (
    declaredLength !== null &&
    (
      !/^[0-9]+$/.test(declaredLength) ||
      Number(declaredLength) > MAX_MEDIA_OBJECT_BYTES ||
      Number(declaredLength) > remainingBytes
    )
  ) {
    await response.body.cancel().catch(() => {});
    throw new Error('Production media object exceeds its size cap');
  }
  const temporary = join(
    destinationRoot,
    `.download-${randomBytes(12).toString('hex')}`
  );
  const output = await open(temporary, 'wx', 0o600);
  const hash = createHash('sha256');
  let bytes = 0;
  try {
    for await (const chunk of response.body) {
      const buffer = Buffer.from(chunk);
      bytes += buffer.length;
      if (
        bytes > MAX_MEDIA_OBJECT_BYTES ||
        bytes > remainingBytes
      ) {
        throw new Error(
          'Production media object exceeds its size cap'
        );
      }
      hash.update(buffer);
      await output.write(buffer);
    }
  } catch (error) {
    await output.close().catch(() => {});
    await unlink(temporary).catch(() => {});
    throw error;
  }
  await output.close();
  if (
    (declaredLength !== null &&
      bytes !== Number(declaredLength)) ||
    (
      declaredBytes !== null &&
      bytes !== declaredBytes
    )
  ) {
    await unlink(temporary).catch(() => {});
    throw new Error('Production media object size changed');
  }
  const sha256 = hash.digest('hex');
  const destination = join(destinationRoot, sha256);
  try {
    await link(temporary, destination);
    await chmod(destination, 0o600);
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      await unlink(temporary).catch(() => {});
      throw error;
    }
    const existing = await stat(destination);
    if (
      existing.size !== bytes ||
      (await sha256File(destination)) !== sha256
    ) {
      await unlink(temporary).catch(() => {});
      throw new Error('Production media content hash collided', {
        cause: error
      });
    }
  }
  await unlink(temporary);
  return {
    bytes,
    sha256,
    contentType: responseType,
    etag: response.headers.get('etag') || null,
    destination
  };
}

async function captureMedia(
  rows,
  metadataRoot,
  configuration,
  captureId,
  onProgress,
  { maxObjects, maxTotalBytes }
) {
  if (
    !Number.isSafeInteger(maxObjects) ||
    maxObjects < 0 ||
    !Number.isSafeInteger(maxTotalBytes) ||
    maxTotalBytes < 0 ||
    maxTotalBytes > MAX_MEDIA_TOTAL_BYTES
  ) {
    throw new Error('Production media execution limits are invalid');
  }
  const grouped = new Map();
  const normalizedRows = [];
  for (const row of rows) {
    const urlValue = row?.blob_url;
    if (
      typeof row?.id !== 'string' ||
      typeof urlValue !== 'string' ||
      !urlValue
    ) {
      throw new Error('Production media reference is incomplete');
    }
    const url = validateMediaUrl(
      urlValue,
      configuration.mediaBlobHost
    );
    const key = url.href;
    const bytes =
      row.bytes === null || row.bytes === undefined
        ? null
        : Number(row.bytes);
    if (
      bytes !== null &&
      (!Number.isSafeInteger(bytes) || bytes < 0)
    ) {
      throw new Error('Production media declared size is invalid');
    }
    const contentType = normalizedContentType(row.content_type);
    const group = grouped.get(key) || {
      url,
      declaredBytes: new Set(),
      contentTypes: new Set()
    };
    if (bytes !== null) group.declaredBytes.add(bytes);
    if (contentType) group.contentTypes.add(contentType);
    grouped.set(key, group);
    normalizedRows.push({
      record: row,
      urlSha256: sha256Text(key)
    });
  }
  for (const group of grouped.values()) {
    if (group.declaredBytes.size > 1) {
      throw new Error(
        'Production media references disagree on object size'
      );
    }
  }

  const objectsRoot = join(
    metadataRoot,
    'external',
    'agent-os-production',
    'media-objects'
  );
  await mkdir(objectsRoot, { recursive: true, mode: 0o700 });
  const objects = [];
  let totalBytes = 0;
  const sortedGroups = [...grouped.entries()].toSorted(
    ([left], [right]) =>
      Buffer.compare(
        Buffer.from(left, 'utf8'),
        Buffer.from(right, 'utf8')
      )
  );
  if (sortedGroups.length > maxObjects) {
    throw new Error(
      'Production media object count exceeded its preflight limit'
    );
  }
  for (const [urlValue, group] of sortedGroups) {
    const result = await downloadMediaObject(
      group.url,
      objectsRoot,
      group.contentTypes,
      group.declaredBytes.size === 1
        ? [...group.declaredBytes][0]
        : null,
      Math.min(
        MAX_MEDIA_TOTAL_BYTES - totalBytes,
        maxTotalBytes - totalBytes
      )
    );
    totalBytes += result.bytes;
    const archivePath = relative(
      metadataRoot,
      result.destination
    ).split(sep).join('/');
    objects.push({
      url: urlValue,
      urlSha256: sha256Text(urlValue),
      archivePath,
      bytes: result.bytes,
      sha256: result.sha256,
      contentType: result.contentType,
      etag: result.etag,
      declaredBytes:
        group.declaredBytes.size === 1
          ? [...group.declaredBytes][0]
          : null
    });
    onProgress({
      stage: 'media',
      completed: objects.length,
      total: sortedGroups.length
    });
  }
  const leaves = objects.map((object) =>
    sha256Text(
      canonicalJson({
        urlSha256: object.urlSha256,
        bytes: object.bytes,
        sha256: object.sha256,
        contentType: object.contentType
      })
    )
  );
  const objectRootSha256 = sha256Text(`${leaves.join('\n')}\n`);
  const inventory = {
    schema: 'openclaw-vercel-media-export/v1',
    captureId,
    sourceTable: 'public.content_media_assets',
    mediaBlobHost: configuration.mediaBlobHost,
    rows: normalizedRows,
    objects,
    rowCount: normalizedRows.length,
    uniqueObjectCount: objects.length,
    totalBytes,
    objectRootSha256
  };
  const inventoryPath = join(
    metadataRoot,
    'external',
    'agent-os-production',
    'media-inventory.json'
  );
  await writeFile(
    inventoryPath,
    `${canonicalJson(inventory)}\n`,
    { mode: 0o600, flag: 'wx' }
  );
  await chmod(inventoryPath, 0o600);
  const inventoryInfo = await stat(inventoryPath);
  return {
    inventoryPath: relative(metadataRoot, inventoryPath)
      .split(sep)
      .join('/'),
    inventoryBytes: inventoryInfo.size,
    inventorySha256: await sha256File(inventoryPath),
    rowCount: inventory.rowCount,
    uniqueObjectCount: inventory.uniqueObjectCount,
    totalBytes: inventory.totalBytes,
    objectRootSha256
  };
}

export async function captureProductionData({
  metadataRoot,
  captureId,
  configuration,
  limits,
  onProgress = () => {}
}) {
  if (!SET_ID_PATTERN.test(captureId)) {
    throw new Error(
      'Production data capture ID is invalid'
    );
  }
  metadataRoot =
    await assertPrivateTmpfsMetadataRoot(metadataRoot);
  if (
    !limits ||
    !Number.isSafeInteger(limits.publicSchemaBytes) ||
    limits.publicSchemaBytes < 0 ||
    !Number.isSafeInteger(limits.publicDumpBytes) ||
    limits.publicDumpBytes < 1 ||
    !Number.isSafeInteger(limits.authBytes) ||
    limits.authBytes < 1 ||
    limits.authBytes > MAX_MANAGEMENT_RESPONSE_BYTES ||
    !Number.isSafeInteger(limits.authControlPlaneBytes) ||
    limits.authControlPlaneBytes < 1 ||
    limits.authControlPlaneBytes >
      MAX_AUTH_CONTROL_PLANE_TOTAL_BYTES ||
    !Number.isSafeInteger(limits.mediaRows) ||
    limits.mediaRows < 0 ||
    !Number.isSafeInteger(limits.mediaObjects) ||
    limits.mediaObjects < 0 ||
    !Number.isSafeInteger(limits.mediaBytes) ||
    limits.mediaBytes < 0 ||
    limits.mediaBytes > MAX_MEDIA_TOTAL_BYTES
  ) {
    throw new Error('Production capture execution limits are invalid');
  }
  const authControlPlaneBefore =
    await fetchSupabaseAuthControlPlane(configuration);
  if (
    Buffer.byteLength(
      canonicalAuthControlPlaneSnapshot(
        authControlPlaneBefore
      ),
      'utf8'
    ) > limits.authControlPlaneBytes
  ) {
    throw new Error(
      'Supabase Auth control-plane data grew beyond its preflight limit'
    );
  }
  onProgress({ stage: 'auth-control-plane-before' });
  const authBefore = await exportAuthData(configuration);
  onProgress({ stage: 'auth-before' });
  const authBeforeCanonical = canonicalJson(authBefore);
  if (
    Buffer.byteLength(authBeforeCanonical, 'utf8') >
    limits.authBytes
  ) {
    throw new Error(
      'Supabase Auth data grew beyond its preflight limit'
    );
  }
  const snapshot = await beginExportedSnapshot(configuration);
  if (
    snapshot.publicSchemaBytes > limits.publicSchemaBytes ||
    snapshot.mediaRows.length > limits.mediaRows
  ) {
    await snapshot.abort();
    throw new Error(
      'Production capture grew beyond its preflight limits'
    );
  }
  onProgress({
    stage: 'snapshot',
    mediaRows: snapshot.mediaRows.length
  });
  const dumpPath = join(
    metadataRoot,
    'external',
    'agent-os-production',
    'public.dump'
  );
  let media;
  try {
    await createSupabasePublicDump(
      configuration,
      snapshot.snapshotId,
      dumpPath,
      limits.publicDumpBytes
    );
    onProgress({ stage: 'public-dump' });
    media = await captureMedia(
      snapshot.mediaRows,
      metadataRoot,
      configuration,
      captureId,
      onProgress,
      {
        maxObjects: limits.mediaObjects,
        maxTotalBytes: limits.mediaBytes
      }
    );
    onProgress({ stage: 'media-complete' });
    await snapshot.close();
    onProgress({ stage: 'snapshot-closed' });
  } catch (error) {
    await snapshot.abort();
    throw error;
  }
  const [
    dumpVerification,
    dumpInfo,
    dumpSha256,
    authAfter,
    authControlPlaneAfter
  ] = await Promise.all([
    verifySupabasePublicDump(dumpPath),
    stat(dumpPath),
    sha256File(dumpPath),
    exportAuthData(configuration),
    fetchSupabaseAuthControlPlane(configuration)
  ]);
  const authAfterCanonical = canonicalJson(authAfter);
  if (
    Buffer.byteLength(authAfterCanonical, 'utf8') >
    limits.authBytes
  ) {
    throw new Error(
      'Supabase Auth data grew beyond its preflight limit'
    );
  }
  if (authAfterCanonical !== authBeforeCanonical) {
    throw new Error(
      'Supabase Auth data changed during production capture'
    );
  }
  assertMatchingAuthControlPlaneSnapshots(
    authControlPlaneBefore,
    authControlPlaneAfter
  );
  if (
    Buffer.byteLength(
      canonicalAuthControlPlaneSnapshot(
        authControlPlaneAfter
      ),
      'utf8'
    ) > limits.authControlPlaneBytes
  ) {
    throw new Error(
      'Supabase Auth control-plane data grew beyond its preflight limit'
    );
  }
  const authControlPlane =
    await writeSupabaseAuthControlPlane({
      metadataRoot,
      captureId,
      configuration,
      responses: authControlPlaneBefore,
      maxBytes: limits.authControlPlaneBytes
    });
  onProgress({ stage: 'auth-after' });
  onProgress({ stage: 'auth-control-plane-after' });
  const authExport = {
    ...authBefore,
    captureId,
    capturedAt: new Date().toISOString()
  };
  const authExportSource = `${canonicalJson(authExport)}\n`;
  if (
    Buffer.byteLength(authExportSource, 'utf8') >
    limits.authBytes
  ) {
    throw new Error(
      'Supabase Auth artifact exceeded its execution-bound limit'
    );
  }
  const authPath = join(
    metadataRoot,
    'external',
    'agent-os-production',
    'auth.json'
  );
  await writeFile(
    authPath,
    authExportSource,
    { mode: 0o600, flag: 'wx' }
  );
  await chmod(authPath, 0o600);
  const authInfo = await stat(authPath);
  const publicDump = {
    archivePath: relative(metadataRoot, dumpPath)
      .split(sep)
      .join('/'),
    bytes: dumpInfo.size,
    sha256: dumpSha256,
    format: 'pg-custom',
    pgMajor: 17,
    schemas: ['public'],
    tocSha256: dumpVerification.tocSha256,
    tocEntries: dumpVerification.tocEntries
  };
  const auth = {
    archivePath: relative(metadataRoot, authPath)
      .split(sep)
      .join('/'),
    bytes: authInfo.size,
    sha256: await sha256File(authPath),
    tableCount: authExport.tableCount,
    userCount: authExport.userCount,
    dataIncluded: true,
    providerConfigIncluded: false
  };
  return {
    schema: PRODUCTION_CAPTURE_V2,
    captureId,
    projectRefSha256: sha256Text(configuration.projectRef),
    publicDump,
    auth,
    authControlPlane,
    media,
    recoveryCapabilities: {
      supabasePublicData: true,
      supabaseAuthData: true,
      vercelMediaObjects: true,
      supabaseAuthControlPlaneMetadata: true,
      supabaseAuthProviderConfig: false,
      supabaseControlPlane: false,
      fullProductionRecovery: false
    },
    recoveryLimitations: [...PRODUCTION_RECOVERY_LIMITATIONS]
  };
}

async function readBoundedJsonFile(
  path,
  expectedBytes,
  expectedSha256,
  {
    maxBytes = MAX_MANAGEMENT_RESPONSE_BYTES,
    requireCanonical = false
  } = {}
) {
  const info = await lstat(path);
  if (
    info.isSymbolicLink() ||
    !info.isFile() ||
    info.size !== expectedBytes ||
    info.size <= 0 ||
    info.size > maxBytes ||
    (await sha256File(path)) !== expectedSha256
  ) {
    throw new Error('Production data artifact integrity check failed');
  }
  const source = await readFile(path, 'utf8');
  try {
    const value = JSON.parse(source);
    if (
      requireCanonical &&
      source !== `${canonicalJson(value)}\n`
    ) {
      throw new Error(
        'Production data artifact is not canonical JSON'
      );
    }
    return value;
  } catch {
    throw new Error('Production data artifact is not valid JSON');
  }
}

function hasExactObjectKeys(value, keys) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).toSorted()) ===
      JSON.stringify([...keys].toSorted())
  );
}

function isCanonicalTimestamp(value) {
  if (typeof value !== 'string') return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

export async function verifySupabaseAuthControlPlaneCapture({
  metadataRoot,
  summary,
  expectedSetId,
  projectRefSha256
}) {
  validateAuthControlPlaneSummary(summary);
  if (
    !SET_ID_PATTERN.test(expectedSetId) ||
    !SHA256_PATTERN.test(projectRefSha256) ||
    summary.totalBytes > MAX_AUTH_CONTROL_PLANE_TOTAL_BYTES
  ) {
    throw new Error(
      'Supabase Auth control-plane verification context is invalid'
    );
  }
  const destinationRoot = join(
    metadataRoot,
    'external',
    'agent-os-production',
    'auth-control-plane'
  );
  const actualNames = new Set();
  const directory = await opendir(destinationRoot);
  for await (const entry of directory) {
    if (!entry.isFile() || actualNames.has(entry.name)) {
      throw new Error(
        'Supabase Auth control-plane directory is invalid'
      );
    }
    actualNames.add(entry.name);
  }
  const expectedNames = new Set(
    SUPABASE_AUTH_CONTROL_PLANE_ENDPOINTS.map(
      (descriptor) => descriptor.archiveName
    )
  );
  if (
    actualNames.size !== expectedNames.size ||
    [...expectedNames].some((name) => !actualNames.has(name))
  ) {
    throw new Error(
      'Supabase Auth control-plane artifact set is incomplete'
    );
  }

  let capturedAt = null;
  const verifiedArtifacts = [];
  for (
    let index = 0;
    index < SUPABASE_AUTH_CONTROL_PLANE_ENDPOINTS.length;
    index += 1
  ) {
    const descriptor =
      SUPABASE_AUTH_CONTROL_PLANE_ENDPOINTS[index];
    const artifactSummary = summary.artifacts[index];
    const artifact = await readBoundedJsonFile(
      join(metadataRoot, artifactSummary.archivePath),
      artifactSummary.bytes,
      artifactSummary.sha256,
      {
        maxBytes:
          MAX_AUTH_CONTROL_PLANE_RESPONSE_BYTES +
          64 * 1024,
        requireCanonical: true
      }
    );
    if (
      !hasExactObjectKeys(artifact, [
        'schema',
        'captureId',
        'projectRefSha256',
        'endpointId',
        'endpointPath',
        'method',
        'httpStatus',
        'capturedAt',
        'unrestorablePaths',
        'response'
      ]) ||
      artifact.schema !==
        SUPABASE_AUTH_CONTROL_PLANE_RESPONSE_SCHEMA ||
      artifact.captureId !== expectedSetId ||
      artifact.projectRefSha256 !== projectRefSha256 ||
      artifact.endpointId !== descriptor.id ||
      artifact.endpointPath !== descriptor.endpointPath ||
      artifact.method !== 'GET' ||
      artifact.httpStatus !== artifactSummary.httpStatus ||
      !Array.isArray(artifact.unrestorablePaths) ||
      artifact.unrestorablePaths.length !==
        artifactSummary.unrestorableValueCount ||
      !descriptor.allowedStatuses.includes(
        artifact.httpStatus
      ) ||
      !isCanonicalTimestamp(artifact.capturedAt) ||
      (
        capturedAt !== null &&
        artifact.capturedAt !== capturedAt
      ) ||
      (
        artifact.httpStatus === 404 &&
        (
          artifact.response !== null ||
          artifact.unrestorablePaths.length !== 0
        )
      ) ||
      (
        artifact.httpStatus === 200 &&
        (
          artifact.response === null ||
          typeof artifact.response !== 'object'
        )
      )
    ) {
      throw new Error(
        'Supabase Auth control-plane artifact contract is invalid'
      );
    }
    if (artifact.httpStatus === 200) {
      validateOpaqueJsonMetadata(artifact.response);
      if (
        JSON.stringify(artifact.unrestorablePaths) !==
        JSON.stringify(
          findUnrestorableControlPlanePaths(
            artifact.response
          )
        )
      ) {
        throw new Error(
          'Supabase Auth control-plane recoverability markers are invalid'
        );
      }
    }
    capturedAt = artifact.capturedAt;
    verifiedArtifacts.push(artifactSummary);
  }
  const verifiedBytes = verifiedArtifacts.reduce(
    (total, artifact) => total + artifact.bytes,
    0
  );
  if (
    verifiedBytes !== summary.totalBytes ||
    authControlPlaneRootSha256(verifiedArtifacts) !==
      summary.rootSha256
  ) {
    throw new Error(
      'Supabase Auth control-plane aggregate binding is invalid'
    );
  }
  return {
    verified: true,
    artifacts: verifiedArtifacts.length,
    bytes: verifiedBytes,
    unrestorableValues: summary.unrestorableValueCount
  };
}

export async function verifyCapturedProductionData({
  metadataRoot,
  summary,
  expectedSetId
}) {
  validateProductionDataSummary(summary, expectedSetId);
  if (!summary.included) {
    return {
      included: false,
      reason: summary.reason,
      fullProductionRecovery: false
    };
  }

  const dumpPath = join(metadataRoot, summary.publicDump.archivePath);
  const dumpInfo = await lstat(dumpPath);
  if (
    dumpInfo.isSymbolicLink() ||
    !dumpInfo.isFile() ||
    dumpInfo.size !== summary.publicDump.bytes ||
    (await sha256File(dumpPath)) !== summary.publicDump.sha256
  ) {
    throw new Error('Supabase public dump integrity check failed');
  }
  const toc = await verifySupabasePublicDump(dumpPath);
  if (
    toc.tocSha256 !== summary.publicDump.tocSha256 ||
    toc.tocEntries !== summary.publicDump.tocEntries
  ) {
    throw new Error('Supabase public dump TOC changed');
  }

  const auth = await readBoundedJsonFile(
    join(metadataRoot, summary.auth.archivePath),
    summary.auth.bytes,
    summary.auth.sha256
  );
  const users = auth.tables?.find(
    (entry) => entry.table_name === 'users'
  );
  if (
    auth.schema !== 'openclaw-supabase-auth-export/v1' ||
    auth.captureId !== expectedSetId ||
    auth.projectRefSha256 !== summary.projectRefSha256 ||
    !Array.isArray(auth.columns) ||
    !Array.isArray(auth.tables) ||
    auth.tables.length !== summary.auth.tableCount ||
    auth.tableCount !== summary.auth.tableCount ||
    auth.userCount !== summary.auth.userCount ||
    !Array.isArray(users?.rows) ||
    users.rows.length !== summary.auth.userCount
  ) {
    throw new Error('Supabase Auth export contract is invalid');
  }
  const authControlPlane =
    summary.schema === PRODUCTION_CAPTURE_V2
      ? await verifySupabaseAuthControlPlaneCapture({
          metadataRoot,
          summary: summary.authControlPlane,
          expectedSetId,
          projectRefSha256: summary.projectRefSha256
        })
      : {
          verified: false,
          artifacts: 0,
          bytes: 0,
          unrestorableValues: 0
        };
  if (
    summary.schema !== PRODUCTION_CAPTURE_V1 &&
    !authControlPlane.verified
  ) {
    throw new Error(
      'Supabase Auth control-plane capture is required'
    );
  }

  const media = await readBoundedJsonFile(
    join(metadataRoot, summary.media.inventoryPath),
    summary.media.inventoryBytes,
    summary.media.inventorySha256
  );
  if (
    media.schema !== 'openclaw-vercel-media-export/v1' ||
    media.captureId !== expectedSetId ||
    !Array.isArray(media.rows) ||
    !Array.isArray(media.objects) ||
    media.rowCount !== summary.media.rowCount ||
    media.uniqueObjectCount !==
      summary.media.uniqueObjectCount ||
    media.totalBytes !== summary.media.totalBytes ||
    media.objectRootSha256 !== summary.media.objectRootSha256 ||
    media.rows.length !== media.rowCount ||
    media.objects.length !== media.uniqueObjectCount ||
    !/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(
      media.mediaBlobHost
    )
  ) {
    throw new Error('Vercel media export contract is invalid');
  }

  const urlHashes = new Set();
  const expectedObjectFiles = new Set();
  let totalBytes = 0;
  let priorUrl = null;
  const leaves = [];
  for (const object of media.objects) {
    const url = validateMediaUrl(
      object?.url,
      media.mediaBlobHost
    );
    const urlSha256 = sha256Text(url.href);
    if (
      object.urlSha256 !== urlSha256 ||
      urlHashes.has(urlSha256) ||
      (
        priorUrl !== null &&
        Buffer.compare(
          Buffer.from(priorUrl, 'utf8'),
          Buffer.from(url.href, 'utf8')
        ) >= 0
      ) ||
      !Number.isSafeInteger(object.bytes) ||
      object.bytes < 0 ||
      !SHA256_PATTERN.test(object.sha256) ||
      object.archivePath !==
        `external/agent-os-production/media-objects/${object.sha256}` ||
      normalizedContentType(object.contentType) !==
        object.contentType
    ) {
      throw new Error('Vercel media object metadata is invalid');
    }
    priorUrl = url.href;
    urlHashes.add(urlSha256);
    expectedObjectFiles.add(object.sha256);
    totalBytes += object.bytes;
    const path = join(metadataRoot, object.archivePath);
    const info = await lstat(path);
    if (
      info.isSymbolicLink() ||
      !info.isFile() ||
      info.size !== object.bytes ||
      (await sha256File(path)) !== object.sha256
    ) {
      throw new Error('Vercel media object integrity check failed');
    }
    leaves.push(
      sha256Text(
        canonicalJson({
          urlSha256: object.urlSha256,
          bytes: object.bytes,
          sha256: object.sha256,
          contentType: object.contentType
        })
      )
    );
  }
  if (
    totalBytes !== summary.media.totalBytes ||
    sha256Text(`${leaves.join('\n')}\n`) !==
      summary.media.objectRootSha256
  ) {
    throw new Error('Vercel media object root is invalid');
  }

  const actualObjectFiles = new Set();
  const objectsDirectory = await opendir(
    join(
      metadataRoot,
      'external',
      'agent-os-production',
      'media-objects'
    )
  );
  for await (const entry of objectsDirectory) {
    if (!entry.isFile() || !SHA256_PATTERN.test(entry.name)) {
      throw new Error(
        'Vercel media object directory contains an unexpected entry'
      );
    }
    actualObjectFiles.add(entry.name);
  }
  if (
    actualObjectFiles.size !== expectedObjectFiles.size ||
    [...expectedObjectFiles].some(
      (name) => !actualObjectFiles.has(name)
    )
  ) {
    throw new Error('Vercel media object set is incomplete');
  }
  for (const row of media.rows) {
    if (
      typeof row?.record?.id !== 'string' ||
      typeof row?.record?.blob_url !== 'string' ||
      row.urlSha256 !==
        sha256Text(
          validateMediaUrl(
            row.record.blob_url,
            media.mediaBlobHost
          ).href
        ) ||
      !urlHashes.has(row.urlSha256)
    ) {
      throw new Error('Vercel media reference mapping is invalid');
    }
  }
  return {
    included: true,
    publicDumpBytes: summary.publicDump.bytes,
    authTables: summary.auth.tableCount,
    authUsers: summary.auth.userCount,
    authControlPlaneArtifacts: authControlPlane.artifacts,
    authControlPlaneBytes: authControlPlane.bytes,
    authControlPlaneUnrestorableValues:
      authControlPlane.unrestorableValues,
    mediaRows: summary.media.rowCount,
    mediaObjects: summary.media.uniqueObjectCount,
    mediaBytes: summary.media.totalBytes,
    fullProductionRecovery:
      summary.recoveryCapabilities.fullProductionRecovery,
    recoveryLimitations:
      summary.schema === PRODUCTION_CAPTURE_V2
        ? summary.recoveryLimitations
        : ['legacy-capture-has-no-auth-control-plane-metadata']
  };
}

export async function checkProductionDataConfiguration(options) {
  const configuration = await loadProductionDataConfiguration(options);
  const child = spawn(
    'docker',
    ['image', 'inspect', PINNED_POSTGRES_IMAGE],
    { stdio: ['ignore', 'ignore', 'ignore'] }
  );
  await childCompletion(
    child,
    'Pinned PostgreSQL client image',
    [],
    CLIENT_IMAGE_INSPECT_TIMEOUT_MS
  );
  const authControlPlane =
    await fetchSupabaseAuthControlPlane(configuration);
  const auth = await exportAuthData(configuration);
  const snapshot = await beginExportedSnapshot(configuration);
  let mediaUrls;
  let mediaDeclaredBytes;
  try {
    mediaUrls = new Set(
      snapshot.mediaRows.map((row) =>
        validateMediaUrl(
          row?.blob_url,
          configuration.mediaBlobHost
        ).href
      )
    );
    const mediaSizes = new Map();
    for (const row of snapshot.mediaRows) {
      const url = validateMediaUrl(
        row?.blob_url,
        configuration.mediaBlobHost
      );
      const declaredBytes =
        row?.bytes === null || row?.bytes === undefined
          ? null
          : Number(row.bytes);
      if (
        declaredBytes !== null &&
        (
          !Number.isSafeInteger(declaredBytes) ||
          declaredBytes < 0 ||
          declaredBytes > MAX_MEDIA_OBJECT_BYTES
        )
      ) {
        throw new Error(
          'Production media size metadata is invalid'
        );
      }
      const previous = mediaSizes.get(url.href);
      if (
        previous !== undefined &&
        previous.declaredBytes !== null &&
        declaredBytes !== null &&
        previous.declaredBytes !== declaredBytes
      ) {
        throw new Error(
          'Production media size metadata disagrees'
        );
      }
      mediaSizes.set(url.href, {
        url,
        declaredBytes:
          previous?.declaredBytes ?? declaredBytes
      });
    }
    const measuredSizes = await collectWithConcurrency(
      [...mediaSizes.values()],
      8,
      async ({ url, declaredBytes }) => {
        const measured = await headMediaObjectSize(url);
        if (
          declaredBytes !== null &&
          measured !== declaredBytes
        ) {
          throw new Error(
            'Production media declared size changed'
          );
        }
        return measured;
      }
    );
    mediaDeclaredBytes = measuredSizes.reduce(
      (total, bytes) => total + bytes,
      0
    );
    if (
      !Number.isSafeInteger(mediaDeclaredBytes) ||
      mediaDeclaredBytes > MAX_MEDIA_TOTAL_BYTES
    ) {
      throw new Error(
        'Production media size estimate exceeded its cap'
      );
    }
    await snapshot.close();
  } catch (error) {
    await snapshot.abort();
    throw error;
  }
  return {
    configured: true,
    projectRefSha256: sha256Text(configuration.projectRef),
    postgresImage: PINNED_POSTGRES_IMAGE,
    authExportMethod: 'supabase-management-read-only-query',
    authTables: auth.tableCount,
    authUsers: auth.userCount,
    authControlPlaneMethod:
      'supabase-management-read-only-get',
    authControlPlaneEndpoints: authControlPlane.length,
    publicExportMethod: 'pg17-exported-snapshot',
    mediaExportMethod: 'pinned-host-public-get',
    mediaRows: snapshot.mediaRows.length,
    mediaObjects: mediaUrls.size,
    mediaDeclaredBytes,
    publicSchemaBytesEstimate: snapshot.publicSchemaBytes,
    authBytesEstimate: Buffer.byteLength(
      `${canonicalJson(auth)}\n`,
      'utf8'
    ),
    authControlPlaneBytesEstimate:
      Buffer.byteLength(
        canonicalJson(authControlPlane),
        'utf8'
      )
  };
}
