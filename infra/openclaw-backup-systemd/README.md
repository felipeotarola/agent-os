# OpenClaw backup systemd units

These files are the reviewed source of truth for the root-level backup
maintenance, recovery guard, health monitoring, and alert units. Services run
from a root-owned content-addressed runtime rather than directly from the Git
workspace.

The maintenance unit creates
`/run/openclaw-backup-tmp` as a service-private 1536 MiB
`rw,nosuid,nodev,noexec,noswap` tmpfs. The runner rejects shared `/dev/shm`,
requires the exact mountpoint and options through both `findmnt` and
`/proc/self/mountinfo`, and recalculates the complete plaintext-staging
allowance before capture. It requires physical RAM for used swap plus the full
1536 MiB ceiling and 768 MiB process headroom before `swapoff`, then repeats
the full-ceiling gate after quiescence. The creator independently gates the
exact execution-plan staging budget and rejects payloads above 200,000 paths or
48 MiB of cumulative UTF-8 path bytes.

Normal host swap is the ephemeral random-key AES-XTS
`/dev/mapper/openclaw-cryptswap` mapping declared by the reviewed
`/etc/crypttab` and `/etc/fstab`. The original two-GiB plaintext backing file
was taken offline and fully raw-scrubbed before dm-crypt activation.
Maintenance disables all swap for plaintext capture, proves `/proc/swaps`
empty, and restores configured swap before normal production health. The
health check fails if the live mapping or either configuration file drifts.
Recovery revalidates the exact configuration, clears any active swap, enables
only `/dev/mapper/openclaw-cryptswap`, and requires it to be the sole
confidential mapping. If that fails, it clears swap again and leaves
credential-bearing production workloads stopped for guard or manual recovery.

The maintenance cgroup uses `MemoryHigh=3G`, `MemoryMax=3500M`, and
`MemorySwapMax=0`. Creator and production-export child processes have
stage-specific deadlines, including bounded PostgreSQL dump/verification,
snapshot lifecycle, Auth/control-plane requests, and the archive pipeline.
Auth management responses are capped at 32 MiB; the five control-plane
responses are capped at 4 MiB each and 16 MiB total with a shared 30-second
request deadline.

The ciphertext output root is an existing private owner-only directory outside
the OpenClaw source tree. Creation rejects symlinks and untrusted
writable/foreign-owned ancestors; health additionally requires the configured
leaf to be root-owned mode `0700`.

Install the complete runtime and unit set atomically:

```bash
bash scripts/install-openclaw-backup-runtime.sh
systemctl start openclaw-backup-healthcheck.service
```

The installer copies only the declared runtime closure (including itself),
creates a checksum manifest, signs it with the pinned backup-origin key,
verifies the exact signature, names the release after the manifest's SHA-256,
atomically updates `/usr/local/libexec/openclaw-backup/current`, installs the
exact unit copies, reloads systemd, and runs `systemd-analyze verify`. It does
not enable the maintenance timer.

Normal CI intentionally exercises only the limited integration path unless a
secure environment is supplied. The full secure E2E requires a private
dedicated `noswap` tmpfs with all swap disabled plus a separate private,
disk-backed ciphertext root. That secure mode has passed for the current
source; the installed runtime and unit copies nevertheless remain stale until
the complete signed cohort is installed.

The maintenance and guard units have explicit extended `TimeoutStopSec` windows
so an ordinary start timeout or termination leaves enough time for the exit
trap or recovery guard to restore swap, thaw Codex, restart prior containers and
services, and complete health checks before systemd escalates termination.

Enable the boot guard and health timer. Keep the maintenance timer disabled
until the current signed runtime/unit cohort is installed, the offline recovery
recipient and independently authenticated v2 recovery kit are ready, the
production v2 full-object probe is deployed, one real encrypted set has passed
that probe, a separate recovery identity has completed a full download/deep
verification/fenced restore, and the isolated Hetzner restore drill has passed.
