import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Transport-independent, file-backed credential vault.
 *
 * The module deliberately has no Next.js, OpenClaw, bridge, database, or blob
 * dependencies. A self-hosted Next route can call it directly. A Vercel-hosted
 * UI cannot see the VPS filesystem and must call a small authenticated service
 * on the VPS that uses this same module.
 */

export const DEFAULT_CREDENTIAL_VAULT_DIR = '/root/.openclaw/secrets/agent-os';

const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]{1,79}$/;
const MAX_SECRET_BYTES = 16_384;
const MAX_SECRET_DESCRIPTION_LENGTH = 240;
const MAX_SECRET_PROJECT_LENGTH = 80;
const FINGERPRINT_KEY_FILE = '.vault-fingerprint.key';
const QUARANTINE_DIR = '.trash';

export class CredentialVaultError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'CredentialVaultError';
    this.status = status;
  }
}

function isFileSystemError(error, code) {
  return error instanceof Error && 'code' in error && error.code === code;
}

function normalizeSecretName(rawName) {
  const name = String(rawName ?? '')
    .trim()
    .toUpperCase();

  if (!SECRET_NAME_PATTERN.test(name)) {
    throw new CredentialVaultError(
      'Secret names must look like ENV vars, e.g. OPENAI_API_KEY.',
      400
    );
  }

  return name;
}

function requireSecretInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CredentialVaultError('Credential payload must be a JSON object.', 400);
  }

  return input;
}

function sanitizeDescription(value) {
  return String(value ?? '')
    .trim()
    .slice(0, MAX_SECRET_DESCRIPTION_LENGTH);
}

function sanitizeProject(value) {
  return String(value ?? '')
    .trim()
    .slice(0, MAX_SECRET_PROJECT_LENGTH);
}

function timestampId() {
  return `${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}-${randomUUID()}`;
}

export function createCredentialVault(options = {}) {
  const secretsDir = path.resolve(
    String(
      options.secretsDir ||
        process.env.AGENT_OS_SECRETS_DIR ||
        DEFAULT_CREDENTIAL_VAULT_DIR
    )
  );
  const quarantineRoot = path.join(secretsDir, QUARANTINE_DIR);
  const configuredFingerprintKey = String(
    options.fingerprintKey || process.env.AGENT_OS_VAULT_FINGERPRINT_KEY || ''
  );

  function secretPath(name) {
    return path.join(secretsDir, normalizeSecretName(name));
  }

  function metadataPath(name) {
    return `${secretPath(name)}.meta.json`;
  }

  async function ensurePrivateDirectory(directory) {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.chmod(directory, 0o700);
  }

  async function ensureSecretsDir() {
    await ensurePrivateDirectory(secretsDir);
  }

  async function fingerprintKey() {
    if (configuredFingerprintKey) return configuredFingerprintKey;

    await ensureSecretsDir();
    const keyPath = path.join(secretsDir, FINGERPRINT_KEY_FILE);

    try {
      const storedKey = (await fs.readFile(keyPath, 'utf8')).trim();
      if (!storedKey) {
        throw new CredentialVaultError('Credential fingerprint key is empty.', 500);
      }
      return storedKey;
    } catch (error) {
      if (!isFileSystemError(error, 'ENOENT')) throw error;
    }

    const generatedKey = randomBytes(32).toString('hex');
    try {
      await fs.writeFile(keyPath, `${generatedKey}\n`, { flag: 'wx', mode: 0o600 });
      return generatedKey;
    } catch (error) {
      if (!isFileSystemError(error, 'EEXIST')) throw error;
      const storedKey = (await fs.readFile(keyPath, 'utf8')).trim();
      if (!storedKey) {
        throw new CredentialVaultError('Credential fingerprint key is empty.', 500);
      }
      return storedKey;
    }
  }

  async function fingerprint(value) {
    return createHmac('sha256', await fingerprintKey())
      .update(value)
      .digest('hex')
      .slice(0, 12);
  }

  async function readMetadata(name) {
    try {
      const raw = await fs.readFile(metadataPath(name), 'utf8');
      const parsed = JSON.parse(raw);
      return parsed?.name === name ? parsed : { name };
    } catch {
      return { name };
    }
  }

  async function readValue(name, metadata) {
    const valueBuffer = await fs.readFile(secretPath(name));
    const storedBytes = Number(metadata?.bytes);
    const hasExactLength = storedBytes === valueBuffer.length;
    const hasLegacyLf = storedBytes === valueBuffer.length - 1 && valueBuffer.at(-1) === 0x0a;
    const hasLegacyCrlf =
      storedBytes === valueBuffer.length - 2 &&
      valueBuffer.at(-2) === 0x0d &&
      valueBuffer.at(-1) === 0x0a;

    if (
      Number.isInteger(storedBytes) &&
      storedBytes >= 0 &&
      (hasExactLength || hasLegacyLf || hasLegacyCrlf)
    ) {
      return valueBuffer.subarray(0, storedBytes).toString('utf8');
    }

    return valueBuffer.toString('utf8').replace(/\r?\n$/, '');
  }

  async function buildMetadata(name, value, input, preservedFingerprint = '') {
    if (!value.trim()) {
      throw new CredentialVaultError('Secret value is required.', 400);
    }

    const bytes = Buffer.byteLength(value, 'utf8');
    if (bytes > MAX_SECRET_BYTES) {
      throw new CredentialVaultError('Secret is too large.', 400);
    }

    return {
      name,
      project: sanitizeProject(input.project),
      description: sanitizeDescription(input.description),
      fingerprint: preservedFingerprint || (await fingerprint(value)),
      bytes,
      updatedAt: new Date().toISOString()
    };
  }

  function publicSecret(metadata) {
    return { ...metadata };
  }

  async function writeReplacement(name, value, input, preservedFingerprint = '') {
    const metadata = await buildMetadata(name, value, input, preservedFingerprint);
    await ensureSecretsDir();

    const suffix = `${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
    const temporarySecretPath = `${secretPath(name)}.${suffix}`;
    const temporaryMetadataPath = `${metadataPath(name)}.${suffix}`;
    const backupSecretPath = `${secretPath(name)}.${suffix}.backup`;
    const backupMetadataPath = `${metadataPath(name)}.${suffix}.backup`;
    let hasSecretBackup = false;
    let hasMetadataBackup = false;
    let replacedSecret = false;
    let replacedMetadata = false;
    let completed = false;

    try {
      await fs.writeFile(temporarySecretPath, value, { mode: 0o600 });
      await fs.writeFile(temporaryMetadataPath, `${JSON.stringify(metadata, null, 2)}\n`, {
        mode: 0o600
      });
      await fs.link(secretPath(name), backupSecretPath);
      hasSecretBackup = true;
      try {
        await fs.link(metadataPath(name), backupMetadataPath);
        hasMetadataBackup = true;
      } catch (error) {
        if (!isFileSystemError(error, 'ENOENT')) throw error;
      }
      await fs.rename(temporarySecretPath, secretPath(name));
      replacedSecret = true;
      await fs.rename(temporaryMetadataPath, metadataPath(name));
      replacedMetadata = true;
      await Promise.all([fs.chmod(secretPath(name), 0o600), fs.chmod(metadataPath(name), 0o600)]);
      completed = true;
    } catch (error) {
      if (replacedSecret && hasSecretBackup) {
        await fs.rename(backupSecretPath, secretPath(name));
        hasSecretBackup = false;
      }
      if (replacedMetadata) {
        if (hasMetadataBackup) {
          await fs.rename(backupMetadataPath, metadataPath(name));
          hasMetadataBackup = false;
        } else {
          await fs.rm(metadataPath(name), { force: true });
        }
      }
      throw error;
    } finally {
      await Promise.all([
        fs.rm(temporarySecretPath, { force: true }),
        fs.rm(temporaryMetadataPath, { force: true }),
        ...(completed || !replacedSecret
          ? [fs.rm(backupSecretPath, { force: true })]
          : []),
        ...(completed || !replacedMetadata
          ? [fs.rm(backupMetadataPath, { force: true })]
          : [])
      ]);
    }

    return { secret: publicSecret(metadata) };
  }

  async function listSecrets() {
    await ensureSecretsDir();
    const entries = await fs.readdir(secretsDir, { withFileTypes: true });
    const names = entries
      .filter((entry) => entry.isFile() && SECRET_NAME_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .toSorted();

    const secrets = await Promise.all(
      names.map(async (name) => {
        const metadata = await readMetadata(name);
        const value = await readValue(name, metadata);
        const storedFingerprint = String(metadata.fingerprint ?? '').trim();
        return publicSecret({
          name,
          project: sanitizeProject(metadata.project),
          description: sanitizeDescription(metadata.description),
          bytes: Number(metadata.bytes ?? Buffer.byteLength(value, 'utf8')),
          fingerprint: storedFingerprint || (await fingerprint(value)),
          updatedAt: String(metadata.updatedAt ?? new Date(0).toISOString())
        });
      })
    );

    return { secrets };
  }

  async function createSecret(input) {
    const payload = requireSecretInput(input);
    const name = normalizeSecretName(payload.name);
    const value = String(payload.value ?? '');
    const metadata = await buildMetadata(name, value, payload);
    await ensureSecretsDir();

    const suffix = `${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
    const temporarySecretPath = `${secretPath(name)}.${suffix}`;
    const temporaryMetadataPath = `${metadataPath(name)}.${suffix}`;
    let createdSecret = false;
    let createdMetadata = false;

    try {
      await fs.writeFile(temporarySecretPath, value, { mode: 0o600 });
      await fs.writeFile(temporaryMetadataPath, `${JSON.stringify(metadata, null, 2)}\n`, {
        mode: 0o600
      });
      try {
        await fs.link(temporarySecretPath, secretPath(name));
        createdSecret = true;
      } catch (error) {
        if (!isFileSystemError(error, 'EEXIST')) throw error;
        throw new CredentialVaultError(
          'Credential already exists. Use edit to replace its value.',
          409
        );
      }
      await fs.rename(temporaryMetadataPath, metadataPath(name));
      createdMetadata = true;
      await Promise.all([fs.chmod(secretPath(name), 0o600), fs.chmod(metadataPath(name), 0o600)]);
    } catch (error) {
      if (createdSecret) await fs.rm(secretPath(name), { force: true });
      if (createdMetadata) await fs.rm(metadataPath(name), { force: true });
      throw error;
    } finally {
      await Promise.all([
        fs.rm(temporarySecretPath, { force: true }),
        fs.rm(temporaryMetadataPath, { force: true })
      ]);
    }

    return { secret: publicSecret(metadata) };
  }

  async function updateSecret(rawName, input) {
    const name = normalizeSecretName(rawName);
    const payload = requireSecretInput(input);
    if (!['project', 'description', 'value'].some((field) => Object.hasOwn(payload, field))) {
      throw new CredentialVaultError(
        'Provide project, description, or a replacement value.',
        400
      );
    }

    let currentMetadata;
    let currentValue;
    try {
      currentMetadata = await readMetadata(name);
      currentValue = await readValue(name, currentMetadata);
    } catch (error) {
      if (!isFileSystemError(error, 'ENOENT')) throw error;
      throw new CredentialVaultError('Managed credential not found.', 404);
    }

    const replacesValue = Object.hasOwn(payload, 'value');
    const nextValue = replacesValue ? String(payload.value ?? '') : currentValue;
    if (replacesValue && !nextValue.trim()) {
      throw new CredentialVaultError('Replacement value cannot be empty.', 400);
    }

    const preservedFingerprint = replacesValue
      ? ''
      : String(currentMetadata.fingerprint ?? '').trim() || (await fingerprint(currentValue));

    return writeReplacement(
      name,
      nextValue,
      {
        project: Object.hasOwn(payload, 'project') ? payload.project : currentMetadata.project,
        description: Object.hasOwn(payload, 'description')
          ? payload.description
          : currentMetadata.description
      },
      preservedFingerprint
    );
  }

  async function deleteSecret(rawName) {
    const name = normalizeSecretName(rawName);
    await ensureSecretsDir();
    await ensurePrivateDirectory(quarantineRoot);

    const quarantineId = timestampId();
    const quarantineDir = path.join(quarantineRoot, quarantineId);
    await ensurePrivateDirectory(quarantineDir);

    const candidates = [
      { source: secretPath(name), destination: path.join(quarantineDir, name) },
      {
        source: metadataPath(name),
        destination: path.join(quarantineDir, `${name}.meta.json`)
      }
    ];
    const moved = [];

    try {
      for (const candidate of candidates) {
        try {
          await fs.rename(candidate.source, candidate.destination);
          moved.push(candidate);
          await fs.chmod(candidate.destination, 0o600);
        } catch (error) {
          if (!isFileSystemError(error, 'ENOENT')) throw error;
        }
      }

      if (moved.length === 0) {
        await fs.rmdir(quarantineDir);
        return { name, deleted: true, quarantined: false, quarantineId: null };
      }

      const manifest = {
        format: 'agent-os.credential-quarantine.v1',
        name,
        deletedAt: new Date().toISOString(),
        files: moved.map(({ destination }) => path.basename(destination))
      };
      await fs.writeFile(
        path.join(quarantineDir, 'manifest.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
        { mode: 0o600, flag: 'wx' }
      );

      return { name, deleted: true, quarantined: true, quarantineId };
    } catch (error) {
      let rollbackComplete = true;
      for (const candidate of moved.toReversed()) {
        try {
          await fs.rename(candidate.destination, candidate.source);
        } catch {
          rollbackComplete = false;
        }
      }
      if (rollbackComplete) await fs.rm(quarantineDir, { recursive: true, force: true });
      throw error;
    }
  }

  return Object.freeze({
    secretsDir,
    listSecrets,
    createSecret,
    updateSecret,
    deleteSecret
  });
}

export const credentialVault = createCredentialVault();
