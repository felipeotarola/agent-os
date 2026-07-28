# Layered OpenClaw backup

- Date: 2026-07-27
- Status: Accepted; unattended activation blocked on the current signed
  runtime/unit install, current v2 recovery-kit publication, offline recovery
  recipient, production full-object probe, first real set, and both provider and
  clean-machine restore drills
- Owner: Felipe

## Decision

Use two complementary recovery layers:

1. Keep the enabled Hetzner Cloud Backups for fast whole-disk rollback.
2. Create daily application-consistent, client-encrypted OpenClaw
   `core+browser` sets in a dedicated private Vercel Blob store.

The Vercel store must belong to a small, isolated ingest project. The OpenClaw
host must never hold a read-write token or OIDC credentials for the backup
store, or any Vercel account token with access to that recovery plane. It may
only request short-lived, single-path, single-operation, non-overwriting signed
`PUT` URLs from the ingest service.
An HMAC-authenticated v2 probe may perform metadata-only `HEAD` checks for every
ordered encrypted object in one exact receipt-bound set. It must consume its
one-time authorization nonce before any `HEAD`, bind the complete path/size/ETag
set into an object root, and return only aggregate evidence. It may not list,
read object bodies, write backup objects, overwrite, or delete.

Scheduled sets must include:

- all dynamically discovered OpenClaw durable files and SQLite databases;
- all managed browser profiles that satisfy the critical profile contract,
  while excluding Chromium runtime locks, caches, and model downloads;
- the local Agent OS fallback PostgreSQL dump;
- a PostgreSQL 17 custom dump of the production Supabase `public` schema from
  an exported read-only snapshot;
- a canonical Supabase Auth schema/table-data export through management
  read-only queries;
- five allowlisted Supabase Auth control-plane GET responses captured before
  and after the database/media window, with exact hashes and explicit
  null/masked-value recovery markers;
- every Vercel media object referenced by the snapshot's
  `public.content_media_assets` rows, pinned to the expected host and bound by
  content hash;
- reviewed host configuration and root crontab; and
- side-effect queues/spools in forensic quarantine.

New sets use outer manifest `openclaw-backup-manifest/v2`, internal payload
`openclaw-backup-payload/v2`, and
`openclaw-backup-path-manifest/v1`. The encrypted path manifest declares every
directory, file size/hash, and symlink-target size/hash. Its summary is bound
into the signed outer manifest; creation and restore require exact tar and
extracted-tree membership. The payload class must remain `core+browser` across
creator, verifier, uploader, receipt, health check, and restore.

The production-data component must explicitly report:

```text
supabasePublicData=true
supabaseAuthData=true
vercelMediaObjects=true
supabaseAuthControlPlaneMetadata=true
supabaseAuthProviderConfig=false
supabaseControlPlane=false
fullProductionRecovery=false
```

`fullProductionRecovery=false` is a deliberate safety statement. The system
verifies and fences production data artifacts but does not automatically import
Auth, write to live Supabase, upload recovered media, or recreate Supabase,
Vercel, DNS, or other provider control planes.

Backup archives use unique immutable pathnames. SQLite databases are captured
with the online backup API, and the remaining payload is streamed through tar,
zstd, public-key encryption, and fixed-size splitting. The recovery private key
stays off the VPS. A separate backup-origin key signs the encrypted remote
manifest, and recovery pins that signer's independently recorded fingerprint.

Plaintext staging must exist only below the service-private
`/run/openclaw-backup-tmp` mount, created as a 1536 MiB
`rw,nosuid,nodev,noexec,noswap` tmpfs. Shared `/dev/shm` is rejected. The
preflight budgets SQLite, both PostgreSQL dumps, Auth/control-plane JSON, media,
host recovery, quarantine, and a fixed allowance; both tmpfs capacity and
physical-memory headroom must cover the full computed requirement.

Normal host swap uses one ephemeral random-key
`/dev/mapper/openclaw-cryptswap` AES-XTS mapping backed by `/swapfile`. The
former plaintext two-GiB backing file was taken offline and fully overwritten
before dm-crypt activation. Maintenance and health validate the live mapping,
exact `crypttab`/`fstab` configuration, and the backing-file contract.
Maintenance requires RAM for used swap, the full staging budget, and 768 MiB
of process headroom, then runs `swapoff --all` and proves that no swap remains
for the plaintext-capture window. Recovery revalidates configuration, clears
any swap, activates only the exact encrypted mapper, and requires it to be the
sole confidential mapping. A failed swap recovery clears swap again and keeps
credential-bearing production workloads stopped.

The pinned PostgreSQL 17 verifier receives the Supabase custom dump over
container stdin and runs `pg_restore --list` with no network, a read-only
container filesystem, all capabilities dropped, `no-new-privileges`, and a PID
limit. Recovery/staging paths are not bind-mounted into that verifier.

The ingest route runs only in Vercel production, atomically consumes HMAC-bound
nonces, and the uploader validates the complete signed-URL scope plus the
private-store receipt. `manifest.json.gpg` is uploaded last and is the sole
completion marker.

Production sets run only through the reviewed maintenance workflow. It records
prior production and swap state, stops or freezes known services, cron work,
browser users, Codex, and containers with writable OpenClaw mounts, disables
swap for capture, creates a quiesced set, restores production health and swap,
verifies, uploads, and probes the complete encrypted object set. Exit handling,
extended systemd stop windows, and an enabled boot guard recover production
after interruption. A six-hour health timer checks configuration, coverage,
resources, encrypted swap, installed units, and, after activation, v2 receipt
freshness and remote object-set evidence. The daily timer remains disabled
behind `/etc/openclaw-backup/scheduler-enabled` until all activation gates pass.

Systemd executes a root-owned content-addressed runtime under
`/usr/local/libexec/openclaw-backup/releases/`, selected through an atomic
`current` symlink. Health verifies the release identity, exact file set,
ownership, modes, checksums, pinned origin-signature, included installer, and
installed units. It reports readiness pending, not health OK, until the
scheduler gate exists.

A standalone local retention CLI is dry-run by default and never runs as part
of maintenance or systemd. It retains the two newest verified sealed
production-recovery sets in every
`manifest-schema + recipient-fingerprint + signer-fingerprint` cohort and every
set younger than seven full days. Legacy and other non-production-recovery sets
are not deletion candidates. Deletion requires both backup locks, exact sealed
metadata, the existing set verifier, a v2 receipt plus v2 probe no older than 36
hours cross-bound to every encrypted object, and a new full-object probe no more
than five minutes before deletion. Partial, unsealed, unsafe, old-cohort, or
unverifiable state is protected or fails closed. This decision does not grant
the VPS remote Blob deletion.

Restores are always fenced into an empty inspection root. Delivery queues,
Telegram ingress spools, absolute links, and both file- and SQLite-backed cron
state are quarantined or disabled rather than made live. The downloaded set and
inspection root must be owned by the recovery user, and their complete parent
hierarchies may be owned only by that user or UID 0.

## Why

Hetzner's daily seven-slot disk backups are useful for rapid rollback, but live
disk consistency is not guaranteed and the backups are deleted with the server.
They also remain in the same provider account and control plane.

Hetzner alone therefore cannot prove application consistency, recover from
provider/account loss, or selectively validate OpenClaw, browser, Supabase Auth,
and media state.

The existing Agent OS `BLOB_READ_WRITE_TOKEN` is a content-upload credential and
can list, read, write, copy, and delete objects in its store. Reusing it would
allow a compromised host to delete the off-host backup.

Vercel Blob supports private stores, OIDC, and signed URLs constrained to one
operation, pathname, and expiry. This lets the VPS upload without receiving
credentials that can read or delete older recovery points.

Supabase is the production Agent OS database; the local Docker PostgreSQL
container is only fallback/development state. Treating the local dump as the
production backup would create a false recovery claim. The Supabase public
dump, Auth export, and referenced media capture make the recoverable data
explicit, while `fullProductionRecovery=false` makes the remaining provider and
import gaps equally explicit.

The signed v2 exact-path manifest closes a separate integrity gap: successful
decryption and a safe tar listing do not, by themselves, prove that every
intended file was present or that the restored tree exactly matches the set
created on the VPS.

## Tradeoffs

- Vercel Blob does not document Object Lock, WORM retention, object version
  recovery, or undelete. It is an independent copy, not the final immutable
  layer.
- A compromised VPS with the narrow ingest secret can attempt storage
  exhaustion, but cannot read, overwrite, or delete existing backup objects.
  Quota alerts and a spend cap improve detection rather than preventing abuse.
- A compromised isolated Vercel project retains store-wide OIDC capability, so
  project isolation is blast-radius reduction rather than immutability.
- A storage-only attacker cannot forge a signed set, but a fully compromised
  root context on the VPS can use its unattended origin-signing key to forge
  future sets. Restore trust therefore depends on the independently recorded
  signer fingerprint and a recovery point from before suspected compromise.
- The v2 probe proves exact metadata for every remote object, not body
  readability, ciphertext hash, decryption, or application recovery. A separate
  recovery identity must periodically perform a full `GET`, deep verification,
  and fenced restore.
- The Supabase management credential is used only for declared read queries by
  this implementation, but the credential may carry broader project/account
  authority and increases host-compromise impact.
- Supabase `public` and media references share one exported database snapshot,
  and Auth is compared before and after capture. Vercel object storage and
  Supabase control-plane settings are not an atomic cross-provider snapshot.
- The allowlisted Auth control-plane responses preserve metadata returned by
  Supabase, but private signing keys, masked/null provider secrets, remaining
  provider state, and automatic recreation are absent; Auth and media recovery
  remain reviewed manual procedures.
- Browser profiles materially increase backup sensitivity because they can
  contain authenticated sessions.
- Streaming, chunked archives and the dedicated tmpfs bound persistent
  plaintext exposure, but capture still needs enough physical RAM for the full
  staging estimate plus process headroom and restore remains a multi-part
  operation.
- Client-side public-key encryption requires disciplined offline key custody.
- The current encrypted staging directory shares the VPS filesystem and is not
  an independent copy.
- The one-time full raw swap scrub removes prior plaintext remnants from the
  live backing file, but cannot retroactively sanitize older Hetzner backup
  slots that captured the disk before migration.
- Local retention exists only as a standalone manual tool. Remote Blob
  retention, authorization-nonce cleanup, and retention scheduling are absent
  and require a separate privileged maintenance identity that must never live
  on the backup host.

## Activation and follow-up

- Verify one completed Hetzner backup by restoring it to a new isolated server.
- Verify the latest contracts, install the current signed runtime and exact unit
  cohort, and require health to prove the private noswap tmpfs, encrypted swap,
  and RAM/staging gates.
- Generate the recovery encryption key off-host, test two private-key copies,
  import only its public key on the VPS, and configure the exact recipient
  fingerprint.
- Publish the current v2 recovery kit to the dedicated branch, regenerate and
  sign its complete checksums, then repeat the independently anchored bootstrap
  from a clean clone.
- Deploy the implemented v2 `/api/openclaw-backup/probe` route, configure its
  exact URL on the VPS, and prove it against every object in a real upload
  receipt.
- Run one manual maintenance cycle and retain all bound local/upload/probe
  evidence.
- Fully download that set through a separate recovery identity and perform deep
  verification plus a clean-machine restore, including the documented manual
  Supabase/Auth/media reconstruction, before creating the scheduler gate.
- Retain initially 30 daily and 12 monthly Blob sets, keep Hetzner's seven
  automatic slots, and run an application restore drill quarterly and after
  material format/runtime changes.
- Exercise and record the fail-closed local retention tool; implement
  separate-identity remote retention, nonce cleanup, and scheduling.
- Add a separately administered Object-Lock/WORM copy if this system becomes
  business-critical.

## Evidence

- Hetzner backup behavior:
  <https://docs.hetzner.com/cloud/servers/backups-snapshots/faq/>
- Vercel Private Blob and signed URLs:
  <https://vercel.com/changelog/vercel-private-blob-is-now-generally-available>
- Vercel Blob CLI credential capabilities:
  <https://vercel.com/docs/cli/blob>
