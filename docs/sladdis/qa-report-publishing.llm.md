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

## Scenario Selection

Before creating a claim or publishing a report, confirm that the report vertical is the right one.

- Use the private Agent OS QA Strategy dashboard (`/dashboard/qa-knowledge`) as the human control surface.
- Use `POST /api/qa-reports/strategy` as the runtime source of truth before recommending, creating a claim, or publishing. It returns active scenarios, configured techniques, matching same-domain/customer reports, the decision policy, and the recommended next action.
- If Felipe named a scenario, use the matching vertical.
- If Felipe only sent a URL or gave an ambiguous "test this" instruction, follow the returned recommendation action:
  - `run`: proceed with the recommended scenario.
  - `ask`: ask Felipe which scenario to run and suggest the recommended default.
  - `approval-required`: wait for explicit approval before running.
- Use `/qa-rapport` as the source of available scenarios and existing public reports.
- Check whether the same domain/customer already has a report. If it does, mention the existing vertical and recommend either a retest or a complementary scenario.
- Do not silently repeat the same vertical for the same domain unless Felipe asked for a retest or the previous report is stale.
- See `docs/sladdis/qa-knowledge-playbook.llm.md` for the decision flow and QA technique baseline.

Available verticals:

- `ux-ui` - UX/UI website test
- `accessibility` - Accessibility smoke test
- `performance` - Performance and loading test
- `seo-content` - SEO and content QA
- `conversion-flow` - Conversion flow test
- `security-smoke` - Security smoke test

Runtime request:

```http
POST /api/qa-reports/strategy
Authorization: Bearer {SLADDIS_QA_ACTIVATION_SECRET}
Content-Type: application/json
```

```json
{
  "targetUrl": "https://www.lysande.ai",
  "customerSlug": "lysande",
  "requestText": "test this",
  "requestedVertical": "ux-ui"
}
```

Omit `requestedVertical` when Felipe did not name a scenario.

If `SLADDIS_QA_ACTIVATION_SECRET` is not configured, the authorization header is not required. Prefer configuring it in production.

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
  "testRun": {
    "build": "public-site 2026-06-10",
    "testPlan": "Sladdis UX/UI smoke plan v1",
    "executionType": "Manual exploratory with browser evidence",
    "startedAt": "10:37",
    "completedAt": "10:52",
    "result": "warning",
    "passed": 4,
    "failed": 0,
    "warnings": 2,
    "notRun": 1,
    "deviations": ["Production form submission was stopped at the mutation boundary."],
    "releaseReadiness": "Ready for review after responsive fixes are retested.",
    "reviewer": "Cai",
    "signOff": "Retest required before final client sign-off."
  },
  "traceability": [
    {
      "requirement": "Visitor understands the offer and primary next step",
      "source": "Homepage acceptance criterion",
      "status": "warning",
      "testCases": ["TC-001"],
      "findings": [],
      "notes": "Covered by first-impression and CTA smoke checks."
    }
  ],
  "testStrategy": {
    "selectedScenarioReason": "Felipe sent a public homepage URL and no scenario; UX/UI is the highest-value first pass for demo readiness.",
    "techniquesUsed": ["Risk-based testing", "Exploratory session-based testing", "Nielsen UX heuristics"],
    "decisionPolicy": "ask-when-ambiguous",
    "knowledgeSources": ["Agent OS QA Strategy", "Nielsen Norman Group heuristics", "ISTQB CTFL v4.0"],
    "coverageGaps": ["No accessibility smoke pass yet", "No safe form submission retest yet"],
    "recommendedNextTest": "Run accessibility smoke next because UX/UI already covered the first impression."
  },
  "metrics": [],
  "environment": [],
  "coverage": [],
  "timeline": [],
  "risks": [],
  "evidence": [
    {
      "id": "hero-desktop",
      "label": "Homepage desktop",
      "viewport": "1440 x 1000",
      "path": "/",
      "imageUrl": "https://example.com/screenshots/lysande-homepage-desktop.png",
      "capturedAt": "10:40 UTC",
      "notes": "Above-the-fold message and primary action visibility."
    }
  ],
  "findings": [],
  "suggestedTests": [],
  "nextRun": ["Retest primary CTA and mobile layout after fixes."]
}
```

If the report body is structurally invalid, the API returns `400 invalid-report` with an `issues` array containing validation paths and messages. If the body conflicts with the active QA Strategy config, it returns `400 qa-strategy-policy-mismatch`.

`testRun` and `traceability` are optional for backwards compatibility. `testStrategy`, `coverageGaps`, `recommendedNextTest`, and durable screenshot evidence are enforced when the QA Strategy config requires them. They capture the QA reporting record: what build or page version was tested, which test plan or acceptance criteria were used, pass/fail/not-run totals, deviations from the plan, release-readiness, reviewer/sign-off, mappings from requirements to test cases and findings, why the scenario was selected, which QA techniques were used, what coverage gaps remain, and what Sladdis recommends next.

When screenshots are required, every `evidence` item that creates a report card must include a durable `imageUrl` or `blobUrl`. Do not publish placeholder-only evidence rows for pages, routes, or viewports that were not actually captured; capture each tested page first or list the missing route in `coverageGaps`.

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
- `evidence` with durable screenshot URLs in `imageUrl` or `blobUrl` for every evidence card when screenshots are required
- `findings`
- `suggestedTests`
- `nextRun`
