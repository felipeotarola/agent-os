# Agent OS IA Consolidation Inventory

Date: 2026-05-19

Purpose: reduce Agent OS from “many dashboard pages” into a smaller cockpit with clear drill-downs. Felipe’s concern is correct: several pages are mostly stats or source-specific views that ultimately point back to tasks, knowledge, or Radar.

## Current dashboard routes

| Route | Current role | Overlap | Recommendation |
| --- | --- | --- | --- |
| `/dashboard/overview` | Large cockpit/briefing/stats page | Pulls tasks, agents, knowledge, events, calendar; overlaps Radar and Action Center | **Keep, but make it the Home/Cockpit summary only**. Avoid deep operational UI here. |
| `/dashboard/radar` | Inbox Radar: attention/review/approval queue | Overlaps Action Center, Mail Radar, observability, notifications, runway | **Make this the primary work queue**. Fold review/approvals/source alerts here. |
| `/dashboard/kanban` | Task board | Many pages create/open tasks | **Keep as Tasks drill-down**. Main queue should link here only when task execution is needed. |
| `/dashboard/action-center` | Operational queue for tasks/knowledge/agents/system | Strong overlap with Radar. Page is just a wrapper around `ActionCenterBoard` | **Merge into Radar** or keep as hidden component inside Radar. Do not keep as top-level nav. |
| `/dashboard/runway` | Income/runway picture | Radar can surface urgent runway; Overview can summarize | **Demote to drill-down** under Cockpit or Radar. Keep route, remove top-level nav. |
| `/dashboard/agents` | Agent list/bindings/status | Overview already shows agents; Settings/Command show system status | **Demote to System drill-down**. Keep route for diagnostics, not daily nav. |
| `/dashboard/command` | Safe runbook/guarded actions/status | Overlaps Settings, Knowledge actions, Memory/QMD | **Keep as Admin/Operations drill-down**, not daily nav. |
| `/dashboard/chat` | Cai chat | Radar now links to it; likely important | **Keep**, but consider making it a panel/drawer in Cockpit/Radar later. |
| `/dashboard/knowledge` | Knowledge inbox/review pipeline | Radar/Action Center point to knowledge items; Wiki/Memory/Mail feed it | **Keep as Knowledge Studio drill-down**. Not top-level daily unless actively curating. |
| `/dashboard/mail-radar` | Gmail candidates → save to Knowledge | Radar already consumes Gmail signals; Knowledge receives saved candidates | **Merge into Radar/Knowledge**. Keep route but remove top-level nav. |
| `/dashboard/supabase` | Supabase connector health | Radar surfaces degraded/alerts; Overview can summarize ops | **Demote to Observability drill-down**. |
| `/dashboard/vercel` | Vercel connector health/deployments | Same as Supabase | **Demote to Observability drill-down**. |
| `/dashboard/github` | GitHub signals/PRs/notifications | Radar consumes GitHub signals | **Demote to Observability/Code drill-down**. |
| `/dashboard/wiki` | Wikified markdown nodes | Output of Knowledge pipeline | **Merge conceptually under Knowledge**. Keep route as subview, remove top-level nav. |
| `/dashboard/memory` | Memory search → save to Knowledge | Feeds Knowledge; overlaps Command Memory/QMD status | **Merge under Knowledge** as Search tab. |
| `/dashboard/notifications` | Permissions/notifications page | Mostly system/admin | **Demote to Settings/System**. |
| `/dashboard/architecture` | System map/docs | Useful but not daily | **Demote to System/About**. |
| `/dashboard/settings` | Bridge/DB/agent/config status | Overlaps Command/Agents | **Keep as System Settings**. |
| `/dashboard/journal` | Raw notes | Not in nav currently | **Potentially fold into Knowledge capture**. |
| `/dashboard/affiliate` | Affiliate stats | Not in nav currently | **Keep hidden/project-specific** unless Sladdis needs it. |

## Main duplication patterns

### 1. Radar vs Action Center

These are now too close.

- Radar = attention/review/approval/signals/tasks.
- Action Center = tasks/knowledge/agent/system actions.

Recommendation: **Radar should absorb Action Center**.

Implementation shape:
- Move `ActionCenterBoard` functionality into Radar as a queue mode or embedded section.
- Keep `/dashboard/action-center` as redirect to `/dashboard/radar?view=tasks` or `/dashboard/radar?view=review` during transition.
- Remove Action Center from nav.

### 2. Source pages vs Radar

Mail Radar, GitHub, Vercel, Supabase are mostly source-specific diagnostics. Daily workflow should not require opening each.

Recommendation:
- Radar owns “what needs attention”.
- Source pages become drill-downs from Radar cards.
- Nav should not list every source by default.

### 3. Knowledge, Wiki, Memory, Mail Radar

These are one pipeline:

```text
Mail / Memory / Journal / Session harvest → Knowledge Inbox → Wiki / promoted context
```

Recommendation:
- Make `/dashboard/knowledge` the top-level “Knowledge Studio”.
- Fold Memory Search, Wiki, Mail candidates and Journal capture as tabs/subviews inside Knowledge over time.
- Remove Wiki, Memory, Mail Radar from main nav.

### 4. Settings, Command, Agents, Notifications, Architecture

These are admin/system surfaces.

Recommendation:
- Collapse nav into one System group.
- Keep Settings top-level inside System.
- Agents, Command, Architecture, Notifications become secondary links/cards from Settings or Command.

## Proposed minimal IA

### Option A — Two primary pages + drill-downs

This is the cleanest product shape.

1. **Cockpit** (`/dashboard/overview`)
   - Today brief
   - top 3 Radar items
   - top task summary
   - calendar/runway/agent health summaries
   - “open Radar” as primary CTA

2. **Inbox Radar** (`/dashboard/radar`)
   - All operational attention
   - Review/approval queue
   - task candidates
   - source alerts
   - central Cai agent console
   - creates tasks / snoozes / opens drill-downs

Secondary drill-downs, not main nav:
- Tasks
- Knowledge Studio
- Chat
- System Settings

### Option B — Four nav items

Probably best near-term because it avoids hiding useful tools too aggressively.

Main nav:
1. **Cockpit**
2. **Inbox Radar**
3. **Tasks**
4. **Knowledge**

Footer/system nav:
- Chat
- Settings
- System/Architecture

Everything else is linked from cards, not nav.

Recommendation: **Option B now, Option A later**.

Why: Tasks and Knowledge are still real work surfaces. If we hide them too early, Radar becomes overloaded before it has persistent `inbox_items` and better embedded actions.

## Proposed nav cleanup V1

Current top-level nav has 18 items. Reduce visible nav to 6.

### Keep visible

- Cockpit → `/dashboard/overview`
- Inbox Radar → `/dashboard/radar`
- Tasks → `/dashboard/kanban`
- Knowledge → `/dashboard/knowledge`
- Chat → `/dashboard/chat`
- Settings → `/dashboard/settings`

### Remove from main nav, keep routes

- Action Center → merge/redirect into Radar later
- Runway → linked from Cockpit/Radar
- Agents → linked from Settings/Cockpit
- Command → linked from Settings/System card
- Mail Radar → linked from Radar/Knowledge
- Supabase → linked from Radar/Settings observability card
- Vercel → linked from Radar/Settings observability card
- GitHub → linked from Radar/Settings code card
- Wiki → linked from Knowledge
- Memory → linked from Knowledge
- Permissions/Notifications → linked from Settings
- Architecture → linked from Settings/System

## Concrete next build steps

1. **Nav cleanup V1**
   - Update `src/config/nav-config.ts` to show only Cockpit, Inbox Radar, Tasks, Knowledge, Chat, Settings.
   - Add “drill-down links” cards inside Settings and Knowledge so hidden pages are still discoverable.

2. **Action Center merge**
   - Embed Action Center items into Radar as either `kind=task/review/system` or a `view=actions` queue.
   - Make `/dashboard/action-center` redirect to Radar after feature parity.

3. **Knowledge Studio tabs**
   - Keep route `/dashboard/knowledge` but add sections/tabs for Inbox, Memory Search, Wiki, Mail Candidates, Journal Capture.
   - Later redirect `/dashboard/wiki`, `/dashboard/memory`, `/dashboard/mail-radar`, `/dashboard/journal` into specific Knowledge tabs.

4. **Observability rollup**
   - Create one compact Settings/Cockpit card for GitHub/Vercel/Supabase health.
   - Keep source pages only as “Inspect details”.

5. **Persistent inbox items**
   - Add real `inbox_items` persistence so Radar can own review/approval/actions instead of only deriving signals from other pages.

## Opinionated answer

Do **not** delete routes yet. Hide and consolidate first.

Best immediate move: **cut the nav down to 6 items** and make Radar the primary attention surface. Then merge Action Center into Radar. After a week of using it, decide which old routes deserve redirects.
