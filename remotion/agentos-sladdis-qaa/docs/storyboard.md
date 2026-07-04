# QAA + Sladdis Film

Purpose: a 60-90 second product story that explains the actual architecture: QAA is the QA platform and system of record. Sladdis is the agent that performs QA work through QAA's scoped agent API.

## Core Positioning

QAA is a QA agent platform: a system where humans can give QA work to an AI agent, and the agent can execute that work in a controlled, traceable, and team-visible way.

Sladdis is the intelligent QA worker.

QAA is the QA workspace and system of record for the product under test. It is where app context, test work, evidence, runs, retests, and team-visible QA state live. Sladdis may have its own agent memory and learning loop; do not frame QAA as Sladdis's memory or brain.

The app exists because an agent needs more than chat. It needs approved identity, project context, test rules, safe test data, a work queue, durable test cases, an application map, run history, evidence, bugs, triage, and a UI where humans can inspect the work.

Without QAA, Sladdis would only be a chatbot reporting "I checked it". With QAA, Sladdis can say: I tested these flows, under these rules, against this project, created this run, step 3 failed, here is the screenshot, here is the bug report, here is the risk, and here is the recommended next test.

## How The Connection Works

The connection is:

Human / team -> QAA platform -> approved scoped agent access -> Sladdis reads QAA state -> Sladdis executes QA work -> Sladdis writes results back to QAA -> humans review and triage in QAA.

Technically, QAA exposes an agent API through Supabase Edge Functions. Agents never receive a user's normal Supabase session token.

1. Sladdis requests access with `agent-request-access`.
2. QAA returns an activation URL.
3. A human opens QAA and approves the claim.
4. Sladdis exchanges the approved request with `agent-exchange-approval`.
5. QAA returns a scoped `qa_agent_...` token.
6. Sladdis uses that token to list projects, read workspace context, claim work, read/write test cases, create runs, add results, upload evidence, update work items, and create triage actions.

## Why QAA Needs To Be An App

QAA is not just a dashboard. It is the agent's workspace and contract with the team.

The app gives Sladdis:

- Identity and scoped permissions
- Project context
- Testing rules
- Safe test data
- QA Work Board
- Test case catalog
- Application Map
- Test runs and result history
- Evidence storage
- Bug and triage workflow
- Human-visible status and history

Sladdis gives QAA:

- Analysis
- Test planning
- Test creation
- Test execution
- Bug reproduction
- Screenshots and evidence
- QA summaries
- Recommendations
- Updated project knowledge

## What The System Does

1. Secure access
   - Sladdis does not get the user's session.
   - It requests access, a human approves in QAA, and QAA returns a limited `qa_agent_...` token.
   - The token has specific scopes such as project read/write, test case write, run write, and result write.

2. Project context
   - Sladdis reads the QA workspace before testing: product profile, key flows, risk areas, testing rules, test data, retest queue, and notes.
   - This means Sladdis understands what matters before it starts clicking or running checks.

3. QA Work Board
   - Humans place work in `ready_for_qa`.
   - Sladdis can claim the item, move it to `testing`, run relevant checks, and update it as `tested`, `failed`, or `blocked`.
   - If it finds a bug, it writes bug title, description, severity, linked run, and QA summary.

4. Living test case catalog
   - Sladdis can create missing test cases, update existing ones, add steps, expected results, priority, screenshots, and metadata.
   - Coverage becomes durable project knowledge, not temporary chat output.

5. Application Map
   - QAA models the product: pages, components, flows, services, external dependencies, and important states.
   - Sladdis can add nodes and edges, link test cases to product areas, and show risk or missing coverage.

6. Controlled web, API, and mobile testing
   - Web testing can use browser automation.
   - API testing goes through QAA API targets, auth profiles, runner policy, redaction, and evidence persistence.
   - Mobile testing uses QAA's mobile test case contract and safe device policy. The app validates policy; execution lives in the agent runtime or harness.
   - Sladdis does not just run arbitrary requests or arbitrary device commands.

7. Evidence and results
   - Sladdis creates runs, adds pass/fail/blocked results, records failed steps, and attaches screenshots or redacted evidence.
   - Humans can see what happened and why, not just read "test failed".

8. Triage and next steps
   - Sladdis can recommend actions such as `create_defect`, `request_rerun`, `mark_flaky`, or `assign_owner`.
   - QAA turns agent findings into team decisions.

## Short Pitch

QAA lets an AI agent become part of the development flow instead of sitting beside it as a chatbot.

Sladdis uses QAA to get approved access, understand the project, pick up QA work, create or update tests, run checks, save evidence, update QA status, report bugs, and recommend next steps.

The key is the QA loop:

Understand the project -> plan testing -> execute checks -> save evidence -> update work items -> create regression coverage -> triage -> learn for the next run.

## Film Storyboard

| Time | Scene | Message |
| --- | --- | --- |
| 0-7s | Cold open | A chatbot can say "I checked it". A QA platform must prove what was checked, how, and what happened. |
| 7-16s | Big idea | QAA turns Sladdis from a side-chat agent into a QA worker inside the development flow. |
| 16-27s | Secure access | Sladdis requests access. A human approves in QAA. Sladdis receives a scoped `qa_agent_...` token. |
| 27-39s | Project context | Sladdis reads project profile, key flows, risk areas, testing rules, safe test data, retest items, and notes. |
| 39-51s | Work Board | A human puts work in `ready_for_qa`. Sladdis claims it, tests it, and writes QA state back. |
| 51-66s | Testing loop | Sladdis creates or updates test cases, runs web/API/mobile checks, records failed steps, and attaches evidence. |
| 66-80s | QAA workspace | Humans inspect Application Map, coverage, runs, screenshots, bugs, triage actions, and history in QAA. |
| 80-90s | Closing | QAA owns and stores the QA workflow. Sladdis performs the work through safe, scoped APIs. |

## Voiceover Draft

Most AI QA demos stop in chat.

But real QA needs more than a message saying "I checked it".

It needs project context, safe access, test rules, work ownership, repeatable test cases, run history, evidence, bugs, and triage.

That is why QAA exists.

QAA is the QA workspace and system of record for the application and test work. Sladdis is the agent that performs the QA work through QAA, with its own agent memory and learning loop.

First, Sladdis requests access. A human approves the request in QAA, and Sladdis receives a limited `qa_agent_...` token. It does not get the user's normal session.

Then Sladdis reads the project workspace: product profile, key flows, risk areas, testing rules, safe test data, retest items, and notes.

When a team puts work in `ready_for_qa`, Sladdis can claim it, move it to `testing`, run the right checks, and write the result back.

If coverage is missing, Sladdis creates or updates test cases. If the product structure changes, it updates the Application Map. If something fails, it creates a run result, marks the failed step, attaches screenshot evidence, and writes a bug summary.

QAA gives humans the UI to follow all of it: projects, work items, application map, test cases, runs, failures, screenshots, triage actions, and history.

The difference is the loop.

Understand the project. Plan the test. Execute the check. Save the evidence. Update QA status. Create regression coverage. Recommend the next step.

QAA owns the QA workflow. Sladdis performs the work through safe, scoped APIs.
