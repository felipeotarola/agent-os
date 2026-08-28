# AgentOS Vault

AgentOS is intentionally small: one private web page for managing the file-backed credentials used by local agents.

The web app is optional. Agents and jobs read their assigned files directly from `/root/.openclaw/secrets/agent-os`; they do not call AgentOS and do not stop working when the app is offline.

## What remains

- Private email/password login with a signed, HTTP-only session cookie.
- Credential inventory containing metadata and fingerprints, never stored values.
- Create and rotate operations that preserve exact file contents and mode `0600`.
- Recoverable delete into the vault's private `.trash/` quarantine.

There is no database, bridge, cron integration, chat, notifications, agent control plane, content studio, Radar, Kanban, knowledge store, or external connector.

## Run locally

```bash
cp env.example.txt .env
npm install
npm run verify
npm run dev
```

Production is designed for one process on the VPS, bound to loopback and exposed only through a private Tailscale route. The filesystem vault is the source of truth; Vercel cannot access it directly.

## Environment

Required:

- `ADMIN_EMAIL`
- `AUTH_SECRET`
- `ADMIN_PASSWORD_HASH` (preferred) or the transitional `ADMIN_PASSWORD`

Optional:

- `AGENT_OS_SECRETS_DIR` (defaults to `/root/.openclaw/secrets/agent-os`)
- `AGENT_OS_VAULT_FINGERPRINT_KEY` (otherwise generated privately in the vault)

## Verification

`npm run verify` runs the isolated vault contract, TypeScript, and a production build. The contract uses a temporary directory and never touches real credentials.

The final full-cockpit code is preserved in Git at tag `agentos-full-archive-2026-08-28`. Old application data is a cold archive, not a runtime dependency.
