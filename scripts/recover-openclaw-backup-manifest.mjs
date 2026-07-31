#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import {
  lstat,
  open,
  realpath,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertTrustedDirectoryHierarchy,
  recoveryUid
} from './openclaw-backup-path-security.mjs';
import {
  decryptSignedManifest,
  validateManifestShape,
  verifySet
} from './verify-openclaw-backup.mjs';

const MAX_MANIFEST_BYTES = 1024 * 1024;
const ENCRYPTED_MANIFEST_NAME = 'manifest.json.gpg';

function usage() {
  return `Usage:
  node scripts/recover-openclaw-backup-manifest.mjs SET_DIRECTORY [options]

Run this only in an isolated recovery environment with the private recovery
key available to GnuPG. It decrypts manifest.json.gpg, reconstructs the local
manifest.json, and verifies every downloaded ciphertext chunk before returning.

It never decrypts the backup payload and refuses to replace an existing
manifest.json.

Options:
  --signer FINGERPRINT   Exact trusted backup-origin signing identity.
  --json                 Emit machine-readable output.`;
}

function parseArgs(argv) {
  const options = {
    setDirectory: '',
    signer: process.env.OPENCLAW_BACKUP_GPG_SIGNER || '',
    json: false,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--signer') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --signer');
      }
      options.signer = value;
      index += 1;
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
    throw new Error('A downloaded backup set directory is required');
  }
  if (
    !options.help &&
    !/^(?:[0-9A-Fa-f]{40}|[0-9A-Fa-f]{64})$/.test(options.signer)
  ) {
    throw new Error('An exact trusted --signer fingerprint is required');
  }
  return options;
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

async function recoverManifest(setDirectory, signerFingerprint) {
  const directory = await realpath(setDirectory);
  await assertTrustedDirectoryHierarchy(directory, {
    label: 'Downloaded backup set'
  });
  const expectedUid = recoveryUid();
  const directoryInfo = await stat(directory);
  if (
    !directoryInfo.isDirectory() ||
    directoryInfo.uid !== expectedUid ||
    (directoryInfo.mode & 0o077) !== 0
  ) {
    throw new Error(
      'Downloaded backup set must be a private directory owned by the recovery user'
    );
  }

  const manifestPath = join(directory, 'manifest.json');
  try {
    await lstat(manifestPath);
    throw new Error(
      'manifest.json already exists; verify it instead of replacing it'
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const encryptedManifestPath = join(
    directory,
    ENCRYPTED_MANIFEST_NAME
  );
  const encryptedInfo = await lstat(encryptedManifestPath);
  if (
    encryptedInfo.isSymbolicLink() ||
    !encryptedInfo.isFile() ||
    encryptedInfo.uid !== expectedUid ||
    (encryptedInfo.mode & 0o077) !== 0 ||
    encryptedInfo.size <= 0 ||
    encryptedInfo.size > MAX_MANIFEST_BYTES
  ) {
    throw new Error('Encrypted manifest is missing or invalid');
  }

  const trustedSigner = signerFingerprint.toUpperCase();
  const remoteManifest = await decryptSignedManifest(
    encryptedManifestPath,
    trustedSigner
  );
  if (
    !remoteManifest ||
    typeof remoteManifest !== 'object' ||
    Array.isArray(remoteManifest) ||
    Object.hasOwn(remoteManifest, 'encryptedManifest')
  ) {
    throw new Error('Encrypted remote manifest contract is invalid');
  }
  const manifest = {
    ...remoteManifest,
    encryptedManifest: {
      name: ENCRYPTED_MANIFEST_NAME,
      bytes: encryptedInfo.size,
      sha256: await sha256File(encryptedManifestPath)
    }
  };
  validateManifestShape(manifest, basename(directory));
  if (manifest.signerFingerprint !== trustedSigner) {
    throw new Error('Backup signer does not match the pinned identity');
  }

  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600, flag: 'wx' }
  );
  try {
    const verification = await verifySet(directory);
    return {
      schema: 'openclaw-backup-manifest-recovery/v1',
      ok: true,
      setId: manifest.setId,
      chunks: manifest.chunks.length,
      ciphertextBytes: manifest.totalBytes,
      verification: verification.outerIntegrity
    };
  } catch (error) {
    await rm(manifestPath, { force: false }).catch(() => {});
    throw error;
  }
}

async function main() {
  process.umask(0o077);
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await recoverManifest(
    options.setDirectory,
    options.signer
  );
  process.stdout.write(
    options.json
      ? `${JSON.stringify(result, null, 2)}\n`
      : `backup_manifest_recovery_ok set=${result.setId} chunks=${result.chunks}\n`
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
  const mainKeepAlive = setInterval(() => {}, 1_000);
  main()
    .catch((error) => {
      process.stderr.write(
        `openclaw_backup_manifest_recovery_error: ${error.message}\n`
      );
      process.exitCode = 1;
    })
    .finally(() => {
      clearInterval(mainKeepAlive);
    });
}
