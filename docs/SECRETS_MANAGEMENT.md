# Secrets Management

Agent OS includes a small Settings card for API keys and local secrets.

## Design

- UI lives in `/dashboard/settings` as **API keys & secrets**.
- API routes live under `/api/secrets` and are protected by the Agent OS session proxy.
- Secret values are written server-side to `/root/.openclaw/secrets/agent-os/<NAME>`.
- Metadata is written to `/root/.openclaw/secrets/agent-os/<NAME>.meta.json`.
- Secret files are created with file mode `600`; the directory is created with mode `700`.
- The UI lists only redacted metadata: name, description, fingerprint, byte count, update time and local path.
- Values are never returned by the API after save.

## Allowed names

Secret names must be ENV-style uppercase identifiers:

```text
^[A-Z][A-Z0-9_]{1,79}$
```

Examples:

- `OPENAI_API_KEY`
- `ELEVENLABS_API_KEY`
- `NORDDEA_CLIENT_SECRET`

## Guardrails

- Do not store secrets in git, markdown, DB rows, chat transcripts or browser localStorage.
- Do not add plaintext reveal endpoints.
- Use the existence/fingerprint metadata to confirm a key was added.
- Live OAuth/API configuration still requires explicit approval when it touches external accounts, paid services or broad OpenClaw config.
