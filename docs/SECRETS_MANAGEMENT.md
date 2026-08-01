# Secrets Management

Agent OS includes a dedicated Credentials workspace for API keys and local secrets.

## Design

- UI lives in `/dashboard/credentials` as **Credentials**.
- API routes live under `/api/secrets` and are protected by the Agent OS session proxy.
- Secret values are written server-side to `/root/.openclaw/secrets/agent-os/<NAME>`.
- Metadata is written to `/root/.openclaw/secrets/agent-os/<NAME>.meta.json`.
- Secret files are created with file mode `600`; the directory is created with mode `700`.
- The UI lists only redacted metadata: name, project, description, keyed fingerprint, byte count, update time and local path.
- Values are never returned by the API after save.
- `POST /api/secrets` creates only; it returns a conflict instead of replacing an existing name.
- `PATCH /api/secrets/<NAME>` edits metadata and can optionally replace the value. Names are immutable.
- The visibility control only reveals an unsaved value currently being typed.

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
- Environment variables with the same name take precedence over managed files.
- Live OAuth/API configuration still requires explicit approval when it touches external accounts, paid services or broad OpenClaw config.
