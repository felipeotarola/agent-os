# Browser Automation Recovery

Purpose: give Cai and Charles a repeatable way to diagnose stuck browser automation without killing unrelated user sessions or sending external actions.

## Guardrails

- Prefer first-class OpenClaw browser tools when available.
- Capture evidence before changing state: active session, profile name, command line, memory pressure, and screenshot if available.
- Do not post, upload, send, follow, comment, or mutate external accounts while recovering a browser.
- Do not kill broad Chrome/Chromium processes. Only target a known automation profile after confirming it is stale or orphaned.
- Ask Felipe before closing a browser that may be an active human session.

## Quick Triage

1. Identify the intended profile or flow, for example `linkedin-charles`.
2. Check whether the agent session is waiting on a browser/tool call, timed out, or already complete.
3. Inspect matching processes narrowly:

```bash
pgrep -af -- '--user-data-dir=.*linkedin-charles|chrome|chromium'
```

4. Check memory pressure:

```bash
free -h
ps -eo pid,ppid,stat,etime,rss,cmd --sort=-rss | head -20
```

5. If a browser tab is reachable, capture a screenshot or snapshot before any cleanup.

## Stale Profile Criteria

Treat a profile as stale only when one or more of these is true:

- The parent process is gone or adopted by PID 1 and the owning agent session is finished or blocked.
- The browser has exceeded the expected job window and no tool output is progressing.
- Renderer count or RSS is growing while the page is no longer producing useful state.
- A previous run documented the same profile as orphaned.

## Recovery Path

1. Save the evidence in the task/session notes or daily memory if it is durable.
2. Prefer a narrow watchdog or profile-specific cleanup script if one exists.
3. If manual cleanup is necessary, kill only the confirmed stale profile tree, not every Chrome process.
4. Restart the browser/tool path cleanly only after the process list shows no stale profile leftovers.
5. Verify with:

```bash
pgrep -af -- '--user-data-dir=.*linkedin-charles' || true
free -h
```

## Known Profile Notes

- `linkedin-charles`: historically leaked orphan Chrome renderers during LinkedIn automation. Use narrow profile matching and avoid retrying LinkedIn flows during high memory pressure.
