# OpenClaw backup recovery kit v1

This branch is the clean-machine bootstrap for an encrypted OpenClaw backup.
It contains no recovery private key, storage credential, host upload secret, or
production environment file.

## Trust bootstrap

Obtain this branch from:

```bash
git clone \
  --branch openclaw-backup-recovery-v1 \
  --single-branch \
  https://github.com/felipeotarola/agent-os.git
cd agent-os
sha256sum --check recovery/openclaw-backup-v1/CHECKSUMS.sha256
```

Independently compare the value in
`recovery/openclaw-backup-v1/TRUSTED_SIGNER_FINGERPRINT` with the copy kept
alongside the offline recovery private key. A repository checkout alone is not
an independent trust anchor.

Create a private recovery keyring and import the public origin-signing key:

```bash
export GNUPGHOME="$PWD/.recovery-gnupg"
install -d -m 0700 "$GNUPGHOME"
gpg --batch --import \
  recovery/openclaw-backup-v1/origin-signing-public.asc
gpg --batch --with-colons --fingerprint |
  awk -F: '$1 == "fpr" { print $10 }'
```

The displayed primary fingerprint must be exactly:

```text
9E49C2F57BCD887ACCF531E69AB4901020F94CDA
```

Import the separately held recovery private key into this isolated keyring.
Never retrieve that private key from the failed OpenClaw host or from the
backup store itself.

## Recovery dependencies

- Node.js 22 or newer, including `node:sqlite`
- GnuPG
- GNU tar
- zstd
- PostgreSQL client matching the backed-up PostgreSQL major version

## Download a completed set

Use a separate recovery identity with read/list access to the private store.
The failed production host's upload identity is intentionally unable to read or
list backups.

Download one exact set prefix into a new directory named after the set ID.
Require the encrypted `manifest.json.gpg` completion marker. Flatten only the
final filenames into that directory and apply mode `0700` to the directory and
`0600` to every file. Do not download into the repository or restore root.

## Verify and fence the restore

Set the trusted signer fingerprint:

```bash
export OPENCLAW_BACKUP_GPG_SIGNER="$(
  tr -d '[:space:]' <
    recovery/openclaw-backup-v1/TRUSTED_SIGNER_FINGERPRINT
)"
```

Reconstruct the plaintext outer manifest from the signed encrypted completion
marker:

```bash
node scripts/recover-openclaw-backup-manifest.mjs \
  /absolute/path/to/<set-id> \
  --signer "$OPENCLAW_BACKUP_GPG_SIGNER" \
  --json
```

Perform a complete cryptographic and archive verification:

```bash
node scripts/verify-openclaw-backup.mjs \
  /absolute/path/to/<set-id> \
  --deep \
  --signer "$OPENCLAW_BACKUP_GPG_SIGNER" \
  --json
```

Create an empty restore root owned by the recovery user and extract only into
that fenced location:

```bash
install -d -m 0700 /absolute/path/to/empty-restore-root
node scripts/restore-openclaw-backup.mjs \
  /absolute/path/to/<set-id> \
  --execute \
  --target /absolute/path/to/empty-restore-root \
  --signer "$OPENCLAW_BACKUP_GPG_SIGNER" \
  --json
```

The restore validates every inventoried SQLite database, fences restored cron
jobs, empties delivery queues in the working copies, quarantines replayable
ingress state, and verifies the PostgreSQL dump with `pg_restore --list`.

Do not start restored services or reconnect external channels from this
inspection root. Restore PostgreSQL into a new empty database with outbound
side effects blocked, review destinations and credentials, and promote services
one at a time only after the fenced evidence has been reviewed.
