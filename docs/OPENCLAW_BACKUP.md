# OpenClaw backup and recovery

## Status

The backup implementation is intentionally not activated. The current source
contains the creator, verifier, v2 uploader and full-object probe, manifest
recovery, fenced restore, maintenance runner, boot recovery guard, health
check, failure alert, and fail-closed local retention. The current source has
passed its deterministic contracts and the full secure synthetic end-to-end
test. It must still be installed as one signed runtime/unit cohort before the
first production maintenance run.

As of 2026-07-28:

- Hetzner Cloud Backups are enabled for the VPS, but an isolated Hetzner restore
  drill has not yet been recorded.
- The isolated Vercel ingest project and private backup Blob store are deployed;
  its put-only canary passed. The production deployment still returns `404` for
  the probe route.
- The boot recovery guard is enabled, and the six-hour health timer is enabled
  and active. The installed content-addressed runtime and systemd unit copies
  match the current source cohort. A direct installed-runtime health check
  passed on 2026-07-28 with readiness pending only on the deliberately absent
  recovery recipient and remote-probe configuration.
- Normal CI runs the integration harness in limited mode: it checks the
  synthetic read-only production/auth contracts but deliberately skips backup
  creation unless secure test roots are supplied. The full secure E2E has
  separately passed with a private `noswap` tmpfs, global swap disabled, and a
  private disk-backed ciphertext root.
- Systemd executes a root-owned, content-addressed runtime below
  `/usr/local/libexec/openclaw-backup/releases/`, not the mutable Git
  workspace. The atomically updated `current` symlink selects one release;
  health verifies its exact file set, modes, checksums, origin-signature,
  release identity, and installed units on every run. The installer itself is
  included in that signed runtime manifest. The services also use a read-only
  system view with explicit write paths and kernel/control-plane protections.
- The daily maintenance timer is installed but disabled, and
  `/etc/openclaw-backup/scheduler-enabled` is absent.
- No production encrypted set, remote recovery receipt, or clean-machine
  application restore drill exists yet.
- `/etc/openclaw-backup/uploader.env` now selects
  `/run/openclaw-backup-tmp`. Current unit source creates that exact path as a
  service-private 1536 MiB `rw,nosuid,nodev,noexec,noswap` tmpfs.
- Normal host swap now uses the reviewed random-key
  `/dev/mapper/openclaw-cryptswap` AES-XTS mapping backed by `/swapfile`. The
  former plaintext backing area received a full raw overwrite during migration.
  Old provider snapshots may still contain blocks from before that scrub.
- The origin-signing key and offline recovery recipient are configured. The VPS
  contains only the recovery recipient's public key; its private key remains
  offline.
- The v2 full-encrypted-object-set probe was deployed to the isolated production
  ingest project on 2026-07-28 and `OPENCLAW_BACKUP_REMOTE_PROBE_URL` is
  configured. Its receipt-bound proof remains pending until the first real
  encrypted upload.
- The published `openclaw-backup-recovery-v1` branch still exposes legacy
  v1-only recovery tooling. The local v1.2 kit contains the current v2 import
  closure and its checksum manifest and detached signature validate locally,
  but it has not been published or tested through the independent clean-clone
  bootstrap and must not be relied on until both steps are complete.
- A fail-closed local encrypted-set retention CLI and deterministic contract are
  implemented. It is deliberately standalone and not scheduled or invoked by
  maintenance. Remote Blob retention and nonce cleanup are not implemented.

The health timer therefore emits
`openclaw_backup_readiness_pending` plus explicit pre-activation warnings while
continuing to validate the rest of the system. It deliberately does not emit a
green `openclaw_backup_health_ok` before activation. The missing recipient and
probe become hard failures after the scheduler gate is created. Do not create
that gate or enable the maintenance timer until the activation sequence below
is complete.

The deployed recovery plane is:

- project: `felipeotarolas-projects/openclaw-backup-ingest`;
- production endpoint:
  `https://openclaw-backup-ingest.vercel.app/api/openclaw-backup/upload-url`;
- private store: `openclaw-backup-primary`
  (`store_gpftMJf6BLAEcpbH`) in Stockholm (`arn1`);
- VPS authentication: `/etc/openclaw-backup/ingest-hmac`, root-owned mode
  `0600`;
- non-secret VPS settings: `/etc/openclaw-backup/uploader.env`, root-owned mode
  `0600`.

The canary verified a `200` signed authorization, private upload receipt, `409`
nonce replay rejection, overwrite rejection, and `403` anonymous read denial.
Production has `BLOB_STORE_ID` and the backup-specific variables only; the
legacy `BLOB_READ_WRITE_TOKEN` added by the CLI was removed before deployment.
Preview and Development have no Blob or backup variables.

The design intentionally uses two independent recovery layers:

1. Hetzner Cloud Backups for fast whole-server rollback.
2. Application-consistent, client-encrypted OpenClaw backups in a dedicated
   private Vercel Blob store for provider- and account-separated recovery.

Neither layer is sufficient by itself. Hetzner backups share the server's
provider control plane and disappear if the server is deleted. Vercel Blob does
not document WORM/Object Lock or undelete semantics.

## Current recovery contract

Every scheduled production set is one `core+browser` payload. A smaller `core`
class still exists for explicit/manual use, but the maintenance and health
contracts reject it for scheduled recovery. The production set dynamically
scans `/root/.openclaw`, so newly created agents are included without a
hard-coded agent list.

It protects:

- agent configuration, sessions, workspaces, memory, goals, skills, and durable
  state below `/root/.openclaw`;
- all discovered SQLite databases, including durable Chromium databases,
  through the Node SQLite online backup API followed by `PRAGMA quick_check`;
- the local Agent OS fallback/development PostgreSQL through a custom-format
  `pg_dump` followed by `pg_restore --list`;
- production Agent OS data as a PostgreSQL 17 custom dump of the Supabase
  `public` schema, created from a read-only exported snapshot;
- Supabase Auth schema and table rows as a canonical JSON export through the
  server-enforced read-only Supabase management query API, captured before and
  checked again after the public/media capture;
- five allowlisted Supabase Auth control-plane GET responses, captured before
  and after the database/media window and required to be canonically identical;
- every Vercel media URL referenced by
  `public.content_media_assets`, downloaded only from the pinned production
  media host, content-hashed, deduplicated, and bound to its database row;
- selected systemd units, cron configuration, UFW rules, Docker configuration,
  SSH configuration, CLI connector configuration, and the root crontab;
- replayable delivery queues and Telegram ingress spools in forensic quarantine
  rather than in the automatically promotable working tree; and
- an encrypted, signed exact-path inventory for the entire payload.

The live read-only source preflight at 2026-07-28 02:31 UTC reports:

- 5,574,262,615 estimated bytes (about 5.19 GiB), 47,229 files, 4,930
  directories, and 4,135,313 cumulative UTF-8 path bytes after exclusions;
- 135 SQLite databases, including all 21 required critical OpenClaw/agent
  databases, with no invalid database-like files;
- four browser profiles: `instagram-login`, `linkedin-charles`, `openclaw`, and
  `social-login`;
- complete recovery-critical coverage for each profile: valid `Local State`
  and `Default/Preferences`, plus SQLite snapshots for `Default/Cookies`,
  `Default/Login Data`, and `Default/History`;
- 23 Auth tables and one Auth user visible to the management export; and
- 48 media-reference rows resolving to 44 unique Vercel Blob objects
  (101,869,128 declared bytes).

The same preflight computes an 820,694,591-byte plaintext-staging requirement:
278,322,256 SQLite bytes, 370 quarantine bytes, 36,328 host-recovery bytes,
76,823,575 local PostgreSQL bytes, 175,418,716 production-data bytes,
21,657,890 archive-metadata bytes, and a 268,435,456-byte fixed allowance. That
currently fits the reviewed 1536 MiB private tmpfs. The maintenance runner
reserves physical RAM for the entire 1536 MiB ceiling rather than only this
estimate, and the creator independently checks the exact execution-plan budget.

These live counts are safety baselines in the maintenance/health gates. A
legitimate topology or data reduction that crosses a baseline must be reviewed
and reflected in the contract; it must not be bypassed ad hoc.

Browser inclusion is fail-closed:

- `--include-browser-profiles` requires `quiesced` consistency;
- the runner stops the gateway and writable containers and verifies that no
  process or open file descriptor still uses the browser tree;
- Chromium runtime locks, `DevToolsActivePort`, PID/socket files, caches, and
  downloaded optimization models are excluded; and
- the four current profiles must satisfy the five-item profile contract above.

Browser cookies and authenticated sessions are high-value credentials. They
exist only inside the client-encrypted payload and must be handled with the same
care as Auth data.

The payload still excludes rebuildable or volatile data:

- dependency and package caches, including `node_modules`, `.next`, and npm
  runtime data;
- QMD indexes that can be rebuilt from durable source;
- Codex rollout/log indexes and temporary files;
- prior local backup copies, sockets, PID files, and temporary runtime files.

### V2 exact-path manifest

New sets use outer schema `openclaw-backup-manifest/v2`, internal schema
`openclaw-backup-payload/v2`, and encrypted path manifest
`openclaw-backup-path-manifest/v1`.

The path manifest records every directory, every file's exact byte count and
SHA-256, and every symbolic link target's byte count and SHA-256. Its hash,
size, entry count, content-byte count, payload class, and host-recovery policy
are bound into the signed encrypted outer manifest. Creation requires the tar
member set and the before/after protected-tree digest to match it exactly.
Restore requires the extracted tree to match every declared entry exactly.
Missing, extra, replaced, or changed paths fail verification.

Creation fails before unbounded path-index growth if the payload exceeds
200,000 path entries or 48 MiB of cumulative UTF-8 path bytes. The live
4,135,313-byte path baseline remains well below that ceiling.

Legacy v1 sets remain readable for compatibility, but a scheduled production
receipt must prove a v2 path manifest and `core+browser` end to end.

### Production-data limitation

The signed production component explicitly records:

```json
{
  "supabasePublicData": true,
  "supabaseAuthData": true,
  "vercelMediaObjects": true,
  "supabaseAuthControlPlaneMetadata": true,
  "supabaseAuthProviderConfig": false,
  "supabaseControlPlane": false,
  "fullProductionRecovery": false
}
```

`fullProductionRecovery: false` is intentional and must not be relabelled. The
backup contains the production `public` data, Auth table data, and referenced
media bytes. It also captures read-only Auth control-plane metadata from the
five allowlisted Management API endpoints for Auth configuration, current and
legacy signing-key metadata, third-party Auth, and SSO providers. It does not
contain private JWT signing keys, provider secrets, the remaining Supabase or
Vercel project/control-plane state, DNS, or an automated safe importer for Auth
and media. The restore tool verifies and fences these artifacts; it does not
write them into live Supabase or Vercel services.

The encrypted control-plane artifacts preserve the values actually returned by
the Management API. Null or visibly masked values are listed by JSON Pointer in
each artifact as not restorable; the backup never fabricates replacements. The
signed outer summary contains only counts, paths, byte sizes, hashes, HTTP
status, and aggregate bindings—never response values.

The Supabase `public` custom dump is verified with the pinned PostgreSQL 17
image. The dump is streamed to `pg_restore --list` over container stdin; the
verifier uses `--network none`, a read-only container filesystem, no Linux
capabilities, `no-new-privileges`, and a PID limit. It does not bind-mount the
recovery or staging tree into the verifier container.

Production capture also has explicit execution ceilings. Management queries
have a 30-second request deadline and a 32 MiB JSON-response cap. The five Auth
control-plane `GET` requests share a 30-second deadline, allow at most 4 MiB per
response and 16 MiB in aggregate, and reject excessive JSON depth, nodes, or
string size. PostgreSQL dump/verification, snapshot startup/lifetime/close, and
the archive pipeline have independent stage deadlines; a hung child receives
`SIGTERM` followed by `SIGKILL`.

Hetzner, Vercel, DNS, firewall, and account-level control-plane settings cannot
be reconstructed entirely from guest files. Keep a reviewed recovery checklist
and independent account access for those systems.

## Security and credential boundaries

For the backup transport, the production VPS may hold:

- the public OpenPGP recovery key;
- a separate OpenPGP backup-origin signing key that can sign unattended;
- a narrowly scoped HMAC secret in a root-owned, non-symlink file with mode
  `0600`;
- the ingest endpoint, fixed lowercase host ID, and non-secret dedicated Blob
  store ID.

The VPS must not hold:

- the OpenPGP private recovery key;
- a Vercel account token that can access the backup project or store;
- a Blob read/write token for the backup store;
- a credential that can list, read, overwrite, or delete backup objects.

The VPS necessarily also holds production application credentials. The backup
runner reads the root-protected Supabase environment and a Supabase management
token to perform the declared production export. SQL export uses the
server-enforced `/database/query/read-only` endpoint. Auth control-plane capture
uses only `GET` against five exact `api.supabase.com` paths. The management
credential itself may have broader account or project authority; keep it
outside the repository, mode `0600`, monitor its use, and rotate it after
suspected host compromise.

The isolated Vercel ingest project holds the matching HMAC secret and uses its
runtime OIDC identity with access to one dedicated private Blob store. It runs
only in the production environment, atomically consumes each signed request
nonce, and mints only five-minute, exact-path, new-object `PUT` URLs.

Vercel's OIDC identity is store-wide rather than mint-only. Compromise of the
isolated deployment could therefore still read or delete that store. A separate
project, deploy chain, and store reduce blast radius but do not provide
immutability.

A compromised root context on the VPS can use the unattended origin-signing key
and HMAC secret to create apparently valid future sets and consume Blob quota,
even though it cannot read, overwrite, or delete existing objects through the
host path. Usage alerts and a conservative spend cap limit detection time and
cost; they are not an integrity boundary. Recovery must therefore distrust the
failed host, pin the origin fingerprint from an independent offline record, and
prefer a recovery point created before suspected compromise.

The v2 probe proves exact remote metadata for the whole encrypted object set,
but `HEAD` does not prove that every body can be downloaded, hashed, decrypted,
and restored. Only a separate recovery identity performing a full `GET`, deep
verification, and fenced clean-machine restore closes that gap. Vercel Blob
also has no documented WORM/Object Lock or undelete guarantee, so neither the
probe nor the private store is an immutable third copy.

The existing Agent OS `BLOB_READ_WRITE_TOKEN` belongs to the separate production
media workflow and must never be reused for the backup store. Production media
capture uses database references plus pinned public `GET` requests; it does not
need the backup-store identity. A compromised OpenClaw host must never be able
to delete the off-host recovery points.

The host also has a main Agent OS Vercel deployment token in a different Vercel
team. It remains a material main-environment credential, but currently receives
an exact `403 forbidden` for the isolated backup project. The health check
repeats that negative authorization test and fails if the boundary becomes
ambiguous or broader.

The private OpenPGP key belongs on an offline recovery device, preferably with
two separately protected copies. Test both copies before enabling unattended
backups.

The origin signing key is separate from the recovery key. Its pinned fingerprint
lets a clean recovery machine reject a backup forged by someone who has only
the public recovery key and Blob write access. Because unattended signing
normally places this private key on the VPS, full host compromise can still
forge future sets. Prefer hardware-backed or tightly root-protected custody and
add an independently administered WORM copy for stronger origin guarantees.

## Repository tools

- `scripts/openclaw-backup.mjs`: inventory or create a local encrypted set.
- `scripts/openclaw-backup-external.mjs`: capture and verify Supabase
  `public`, Auth, and referenced Vercel media.
- `scripts/verify-openclaw-backup.mjs`: hash verification and optional full
  decrypt/decompress/archive validation.
- `scripts/upload-openclaw-backup.mjs`: dry-run or upload through signed
  put-only URLs.
- `scripts/probe-openclaw-backup.mjs`: authenticated metadata-only proof that
  every receipt-bound encrypted object exists remotely with the expected path,
  size, content type, and ETag.
- `scripts/recover-openclaw-backup-manifest.mjs`: reconstruct the local
  verification manifest from the encrypted remote completion marker.
- `scripts/restore-openclaw-backup.mjs`: deep-verify and extract only into an
  empty, isolated restore root, validate every database, and quarantine
  side-effect state.
- `scripts/openclaw-backup-maintenance.sh`: stop/freeze known writers, create
  and upload one `core+browser` set, probe its full encrypted object set, and
  restore prior production health.
- `scripts/openclaw-backup-healthcheck.sh`: validate configuration, live
  inventory, production-data access, installed units, disk/tmpfs margin, and
  receipt freshness.
- `scripts/openclaw-backup-alert.sh`: deduplicated Telegram alert for failed
  maintenance, guard, or health units.
- `scripts/install-openclaw-backup-runtime.sh`: build one exact
  content-addressed runtime release, atomically select it, install the reviewed
  units, reload systemd, and verify the unit set.
- `scripts/retain-openclaw-backups.mjs`: standalone dry-run-first deletion of
  eligible local encrypted sets with dual locks and exact remote evidence.
- `scripts/openclaw-backup-integration.mjs`: fully local synthetic
  backup-to-restore test.
- `infra/openclaw-backup-ingest`: isolated Vercel Function project.
- `infra/openclaw-backup-systemd`: reviewed systemd source of truth.

The creator, uploader, remote probe, and restore CLIs are dry-run by default and
require `--execute`. Manifest recovery is an explicit recovery operation and
refuses to replace an existing manifest. The maintenance runner intentionally
invokes the execute paths only after its fail-closed preflight.

## Local verification

Run the deterministic contracts and normal limited integration check:

```bash
node scripts/openclaw-backup-contract.mjs
node scripts/openclaw-backup-upload-contract.mjs
node scripts/openclaw-backup-integration.mjs
node scripts/openclaw-backup-retention-contract.mjs
(
  cd infra/openclaw-backup-ingest
  npm ci
  npm run verify
)
```

Without secure roots, the integration command exits successfully with
`openclaw_backup_integration_limited_ok secure_e2e=skipped`; that is the
expected normal-CI result, not proof of encrypted creation and recovery. The
full test must be invoked with `--require-secure`,
`OPENCLAW_BACKUP_TEST_SECURE_TMPDIR` pointing at a private dedicated
`rw,nosuid,nodev,noexec,noswap` tmpfs while `/proc/swaps` is empty, and
`OPENCLAW_BACKUP_TEST_CIPHERTEXT_ROOT` pointing at a private, disk-backed,
owner-only ciphertext directory with the safety-floor capacity. That secure
mode has passed on this host and exercised encrypted creation, verification,
remote-only reconstruction, and fenced restore.

The current source has passed both the normal contracts and the separately
secured full E2E. Install or refresh the immutable runtime:

```bash
bash scripts/install-openclaw-backup-runtime.sh
systemctl start openclaw-backup-healthcheck.service
```

The installer never enables the daily timer. Old content-addressed releases
remain available for an explicit rollback; the `current` symlink changes
atomically only after the new release, its checksum manifest, and an exact
origin-signature from the pinned signer validate.

The contracts cover v2/path-manifest binding, zero-optional-field Linux
`mountinfo`, browser profile discovery and runtime exclusions, v2
upload/full-object probe authorization, cohort-aware retention, fresh
pre-delete probing, and restore safety. The integration test creates separate
temporary recovery and origin-signing keys, imports only the recovery key's
public half on the synthetic backup host, creates a v2 encrypted signed backup,
verifies every chunk, simulates a remote-only download, reconstructs the signed
manifest, runs a fenced restore, validates five SQLite snapshots, scrubs a
delivery queue, disables SQLite-backed cron jobs, proves closed hard-link
groups, quarantines absolute links and replayable ingress/file-based cron state,
and validates the upload plan. It uses only synthetic temporary data and
performs no network requests.

Run a read-only production inventory:

```bash
set -a
source /etc/openclaw-backup/uploader.env
set +a
node scripts/openclaw-backup.mjs \
  --include-browser-profiles \
  --production-data required \
  --json
```

This performs live Supabase/Auth/media reads but does not write local or remote
backup state. It also performs the writer preflight. While production is
running it should report active writers as blockers; the maintenance runner
creates a real set only after it has stopped or frozen those writers.

## Activation runbook

The timer is installed but disabled. Do not create the scheduler gate or enable
the timer until one real remote clean-machine restore has passed.

### 1. Prove the Hetzner layer

- Confirm Cloud Backups are enabled for the intended server.
- Restore one backup into a new isolated test server.
- Keep the restored server fenced from agent channels, scheduled jobs, email,
  messaging, browser automation, and other outbound side effects.
- Record the restore date, recovery time, server image/version, and result.
- Delete the test server only after the evidence has been reviewed.

This tests recoverability; merely seeing a backup in the dashboard does not.

### 2. Supply the offline recovery key

The distinct origin-signing key is already configured on the VPS. The remaining
cryptographic blocker is a recovery encryption key generated on a device that
will not run OpenClaw. Use a strong passphrase or hardware-backed custody, keep
two separately protected private-key copies, export only the public key for the
VPS, and record the full primary fingerprint through a second channel.

Import the public export into the dedicated VPS keyring and confirm that the
recipient's private key is absent:

```bash
export RECOVERY_FINGERPRINT='PASTE_EXACT_RECOVERY_FINGERPRINT_HERE'
GNUPGHOME=/etc/openclaw-backup/gnupg \
  gpg --import openclaw-backup-public.asc
GNUPGHOME=/etc/openclaw-backup/gnupg \
  gpg --with-colons --list-keys "$RECOVERY_FINGERPRINT"
if GNUPGHOME=/etc/openclaw-backup/gnupg \
  gpg --batch --list-secret-keys "$RECOVERY_FINGERPRINT"; then
  echo 'recovery private key must not be present on the VPS' >&2
  exit 1
fi
```

Set the exact fingerprint as `OPENCLAW_BACKUP_GPG_RECIPIENT` in the root-owned
`/etc/openclaw-backup/uploader.env`. Never copy the recovery private key to the
VPS, repository, Vercel, or backup store.

The backup creator refuses to run when the configured recipient's private key
is present in the active GnuPG home. The recipient must remain different from
the existing origin-signing key.

The signing key proves origin against a storage-only attacker. It does not
protect against a fully compromised VPS that can use the local signing key.

### 3. Deploy and configure the exact remote probe

The upload route and private store are already deployed. The source also
contains `POST /api/openclaw-backup/probe`, an HMAC-authenticated,
metadata-only v2 check for the complete ordered encrypted object set in one
upload receipt. The complete source cohort was verified (10/10 tests) and
deployed to the production ingest project on 2026-07-28. An unauthenticated
request returns `401`, confirming the route is present and retains its HMAC
authentication boundary; a valid full-object proof requires the first real
encrypted upload.

The probe accepts at most 128 exact receipt objects, consumes its one-time
authorization nonce before any reads, derives every immutable pathname, and
performs bounded-concurrency `HEAD` calls. It verifies path, byte count, content
type, and ETag, then returns the receipt-bound object count, total bytes, object
root, and completion marker. It cannot list a prefix, return object bodies,
write backup objects, overwrite, or delete. This is stronger than a marker-only
check but is still not a deep remote-body verification. After deployment
configure:

```text
OPENCLAW_BACKUP_INGEST_URL=https://<isolated-project>/api/openclaw-backup/upload-url
OPENCLAW_BACKUP_REMOTE_PROBE_URL=https://<isolated-project>/api/openclaw-backup/probe
OPENCLAW_BACKUP_HOST_ID=hetzner-openclaw-primary
OPENCLAW_BACKUP_INGEST_SECRET_FILE=/etc/openclaw-backup/ingest-hmac
OPENCLAW_BACKUP_BLOB_STORE_ID=<exact dedicated store ID>
OPENCLAW_BACKUP_GPG_RECIPIENT=<exact fingerprint>
OPENCLAW_BACKUP_GPG_SIGNER=<different exact fingerprint>
OPENCLAW_BACKUP_OUTPUT_DIR=/var/lib/openclaw-backup/sets
OPENCLAW_BACKUP_PLAINTEXT_STAGING_ROOT=/run/openclaw-backup-tmp
OPENCLAW_BACKUP_PRODUCTION_DATA_MODE=required
OPENCLAW_BACKUP_SUPABASE_ENV_FILE=<root-owned production env file>
OPENCLAW_BACKUP_SUPABASE_POOLER_HOST=<pinned IPv4 pooler host>
OPENCLAW_BACKUP_SUPABASE_MANAGEMENT_TOKEN_FILE=<root-owned token file>
OPENCLAW_BACKUP_MEDIA_BLOB_HOST=<pinned production media host>
GNUPGHOME=/etc/openclaw-backup/gnupg
```

Do not put secret values in git, shell history, Markdown, Agent OS settings, or
a systemd unit. The Vercel backup project must keep production-only OIDC/store
access and HMAC configuration, no `BLOB_READ_WRITE_TOKEN`, no Preview or
Development backup environment, a private store, usage alerts, and a
conservative spend cap.

The plaintext staging root must be the exact service-private mount created by
the maintenance unit:

```text
TemporaryFileSystem=/run/openclaw-backup-tmp:rw,nosuid,nodev,noexec,noswap,size=1536M,mode=0700
```

Shared `/dev/shm` is rejected. Temporary plaintext includes SQLite snapshots,
both PostgreSQL dumps, Auth JSON, media objects, and small metadata. The creator
checks the mount through both `findmnt` and `/proc/self/mountinfo`, requires it
to be the exact dedicated mountpoint, and refuses capture if any swap remains
active. The unit namespace removes the tmpfs when the service ends; normal and
caught-error paths also remove their per-run staging directory.

Normal host operation uses one ephemeral random-key dm-crypt swap mapping:
`/dev/mapper/openclaw-cryptswap` is backed by `/swapfile`, uses
AES-XTS-plain64 with a 256-bit key from `/dev/urandom`, and is recreated on
boot. The migration fully overwrote the prior raw backing area before the new
swap was accepted. Maintenance and health fail closed unless the live mapping,
`/etc/crypttab`, `/etc/fstab`, and the root-owned two-GiB backing file match the
reviewed contract. Immediately before plaintext capture, the runner requires
enough `MemAvailable` for used swap plus the full 1536 MiB tmpfs ceiling plus
768 MiB of process headroom, runs `swapoff --all`, and proves `/proc/swaps` is
empty. It repeats the full-ceiling gate after writer quiescence; the creator
then independently requires physical memory and tmpfs capacity for the exact
execution-plan staging budget plus the same process headroom. The systemd unit
adds `MemoryHigh=3G`, `MemoryMax=3500M`, and `MemorySwapMax=0`. Recovery
revalidates the configuration, clears any active swap, enables only
`/dev/mapper/openclaw-cryptswap`, and requires it to be the sole confidential
mapping. On failure it clears swap again and leaves credential-bearing
production workloads stopped for guard or manual recovery. Provider snapshots
created before the raw scrub can still retain historical plaintext blocks and
must be governed by their own retention and access controls.

The current encrypted set directory is on the VPS filesystem. The maintenance
runner therefore uses the explicit `--allow-same-device` acknowledgement. The
creator resolves the output root, requires a private owner-only directory,
rejects symlinks and untrusted writable/foreign-owned ancestors, and keeps it
outside the OpenClaw source tree. The health check enforces the same root-owned
mode-`0700` leaf invariant plus free space equal to the included-source
estimate, the full 1536 MiB staging ceiling, and a 5 GiB floor. This local set
is staging and operational evidence, not an independent recovery layer.

### 4. Run the first maintenance cycle manually

Start the oneshot service manually; do not enable its timer:

```bash
systemctl start openclaw-backup-maintenance.service
systemctl status --no-pager openclaw-backup-maintenance.service
journalctl -u openclaw-backup-maintenance.service --no-pager
```

The runner records prior production and swap state, stops the gateway, cron,
QAA, the Agent OS bridge, and named writable sandbox containers, waits for cron
quiescence, and freezes verified Codex processes in one interactive systemd
session scope. It then applies the exact RAM/staging gates above, disables all
swap for the plaintext window, and requires:

- `core+browser`, `quiesced`, v2 path-manifest coverage;
- all browser profile and SQLite baselines;
- local PostgreSQL, Supabase public/Auth/media, and host-recovery inclusion;
- stable protected-tree and session JSONL state before/after;
- local outer verification;
- an upload plan bound to the backup result;
- complete remote upload; and
- a successful v2 probe bound to every encrypted object.

Creator subprocesses are stage-bounded: ordinary commands default to two
minutes, local and production PostgreSQL dump/verification stages use
20-/10-minute limits, and the archive pipeline has a 60-minute limit. Supabase
snapshot and Auth/control-plane requests have their own stricter lifecycle,
response, and complexity caps described above.

Production state, including configured swap, is restored before the potentially
long upload. Exit trapping restores the prior gateway, cron, and container
state on success or failure. The service has extended stop time for this
recovery path, and the root-owned maintenance-state file lets the enabled boot
guard retry restoration after an interruption or reboot. A previously running
managed `openclaw` browser is stopped explicitly and restarted only after the
gateway is healthy; legacy profiles and restored tabs are never auto-replayed.
Review the run evidence below
`/var/lib/openclaw-backup/state/runs/<run-id>/`.

Ciphertext chunks are uploaded first. `manifest.json.gpg` is uploaded last and
acts as the completion marker. The plaintext local `manifest.json` is never
uploaded. Failed or interrupted sets without the encrypted completion marker
must be treated as incomplete.

The uploader deliberately has no remote `HEAD`, read, list, overwrite, or delete
capability. If a `PUT` response is ambiguous, abandon that set ID and create a
new backup set rather than retrying into the same immutable path.

The remote object layout is content-addressed:

```text
openclaw-backups/v1/<host-id>/<set-id>/<sha256>-<bytes>/<filename>
```

### 5. Perform a remote clean-machine restore

Complete the restore procedure below from a new isolated machine. Only after it
passes, including manual recovery of the captured production-data components,
should scheduling be enabled. Record RPO, RTO, version information, exact
evidence paths, and every manual gap.

### 6. Enable scheduling only after all gates pass

Create the gate and enable the already-installed timer only after:

- the recovery recipient and both offline private-key copies are tested;
- the dedicated recovery branch contains the current v2 kit-local import
  closure and its pinned signature plus every signed checksum pass on an
  isolated machine;
- one real set has uploaded and the deployed remote probe has confirmed its
  exact full encrypted object set;
- a separate recovery identity has downloaded every object and the
  clean-machine deep verification and fenced restore have passed; and
- a manual retention owner and procedure exist.

```bash
install -o root -g root -m 0600 /dev/null \
  /etc/openclaw-backup/scheduler-enabled
systemctl enable --now openclaw-backup-maintenance.timer
systemctl start openclaw-backup-healthcheck.service
```

The timer runs daily at 03:17 Europe/Stockholm with up to 20 minutes of
randomized delay. The separate health timer runs every six hours, checks
configuration and live coverage, and, after activation, requires a complete
receipt no older than 36 hours plus a successful remote probe. Unit failure
triggers the deduplicated alert service.

### 7. Retention and drill policy

Initial policy:

- Hetzner: keep its seven automatic daily server-bound slots for rapid rollback.
- Local encrypted staging: keep at least the two newest verified sealed
  production-recovery sets in every
  `manifest-schema + recipient-fingerprint + signer-fingerprint` cohort and
  never delete a set until it is seven full days old. Legacy, best-effort, or
  otherwise non-production-recovery sets are never deletion candidates. This is
  the implemented minimum, not a daily/monthly archival policy.
- Backup Blob: create one daily `core+browser` set; the proposed remote policy
  is 30 daily and 12 monthly recovery points until cost and restore evidence
  justify a revision.
- Run an application clean-machine restore at least quarterly and after material
  OpenClaw, Chrome, PostgreSQL, Supabase, encryption, backup-format, or recovery
  script changes.
- Run a separate Hetzner isolated-server restore at least annually and after a
  material host-layout change.

The standalone local tool is dry-run by default:

```bash
node scripts/retain-openclaw-backups.mjs \
  --sets-root "$OPENCLAW_BACKUP_OUTPUT_DIR" --json
```

`--execute` acquires both the maintenance and creator locks. A candidate must be
older than seven full days, outside the newest-two-per-key-cohort floor, pass
the existing sealed-set verifier with exact `0500` directory/`0400` file
metadata, and have an
`openclaw-backup-upload-result/v2` receipt plus
`openclaw-backup-remote-probe/v2` evidence cross-bound to the local v2 manifest,
every ordered encrypted object, aggregate bytes, object root, and completion
marker. Stored probe evidence may be at most 36 hours old. Immediately before
deletion, the execute path performs another receipt-bound full-object probe and
requires it to be at most five minutes old. Active maintenance, lock conflict,
partial/incomplete or unsealed sets, old v1 evidence, invalid evidence,
symlinks, and unsafe entries protect data or fail closed. The JSON result
exposes no local paths, host IDs, object hashes, or markers.

Only after reviewing the dry-run selection:

```bash
node scripts/retain-openclaw-backups.mjs \
  --sets-root "$OPENCLAW_BACKUP_OUTPUT_DIR" \
  --execute --json
```

This tool deletes local encrypted staging only and is not integrated with
systemd or the maintenance runner. The backup host must never implement Blob
deletion. Both upload authorization and v2 probe requests consume immutable
entries below `openclaw-backup-auth-nonces/v1/`; probe nonces are consumed
before any remote `HEAD`. Remote set deletion and expired nonce cleanup belong
to a separate privileged maintenance identity and must preserve the equivalent
per-key-cohort recovery floor plus the most recent independently deep-verified
remote set.

Remote retention, nonce cleanup, retention scheduling, and an immutable third
copy are not implemented. Until they are, run local retention manually and
record every execution; monitor the same-filesystem local set directory because
daily sets otherwise accumulate. Vercel Blob has no documented WORM/Object
Lock or undelete guarantee, so a separately administered immutable copy remains
a future requirement for business-critical recovery.

## Remote restore runbook

### 1. Contain before restoring

- Preserve the failed server and logs when incident response requires them.
- Build a new isolated machine; do not restore directly over production.
- Block agent channels and outbound side effects.
- Disable cron, systemd timers, queue consumers, email, messaging, browser
  automation, and external webhooks.
- Install the same OpenClaw and PostgreSQL major versions used by the backup.
- Keep old credentials disabled or rotate them when compromise is possible.

### 2. Authenticate the clean-machine recovery kit

Obtain the dedicated recovery branch, not the mutable production checkout:

```bash
git clone \
  --branch openclaw-backup-recovery-v1 \
  --single-branch \
  https://github.com/felipeotarola/agent-os.git
cd agent-os
export OPENCLAW_RECOVERY_KIT="$PWD/recovery/openclaw-backup-v1"
```

Follow `$OPENCLAW_RECOVERY_KIT/README.md` exactly. Supply the expected primary
origin-signing fingerprint from the independent record stored with the offline
recovery key; never accept the checkout's copy as the trust anchor. In a new
empty GnuPG home, require exactly one imported primary public key, no secret
key, exactly one `VALIDSIG` from that independently supplied fingerprint, and a
successful `sha256sum --check` for the entire kit-local import closure. Stop if
the kit does not explicitly support the set's v2 manifest/payload schemas or
any check fails.

At the current pre-activation checkpoint the published branch is v1-only and
the newer local kit's signed checksum verification fails on its changed README.
Do not treat either copy as production-ready until the v2 import closure,
version, checksum manifest, and detached signature have been regenerated from
frozen source, published, and repeated successfully from a clean clone.

### 3. Download one complete set

Use a separate recovery identity with read/list access to the private backup
store. List the exact host/set prefix, require `manifest.json.gpg`, and download
all objects into an empty local directory named exactly as the set ID. Flatten
only the final filenames into that directory, set its mode to `0700`, and set
every downloaded file to `0600` or stricter. The directory and files must be
owned by the recovery user. Every parent directory must be owned by that user or
UID 0; group/world-writable parents are rejected unless they have sticky
semantics. This prevents another local account from swapping the verified set
or restore root during recovery.

The production VPS must never receive this recovery identity.

### 4. Reconstruct and verify the manifest

With the private recovery key available to GnuPG:

```bash
node "$OPENCLAW_RECOVERY_KIT/scripts/recover-openclaw-backup-manifest.mjs" \
  /recovery/<set-id> \
  --signer "$OPENCLAW_BACKUP_GPG_SIGNER" --json

node "$OPENCLAW_RECOVERY_KIT/scripts/verify-openclaw-backup.mjs" \
  /recovery/<set-id> --deep \
  --signer "$OPENCLAW_BACKUP_GPG_SIGNER" --json
```

Manifest recovery refuses to replace an existing local manifest and verifies
the pinned origin signature plus the hash and size of every downloaded
ciphertext part. Deep verification then streams all parts through GPG, zstd,
and tar without writing plaintext payloads. The trusted signer fingerprint must
come from the independent offline record, not from the downloaded manifest.

### 5. Create a fenced inspection restore

Never extract directly into `/root` or a running OpenClaw installation.

```bash
mkdir -m 0700 /recovery/inspection-root

node "$OPENCLAW_RECOVERY_KIT/scripts/restore-openclaw-backup.mjs" \
  /recovery/<set-id> \
  --target /recovery/inspection-root \
  --signer "$OPENCLAW_BACKUP_GPG_SIGNER" \
  --execute --json
```

The command repeats pinned-signature deep verification and releases each
ciphertext chunk to the extractor only after hashing the same pinned file
descriptor. It rejects unsafe archive paths, escaping/incomplete hard links,
special files, duplicates, and oversized metadata, then extracts only into the
existing empty `0700` target. Absolute symlinks are removed from the working
tree and recorded for manual relinking; closed hard-link groups are preserved.

It verifies every declared SQLite snapshot by size, hash, and
`PRAGMA quick_check`, materializes every inventoried working database without
stale WAL/SHM/journal files, and proves all 21 critical core paths. The current
production inventory contains 135 SQLite databases. It discovers and clears
delivery queues directly and sets every SQLite-backed cron job to disabled with
pending/running state cleared.

Replayable session-delivery queues, Telegram ingress spools, file-based cron
content, and the absolute-symlink report remain under fenced quarantine. The
original unmodified SQLite snapshots remain available for forensics. The command
never writes to live OpenClaw, starts services, installs cron, applies host
configuration, or connects to a PostgreSQL server. Review
`RESTORE_FENCED.json` before promotion.

### 6. Inspect the local fallback PostgreSQL dump

The `backup-meta/postgres/agent-os.dump` artifact is the local
fallback/development database, not the Agent OS production source. For it:

- provision a fresh instance matching the recorded PostgreSQL major version;
- confirm the fenced restore verified the dump hash and
  `pg_restore --list`;
- restore into a new empty database using `--no-owner --no-privileges`;
- validate the expected schema and table counts before deciding whether it is
  needed.

### 7. Recover Agent OS production data manually

The fenced result must report included Supabase public/Auth/media artifacts and
`fullProductionRecovery: false`. Keep the target network-fenced while doing the
following:

1. Provision an isolated Supabase recovery project or PostgreSQL 17 target.
   Restore
   `backup-meta/external/agent-os-production/public.dump` with no owner or
   privilege replay, then validate schema, row counts, and application
   invariants.
2. Review the five canonical JSON artifacts under
   `backup-meta/external/agent-os-production/auth-control-plane/`. They preserve
   read-only Auth configuration, public signing-key metadata, third-party Auth,
   and SSO provider metadata as recovery evidence. They do not contain the
   private JWT signing keys or provider secrets required for automatic
   recreation. Review each artifact's `unrestorablePaths`; null or masked
   Management API fields need an independent recovery source.
3. Recreate Supabase project settings, Auth providers, redirect URLs, secrets,
   SMTP, policies, and other control-plane configuration in the isolated
   project using the captured metadata plus an independently maintained
   checklist. Never apply the artifacts as an automatic configuration import.
4. Review `backup-meta/external/agent-os-production/auth.json`. It contains
   Auth schema inventory and table rows, but is not an automatic importer. Use
   a separately reviewed, vendor-compatible migration procedure and prove login
   for the recovered admin before relying on it.
5. Review
   `backup-meta/external/agent-os-production/media-inventory.json` and the
   content-addressed `media-objects/` directory. Upload verified objects to a
   new media store using a recovery-side credential, preserve or deliberately
   remap each database reference, and verify byte count, SHA-256, content type,
   and reachability. The current baseline is 48 references to 44 objects.
6. Keep the original production projects untouched until the recovered stack
   passes application tests. Record every transformation and credential
   rotation.

The current restore tool deliberately blocks live Supabase writes and media
uploads. A tested automation for these steps plus provider/control-plane
reconstruction is required before `fullProductionRecovery` may become `true`.

### 8. Promote ordinary files and host configuration

- Copy the inspected `.openclaw` tree into the new installation.
- Rebuild excluded dependency trees, Next.js output, npm data, and QMD indexes.
- Review systemd units, drop-ins, root crontab, `/etc/cron.d`, UFW rules, Docker
  configuration, connector configuration, and SSH files manually.
- Keep all restored services disabled while reviewing destinations, credentials,
  schedules, and side effects.
- Recreate Hetzner, Vercel, firewall, DNS, and account-level settings from the
  independent control-plane checklist.

### 9. Validate before reconnecting

- Run all SQLite integrity checks.
- Validate the local fallback dump if used, plus Supabase `public`, Auth, and
  media row/object counts.
- Confirm the four expected browser profiles and inspect browser sessions while
  outbound access remains fenced.
- Confirm every expected agent, workspace, memory store, and session directory.
- Run Agent OS contracts and health checks.
- Verify that queues are quarantined and no old scheduled action can fire.
- Rotate credentials if compromise is suspected.
- Enable read-only/internal services first.
- Re-enable external channels and schedules one at a time with human review.

Record recovery point objective, actual data age, recovery time, test evidence,
and any manual gaps. Update this runbook after every drill.

## Production readiness gates

The backup system is not production-ready until all of these are true:

- a Hetzner backup has been restored to an isolated test server;
- the dedicated private Blob store and ingest project exist;
- the current signed runtime and exact systemd unit cohort are installed, and
  health proves the private 1536 MiB noswap mount, ephemeral encrypted swap,
  staging/RAM gates, and v2 evidence contracts;
- the v2 remote-probe route is deployed, configured, and has confirmed every
  encrypted object in a real receipt-bound set;
- the VPS has the public recovery key, protected origin-signing key, narrow HMAC
  secret, and no Blob read/write credential for the backup store;
- two independently protected copies of the recovery private key have been
  tested off-host;
- a clean clone of the recovery branch has passed the independently anchored
  exact-signature and full-checksum bootstrap with the current v2 kit-local
  import closure;
- one real v2 `core+browser` set has passed outer and deep verification;
- the same set has been fully downloaded with a separate recovery identity,
  deep-verified, and restored on a clean machine;
- all 135 currently inventoried SQLite databases, including all 21 critical
  core paths and all four browser profile contracts, have passed post-restore
  validation;
- the local PostgreSQL dump and the captured Supabase `public`, Auth, and Vercel
  media artifacts have passed integrity and recovery validation;
- the manual provider/Auth/media reconstruction required by
  `fullProductionRecovery: false` has been exercised and documented;
- restored delivery queues are empty, every restored SQLite cron job is
  disabled, and absolute symlinks have been reviewed before promotion;
- health, boot recovery, production restoration, and failure alerting have been
  observed during a real maintenance run;
- the scheduler gate remains absent and the maintenance timer remains disabled
  until all of these checks have passed; and
- local retention has an exercised owner, remote retention/nonce cleanup has an
  implemented separate-identity plan, and a true
  WORM/Object-Lock third copy has an explicit accepted plan or risk decision.
