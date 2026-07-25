# Ephemeral coding sandbox — proposed V0

## Decision

Add an optional isolation layer for coding-worker jobs. A worker does not run
directly in the OpenClaw host workspace. The orchestrator creates a short-lived
execution environment for one task, returns only reviewable artifacts, then
destroys that environment.

This is defence in depth. It reduces the blast radius of compromised prompts,
malicious repositories, dependency scripts, and agent mistakes. It does not
make untrusted instructions safe or replace approval, policy, scoped
credentials, or code review.

## Target flow

```text
task + approved scope
        |
        v
trusted orchestrator
  - selects isolation profile
  - creates a sealed task workspace
  - issues a scope receipt
        |
        v
ephemeral container / microVM
  - project copy or read-only source snapshot
  - no host home, Docker socket, SSH agent, or broad mounts
  - network disabled by default
  - no long-lived credentials
        |
        v
artifacts only: patch, test/log summary, dependency changes, receipt
        |
        v
host-side review + verification -> explicit apply to real worktree
```

The agent never receives write access to the real checkout. It works against a
task copy. A trusted host-side step validates and applies an accepted patch.

## Profiles

| Profile | Intended work | Isolation | Network | Credentials |
| --- | --- | --- | --- | --- |
| `local-safe` | Docs or deterministic repository checks | Existing controlled worktree | No new access | None |
| `sandboxed-code` | Normal implementation, unfamiliar code, dependency install | Rootless ephemeral container | Deny by default; allowlisted only when required | None |
| `high-risk-code` | Untrusted external content, browser/tool output, risky build scripts | MicroVM or remote disposable VM | Deny by default; per-destination allowlist | One-time scoped broker token only when approved |

Containers are adequate for the normal profile but share the host kernel. A
microVM is the appropriate boundary when a task executes hostile code or has
access to higher-value credentials.

## Hard boundaries

- Mount only the task workspace; never `/root`, the OpenClaw home, the Docker
  socket, host SSH agent, or arbitrary project siblings.
- Start from an immutable, pinned image and retain its digest in the receipt.
- Use a copied checkout or read-only source plus a dedicated output directory;
  do not mount a real Git worktree as writable.
- Block outbound network by default. An allowlist is a task input, not an agent
  choice. DNS, metadata endpoints, and private-network ranges remain blocked.
- Do not inject long-lived secrets. If a task truly needs one, a credential
  broker issues a short-lived, operation-scoped token after explicit approval.
- Limit CPU, memory, process count, disk, wall-clock time, and output size.
- Treat all sandbox output, including a patch and test log, as untrusted until
  host-side validation passes.
- Destroy the sandbox, temporary volume, token, and network rules at terminal
  task state. Persist only safe metadata and approved artifacts.

## Evidence and control plane

Every run attaches an Agent OS execution-scope receipt. For this profile, the
receipt must identify the actual enforcement mechanism (`process-sandbox`),
task workspace identifier, image digest, network policy identifier, credential
mode, effective mount/action scope, resource limits, and teardown outcome.

The existing receipt contract already fails closed when the effective scope is
broader than requested or enforcement is absent. The sandbox adapter must make
that proof concrete rather than merely reporting a requested profile.

Host-side acceptance requires:

1. patch paths are within the approved repository and requested scope;
2. dependency/lockfile changes are explicitly listed;
3. validation runs in a trusted, scoped verifier or a fresh sandbox;
4. a human approval is required before applying changes to protected branches,
   deployments, secrets, billing, external communication, or production data.

## V0 implementation path

1. **Contract and dry run.** Define `sandbox-run-receipt.v0`, profiles, and
   deterministic fixtures. No live sandbox execution.
2. **Disposable container spike.** Build one rootless, network-disabled task
   runner for a synthetic repository. Verify mount denial, secret absence,
   resource timeout, artifact extraction, and teardown.
3. **Patch handoff.** Permit the runner to return a patch only; have a
   host-side verifier reject out-of-scope paths before any apply operation.
4. **MicroVM escalation.** Add a microVM/remote-VM adapter only for the
   `high-risk-code` profile once the container contract and receipts are proven.
5. **Scoped credential broker.** Consider this last. It is not part of V0 and
   requires separate approval because it changes the secrets boundary.

## Proposed implementation in our stack

### Components

1. `sandbox-runner` is a small host-side Node.js program owned by Agent OS. It
   is the only component allowed to talk to the Docker daemon. Coding workers
   never receive the Docker socket or a general-purpose Docker command.
2. `sandbox-policy.v0.json` contains fixed profiles and limits. A task may ask
   for a named profile, but cannot add mounts, capabilities, credentials, or
   network access beyond that profile.
3. `sandbox-run-receipt.v0.json` records the requested and effective boundary,
   image digest, limits, artifact hashes, validation result, and teardown.
4. `sandbox-verifier` runs on the host after the container exits. It validates
   receipt integrity, patch paths, artifact size, dependency changes, and
   teardown before anything can be offered for application.

The initial interface should be narrow:

```text
agent-os sandbox run \
  --task-id <id> \
  --repo <approved-repo-id> \
  --commit <sha> \
  --profile sandboxed-code \
  --scope <normalized-path-list> \
  --command <approved-command-class>
```

Repository IDs, profiles, and command classes are resolved by the trusted
runner. The agent cannot pass a host path, raw mount, Docker flag, image name,
or arbitrary network rule.

### Job lifecycle

1. Agent OS validates the task, repository identity, commit, requested paths,
   action class, and approval state.
2. The runner creates a fresh temporary task directory outside the real
   worktree and materializes exactly the approved commit. Uncommitted host
   changes and sibling repositories are absent.
3. The runner starts a pinned image by digest with a read-only root filesystem,
   non-root UID, dropped capabilities, `no-new-privileges`, default seccomp and
   AppArmor, network disabled, and explicit CPU/RAM/PID/disk/time limits.
4. Only the task copy and a bounded artifact directory are visible. Neither
   OpenClaw home, host home, Docker socket, SSH agent, Git credentials, nor
   host environment variables are mounted or forwarded.
5. The worker edits the task copy and runs the permitted command class.
6. The runner extracts a unified patch, structured test summary, changed-file
   manifest, dependency manifest, and logs with size limits.
7. A fresh verifier rejects absolute paths, traversal, symlink escapes,
   out-of-scope files, binary surprises, undeclared lockfile changes, missing
   enforcement evidence, or a failed teardown.
8. Agent OS presents the verified patch for review. Applying it to the real
   worktree remains a separate trusted action; deployments and external writes
   remain separately approval-gated.
9. The runner destroys the container, task directory, volumes, and temporary
   rules, then records teardown evidence. Failure to prove cleanup routes the
   run to Radar and blocks reuse of its artifacts.

### V0 container profile

The first profile should be equivalent to these enforced properties, generated
by the runner rather than supplied by the agent:

```text
image: pinned by sha256 digest
user: fixed non-root UID/GID
root filesystem: read-only
capabilities: all dropped
privilege escalation: disabled
network: none
mounts: task copy + bounded artifact directory only
Docker socket / SSH agent / host home: absent
limits: 2 CPU, 2 GiB RAM, 256 PIDs, bounded tmpfs, 15 minute wall clock
credentials: none
restart policy: never
```

The exact resource numbers are initial defaults, not security truths. They can
be tuned from run evidence without widening filesystem, network, or credential
scope.

### Network policy

V0 has no network. This is intentional: package installation with arbitrary
internet access combines untrusted dependency code with an exfiltration path.
Jobs that need dependencies should first use a prepared pinned image or a
host-generated, read-only dependency cache.

A later `sandboxed-code-networked` profile may use an egress proxy with a
destination allowlist, request logging, private-address and metadata blocking,
and no agent-controlled DNS. It requires a separate approval because Docker's
ordinary network flags do not provide a robust destination allowlist.

### Container versus microVM policy

Use the container profile for our own repositories, routine builds, tests, and
code changes when no secret is present. Escalate to a microVM or remote
disposable VM when any of the following is true:

- the repository, archive, dependency, build script, or generated executable
  is genuinely untrusted;
- the job is explicitly testing malware-like or sandbox-escape behavior;
- a temporary credential or access to a sensitive service is unavoidable;
- stronger tenant separation is required than a shared host kernel provides.

Do not install Firecracker on the current host as part of V0. The host does not
currently expose a usable KVM boundary, and a rushed nested setup would add
complexity without proving stronger isolation. Keep the runner API backend-
neutral so a later `microvm` adapter can implement the same receipt and
artifact contract.

## Delivery plan and gates

### Phase 0 — contract only

- Define JSON schemas for policy, run request, receipt, and artifact manifest.
- Add deterministic allow/reject fixtures.
- Gate: broad mounts, raw host paths, mutable image tags, missing enforcement,
  network escalation, credential injection, and failed teardown all fail
  closed.

### Phase 1 — synthetic container spike

- Implement the runner against a disposable synthetic Git repository.
- Use no secrets, no production repositories, and no live agent routing.
- Exercise filesystem denial, network denial, resource exhaustion, timeout,
  artifact extraction, and teardown.
- Gate: every negative test is blocked and every run produces a verifiable
  receipt tied to the actual container configuration.

### Phase 2 — patch handoff

- Add the host verifier and test patch application against a throwaway clone.
- Reject path traversal, symlink escapes, out-of-scope edits, oversized output,
  binary files, and undeclared dependency changes.
- Gate: the sandbox cannot modify a real worktree; only a verified artifact can
  reach the review step.

### Phase 3 — opt-in internal repository pilot

- Enable only for one low-risk repository and explicit coding-worker tasks.
- Compare completion rate, runtime, false rejects, and cleanup reliability with
  current execution.
- Gate: repeated clean teardown, acceptable developer experience, and no
  policy bypass before expanding use.

### Phase 4 — production default for coding workers

- Make `sandboxed-code` the default for eligible coding jobs while retaining a
  visible trusted-host exception requiring explicit approval and reason.
- Route scope violations and cleanup failures into existing Agent OS Radar.
- Gate: rollback switch, metrics, documented incident procedure, and reviewed
  policy version.

### Phase 5 — microVM evaluation

- Evaluate Firecracker/Kata/Cloud Hypervisor or a disposable remote runner on
  infrastructure with a real KVM boundary.
- Reuse the same request, receipt, verifier, and artifact formats.
- Gate: demonstrate a measurable isolation gain, reliable teardown, acceptable
  startup time/cost, and a concrete high-risk workload that justifies it.

## Acceptance test matrix

| Test | Expected result |
| --- | --- |
| Read host `/root`, OpenClaw home, sibling repo | Path absent or permission denied |
| Access Docker socket or SSH agent | Endpoint absent |
| `curl`, DNS, metadata IP, private LAN | No route / denied |
| Read host env or long-lived credentials | Values absent |
| Fork bomb / memory pressure / infinite process | PID, memory, CPU, or time limit terminates job |
| Fill writable storage or artifact output | Quota/size limit terminates or rejects output |
| Patch `../`, absolute path, symlink escape, sibling path | Host verifier rejects artifact |
| Add undeclared dependency or lockfile change | Review required or artifact rejected by policy |
| Spoof requested scope or receipt fields | Actual runtime evidence wins; run rejected |
| Leave container/volume behind | Teardown failure recorded; artifact blocked |
| Prompt injection requests exfiltration | Attempt may occur, but source, secrets, and network path are unavailable |

## Why these choices

- **Container first:** it uses infrastructure already present and lets us prove
  the control contract before paying the operational cost of microVMs.
- **Dedicated runner instead of direct Docker:** access to the Docker daemon is
  effectively host-level power. Keeping it out of the agent is the main safety
  boundary.
- **Copied commit instead of writable worktree mount:** prevents an agent or
  malicious build from silently altering local state, Git metadata, or sibling
  work.
- **No network and no secrets in V0:** this removes the two ingredients needed
  for most useful exfiltration and makes negative tests deterministic.
- **Artifact-only handoff:** separates untrusted execution from trusted state
  mutation and creates a reviewable audit point.
- **Receipts from effective configuration:** requested policy is not evidence;
  the receipt must describe what the runtime actually enforced.
- **MicroVM as escalation:** containers share the host kernel, so they are a
  useful blast-radius reduction but not the strongest boundary for hostile
  code or valuable credentials.

## Review decisions before implementation

Felipe only needs to approve the following before Phase 1 begins:

1. V0 is an isolated synthetic spike, not a live-agent rollout.
2. The coding agent receives no Docker socket, host secrets, or network.
3. The initial resource defaults are 2 CPU, 2 GiB RAM, 256 PIDs, and 15 minutes.
4. A verified patch is reviewable output; it is never auto-applied to a real
   worktree in V0.
5. MicroVM and credential-bearing profiles remain separate future decisions.

## Explicit non-goals

- No automatic production deployment, Git push, purchase, signup, or external
  message from a sandbox job.
- No assumption that a VM neutralizes prompt injection or malicious code.
- No broad host access disguised as a sandbox through writable mounts or shared
  credentials.
- No production rollout until the spike proves teardown and scope enforcement.
