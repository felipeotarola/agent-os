# OpenClaw backup ingest

This is a separate Vercel project that mints short-lived, private, put-only Blob
URLs for one fixed OpenClaw backup host. Deploy this directory as its own Vercel
project. Do not attach the backup Blob store to the main Agent OS project. The
route fails closed outside Vercel's production environment.

The current production deployment is
`https://openclaw-backup-ingest.vercel.app`. It is connected only in Production
to the private `openclaw-backup-primary` store in `arn1`. Runtime OIDC was
verified with a real signed-URL canary; Preview and Development remain
unconfigured. The deployed upload route is active, but the current production
deployment returns `404` for the probe route and predates the v2 full-object-set
probe in this source tree. Verify and deploy this complete source cohort, then
install the matching v2 uploader/probe/retention runtime on the VPS before
configuring the probe URL. Do not mix v1 receipts or marker-only probe evidence
with the v2 retention contract.

## Required environment

- `OPENCLAW_BACKUP_ALLOWED_HOST_ID`: one fixed lowercase host identifier.
- `OPENCLAW_BACKUP_INGEST_HMAC_SECRET`: at least 32 random bytes, shared only
  with the backup uploader.
- `OPENCLAW_BACKUP_BLOB_STORE_ID`: the explicit private backup Blob store ID.
- Vercel supplies OIDC through the Function request context (with
  `VERCEL_OIDC_TOKEN` as the SDK fallback). Do not configure this value
  manually.

The project's OIDC identity needs access only to the dedicated private backup
store. Connect the store and HMAC secret only to production; preview deployments
must have neither.

Use the exact production `*.vercel.app` hostname. Deployment Protection must not
intercept this route because the uploader does not hold a Vercel account
credential; the route's HMAC contract is its authentication boundary. Configure
usage alerts and a conservative spend cap because a compromised HMAC host can
create new objects and consume quota.

Do not reuse the main Agent OS project, media store, or
`BLOB_READ_WRITE_TOKEN`. This project is deliberately an independent recovery
control plane. The function fails closed if `BLOB_READ_WRITE_TOKEN` is present.

Vercel's project OIDC identity has store-wide capabilities, not a mint-only
role. Compromise of this isolated project could therefore read or delete the
dedicated store. Project isolation reduces blast radius but is not WORM or
Object Lock; keep Hetzner as a separate recovery layer and add an independently
administered immutable copy if the system becomes business-critical.

## Request contract

`POST /api/openclaw-backup/upload-url` with exactly:

- `Content-Type: application/json`
- `X-OpenClaw-Backup-Host-Id`
- `X-OpenClaw-Backup-Timestamp`: ten-digit Unix seconds, within five minutes.
- `X-OpenClaw-Backup-Nonce`: 32 lowercase hexadecimal characters.
- `X-OpenClaw-Backup-Signature`: `v1=` plus lowercase HMAC-SHA-256 hex.

The compact JSON body must have this exact field order:

```json
{
  "filename": "openclaw-backup.part-00000.gpg",
  "setId": "20260727T120000Z-0123456789abcdef",
  "sha256": "<64 lowercase hex>",
  "sizeBytes": 100663296
}
```

Only encrypted `.gpg` files of at most 96 MiB are accepted. The HMAC canonical
request and serializer are exported from `src/contract.ts` so the VPS uploader
can share the exact contract.

The response URL permits one private `PUT` pathname only, expires after five
minutes, cannot overwrite an existing object, and is bounded to the declared
content type and size. The claimed SHA-256 is bound into the immutable pathname;
the restore process must still hash the downloaded ciphertext before decrypting
it.

The signed upload URL currently uses Vercel's `https://vercel.com/api/blob/`
control-plane endpoint. The VPS uploader pins that exact endpoint and validates
the delegated operation, store ID, pathname, expiry, content type, maximum size,
random-suffix flag, and overwrite policy before sending bytes. It also validates
that the upload receipt resolves to the expected dedicated private-store host.

Objects use this layout:

```text
openclaw-backups/v1/<host-id>/<set-id>/<sha256>-<bytes>/<filename>
```

The uploader sends numbered ciphertext parts first and `manifest.json.gpg`
last. The encrypted manifest remains the completion marker, but v2 remote
evidence covers the full ordered object set. This project deliberately has no
list, object-body read, overwrite, or delete route.

`POST /api/openclaw-backup/probe` uses the same headers and HMAC construction,
with the signature bound to the probe pathname and exact compact request body.
Its body schema is `openclaw-backup-remote-object-set/v2` and contains, in
canonical order:

```json
{
  "schema": "openclaw-backup-remote-object-set/v2",
  "setId": "20260727T120000Z-0123456789abcdef",
  "objects": [
    {
      "filename": "openclaw-backup.part-00000.gpg",
      "sha256": "<64 lowercase hex>",
      "sizeBytes": 100663296,
      "etag": "<exact upload receipt ETag>"
    },
    {
      "filename": "manifest.json.gpg",
      "sha256": "<64 lowercase hex>",
      "sizeBytes": 4096,
      "etag": "<exact upload receipt ETag>"
    }
  ],
  "objectRootSha256": "<64 lowercase hex>"
}
```

The route accepts 2–128 objects and at most 64 KiB of request JSON. Numbered
parts must be contiguous and ordered, `manifest.json.gpg` must be last, and the
canonical object root must match the host-derived immutable pathnames. After
authentication it consumes the one-time nonce before any metadata read, then
performs bounded-concurrency `head` calls for every object. Each result must
match pathname, size, `application/octet-stream`, and ETag. A successful
`openclaw-backup-remote-probe/v2` response repeats only the set ID, object
count, total bytes, object root, and completion-marker pathname. It never lists
a prefix or returns object bytes.

The HMAC timestamp limits an intercepted authorization request to five minutes.
Both upload authorization and probe calls atomically consume their signed nonce
by creating a non-overwritable private marker below
`openclaw-backup-auth-nonces/v1/`. A replay therefore fails before another URL
is issued or a probe performs any `head`. Retention maintenance must eventually
remove expired nonce markers; the ingest function itself has no delete route.

If an upload succeeds but its response is lost, do not mint again for the same
immutable set. The host deliberately has no `HEAD` permission; abandon that set
ID and create a new one.

## Residual boundaries

- The root backup process can use the HMAC secret to create new immutable
  objects and consume store quota. It cannot use this API to read, overwrite, or
  delete existing backups. Configure usage alerts and a conservative spend cap.
- The isolated project's OIDC identity remains store-wide. Project compromise
  can therefore read or delete the private store even though the host contract
  cannot.
- The v2 probe is metadata-only. Full remote assurance still requires a
  separate read/list recovery identity to `GET` every object, verify ciphertext
  hashes, decrypt, deep-verify, and perform a fenced clean-machine restore.
- Vercel Blob has no documented WORM/Object Lock or undelete guarantee. A
  separately administered immutable copy remains required for stronger
  ransomware and control-plane-loss protection.
- Remote backup retention and authorization-nonce cleanup are not implemented
  here. They require a separate privileged identity that never resides on the
  backup host and must preserve each recovery-key cohort's floor.

## Verify

```bash
npm ci
npm run verify
```

The production activation and restore procedure is documented in
`../../docs/OPENCLAW_BACKUP.md`.
