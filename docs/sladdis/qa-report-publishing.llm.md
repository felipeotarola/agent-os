# Sladdis QA Report Publishing

Use this instruction when Sladdis needs to publish a public QA report into Agent OS.

## Purpose

Sladdis must never write reports directly with Felipe's dashboard session. Instead, Sladdis requests a short-lived claim, Felipe approves the claim through Agent OS login, and Sladdis exchanges the approved claim for a scoped writer token.

## URL Shape

Published reports use:

```text
/qa-rapport/{vertical}/{customerSlug}/{reportSlug}
```

Example:

```text
/qa-rapport/ux-ui/lysande/homepage-review
```

## Claim Flow

1. Create a claim:

```http
POST /api/qa-reports/claims
Authorization: Bearer {SLADDIS_QA_ACTIVATION_SECRET}
Content-Type: application/json
```

Body:

```json
{
  "vertical": "ux-ui",
  "requestedByAgent": "Sladdis",
  "customerSlug": "lysande",
  "customerName": "Lysande",
  "reportSlug": "homepage-review",
  "targetUrl": "https://www.lysande.ai"
}
```

If `SLADDIS_QA_ACTIVATION_SECRET` is not configured, the authorization header is not required. Prefer configuring it in production.

2. Send Felipe the returned `activationUrl`.

3. Wait until Felipe opens the activation URL, logs in to Agent OS if needed, and approves the claim.

4. Exchange the approved claim:

```http
POST /api/qa-reports/claims/exchange
Content-Type: application/json
```

Body:

```json
{
  "claimToken": "qa_claim_..."
}
```

If the response is `409 claim-not-approved`, wait and retry later. Do not spam retries.

5. Store the returned `writerToken` only for this publishing session. Treat it as secret. Do not print it in public report text, screenshots, logs, or customer-facing output.

6. Publish the report:

```http
POST /api/qa-reports
Authorization: Bearer {writerToken}
Content-Type: application/json
```

Body must be a full `QaReport` object. The token is scoped; if the claim included `vertical`, `customerSlug`, or `reportSlug`, the report must match those values.

Minimum valid example:

```json
{
  "vertical": "ux-ui",
  "customerSlug": "lysande",
  "customerName": "Lysande",
  "slug": "homepage-review",
  "title": "Lysande UX/UI QA report",
  "targetUrl": "https://www.lysande.ai",
  "generatedAt": "2026-06-10T10:37:18.782Z",
  "agentName": "Sladdis",
  "reportType": "ux-ui-report",
  "executiveSummary": "Short summary of the most important QA findings.",
  "score": 78,
  "verdict": "Usable, with clear conversion and responsive-layout fixes recommended.",
  "scope": ["Homepage first impression", "Desktop and mobile responsive pass"],
  "metrics": [],
  "environment": [],
  "coverage": [],
  "timeline": [],
  "risks": [],
  "evidence": [],
  "findings": [],
  "suggestedTests": [],
  "nextRun": ["Retest primary CTA and mobile layout after fixes."]
}
```

If the report body is invalid, the API returns `400 invalid-report` with an `issues` array containing validation paths and messages.

The response returns:

```json
{
  "reportUrl": "/qa-rapport/ux-ui/lysande/homepage-review"
}
```

## Rules

- Create a claim before trying to save a report.
- Do not ask Felipe for a dashboard cookie, password, or session token.
- Do not reuse a writer token for another customer, vertical, or report if the token was scoped.
- Do not expose raw claim tokens or writer tokens in customer-facing output.
- If approval expires or exchange fails, create a new claim and send a fresh activation URL.
- If report submission returns `403 token-scope-mismatch`, create a new correctly scoped claim instead of changing the report identity silently.

## Minimum Report Identity

Every publishable report must include:

- `vertical`
- `customerSlug`
- `customerName`
- `slug`
- `title`
- `targetUrl`
- `generatedAt`
- `agentName`
- `reportType`
- `executiveSummary`
- `score`
- `verdict`
- `scope`
- `metrics`
- `environment`
- `coverage`
- `timeline`
- `risks`
- `evidence`
- `findings`
- `suggestedTests`
- `nextRun`
