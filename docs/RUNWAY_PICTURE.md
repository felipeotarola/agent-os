# Runway Picture

Agent OS Runway is a safe Life OS surface for near-term income planning.

## Status

V1 is implemented as a safe summary surface. It deliberately avoids raw bank/account data and uses planning ranges, constraints, questions and next actions.

## Route

- UI route: `/dashboard/runway`
- Helper: `src/lib/runway.ts`
- Source: safe summary from Life OS context, not raw bank data.
- Radar integration: urgent runway posture creates a `/dashboard/radar` signal.

## Safety Rules

Do not store or render:

- bank logins
- card numbers
- account numbers
- OTP/2FA codes
- API keys/tokens
- raw bank statements
- overly specific transaction trails

Use ranges, decisions, constraints and next actions instead.

## V1 Scope

Runway V1 is intentionally simple:

- current posture
- high-level situation cards
- paths to cash
- next 7 day actions
- questions to resolve
- guardrails

It is planning support, not financial advice.

## Recommended Operating Mode

- Keep a tight 30-60 day horizon.
- Prefer paid fixed-scope work that protects autonomy.
- Do not count product revenue as the only short-term plan until paid signals improve.
- Ask for only the missing numbers needed to make decisions, and store them as safe ranges.

## Evidence

- Task `life-os-runway` - requested concrete runway view and next actions without storing secrets.
- `src/lib/runway.ts` - V1 safe summary data.
- `/dashboard/runway` - V1 UI surface.
- `/dashboard/radar` - urgent runway attention signal.
