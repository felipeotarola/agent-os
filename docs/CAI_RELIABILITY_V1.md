# Cai Reliability V1

Purpose: make Cai's autonomous work observable and quiet. This is a control
plane, not another general-purpose autonomous agent.

## Control-plane shape

- **Reliability monitor** is read-only. It inspects scheduled-job health and
  sends Felipe one alert only for a failed or missed enabled job. Healthy runs
  are silent. OpenClaw's own per-job failure alerts remain the first line of
  defence; this monitor catches missed schedules and gives one coherent view.
- **Daily learning** is the observation lane. It may update memory, lessons,
  and candidate records, but does not implement Agent OS code or publish work.
- **Research** selects at most one evidence-backed candidate. It does not
  implement.
- **Implementation** is the only autonomous mutation lane for Agent OS
  reliability work. It acts only on a `ready-small`, reversible, verifiable
  candidate and must run focused checks before a commit/push.

This sequence prevents the same signal being independently acted on by daily
learning, research, and implementation lanes.

## Incident contract

`npm run check:cai-reliability` covers regressions we have already seen:

- commentary or ambiguous runtime output is contained; it is never published
  as a user answer;
- a GOG keyring failure becomes a named credential-storage blocker, not an
  endless re-authentication loop;
- an unavailable browser session becomes a named session blocker. Cai checks
  purpose-named credentials first and only asks Felipe to reconnect a browser
  or complete an unavoidable manual step.

The suite is deterministic and contains no credentials, live browser access,
or external messaging.
