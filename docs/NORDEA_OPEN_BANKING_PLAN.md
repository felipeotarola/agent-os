# Nordea Open Banking account overview — implementation plan

## Decision

Build the smallest useful Nordea integration inside Agent OS: a read-only account overview for Felipe.

## Scope v0

- Show Nordea account list and current balances.
- Show only safe display fields: account name/type, currency, masked account/IBAN, available/booked balance when provided, last synced time.
- Manual/user-triggered sync only.
- Swedish personal flow first: `country: "SE"`, BankID auth when applicable.
- No payments, transfers, transaction ingestion, budget analysis, recurring background scraping, or raw bank statement storage.

## Nordea API facts found

Source inspected: Nordea Open Banking Postman collection: `Nordea Open Banking v5 Personal API` from `https://raw.githubusercontent.com/NordeaOB/swaggers/master/Nordea%20Open%20Banking%20v5%20Personal%20API.postman_collection.json`.

Relevant endpoints in that collection:

- Start redirect OAuth/consent: `POST https://api.nordeaopenbanking.com/personal/v5/authorize`
- Exchange redirect code for token: `POST https://api.nordeaopenbanking.com/personal/v5/authorize/token`
- Refresh redirect token: `POST https://api.nordeaopenbanking.com/personal/v5/authorize/token`
- Revoke token: `POST https://api.nordeaopenbanking.com/personal/v5/authorize/token/revoke`
- Read account assets: `GET https://api.nordeaopenbanking.com/personal/v4/assets`
- Decoupled auth also exists for SE/FI/NO/DK via `/personal/v5/decoupled/...`, but v0 should prefer redirect auth unless browser/redirect constraints force decoupled.

Minimum scopes for v0:

- `ACCOUNTS_BASIC`
- `ACCOUNTS_BALANCES`

Explicitly do **not** request:

- `ACCOUNTS_TRANSACTIONS`
- `PAYMENTS_MULTIPLE`
- any payment/write scope

Nordea requests require more than bearer auth:

- `Authorization: Bearer <access_token>`
- `X-IBM-Client-ID`
- `X-IBM-Client-Secret`
- `X-Nordea-Originating-Date`
- `X-Nordea-Originating-Host`
- `Signature`
- sometimes `Digest` depending on method/body

The signature/digest handling is the main unknown and should be isolated in one small module.

## Product UX

Add a new dashboard page:

- Route: `/dashboard/bank-accounts`
- Nav label: `Bank Accounts`
- Badge: `read-only · Nordea`

Page states:

1. **Not configured** — missing client id/secret/signing config.
2. **Not connected** — config exists, no valid user consent/token.
3. **Connected** — show accounts + balances.
4. **Consent expired** — show reconnect CTA.
5. **API/signature error** — show safe error summary, no secrets.

Actions:

- `Connect Nordea` starts consent.
- `Sync now` reads `/assets` with existing token.
- `Disconnect` revokes token if possible, then deletes local token record.

## Data model

Keep sensitive data minimal.

Environment/secrets only:

- `NORDEA_CLIENT_ID`
- `NORDEA_CLIENT_SECRET`
- `NORDEA_SIGNING_KEY` or equivalent private key material if required by Nordea signature scheme
- `NORDEA_SIGNING_KEY_ID` if required
- `NORDEA_REDIRECT_URI`
- `NORDEA_ENV=production|sandbox`

Database table, if persistence is needed:

```ts
nordea_connections
- id text primary key
- owner_agent_id text default 'main'
- country text default 'SE'
- status text // connected | expired | revoked | error
- access_token_encrypted text nullable
- refresh_token_encrypted text nullable
- expires_at timestamp nullable
- scopes jsonb
- created_at timestamp
- updated_at timestamp
```

Do not store raw full account numbers unless unavoidable. If caching account display is needed:

```ts
nordea_account_snapshots
- id text primary key
- connection_id text
- provider_account_id_hash text
- display_name text
- masked_account text
- currency text
- balance_available text/null
- balance_booked text/null
- synced_at timestamp
```

Prefer live fetch over cache for v0 if latency is acceptable.

## Code structure

Add:

- `src/lib/nordea/types.ts` — normalized account/balance types and error types.
- `src/lib/nordea/config.ts` — env parsing, no secret logging.
- `src/lib/nordea/signing.ts` — digest/signature generation. Unit-test this separately.
- `src/lib/nordea/client.ts` — `startAuthorization`, `exchangeToken`, `refreshToken`, `revokeToken`, `getAssets`.
- `src/db/nordea.ts` — server-side snapshot function consumed by the page.
- `src/app/api/nordea/connect/route.ts` — starts consent and redirects/returns authorize URL.
- `src/app/api/nordea/callback/route.ts` — handles OAuth callback and token exchange.
- `src/app/api/nordea/sync/route.ts` — manual sync.
- `src/app/api/nordea/disconnect/route.ts` — revoke/delete connection.
- `src/app/dashboard/bank-accounts/page.tsx` — read-only UI.
- `docs/NORDEA_OPEN_BANKING_PLAN.md` — this plan.

Update:

- `src/config/nav-config.ts` — add Bank Accounts item, probably with `creditCard` icon.

## Implementation phases

### Phase 1 — mock/skeleton, no bank credentials

- Add types and normalized `BankAccountSnapshot` model.
- Add UI page with mocked local fixture behind `NORDEA_MOCK=true`.
- Add nav item.
- Add safe empty/error states.
- Verification: `bun run lint` and page renders.

### Phase 2 — Nordea client adapter

- Implement env config validation.
- Implement request wrapper with required Nordea headers.
- Implement digest/signature module based on Nordea docs/working Postman examples.
- Implement `getAssets()` against sandbox or mocked fixture first.
- Verification: unit tests for signing/config; mocked client test for assets normalization.

### Phase 3 — consent flow

- Add connect/callback routes.
- Store encrypted token material only if necessary.
- Add token refresh and expiry handling.
- Add disconnect/revoke.
- Verification: local end-to-end with sandbox credentials or Nordea developer app.

### Phase 4 — production connection

- Felipe creates/approves Nordea developer app/consent manually.
- Set production env secrets outside repo.
- Run one manual sync.
- Verify display only includes safe fields.

## Security rules

- Never paste Nordea client secret, signing key, refresh token, BankID info, OTP, or full account identifiers into chat or markdown.
- Never commit `.env` changes.
- Do not request transaction/payment scopes in v0.
- Log only status codes, Nordea request id/global transaction id, endpoint name, and safe error code.
- Redact all token/account fields in thrown errors.
- Keep sync user-triggered until Felipe explicitly asks for scheduled refresh.

## Open decisions / blockers

1. Nordea developer access: Felipe likely needs to create/login to Nordea Open Banking developer portal and register app/redirect URI.
2. Signature scheme details: need exact signing-key format and required key id/cert setup from Nordea docs/portal.
3. Redirect URI: choose local/prod URL. Likely `https://api.felipeotarola.com/api/nordea/callback` or the deployed Agent OS app callback, depending on where the UI runs.
4. Storage: decide whether tokens go in DB encrypted with app secret or host secret store. Recommendation: encrypted DB field for refresh token if recurring access is needed; otherwise access-token-only for session-level manual sync.

## Recommended next build ticket split

1. `Nordea v0 UI skeleton with mock accounts`
2. `Nordea client config + redacted request wrapper`
3. `Nordea signing/digest implementation`
4. `Nordea OAuth connect/callback/disconnect routes`
5. `Nordea assets normalization and dashboard sync`
