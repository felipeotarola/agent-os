#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  chmod,
  chown,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  assertPathCollectionWithinLimits,
  assertProtectedTreeSnapshotTransition,
  buildInventory,
  collectOpenClawArchiveEntries,
  inspectBrowserWriters,
  isPotentialWriterTimerLine,
  makeSetId,
  parseArgs,
  rebuildableReason,
  runBoundedCommandToFile,
  runCommandFromFile,
  snapshotSqliteDatabase
} from './openclaw-backup.mjs';
import {
  assertNoSwapTmpfsMountInfo,
  openPrivateLockFile,
  assertTrustedDirectoryHierarchy,
  assertTrustedDirectoryMetadata
} from './openclaw-backup-path-security.mjs';
import {
  isAllowedArchiveMember,
  validateManifestShape,
  verifySet
} from './verify-openclaw-backup.mjs';

async function main() {
  const testRoot = await mkdtemp(join(tmpdir(), 'openclaw-backup-contract-'));
  try {
    await testDryRunContract(testRoot);
    await testInvalidDatabaseFailClosed(testRoot);
    await testSqliteSnapshot(testRoot);
    await testSqliteSnapshotKeepsProcessAlive(testRoot);
    await testProtectedTreeSnapshotTransition();
    await testPostgresStreamLifecycle(testRoot);
    await testTopLevelMainProducesOutput(testRoot);
    await testOuterVerification(testRoot);
    await testTrustedDirectoryHierarchy(testRoot);
    await testPrivateLockSymlinkRefusal(testRoot);
    await testZeroByteMaintenanceLockChecks();
    await testPrivateRunsRootContract();
    await testPersistentGpgAgentContract();
    testNoOptionalMountInfoFields();
    testPathCardinalityCeilings();
    process.stdout.write('openclaw_backup_contract_ok\n');
  } finally {
    await rm(testRoot, { recursive: true, force: true });
  }
}

async function testProtectedTreeSnapshotTransition() {
  const entry = (path, overrides = {}) => ({
    path,
    kind: 'file',
    dev: '1',
    ino: '2',
    mode: '33152',
    uid: '0',
    gid: '0',
    size: '32768',
    nlink: '1',
    mtimeNs: '100',
    ctimeNs: '100',
    ...overrides
  });
  const databasePath = 'state/openclaw.sqlite';
  const shmPath = `${databasePath}-shm`;
  const initial = [
    entry(databasePath, { size: '4096' }),
    entry(`${databasePath}-wal`, { size: '8192' }),
    entry(`${databasePath}-journal`, { size: '4096' }),
    entry(shmPath),
    entry('state/untracked.sqlite-shm'),
    entry('workspace/config.json', { size: '64' })
  ];
  const allowed = structuredClone(initial);
  allowed[1].ctimeNs = '201';
  allowed[2].ctimeNs = '202';
  allowed[3].mtimeNs = '203';
  allowed[3].ctimeNs = '204';
  assert.deepEqual(
    assertProtectedTreeSnapshotTransition(
      initial,
      allowed,
      {
        sqliteDatabases: [
          { relativePath: databasePath }
        ]
      }
    ),
    {
      allowedPaths: 3,
      allowedMetadataChanges: 3
    }
  );
  const rejectedMutations = [
    [0, 'mtimeNs', '200'],
    [1, 'mtimeNs', '200'],
    [1, 'size', '8193'],
    [2, 'mtimeNs', '200'],
    [2, 'size', '4097'],
    [3, 'size', '32769'],
    [3, 'ino', '3'],
    [3, 'dev', '2'],
    [3, 'mode', '33188'],
    [3, 'uid', '1'],
    [3, 'gid', '1'],
    [3, 'nlink', '2'],
    [3, 'kind', 'symlink'],
    [4, 'mtimeNs', '200'],
    [5, 'mode', '33188']
  ];
  for (const [index, field, value] of rejectedMutations) {
    const changed = structuredClone(initial);
    changed[index][field] = value;
    assert.throws(
      () =>
        assertProtectedTreeSnapshotTransition(
          initial,
          changed,
          {
            sqliteDatabases: [
              { relativePath: databasePath }
            ]
          }
        ),
      /Protected OpenClaw tree changed during SQLite snapshots/
    );
  }
  assert.throws(
    () =>
      assertProtectedTreeSnapshotTransition(
        initial,
        [
          ...initial,
          entry('workspace/new-file')
        ],
        {
          sqliteDatabases: [
            { relativePath: databasePath }
          ]
        }
      ),
    /Protected OpenClaw tree changed during SQLite snapshots/
  );
  const replaced = structuredClone(initial);
  replaced[5].path = 'workspace/replacement.json';
  assert.throws(
    () =>
      assertProtectedTreeSnapshotTransition(
        initial,
        replaced,
        {
          sqliteDatabases: [
            { relativePath: databasePath }
          ]
        }
      ),
    /Protected OpenClaw tree changed during SQLite snapshots/
  );
  assert.throws(
    () =>
      assertProtectedTreeSnapshotTransition(
        initial,
        initial.slice(0, -1),
        {
          sqliteDatabases: [
            { relativePath: databasePath }
          ]
        }
      ),
    /Protected OpenClaw tree changed during SQLite snapshots/
  );

  const creator = await readFile(
    new URL('./openclaw-backup.mjs', import.meta.url),
    'utf8'
  );
  const executeStart = creator.indexOf(
    'async function executeBackup'
  );
  const executeEnd = creator.indexOf(
    '\nasync function runToFile',
    executeStart
  );
  assert.ok(
    executeStart >= 0 && executeEnd > executeStart,
    'backup execution source boundaries must be discoverable'
  );
  const execution = creator.slice(executeStart, executeEnd);
  const protectedInitial = execution.indexOf(
    'const protectedTreeStateInitial'
  );
  const sqliteStart = execution.indexOf(
    "trace('sqlite-snapshots:start')"
  );
  const sqliteComplete = execution.indexOf(
    "trace('sqlite-snapshots:complete')"
  );
  const protectedPostSqlite = execution.indexOf(
    "trace('protected-tree-post-sqlite:start')"
  );
  const transitionCheck = execution.indexOf(
    'assertProtectedTreeSnapshotTransition'
  );
  const postBaselineAssignment = execution.indexOf(
    'protectedTreeStateBefore =\n        protectedTreeStateAfterSqlite'
  );
  const finalExactComparison = execution.indexOf(
    'JSON.stringify(protectedTreeStateAfter) !=='
  );
  assert.ok(
    protectedInitial >= 0 &&
      sqliteStart > protectedInitial &&
      sqliteComplete > sqliteStart &&
      protectedPostSqlite > sqliteComplete &&
      transitionCheck > protectedPostSqlite &&
      postBaselineAssignment > transitionCheck &&
      finalExactComparison > postBaselineAssignment,
    'quiesced protected-tree transition must bracket SQLite snapshots'
  );
}

async function testPersistentGpgAgentContract() {
  const [maintenance, health, creator, maintenanceUnit, healthUnit, agentUnit] =
    await Promise.all([
      readFile(
        new URL('./openclaw-backup-maintenance.sh', import.meta.url),
        'utf8'
      ),
      readFile(
        new URL('./openclaw-backup-healthcheck.sh', import.meta.url),
        'utf8'
      ),
      readFile(new URL('./openclaw-backup.mjs', import.meta.url), 'utf8'),
      readFile(
        new URL(
          '../infra/openclaw-backup-systemd/openclaw-backup-maintenance.service',
          import.meta.url
        ),
        'utf8'
      ),
      readFile(
        new URL(
          '../infra/openclaw-backup-systemd/openclaw-backup-healthcheck.service',
          import.meta.url
        ),
        'utf8'
      ),
      readFile(
        new URL(
          '../infra/openclaw-backup-systemd/openclaw-backup-gpg-agent.service',
          import.meta.url
        ),
        'utf8'
      )
    ]);
  assert.doesNotMatch(
    maintenance,
    /gpgconf[\s\S]{0,120}--launch/,
    'maintenance must not launch an agent inside its hardened cgroup'
  );
  assert.match(
    maintenance,
    /gpg --batch --no-autostart --with-colons --list-secret-keys/,
    'maintenance signing-key preflight must fail closed without the persistent agent'
  );
  assert.match(
    health,
    /--no-autostart --list-secret-keys/,
    'health signing-key lookup must not spawn an ad-hoc agent'
  );
  assert.match(
    creator,
    /'--no-autostart',[\s\S]{0,120}'GPG signing-key lookup'/,
    'creator signing-key lookup must not spawn an ad-hoc agent'
  );
  for (const unit of [maintenanceUnit, healthUnit]) {
    assert.match(unit, /^Requires=openclaw-backup-gpg-agent\.service$/m);
    assert.match(
      unit,
      /^After=.*openclaw-backup-gpg-agent\.service$/m
    );
  }
  assert.match(agentUnit, /^RemainAfterExit=yes$/m);
  assert.match(
    agentUnit,
    /^ExecStart=.*gpgconf .*--launch gpg-agent$/m
  );
  assert.match(agentUnit, /^ProtectSystem=strict$/m);
  assert.match(
    agentUnit,
    /^ReadWritePaths=\/etc\/openclaw-backup\/gnupg$/m
  );
}

async function testZeroByteMaintenanceLockChecks() {
  const checks = [
    {
      source: await readFile(
        new URL('./openclaw-backup-healthcheck.sh', import.meta.url),
        'utf8'
      ),
      lock: 'MAINTENANCE_LOCK',
      descriptor: '8'
    },
    {
      source: await readFile(
        new URL('./openclaw-backup-maintenance.sh', import.meta.url),
        'utf8'
      ),
      lock: 'LOCK_PATH',
      descriptor: '9'
    }
  ];
  for (const { source, lock, descriptor } of checks) {
    assert.match(
      source,
      new RegExp(`! -f \\"\\$${lock}\\" \\|\\| -L \\"\\$${lock}\\"`),
      `${lock} must reject symlinks and non-regular files`
    );
    assert.match(
      source,
      new RegExp(`stat -c '%u:%a:%h:%s' \\"\\$${lock}\\"[^\\n]*'0:600:1:0'`),
      `${lock} must accept a zero-byte regular file without depending on stat %F wording`
    );
    assert.match(
      source,
      new RegExp(`-f /proc/self/fd/${descriptor}[\\s\\S]*stat -Lc '%u:%a:%h:%s' /proc/self/fd/${descriptor}[^\\n]*'0:600:1:0'`),
      `maintenance lock descriptor ${descriptor} must use the same invariant`
    );
  }
}

async function testPrivateRunsRootContract() {
  const scripts = [
    {
      label: 'maintenance',
      source: await readFile(
        new URL('./openclaw-backup-maintenance.sh', import.meta.url),
        'utf8'
      ),
      firstEvidenceUse: 'RUN_DIR="$RUNS_ROOT/$RUN_ID"'
    },
    {
      label: 'healthcheck',
      source: await readFile(
        new URL('./openclaw-backup-healthcheck.sh', import.meta.url),
        'utf8'
      ),
      firstEvidenceUse:
        'find "$RUNS_ROOT" -mindepth 2 -maxdepth 2'
    }
  ];
  for (const { label, source, firstEvidenceUse } of scripts) {
    assert.match(
      source,
      /^RUNS_ROOT="\$STATE_ROOT\/runs"$/m,
      `${label} must pin its evidence runs root below the private state root`
    );
    assert.match(
      source,
      /if \[\[ -L "\$directory" \|\|[\s\S]{0,80}-e "\$directory" && ! -d "\$directory" \]\]; then/,
      `${label} must reject symlink and non-directory runs roots`
    );
    const parentDeclaration = source.indexOf(
      'local parent_directory=${directory%/*}'
    );
    const parentModeCheck = source.indexOf(
      '$(stat -c \'%u:%g:%a\' "$parent_directory"'
    );
    const parentCanonicalCheck = source.indexOf(
      '$(realpath --canonicalize-existing "$parent_directory"'
    );
    const directPathCheck = source.indexOf(
      'if [[ -L "$directory"'
    );
    assert.ok(
      parentDeclaration >= 0 &&
        parentModeCheck > parentDeclaration &&
        parentCanonicalCheck > parentModeCheck &&
        directPathCheck > parentCanonicalCheck,
      `${label} must validate the private canonical parent before creation`
    );
    assert.match(
      source,
      /stat -c '%u:%g' "\$directory"[\s\S]{0,80}!= '0:0'/,
      `${label} must reject an existing runs root with non-root ownership`
    );
    assert.match(
      source,
      /install -o root -g root -m 0700 -d -- "\$directory"/,
      `${label} must create a missing runs root with private root ownership`
    );
    assert.match(
      source,
      /chmod 0700 -- "\$directory"/,
      `${label} must enforce the private mode on an existing runs root`
    );
    assert.match(
      source,
      /stat -c '%u:%g:%a' "\$directory"[\s\S]{0,120}!= '0:0:700'[\s\S]{0,160}realpath --canonicalize-existing "\$directory"/,
      `${label} must verify exact metadata and reject symlink traversal`
    );
    const enforcement = source.indexOf(
      'ensure_private_root_directory "$RUNS_ROOT"'
    );
    const evidenceUse = source.indexOf(firstEvidenceUse);
    const existingPathCheck = source.indexOf(
      '$(realpath --canonicalize-existing "$directory"'
    );
    const modeEnforcement = source.indexOf(
      'chmod 0700 -- "$directory"'
    );
    assert.ok(
      enforcement >= 0 &&
        evidenceUse > enforcement,
      `${label} must enforce runs-root metadata before evidence use`
    );
    assert.ok(
      existingPathCheck >= 0 &&
        modeEnforcement > existingPathCheck,
      `${label} must reject ancestor traversal before changing an existing directory`
    );
  }
}

async function testPrivateLockSymlinkRefusal(testRoot) {
  const lockRoot = join(testRoot, 'private-lock-root');
  const victim = join(testRoot, 'lock-symlink-victim');
  const lockPath = join(lockRoot, 'creator.lock');
  await mkdir(lockRoot, { mode: 0o700 });
  await chmod(lockRoot, 0o700);
  await writeFile(victim, 'must-not-be-truncated\n', {
    mode: 0o600
  });
  await symlink(victim, lockPath);
  await assert.rejects(
    openPrivateLockFile(lockRoot, 'creator.lock', {
      label: 'Fixture lock'
    })
  );
  assert.equal(
    await readFile(victim, 'utf8'),
    'must-not-be-truncated\n'
  );
  await rm(lockPath);
  const handle = await openPrivateLockFile(
    lockRoot,
    'creator.lock',
    { label: 'Fixture lock' }
  );
  try {
    const info = await handle.stat();
    assert.equal(info.mode & 0o777, 0o600);
    assert.equal(info.nlink, 1);
    assert.equal(info.size, 0);
  } finally {
    await handle.close();
  }
}

function testPathCardinalityCeilings() {
  assert.doesNotThrow(() =>
    assertPathCollectionWithinLimits(
      200_000,
      48 * 1024 * 1024,
      'Fixture'
    )
  );
  assert.throws(
    () =>
      assertPathCollectionWithinLimits(
        200_001,
        1,
        'Fixture'
      ),
    /path cardinality ceiling/
  );
  assert.throws(
    () =>
      assertPathCollectionWithinLimits(
        1,
        48 * 1024 * 1024 + 1,
        'Fixture'
      ),
    /path cardinality ceiling/
  );
}

function testNoOptionalMountInfoFields() {
  const mountInfo = [
    '29 1 8:1 / / rw,relatime - ext4 /dev/sda1 rw',
    '30 29 0:99 / /run/openclaw-backup-tmp rw,nosuid,nodev,noexec - tmpfs tmpfs rw,size=1572864k,mode=700,noswap'
  ].join('\n');
  assert.deepEqual(
    assertNoSwapTmpfsMountInfo(
      mountInfo,
      '/run/openclaw-backup-tmp/fixture'
    ),
    {
      path: '/run/openclaw-backup-tmp/fixture',
      mountPoint: '/run/openclaw-backup-tmp'
    }
  );
  assert.throws(
    () =>
      assertNoSwapTmpfsMountInfo(
        [
          mountInfo,
          '31 30 8:2 / /run/openclaw-backup-tmp rw - ext4 /dev/sdb1 rw'
        ].join('\n'),
        '/run/openclaw-backup-tmp/fixture'
      ),
    /ambiguous stacked mountpoint/
  );
}

async function testTrustedDirectoryHierarchy(testRoot) {
  const foreignOwnedDirectory = {
    isSymbolicLink: () => false,
    isDirectory: () => true,
    uid: 65534,
    mode: 0o40700
  };
  assert.throws(
    () =>
      assertTrustedDirectoryMetadata(foreignOwnedDirectory, {
        expectedUid: 0,
        isLeaf: false,
        label: 'Fixture'
      }),
    /owned by an untrusted user/
  );

  if (typeof process.getuid !== 'function' || process.getuid() !== 0) {
    return;
  }
  const foreignParent = join(testRoot, 'foreign-owned-parent');
  const recoveryLeaf = join(foreignParent, 'root-owned-set');
  await mkdir(recoveryLeaf, { recursive: true, mode: 0o700 });
  await chown(foreignParent, 65534, 65534);
  await assert.rejects(
    assertTrustedDirectoryHierarchy(recoveryLeaf, {
      label: 'Fixture set'
    }),
    /owned by an untrusted user/
  );
}

async function testInvalidDatabaseFailClosed(testRoot) {
  const source = join(testRoot, 'invalid-database', '.openclaw');
  await mkdir(join(source, 'state'), { recursive: true });
  await mkdir(join(source, 'agents'), { recursive: true });
  await writeFile(
    join(source, 'state', 'openclaw.sqlite'),
    'not-a-sqlite-database\n'
  );
  const inventory = await buildInventory(source);
  assert.deepEqual(
    inventory.invalidDatabaseCandidates.map((entry) => entry.path),
    [join('state', 'openclaw.sqlite')]
  );
  assert.deepEqual(inventory.missingCriticalSqlitePaths, [
    join('state', 'openclaw.sqlite')
  ]);
}

async function testDryRunContract(testRoot) {
  const timerPrefix =
    'Tue 2026-07-28 03:17:00 CEST 4h left - -';
  assert.equal(
    isPotentialWriterTimerLine(
      `${timerPrefix} openclaw-backup-maintenance.timer openclaw-backup-maintenance.service`,
      'system'
    ),
    false,
    'the maintenance timer itself is not an OpenClaw writer'
  );
  assert.equal(
    isPotentialWriterTimerLine(
      `${timerPrefix} openclaw-backup-healthcheck.timer openclaw-backup-healthcheck.service`,
      'system'
    ),
    false,
    'the read-only health timer is not an OpenClaw writer'
  );
  assert.equal(
    isPotentialWriterTimerLine(
      `${timerPrefix} agent-os-mutator.timer agent-os-mutator.service`,
      'system'
    ),
    true,
    'unknown Agent OS timers must still fail closed'
  );
  assert.equal(
    isPotentialWriterTimerLine(
      `${timerPrefix} openclaw-backup-healthcheck.timer openclaw-backup-healthcheck.service`,
      'user'
    ),
    true,
    'only the reviewed system timer is exempt'
  );

  const source = join(testRoot, '.openclaw');
  await mkdir(join(source, 'state'), { recursive: true });
  await mkdir(join(source, 'agents', 'main', 'sessions'), {
    recursive: true
  });
  await mkdir(join(source, 'workspace', 'app', 'node_modules', 'fixture'), {
    recursive: true
  });
  await mkdir(join(source, 'workspace', 'app', '.next'), {
    recursive: true
  });
  await mkdir(
    join(source, 'agents', 'main', 'agent', 'codex-home'),
    { recursive: true }
  );
  await mkdir(join(source, 'agents', 'main', 'qmd', 'xdg-cache', 'qmd'), {
    recursive: true
  });
  await writeFile(
    join(source, 'openclaw.json'),
    '{"fixtureSecret":"must-never-appear-in-inventory"}\n'
  );
  await writeFile(
    join(source, 'agents', 'main', 'sessions', 'session.jsonl'),
    '{"event":"kept"}\n'
  );
  await writeFile(
    join(source, 'workspace', 'app', 'node_modules', 'fixture', 'index.js'),
    'rebuildable\n'
  );
  await writeFile(
    join(source, 'workspace', 'app', '.next', 'output.bin'),
    'rebuildable\n'
  );
  await writeFile(
    join(
      source,
      'agents',
      'main',
      'agent',
      'codex-home',
      'logs_2.sqlite'
    ),
    'rebuildable log fixture\n'
  );
  await writeFile(
    join(
      source,
      'agents',
      'main',
      'qmd',
      'xdg-cache',
      'qmd',
      'index.sqlite'
    ),
    'rebuildable index fixture\n'
  );

  const sourceDatabase = join(source, 'state', 'openclaw.sqlite');
  const database = new DatabaseSync(sourceDatabase);
  database.exec('CREATE TABLE fixture (value TEXT NOT NULL)');
  database.prepare('INSERT INTO fixture (value) VALUES (?)').run('kept');
  database.close();
  for (const relativePath of [
    join('agents', 'main', 'agent', 'openclaw-agent.sqlite'),
    join(
      'agents',
      'main',
      'agent',
      'codex-home',
      'state_5.sqlite'
    ),
    join(
      'agents',
      'main',
      'agent',
      'codex-home',
      'memories_1.sqlite'
    ),
    join(
      'agents',
      'main',
      'agent',
      'codex-home',
      'goals_1.sqlite'
    )
  ]) {
    const path = join(source, relativePath);
    await mkdir(join(path, '..'), { recursive: true });
    const agentDatabase = new DatabaseSync(path);
    agentDatabase.exec(
      'CREATE TABLE fixture_agent_state (value TEXT NOT NULL)'
    );
    agentDatabase.close();
  }

  const options = parseArgs([]);
  assert.equal(options.execute, false, 'dry run must be the default');
  assert.equal(options.chunkBytes, 96 * 1024 * 1024);
  assert.equal(
    parseArgs([
      '--frozen-codex-scope',
      'session-20108.scope'
    ]).frozenCodexScope,
    'session-20108.scope'
  );
  assert.throws(
    () =>
      parseArgs([
        '--frozen-codex-scope',
        'openclaw-gateway.service'
      ]),
    /exact systemd session-N\.scope/
  );
  assert.throws(
    () =>
      parseArgs([
        '--include-browser-profiles',
        '--consistency',
        'best-effort'
      ]),
    /requires quiesced consistency/
  );
  assert.throws(
    () =>
      parseArgs([
        '--frozen-codex-scope',
        'session-20108.scope',
        '--consistency',
        'best-effort'
      ]),
    /valid only with quiesced/
  );
  assert.equal(
    rebuildableReason('workspace/app/node_modules', true),
    'dependency_tree'
  );
  assert.equal(
    rebuildableReason('npm/package.json'),
    null,
    'OpenClaw npm root manifest must be recoverable'
  );
  assert.equal(
    rebuildableReason('npm/projects/plugin/package-lock.json'),
    null,
    'OpenClaw npm project lockfiles must be recoverable'
  );
  assert.equal(
    rebuildableReason('npm/projects/plugin/node_modules', true),
    'dependency_tree'
  );
  for (const path of [
    'etc/ufw/ufw.conf',
    'etc/ufw/before.rules',
    'etc/default/ufw',
    'etc/ssh/sshd_config',
    'etc/ssh/sshd_config.d/60-openclaw-hardening.conf',
    'etc/systemd/system/openclaw-backup-maintenance.service',
    'etc/systemd/system/openclaw-backup-maintenance-guard.service',
    'etc/systemd/system/openclaw-backup-maintenance.timer',
    'etc/systemd/system/openclaw-backup-alert@.service',
    'etc/systemd/system/openclaw-backup-healthcheck.service',
    'etc/systemd/system/openclaw-backup-healthcheck.timer'
  ]) {
    assert.equal(
      isAllowedArchiveMember(path),
      true,
      `host recovery path must pass deep verification: ${path}`
    );
  }
  assert.equal(
    isAllowedArchiveMember('etc/ssh/ssh_host_ed25519_key'),
    false,
    'SSH host private keys are not part of Tier A host recovery'
  );
  for (const runtimePath of [
    '.openclaw/browser/profile/SingletonLock',
    '.openclaw/browser/profile/SingletonCookie',
    '.openclaw/browser/profile/SingletonSocket',
    '.openclaw/browser/profile/DevToolsActivePort',
    '.openclaw/browser/profile/chrome.pid',
    '.openclaw/browser/profile/chrome.sock'
  ]) {
    assert.equal(
      isAllowedArchiveMember(runtimePath),
      false,
      `browser runtime artifact must be rejected: ${runtimePath}`
    );
  }

  const browserProfile = join(source, 'browser', 'fixture-profile');
  const browserDefault = join(browserProfile, 'Default');
  await mkdir(
    join(browserDefault, 'Local Storage', 'leveldb'),
    { recursive: true }
  );
  await mkdir(join(browserDefault, 'Cache'), { recursive: true });
  await writeFile(
    join(browserProfile, 'Local State'),
    '{"profile":{"name":"fixture"}}\n'
  );
  await writeFile(
    join(browserDefault, 'Preferences'),
    '{"profile":{"exit_type":"Normal"}}\n'
  );
  for (const name of ['Cookies', 'Login Data', 'History']) {
    const browserDatabase = new DatabaseSync(
      join(browserDefault, name)
    );
    browserDatabase.exec(
      'CREATE TABLE fixture_browser_state (value TEXT NOT NULL)'
    );
    browserDatabase.close();
  }
  await writeFile(
    join(browserDefault, 'Cookies-wal'),
    'live-wal-must-not-be-archived\n'
  );
  await writeFile(
    join(browserDefault, 'Local Storage', 'leveldb', '000003.log'),
    'durable-leveldb\n'
  );
  await writeFile(
    join(browserDefault, 'Cache', 'cache.bin'),
    'rebuildable-cache\n'
  );
  await writeFile(
    join(browserProfile, 'SingletonLock'),
    'runtime-lock\n'
  );

  const browserInventory = await buildInventory(source, {
    includeBrowserProfiles: true
  });
  assert.equal(browserInventory.sqliteDatabaseCount, 8);
  assert.equal(browserInventory.browserProfiles.profileCount, 1);
  assert.deepEqual(
    browserInventory.browserProfiles.missingCriticalPaths,
    []
  );
  assert.ok(
    browserInventory.excludedRoots.some(
      (entry) => entry.reason === 'browser_cache'
    )
  );
  assert.ok(
    browserInventory.excludedRoots.some(
      (entry) => entry.reason === 'browser_runtime_artifacts'
    )
  );
  const browserEntries = await collectOpenClawArchiveEntries(
    source,
    browserInventory,
    { includeBrowserProfiles: true }
  );
  const browserEntryPaths = new Set(
    browserEntries.map((entry) => entry.path)
  );
  assert.equal(
    browserEntryPaths.has(
      '.openclaw/browser/fixture-profile/Default/Cookies'
    ),
    false
  );
  assert.equal(
    browserEntryPaths.has(
      '.openclaw/browser/fixture-profile/Default/Cookies-wal'
    ),
    false
  );
  assert.equal(
    browserEntryPaths.has(
      '.openclaw/browser/fixture-profile/Default/Local Storage/leveldb/000003.log'
    ),
    true
  );
  assert.equal(
    [...browserEntryPaths].some(
      (path) =>
        path.includes('/Cache/') ||
        path.endsWith('/SingletonLock')
    ),
    false
  );

  const cwdWriter = spawn('sleep', ['10'], {
    cwd: join(source, 'browser'),
    stdio: 'ignore'
  });
  await once(cwdWriter, 'spawn');
  try {
    const browserWriterState =
      await inspectBrowserWriters(source);
    assert.equal(browserWriterState.stopped, false);
    assert.match(
      browserWriterState.state,
      /browser-tree-users/
    );
  } finally {
    const closed = once(cwdWriter, 'close');
    cwdWriter.kill('SIGKILL');
    await closed;
  }

  const inventory = await buildInventory(source);
  assert.equal(inventory.sqliteDatabaseCount, 5);
  assert.equal(inventory.expectedCriticalSqliteCount, 5);
  assert.deepEqual(inventory.missingCriticalSqlitePaths, []);
  assert.deepEqual(inventory.invalidDatabaseCandidates, []);
  assert.equal(
    inventory.sqliteDatabases.some(
      (entry) =>
        entry.relativePath === join('state', 'openclaw.sqlite')
    ),
    true
  );
  assert.ok(
    inventory.excludedRoots.some(
      (entry) => entry.reason === 'dependency_tree'
    )
  );
  assert.ok(
    inventory.excludedRoots.some(
      (entry) => entry.reason === 'codex_rollout_logs'
    )
  );
  assert.ok(
    inventory.excludedRoots.some((entry) => entry.reason === 'qmd_index')
  );
  assert.equal(
    JSON.stringify(inventory).includes('must-never-appear-in-inventory'),
    false,
    'inventory must never contain file contents'
  );
  assert.match(makeSetId(), /^\d{8}T\d{6}Z-[0-9a-f]{16}$/);
}

async function testSqliteSnapshot(testRoot) {
  const source = join(testRoot, '.openclaw', 'state', 'openclaw.sqlite');
  const destination = join(testRoot, 'snapshot', 'openclaw.sqlite');
  await snapshotSqliteDatabase(source, destination);

  const snapshot = new DatabaseSync(destination, { readOnly: true });
  const row = snapshot.prepare('SELECT value FROM fixture').get();
  snapshot.close();
  assert.equal(row.value, 'kept');
}

async function testSqliteSnapshotKeepsProcessAlive(testRoot) {
  const source = join(testRoot, '.openclaw', 'state', 'openclaw.sqlite');
  const destination = join(
    testRoot,
    'snapshot-final-operation',
    'openclaw.sqlite'
  );
  const moduleUrl = new URL('./openclaw-backup.mjs', import.meta.url).href;
  const script = `
    import { snapshotSqliteDatabase } from ${JSON.stringify(moduleUrl)};
    await snapshotSqliteDatabase(process.argv[1], process.argv[2]);
    process.stdout.write('snapshot-complete\\n');
  `;
  const child = spawn(
    process.execPath,
    ['--input-type=module', '--eval', script, source, destination],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const stdout = [];
  const stderr = [];
  let timedOut = false;
  child.stdout.on('data', (chunk) => stdout.push(chunk));
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, 5_000);
  const [code, signal] = await once(child, 'close');
  clearTimeout(timeout);
  assert.equal(
    timedOut,
    false,
    'SQLite liveness subprocess hung'
  );
  assert.equal(
    code,
    0,
    `SQLite liveness subprocess failed (${signal || 'no signal'}): ` +
      Buffer.concat(stderr).toString('utf8')
  );
  assert.equal(Buffer.concat(stdout).toString('utf8'), 'snapshot-complete\n');

  const snapshot = new DatabaseSync(destination, { readOnly: true });
  const row = snapshot.prepare('SELECT value FROM fixture').get();
  snapshot.close();
  assert.equal(row.value, 'kept');
}

async function testPostgresStreamLifecycle(testRoot) {
  const destination = join(
    testRoot,
    'postgres-stream-lifecycle',
    'agent-os.dump'
  );
  await mkdir(join(destination, '..'), {
    recursive: true,
    mode: 0o700
  });
  const fakeBin = join(testRoot, 'postgres-stream-fake-bin');
  await mkdir(fakeBin, { mode: 0o700 });
  const fakeDocker = join(fakeBin, 'docker');
  await writeFile(
    fakeDocker,
    [
      '#!/bin/sh',
      'case "${OPENCLAW_FAKE_DOCKER_EARLY_EXIT:-0}" in',
      '  success)',
      "    printf '%s\\n' '1; 1259 16384 TABLE public fixture postgres'",
      '    exit 0',
      '    ;;',
      '  nonzero)',
      "    printf '%s\\n' '1; 1259 16384 TABLE public fixture postgres'",
      '    exit 42',
      '    ;;',
      '  forbidden)',
      "    printf '%s\\n' '1; 0 0 ACL public fixture postgres'",
      '    exit 0',
      '    ;;',
      'esac',
      'cat >/dev/null',
      "printf '%s\\n' '1; 1259 16384 TABLE public fixture postgres'",
      ''
    ].join('\n'),
    { mode: 0o700 }
  );
  await chmod(fakeDocker, 0o700);
  const moduleUrl = new URL('./openclaw-backup.mjs', import.meta.url).href;
  const externalModuleUrl =
    new URL('./openclaw-backup-external.mjs', import.meta.url).href;
  const script = `
    import {
      readFile,
      stat,
      symlink,
      writeFile
    } from 'node:fs/promises';
    import {
      runBoundedCommandToFile,
      runCommandFromFile
    } from ${JSON.stringify(moduleUrl)};
    import {
      verifySupabasePublicDump
    } from ${JSON.stringify(externalModuleUrl)};

    const payload = 'PGDMP-postgres-stream-fixture';
    const bytes = await runBoundedCommandToFile(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        ${JSON.stringify(
          "process.stdout.write('PGDMP-postgres-stream-fixture')"
        )}
      ],
      process.argv[1],
      {
        label: 'PostgreSQL dump fixture',
        maxBytes: 64,
        timeoutMs: 5_000
      }
    );
    const captured = await readFile(process.argv[1]);
    if (
      bytes !== Buffer.byteLength(payload) ||
      captured.toString('ascii', 0, 5) !== 'PGDMP' ||
      captured.toString('utf8') !== payload
    ) {
      throw new Error('bounded PostgreSQL dump capture is invalid');
    }
    const boundedPartialPath = process.argv[1] + '.bounded-partial';
    let boundedError;
    try {
      await runBoundedCommandToFile(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          ${JSON.stringify(
            "process.stdout.write('PGDMP-postgres-stream-too-large')"
          )}
        ],
        boundedPartialPath,
        {
          label: 'oversized PostgreSQL dump fixture',
          maxBytes: 5,
          timeoutMs: 5_000
        }
      );
    } catch (error) {
      boundedError = error;
    }
    const boundedPartialInfo = await stat(boundedPartialPath);
    if (
      !/bounded output contract/.test(boundedError?.message || '') ||
      boundedPartialInfo.size > 5
    ) {
      throw new Error('bounded PostgreSQL partial write was not finalized');
    }
    await runCommandFromFile(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        ${JSON.stringify(`
          const chunks = [];
          process.stdin.on('data', (chunk) => chunks.push(chunk));
          process.stdin.on('end', () => {
            const input = Buffer.concat(chunks);
            if (input.toString('ascii', 0, 5) !== 'PGDMP') {
              process.exitCode = 1;
            }
          });
        `)}
      ],
      process.argv[1],
      {
        label: 'PostgreSQL read-stream fixture',
        timeoutMs: 5_000
      }
    );
    const previousPath = process.env.PATH;
    process.env.PATH = process.argv[2] + ':' + previousPath;
    try {
      const externalVerification =
        await verifySupabasePublicDump(process.argv[1]);
      if (externalVerification.tocEntries !== 1) {
        throw new Error('external PostgreSQL dump listing is invalid');
      }

      const earlyClosePath = process.argv[1] + '.early-close';
      const earlyClosePayload = Buffer.alloc(8 * 1024 * 1024);
      earlyClosePayload.write('PGDMP', 0, 'ascii');
      await writeFile(earlyClosePath, earlyClosePayload, {
        mode: 0o600
      });
      process.env.OPENCLAW_FAKE_DOCKER_EARLY_EXIT = 'success';
      const earlyCloseVerification =
        await verifySupabasePublicDump(earlyClosePath);
      if (earlyCloseVerification.tocEntries !== 1) {
        throw new Error(
          'early-close PostgreSQL dump listing is invalid'
        );
      }
      await runCommandFromFile(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          'process.exit(0)'
        ],
        earlyClosePath,
        {
          label: 'early-close PostgreSQL read-stream fixture',
          timeoutMs: 5_000,
          allowEarlyConsumerClose: true
        }
      );

      process.env.OPENCLAW_FAKE_DOCKER_EARLY_EXIT = 'nonzero';
      let nonzeroError;
      try {
        await verifySupabasePublicDump(earlyClosePath);
      } catch (error) {
        nonzeroError = error;
      }
      if (
        !/Supabase public dump listing failed/.test(
          nonzeroError?.message || ''
        )
      ) {
        throw new Error(
          'early-close child failure was incorrectly accepted'
        );
      }

      process.env.OPENCLAW_FAKE_DOCKER_EARLY_EXIT = 'forbidden';
      let forbiddenTocError;
      try {
        await verifySupabasePublicDump(earlyClosePath);
      } catch (error) {
        forbiddenTocError = error;
      }
      if (
        !/Supabase public dump TOC violates policy/.test(
          forbiddenTocError?.message || ''
        )
      ) {
        throw new Error(
          'early-close forbidden TOC was incorrectly accepted'
        );
      }
      delete process.env.OPENCLAW_FAKE_DOCKER_EARLY_EXIT;

      const symlinkPath = process.argv[1] + '.symlink';
      await symlink(process.argv[1], symlinkPath);
      let symlinkError;
      try {
        await verifySupabasePublicDump(symlinkPath);
      } catch (error) {
        symlinkError = error;
      }
      if (symlinkError?.code !== 'ELOOP') {
        throw new Error(
          'external PostgreSQL verification followed a symlink'
        );
      }
    } finally {
      process.env.PATH = previousPath;
    }
    process.stdout.write('postgres-stream-complete\\n');
  `;
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      script,
      destination,
      fakeBin
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const stdout = [];
  const stderr = [];
  let timedOut = false;
  child.stdout.on('data', (chunk) => stdout.push(chunk));
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, 10_000);
  const [code, signal] = await once(child, 'close');
  clearTimeout(timeout);
  assert.equal(
    timedOut,
    false,
    'PostgreSQL stream lifecycle subprocess hung'
  );
  assert.equal(
    code,
    0,
    `PostgreSQL stream lifecycle subprocess failed (${signal || 'no signal'}): ` +
      Buffer.concat(stderr).toString('utf8')
  );
  assert.equal(
    Buffer.concat(stdout).toString('utf8'),
    'postgres-stream-complete\n',
    'PostgreSQL stream lifecycle silently exited before finalization'
  );
  const captured = await readFile(destination);
  assert.equal(captured.toString('ascii', 0, 5), 'PGDMP');
  assert.equal(
    captured.toString('utf8'),
    'PGDMP-postgres-stream-fixture'
  );
}

async function testTopLevelMainProducesOutput(testRoot) {
  const scripts = [
    'openclaw-backup.mjs',
    'upload-openclaw-backup.mjs',
    'probe-openclaw-backup.mjs',
    'recover-openclaw-backup-manifest.mjs',
    'verify-openclaw-backup.mjs',
    'restore-openclaw-backup.mjs',
    'retain-openclaw-backups.mjs'
  ];
  for (const script of scripts) {
    const source = fileURLToPath(new URL(`./${script}`, import.meta.url));
    const installedEntrypoint = join(
      testRoot,
      `installed-current-${script}`
    );
    await symlink(source, installedEntrypoint);
    const child = spawn(
      process.execPath,
      [installedEntrypoint, '--help'],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 5_000);
    const [code, signal] = await once(child, 'close');
    clearTimeout(timeout);
    assert.equal(
      timedOut,
      false,
      `${script} hung through its installed-runtime symlink`
    );
    assert.equal(
      code,
      0,
      `${script} failed through its installed-runtime symlink ` +
        `(${signal || 'no signal'}): ` +
        Buffer.concat(stderr).toString('utf8')
    );
    assert.match(
      Buffer.concat(stdout).toString('utf8'),
      /^Usage:\s*$/m,
      `${script} silently exited through its installed-runtime symlink`
    );
  }
}

async function testOuterVerification(testRoot) {
  const setId = '20260727T120000Z-0123456789abcdef';
  const setDirectory = join(testRoot, setId);
  await mkdir(setDirectory, { mode: 0o700 });
  await chmod(setDirectory, 0o700);

  const chunkName = 'openclaw-backup.part-00000.gpg';
  const chunkPath = join(setDirectory, chunkName);
  const contents = Buffer.from('encrypted-fixture-bytes');
  await writeFile(chunkPath, contents, { mode: 0o600 });
  const sha256 = createHash('sha256').update(contents).digest('hex');
  const encryptedManifestName = 'manifest.json.gpg';
  const encryptedManifestContents = Buffer.from(
    'encrypted-manifest-fixture-bytes'
  );
  await writeFile(
    join(setDirectory, encryptedManifestName),
    encryptedManifestContents,
    { mode: 0o600 }
  );
  const encryptedManifestSha256 = createHash('sha256')
    .update(encryptedManifestContents)
    .digest('hex');
  await writeFile(
    join(setDirectory, 'manifest.json'),
    `${JSON.stringify(
      {
        schema: 'openclaw-backup-manifest/v1',
        setId,
        completedAt: '2026-07-27T12:00:00.000Z',
        archive: 'tar',
        compression: 'zstd',
        encryption: 'openpgp-public-recipient',
        recipientFingerprint: 'A'.repeat(40),
        signerFingerprint: 'B'.repeat(40),
        consistencyProof: {
          mode: 'best-effort',
          writersChecked: 1,
          writersStoppedBefore: false,
          writersStoppedAfter: null,
          protectedEntriesChecked: 0,
          protectedTreeStable: null
        },
        payloadBytesEstimate: 1024,
        chunkBytes: 64 * 1024 * 1024,
        totalBytes: contents.length,
        chunks: [{ name: chunkName, bytes: contents.length, sha256 }],
        encryptedManifest: {
          name: encryptedManifestName,
          bytes: encryptedManifestContents.length,
          sha256: encryptedManifestSha256
        }
      },
      null,
      2
    )}\n`,
    { mode: 0o600 }
  );

  const valid = await verifySet(setDirectory);
  assert.equal(valid.ok, true);
  assert.equal(valid.outerIntegrity, 'sha256-ok');

  const legacyManifest = JSON.parse(
    await readFile(join(setDirectory, 'manifest.json'), 'utf8')
  );
  const v2Manifest = {
    ...legacyManifest,
    schema: 'openclaw-backup-manifest/v2',
    payloadClass: 'invalid-tier',
    payloadManifest: {
      schema: 'openclaw-backup-path-manifest/v1',
      archivePath: 'backup-meta/path-manifest.json',
      bytes: 1024,
      sha256: 'c'.repeat(64),
      entries: 2,
      contentBytes: 1,
      hostPolicy: 'openclaw-host-recovery/v1'
    },
    payloadComponents: {
      agentOsProduction: {
        schema: 'openclaw-agent-os-production-capture/v2',
        included: false,
        reason: 'explicitly_skipped'
      }
    }
  };
  assert.throws(
    () => validateManifestShape(v2Manifest, setId),
    /payload class is invalid/
  );
  v2Manifest.payloadClass = 'core+browser';
  assert.doesNotThrow(() =>
    validateManifestShape(v2Manifest, setId)
  );

  await writeFile(chunkPath, Buffer.from('corrupted'));
  await assert.rejects(
    () => verifySet(setDirectory),
    /integrity verification failed/
  );
  assert.notEqual(await readFile(chunkPath, 'utf8'), 'encrypted-fixture-bytes');
}

main().catch((error) => {
  process.stderr.write(`openclaw_backup_contract_error: ${error.message}\n`);
  process.exitCode = 1;
});
