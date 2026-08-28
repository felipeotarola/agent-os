# AGENTS.md — AgentOS Vault

This repository has one purpose: provide a small, private administration UI for the existing file-backed credential vault.

## Non-negotiable boundaries

- The agent harness must never depend on this app. Agents read their assigned credential files directly.
- Do not import or call OpenClaw, agent sessions, cron, Postgres, Supabase, Vercel Blob, chat, notifications, or other product systems.
- Do not add a page or integration without a current, explicit user need.
- Never return, log, cache, persist in a database, or prefill a stored secret value.
- Preserve the default vault path, exact values, metadata compatibility, and file mode `0600`.
- Deletion must remain recoverable through the private vault quarantine.
- Keep all routes private except sign-in and sign-out.

## Stack

- Next.js App Router, React, TypeScript.
- Plain CSS and platform controls; no component framework or client state library.
- Node filesystem vault in `src/server/credential-vault.mjs`.
- Custom signed session in `src/lib/auth/`.

## Required checks

Run `npm run verify` before committing application changes. The credential contract is isolated and must never point at the live vault.

For a credential-core change, also check that:

- response JSON contains metadata only;
- create cannot overwrite;
- metadata-only updates do not alter values;
- rotation preserves exact bytes and restricted permissions;
- delete quarantines instead of permanently removing files.

The former cockpit is archived at Git tag `agentos-full-archive-2026-08-28`; do not retain dead runtime code merely as an in-tree archive.
