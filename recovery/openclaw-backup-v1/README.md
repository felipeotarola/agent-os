# OpenClaw backup recovery kit v1.2.0

This is the clean-machine bootstrap for an encrypted OpenClaw backup. Kit
release v1.2.0 contains recovery tooling for the current
`openclaw-backup-manifest/v2` and `openclaw-backup-payload/v2` formats. The
tools retain reduced-assurance read compatibility with legacy v1 sets, but only
v2 binds an exact encrypted path-and-content manifest.

The kit-local files under `scripts/` are the complete runtime import closure for
manifest recovery, deep verification, and fenced restore. It contains no
recovery private key, storage credential, host upload secret, or production
environment file.

## Trust bootstrap

Obtain the immutable signed recovery tag on an isolated recovery machine. Get
the exact release commit separately from the independent record stored with the
offline recovery key; do not learn that value from this repository or the
backup store:

```bash
export OPENCLAW_RECOVERY_TAG=\
openclaw-backup-recovery-kit-v1.2.0
export OPENCLAW_RECOVERY_COMMIT=\
'PASTE_EXACT_COMMIT_FROM_THE_INDEPENDENT_RECORD'
test "$OPENCLAW_RECOVERY_COMMIT" != \
  'PASTE_EXACT_COMMIT_FROM_THE_INDEPENDENT_RECORD'
test "$OPENCLAW_RECOVERY_COMMIT" = \
  "$(printf '%s' "$OPENCLAW_RECOVERY_COMMIT" |
    tr '[:upper:]' '[:lower:]')"
test "${#OPENCLAW_RECOVERY_COMMIT}" -eq 40
test -z "$(printf '%s' "$OPENCLAW_RECOVERY_COMMIT" |
  tr -d '0-9a-f')"

git clone \
  --branch "$OPENCLAW_RECOVERY_TAG" \
  --single-branch \
  https://github.com/felipeotarola/agent-os.git
cd agent-os
test "$(git rev-parse HEAD)" = "$OPENCLAW_RECOVERY_COMMIT"
test "$(git rev-parse "${OPENCLAW_RECOVERY_TAG}^{commit}")" = \
  "$OPENCLAW_RECOVERY_COMMIT"
export OPENCLAW_RECOVERY_KIT="$PWD/recovery/openclaw-backup-v1"
```

Before trusting anything from the checkout, obtain the origin-signing
fingerprint from the independent record stored alongside the offline recovery
private key. Enter that value yourself; do not derive it from this checkout.
A file, public key, command, or fingerprint printed by the same repository is
not an independent trust anchor. The expected primary fingerprint for this
release is:

```text
11EAFE1BD7AD1BEE296B24565C8124C33417F2D7
```

Create a new empty private GnuPG home outside the repository. The following
bootstrap requires the checkout fingerprint to equal the independently entered
value, requires the public export to contain exactly one primary key and no
secret key, and binds the detached signature's exact `VALIDSIG` fingerprint to
that same value:

```bash
set -Eeuo pipefail
umask 077

export OPENCLAW_BACKUP_GPG_SIGNER=\
'PASTE_FINGERPRINT_FROM_THE_INDEPENDENT_RECORD'
test "$OPENCLAW_BACKUP_GPG_SIGNER" = \
  11EAFE1BD7AD1BEE296B24565C8124C33417F2D7
test "$(
  tr -d '[:space:]' <
    "$OPENCLAW_RECOVERY_KIT/TRUSTED_SIGNER_FINGERPRINT"
)" = "$OPENCLAW_BACKUP_GPG_SIGNER"

export GNUPGHOME=/absolute/private/path/recovery-gnupg
install -d -m 0700 "$GNUPGHOME"
test -z "$(
  find "$GNUPGHOME" -mindepth 1 -maxdepth 1 -print -quit
)"
gpg --batch --import "$OPENCLAW_RECOVERY_KIT/origin-signing-public.asc"

mapfile -t IMPORTED_PRIMARY_FINGERPRINTS < <(
  gpg --batch --with-colons --list-keys |
    awk -F: '
      $1 == "pub" { want_primary = 1; next }
      want_primary && $1 == "fpr" {
        print toupper($10)
        want_primary = 0
      }
    '
)
test "${#IMPORTED_PRIMARY_FINGERPRINTS[@]}" -eq 1
test "${IMPORTED_PRIMARY_FINGERPRINTS[0]}" = \
  "$OPENCLAW_BACKUP_GPG_SIGNER"
test -z "$(
  gpg --batch --with-colons --list-secret-keys |
    awk -F: '$1 == "sec" { print $5 }'
)"

SIGNATURE_STATUS="$(
  gpg --batch --status-fd 1 --verify \
    "$OPENCLAW_RECOVERY_KIT/CHECKSUMS.sha256.asc" \
    "$OPENCLAW_RECOVERY_KIT/CHECKSUMS.sha256"
)"
mapfile -t VALID_SIGNATURE_FINGERPRINTS < <(
  awk '
    $1 == "[GNUPG:]" && $2 == "VALIDSIG" {
      print toupper($3)
    }
  ' <<<"$SIGNATURE_STATUS"
)
test "${#VALID_SIGNATURE_FINGERPRINTS[@]}" -eq 1
test "${VALID_SIGNATURE_FINGERPRINTS[0]}" = \
  "$OPENCLAW_BACKUP_GPG_SIGNER"
sha256sum --check "$OPENCLAW_RECOVERY_KIT/CHECKSUMS.sha256"
git verify-tag "$OPENCLAW_RECOVERY_TAG"
```

Stop if any command fails. In particular, do not weaken the exact key-count or
`VALIDSIG` comparisons. Only after all checks pass should the separately held
recovery private key be imported into this isolated keyring. Never retrieve
that private key from the failed OpenClaw host or from the backup store itself.

## Recovery dependencies

- A Unix recovery host with Node.js 22.13.0 or newer, including unflagged
  `node:sqlite`
- GnuPG
- GNU tar
- zstd
- Docker Engine with a running daemon. The production-dump verifier runs the
  pinned PostgreSQL 17 image with `--network none`; preload that exact digest
  before fencing the recovery host if it is not already cached.
- `pg_restore` from a PostgreSQL client compatible with the backed-up major
  version
- Free space greater than the signed payload estimate plus the restore tool's
  5 GiB safety floor

## Download one completed set

Use a separate recovery identity with read/list access to the private store.
The failed production host's upload identity is intentionally unable to read or
list backups.

Download one exact set prefix into a new directory whose basename is the set
ID, for example `20260727T010203Z-0123456789abcdef`. Require the encrypted
`manifest.json.gpg` completion marker and every numbered ciphertext chunk
declared by it. Flatten only the final filenames into the set directory. The
directory must be owned by the recovery user with mode `0700`; every downloaded
file must be owned by that user with mode `0600`. Keep the set outside both the
repository and the restore target.

```bash
export OPENCLAW_BACKUP_SET=\
/absolute/recovery/sets/20260727T010203Z-0123456789abcdef
```

## Recover and verify the manifest

Reconstruct `manifest.json` from the signed encrypted completion marker. This
step refuses to overwrite an existing plaintext manifest and verifies the
downloaded ciphertext set before returning:

```bash
node "$OPENCLAW_RECOVERY_KIT/scripts/recover-openclaw-backup-manifest.mjs" \
  "$OPENCLAW_BACKUP_SET" \
  --signer "$OPENCLAW_BACKUP_GPG_SIGNER" \
  --json
```

Then perform the pinned-signature deep check. It streams
`gpg -> zstd -> tar`, writes no decrypted payload to disk, validates the exact
archive member policy, and verifies the v2 payload-manifest binding:

```bash
node "$OPENCLAW_RECOVERY_KIT/scripts/verify-openclaw-backup.mjs" \
  "$OPENCLAW_BACKUP_SET" \
  --deep \
  --signer "$OPENCLAW_BACKUP_GPG_SIGNER" \
  --json
```

## Create a fenced inspection restore

The restore target must already exist, be empty, be owned by the recovery user,
have mode `0700` or stricter, and be isolated from the backup set and
`/root/.openclaw`.

Review the non-mutating plan first:

```bash
node "$OPENCLAW_RECOVERY_KIT/scripts/restore-openclaw-backup.mjs" \
  "$OPENCLAW_BACKUP_SET" \
  --target /absolute/path/to/empty-restore-root \
  --signer "$OPENCLAW_BACKUP_GPG_SIGNER" \
  --json
```

Create the empty target and execute the fenced extraction:

```bash
install -d -m 0700 /absolute/path/to/empty-restore-root
node "$OPENCLAW_RECOVERY_KIT/scripts/restore-openclaw-backup.mjs" \
  "$OPENCLAW_BACKUP_SET" \
  --execute \
  --target /absolute/path/to/empty-restore-root \
  --signer "$OPENCLAW_BACKUP_GPG_SIGNER" \
  --json
```

For a v2 set, restore verifies the exact path set, entry kinds, file bytes and
SHA-256 digests, symlink targets, required staged host-recovery items, signed
payload class (`core` or `core+browser`), and captured Agent OS production data.
The production-data check includes the PostgreSQL custom dump, all captured
Supabase Auth tables, the Vercel media inventory and objects, and the exact five
allowlisted Supabase Auth control-plane artifacts. Null or provider-masked
control-plane values remain bound to their JSON Pointer markers and are
reported as not automatically restorable; they are never invented by the
recovery tooling. The signed recovery capability must remain
`fullProductionRecovery: false`.
It also validates every inventoried SQLite database, fences restored cron jobs,
empties delivery queues in working copies, quarantines replayable ingress and
absolute symlinks, and verifies the PostgreSQL dump with `pg_restore --list`.
The target receives `RESTORE_FENCED.json` as the inspection receipt.

The following overrides deliberately lower the normal recovery baseline and
must only be used after an explicit, documented decision:

- `--allow-best-effort` accepts a set created without quiesced writers.
- `--allow-no-postgres` accepts a dump explicitly omitted at backup time.
- `--allow-no-production-data` accepts explicitly omitted Agent OS production
  data.

Do not start restored services, install restored host configuration or cron, or
reconnect external channels from the inspection root. Restore PostgreSQL into a
new empty database with outbound side effects blocked, review all destinations
and credentials, and promote services one at a time only after the fenced
evidence has been reviewed.
