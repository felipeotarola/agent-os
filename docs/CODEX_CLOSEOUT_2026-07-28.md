# Codex closeout: OpenClaw backup work

Date: 2026-07-28

## Outcome

Codex built a layered OpenClaw recovery system without activating production
backup execution. The local change set now includes client-encrypted backup
creation, exact-path manifests, verification and fenced restore, isolated Blob
ingest/upload and full-object probing, fail-closed retention, maintenance and
health tooling, signed immutable runtime installation, systemd hardening, and a
signed clean-machine recovery kit.

The installed runtime matches the current source and unit cohort. Its direct
health check exits successfully with `openclaw_backup_readiness_pending`; the
only current warnings are the intentionally missing offline recovery recipient
and production remote-probe configuration. The daily maintenance timer remains
disabled and the scheduler gate is absent.

## Change map

Backup and production-readiness work:

- Architecture and operator guidance: `docs/OPENCLAW_BACKUP.md`,
  `decisions/2026-07-27-layered-openclaw-backup.md`, `README.md`, and
  `decisions/README.md`.
- Backup, verification, upload, probe, restore, retention, contracts, runtime
  installation, health, maintenance, and alerting: `scripts/openclaw-backup*`,
  `scripts/probe-openclaw-backup.mjs`,
  `scripts/recover-openclaw-backup-manifest.mjs`,
  `scripts/restore-openclaw-backup.mjs`,
  `scripts/retain-openclaw-backups.mjs`,
  `scripts/upload-openclaw-backup.mjs`,
  `scripts/verify-openclaw-backup.mjs`, and the pinned Supabase CA.
- Isolated Vercel ingest API and tests: `infra/openclaw-backup-ingest/`.
- Installed-service source: `infra/openclaw-backup-systemd/`.
- Portable signed recovery tooling: `recovery/openclaw-backup-v1/`.
- Local bridge exposure reduction: `bridge/server.mjs` and
  `docker-compose.yml`.
- Package wiring and Node runtime constraint: `package.json` and
  `package-lock.json`.

Separate Codex work preserved but not folded into the backup design:

- Context-dependent proactivity evaluation:
  `evals/context-dependent-proactivity-v0.json`,
  `scripts/context-dependent-proactivity-eval.mjs`, `evals/README.md`, the
  corresponding entry in `docs/TASKS.md`, and the 2026-07-27 research section
  in `docs/AGENT_OS_RESEARCH_RADAR.md`.
- The 2026-07-28 R&D loop-board candidate in
  `docs/AGENT_OS_RESEARCH_RADAR.md`.

## Verification

- `npm run check:openclaw-backup`: passed all creator, upload, limited
  integration, and retention contracts. The secure synthetic E2E was skipped
  in this closeout because its private secure test roots were not supplied.
- `npm test` in `infra/openclaw-backup-ingest`: 10/10 tests passed.
- Recovery-kit SHA-256 manifest and detached origin signature: passed locally.
- Installed runtime/source and installed unit/source comparisons: exact match.
- Installed runtime health check: exit 0, readiness pending as described above.
- `npm run verify`: passed after correcting one backup recovery-kit lint error
  and two backup warnings found by the first run. One pre-existing unrelated
  Remotion unused-function warning remains non-fatal.

No real backup, restore, remote mutation, scheduler activation, commit, or push
was performed during this closeout.

## Remaining activation blockers

- Supply and independently custody the offline recovery private key, then
  configure only its public recipient on the VPS.
- Deploy/configure and validate the production full-object probe route.
- Publish the v1.2 recovery kit as an immutable signed tag/branch and pass its
  independent clean-clone trust bootstrap.
- Run the reviewed secure synthetic E2E again with private `noswap` tmpfs and
  ciphertext roots.
- Complete a controlled first encrypted backup, remote recovery receipt,
  clean-machine application restore drill, and isolated Hetzner restore drill.
- Review local retention policy separately; remote Blob retention and nonce
  cleanup are not implemented.

Only after those gates pass should the scheduler gate be created and the daily
maintenance timer enabled.
