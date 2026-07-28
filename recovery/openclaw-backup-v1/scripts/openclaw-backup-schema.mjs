/* eslint-disable no-control-regex -- Intentional trust-boundary validation. */

const ASCII_CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;

export const BACKUP_MANIFEST_V1 = 'openclaw-backup-manifest/v1';
export const BACKUP_MANIFEST_V2 = 'openclaw-backup-manifest/v2';
export const BACKUP_PAYLOAD_V1 = 'openclaw-backup-payload/v1';
export const BACKUP_PAYLOAD_V2 = 'openclaw-backup-payload/v2';
export const PATH_MANIFEST_SCHEMA =
  'openclaw-backup-path-manifest/v1';
export const HOST_RECOVERY_POLICY =
  'openclaw-host-recovery/v1';
export const HOST_RECOVERY_SKIPPED_POLICY =
  'openclaw-host-recovery/skipped-v1';
export const HOST_RECOVERY_POLICIES = new Set([
  HOST_RECOVERY_POLICY,
  HOST_RECOVERY_SKIPPED_POLICY
]);
export const HOST_ROOT_CRONTAB_REQUIRED = true;
export const PAYLOAD_CLASSES = new Set(['core', 'core+browser']);
export const PATH_MANIFEST_ARCHIVE_PATH =
  'backup-meta/path-manifest.json';
export const PRODUCTION_CAPTURE_V1 =
  'openclaw-agent-os-production-capture/v1';
export const PRODUCTION_CAPTURE_V2 =
  'openclaw-agent-os-production-capture/v2';
export const SUPABASE_AUTH_CONTROL_PLANE_SCHEMA =
  'openclaw-supabase-auth-control-plane-capture/v1';
export const SUPABASE_AUTH_CONTROL_PLANE_RESPONSE_SCHEMA =
  'openclaw-supabase-auth-control-plane-response/v1';

export const SUPABASE_AUTH_CONTROL_PLANE_ENDPOINTS =
  Object.freeze([
    Object.freeze({
      id: 'auth_config',
      endpointPath: 'config/auth',
      archiveName: 'config-auth.json',
      allowedStatuses: Object.freeze([200])
    }),
    Object.freeze({
      id: 'signing_keys',
      endpointPath: 'config/auth/signing-keys',
      archiveName: 'signing-keys.json',
      allowedStatuses: Object.freeze([200])
    }),
    Object.freeze({
      id: 'legacy_signing_key',
      endpointPath: 'config/auth/signing-keys/legacy',
      archiveName: 'signing-keys-legacy.json',
      allowedStatuses: Object.freeze([200, 404])
    }),
    Object.freeze({
      id: 'third_party_auth',
      endpointPath: 'config/auth/third-party-auth',
      archiveName: 'third-party-auth.json',
      allowedStatuses: Object.freeze([200])
    }),
    Object.freeze({
      id: 'sso_providers',
      endpointPath: 'config/auth/sso/providers',
      archiveName: 'sso-providers.json',
      allowedStatuses: Object.freeze([200, 404])
    })
  ]);

export const PRODUCTION_RECOVERY_LIMITATIONS = Object.freeze([
  'supabase-private-jwt-signing-keys-not-exported',
  'supabase-auth-provider-secrets-not-exported',
  'supabase-control-plane-automatic-recreation-not-supported'
]);

export const HOST_RECOVERY_DESCRIPTORS = Object.freeze([
  {
    id: 'openclaw_gateway_service',
    path: '/root/.config/systemd/user/openclaw-gateway.service',
    kind: 'file',
    required: true
  },
  {
    id: 'openclaw_gateway_dropins',
    path: '/root/.config/systemd/user/openclaw-gateway.service.d',
    kind: 'directory',
    required: true
  },
  {
    id: 'qaa_runner_service',
    path: '/etc/systemd/system/qaa-sladdis-web-runner.service',
    kind: 'file',
    required: true
  },
  {
    id: 'agent_os_postgres_cron',
    path: '/etc/cron.d/agent-os-postgres-backup',
    kind: 'file',
    required: true
  },
  {
    id: 'backup_maintenance_service',
    path: '/etc/systemd/system/openclaw-backup-maintenance.service',
    kind: 'file',
    required: true
  },
  {
    id: 'backup_maintenance_guard_service',
    path:
      '/etc/systemd/system/openclaw-backup-maintenance-guard.service',
    kind: 'file',
    required: true
  },
  {
    id: 'backup_maintenance_timer',
    path: '/etc/systemd/system/openclaw-backup-maintenance.timer',
    kind: 'file',
    required: true
  },
  {
    id: 'backup_alert_service',
    path: '/etc/systemd/system/openclaw-backup-alert@.service',
    kind: 'file',
    required: true
  },
  {
    id: 'backup_healthcheck_service',
    path: '/etc/systemd/system/openclaw-backup-healthcheck.service',
    kind: 'file',
    required: true
  },
  {
    id: 'backup_healthcheck_timer',
    path: '/etc/systemd/system/openclaw-backup-healthcheck.timer',
    kind: 'file',
    required: true
  },
  {
    id: 'host_filesystem_table',
    path: '/etc/fstab',
    kind: 'file',
    required: true
  },
  {
    id: 'host_cryptography_table',
    path: '/etc/crypttab',
    kind: 'file',
    required: true
  },
  {
    id: 'ufw_user_rules_v4',
    path: '/etc/ufw/user.rules',
    kind: 'file',
    required: true
  },
  {
    id: 'ufw_user_rules_v6',
    path: '/etc/ufw/user6.rules',
    kind: 'file',
    required: true
  },
  {
    id: 'ufw_configuration',
    path: '/etc/ufw/ufw.conf',
    kind: 'file',
    required: true
  },
  {
    id: 'ufw_sysctl',
    path: '/etc/ufw/sysctl.conf',
    kind: 'file',
    required: true
  },
  {
    id: 'ufw_before_rules_v4',
    path: '/etc/ufw/before.rules',
    kind: 'file',
    required: true
  },
  {
    id: 'ufw_before_rules_v6',
    path: '/etc/ufw/before6.rules',
    kind: 'file',
    required: true
  },
  {
    id: 'ufw_after_rules_v4',
    path: '/etc/ufw/after.rules',
    kind: 'file',
    required: true
  },
  {
    id: 'ufw_after_rules_v6',
    path: '/etc/ufw/after6.rules',
    kind: 'file',
    required: true
  },
  {
    id: 'ufw_defaults',
    path: '/etc/default/ufw',
    kind: 'file',
    required: true
  },
  {
    id: 'sshd_configuration',
    path: '/etc/ssh/sshd_config',
    kind: 'file',
    required: true
  },
  {
    id: 'sshd_dropins',
    path: '/etc/ssh/sshd_config.d',
    kind: 'directory',
    required: true
  },
  {
    id: 'docker_daemon_configuration',
    path: '/etc/docker/daemon.json',
    kind: 'file',
    required: false
  },
  {
    id: 'gogcli_configuration',
    path: '/root/.config/gogcli',
    kind: 'directory',
    required: true
  },
  {
    id: 'clerk_configuration',
    path: '/root/.config/clerk',
    kind: 'directory',
    required: true
  },
  {
    id: 'docker_client_configuration',
    path: '/root/.docker',
    kind: 'directory',
    required: true
  },
  {
    id: 'root_ssh_configuration',
    path: '/root/.ssh',
    kind: 'directory',
    required: true
  },
  {
    id: 'root_git_configuration',
    path: '/root/.gitconfig',
    kind: 'file',
    required: true
  }
]);

export function containsAsciiControl(value) {
  return ASCII_CONTROL_PATTERN.test(value);
}

export function isForbiddenBrowserRuntimeArchivePath(value) {
  const normalized = value.endsWith('/')
    ? value.slice(0, -1)
    : value;
  const segments = normalized.split('/');
  if (
    segments[0] !== '.openclaw' ||
    segments[1] !== 'browser'
  ) {
    return false;
  }
  const name = segments.at(-1);
  return (
    name === 'SingletonLock' ||
    name === 'SingletonCookie' ||
    name === 'SingletonSocket' ||
    name === 'DevToolsActivePort' ||
    name.endsWith('.pid') ||
    name.endsWith('.sock')
  );
}

export function normalizePayloadClass(value, {
  legacyMissingAsCore = false
} = {}) {
  if (value === undefined && legacyMissingAsCore) return 'core';
  if (!PAYLOAD_CLASSES.has(value)) {
    throw new Error('Backup payload class is invalid');
  }
  return value;
}

export function validateHostRecoveryDescriptors() {
  const ids = new Set();
  const paths = new Set();
  for (const descriptor of HOST_RECOVERY_DESCRIPTORS) {
    if (
      !/^[a-z0-9_]+$/.test(descriptor.id) ||
      typeof descriptor.path !== 'string' ||
      !descriptor.path.startsWith('/') ||
      containsAsciiControl(descriptor.path) ||
      typeof descriptor.required !== 'boolean' ||
      !['file', 'directory', 'symlink'].includes(
        descriptor.kind
      ) ||
      ids.has(descriptor.id) ||
      paths.has(descriptor.path)
    ) {
      throw new Error('Host recovery descriptor contract is invalid');
    }
    ids.add(descriptor.id);
    paths.add(descriptor.path);
  }
  return true;
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function hasExactKeys(value, expectedKeys) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).toSorted()) ===
      JSON.stringify([...expectedKeys].toSorted())
  );
}

export function validateAuthControlPlaneSummary(value) {
  if (
    !hasExactKeys(value, [
      'schema',
      'consistency',
      'artifactCount',
      'unrestorableValueCount',
      'totalBytes',
      'rootSha256',
      'artifacts'
    ]) ||
    value.schema !== SUPABASE_AUTH_CONTROL_PLANE_SCHEMA ||
    value.consistency !== 'canonical-before-after' ||
    value.artifactCount !==
      SUPABASE_AUTH_CONTROL_PLANE_ENDPOINTS.length ||
    !Number.isSafeInteger(value.unrestorableValueCount) ||
    value.unrestorableValueCount < 0 ||
    !isPositiveInteger(value.totalBytes) ||
    !isSha256(value.rootSha256) ||
    !Array.isArray(value.artifacts) ||
    value.artifacts.length !== value.artifactCount
  ) {
    throw new Error(
      'Supabase Auth control-plane summary is invalid'
    );
  }
  let totalBytes = 0;
  let unrestorableValueCount = 0;
  for (
    let index = 0;
    index < SUPABASE_AUTH_CONTROL_PLANE_ENDPOINTS.length;
    index += 1
  ) {
    const descriptor =
      SUPABASE_AUTH_CONTROL_PLANE_ENDPOINTS[index];
    const artifact = value.artifacts[index];
    if (
      !hasExactKeys(artifact, [
        'id',
        'endpointPath',
        'archivePath',
        'httpStatus',
        'unrestorableValueCount',
        'bytes',
        'sha256'
      ]) ||
      artifact.id !== descriptor.id ||
      artifact.endpointPath !== descriptor.endpointPath ||
      artifact.archivePath !==
        `external/agent-os-production/auth-control-plane/${descriptor.archiveName}` ||
      !descriptor.allowedStatuses.includes(
        artifact.httpStatus
      ) ||
      !Number.isSafeInteger(
        artifact.unrestorableValueCount
      ) ||
      artifact.unrestorableValueCount < 0 ||
      !isPositiveInteger(artifact.bytes) ||
      !isSha256(artifact.sha256)
    ) {
      throw new Error(
        'Supabase Auth control-plane artifact summary is invalid'
      );
    }
    totalBytes += artifact.bytes;
    unrestorableValueCount +=
      artifact.unrestorableValueCount;
  }
  if (
    !Number.isSafeInteger(totalBytes) ||
    totalBytes !== value.totalBytes ||
    !Number.isSafeInteger(unrestorableValueCount) ||
    unrestorableValueCount !== value.unrestorableValueCount
  ) {
    throw new Error(
      'Supabase Auth control-plane byte summary is invalid'
    );
  }
  return value;
}

export function validateProductionDataSummary(
  value,
  expectedSetId
) {
  const legacy = value?.schema === PRODUCTION_CAPTURE_V1;
  const current = value?.schema === PRODUCTION_CAPTURE_V2;
  if (
    !value ||
    (!legacy && !current) ||
    typeof value.included !== 'boolean'
  ) {
    throw new Error(
      'Agent OS production data summary is invalid'
    );
  }
  if (!value.included) {
    if (
      !hasExactKeys(value, ['schema', 'included', 'reason']) ||
      !['explicitly_skipped', 'configuration_incomplete',
        'configuration_or_client_invalid', 'not_captured']
        .includes(value.reason)
    ) {
      throw new Error(
        'Skipped Agent OS production data summary is invalid'
      );
    }
    return value;
  }
  const publicDump = value.publicDump;
  const auth = value.auth;
  const media = value.media;
  const capabilities = value.recoveryCapabilities;
  if (current) {
    validateAuthControlPlaneSummary(value.authControlPlane);
  }
  if (
    (
      current &&
      (
        !hasExactKeys(value, [
          'schema',
          'included',
          'captureId',
          'projectRefSha256',
          'publicDump',
          'auth',
          'authControlPlane',
          'media',
          'recoveryCapabilities',
          'recoveryLimitations'
        ]) ||
        !hasExactKeys(publicDump, [
          'archivePath',
          'bytes',
          'sha256',
          'format',
          'pgMajor',
          'schemas',
          'tocSha256',
          'tocEntries'
        ]) ||
        !hasExactKeys(auth, [
          'archivePath',
          'bytes',
          'sha256',
          'tableCount',
          'userCount',
          'dataIncluded',
          'providerConfigIncluded'
        ]) ||
        !hasExactKeys(media, [
          'inventoryPath',
          'inventoryBytes',
          'inventorySha256',
          'rowCount',
          'uniqueObjectCount',
          'totalBytes',
          'objectRootSha256'
        ]) ||
        !hasExactKeys(capabilities, [
          'supabasePublicData',
          'supabaseAuthData',
          'vercelMediaObjects',
          'supabaseAuthControlPlaneMetadata',
          'supabaseAuthProviderConfig',
          'supabaseControlPlane',
          'fullProductionRecovery'
        ])
      )
    ) ||
    value.captureId !== expectedSetId ||
    !isSha256(value.projectRefSha256) ||
    publicDump?.archivePath !==
      'external/agent-os-production/public.dump' ||
    publicDump.format !== 'pg-custom' ||
    publicDump.pgMajor !== 17 ||
    JSON.stringify(publicDump.schemas) !== '["public"]' ||
    !isPositiveInteger(publicDump.bytes) ||
    !isSha256(publicDump.sha256) ||
    !isSha256(publicDump.tocSha256) ||
    !isPositiveInteger(publicDump.tocEntries) ||
    auth?.archivePath !==
      'external/agent-os-production/auth.json' ||
    !isPositiveInteger(auth.bytes) ||
    !isSha256(auth.sha256) ||
    !isPositiveInteger(auth.tableCount) ||
    !Number.isSafeInteger(auth.userCount) ||
    auth.userCount < 0 ||
    auth.dataIncluded !== true ||
    auth.providerConfigIncluded !== false ||
    media?.inventoryPath !==
      'external/agent-os-production/media-inventory.json' ||
    !isPositiveInteger(media.inventoryBytes) ||
    !isSha256(media.inventorySha256) ||
    !Number.isSafeInteger(media.rowCount) ||
    media.rowCount < 0 ||
    !Number.isSafeInteger(media.uniqueObjectCount) ||
    media.uniqueObjectCount < 0 ||
    !Number.isSafeInteger(media.totalBytes) ||
    media.totalBytes < 0 ||
    !isSha256(media.objectRootSha256) ||
    !capabilities ||
    capabilities.supabasePublicData !== true ||
    capabilities.supabaseAuthData !== true ||
    capabilities.vercelMediaObjects !== true ||
    (
      current &&
      capabilities.supabaseAuthControlPlaneMetadata !== true
    ) ||
    (
      legacy &&
      Object.hasOwn(
        capabilities,
        'supabaseAuthControlPlaneMetadata'
      )
    ) ||
    capabilities.supabaseAuthProviderConfig !== false ||
    capabilities.supabaseControlPlane !== false ||
    capabilities.fullProductionRecovery !== false ||
    (
      current &&
      JSON.stringify(value.recoveryLimitations) !==
        JSON.stringify(PRODUCTION_RECOVERY_LIMITATIONS)
    )
  ) {
    throw new Error(
      'Included Agent OS production data summary is invalid'
    );
  }
  return value;
}

validateHostRecoveryDescriptors();
