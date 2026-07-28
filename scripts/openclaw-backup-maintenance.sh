#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export XDG_RUNTIME_DIR=/run/user/0
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/0/bus

RUNTIME_ROOT=$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &&
    pwd -P
)
BACKUP_ENV=/etc/openclaw-backup/uploader.env
STATE_ROOT=/var/lib/openclaw-backup/state
LOG_ROOT=/var/lib/openclaw-backup/logs
ACTIVE_STATE="$STATE_ROOT/maintenance-active.json"
LOCK_ROOT=/run/openclaw-backup
LOCK_PATH="$LOCK_ROOT/maintenance.lock"
CODEX_PATTERN='[/]codex( |$)|[/]codex-code-mode-host( |$)'
QAA_UNIT=qaa-sladdis-web-runner.service
GATEWAY_UNIT=openclaw-gateway.service
CRON_UNIT=cron.service
BRIDGE_CONTAINER=agent-os-bridge
MANAGED_BROWSER_PROFILE=openclaw
RUNTIME_GNUPGHOME=/etc/openclaw-backup/gnupg
RUNTIME_SIGNER=11EAFE1BD7AD1BEE296B24565C8124C33417F2D7
EXPECTED_STAGING_ROOT=/run/openclaw-backup-tmp
STAGING_TMPFS_BYTES=$((1536 * 1024 * 1024))
CRYPTSWAP_NAME=openclaw-cryptswap
CRYPTSWAP_BACKING_FILE=/swapfile
CRYPTSWAP_BACKING_BYTES=$((2 * 1024 * 1024 * 1024))
MIN_CAPTURE_PROCESS_HEADROOM_KIB=$((768 * 1024))
SANDBOX_CONTAINERS=(
  openclaw-sbx-agent-charles-c5870675
  openclaw-sbx-agent-linda-a1c79fb4
  openclaw-sbx-agent-agnes-b92b654d
  openclaw-sbx-agent-sladdis-00c345bc
)

MODE=${1:-run}
case "$MODE" in
  run | --recover-only) ;;
  *)
    printf 'usage: %s [run|--recover-only]\n' "$0" >&2
    exit 64
    ;;
esac

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo 'openclaw backup maintenance requires root' >&2
  exit 1
fi

runtime_release=${RUNTIME_ROOT##*/}
runtime_checksums="$RUNTIME_ROOT/RUNTIME_CHECKSUMS.sha256"
runtime_signature="$RUNTIME_ROOT/RUNTIME_CHECKSUMS.sha256.asc"
runtime_signature_status=
if runtime_signature_status=$(
  gpg --homedir "$RUNTIME_GNUPGHOME" \
    --batch --status-fd 1 --verify \
    "$runtime_signature" "$runtime_checksums" 2>/dev/null
); then
  mapfile -t runtime_signature_fingerprints < <(
    awk '
      $1 == "[GNUPG:]" && $2 == "VALIDSIG" {
        print toupper($3)
      }
    ' <<<"$runtime_signature_status"
  )
else
  runtime_signature_fingerprints=()
fi
if [[ ! -d "$RUNTIME_ROOT/systemd" ||
  ! "$runtime_release" =~ ^[a-f0-9]{64}$ ||
  $(stat -c '%u:%a:%F' "$RUNTIME_ROOT" 2>/dev/null || true) != '0:750:directory' ||
  $(stat -c '%u:%a:%F' "$RUNTIME_ROOT/systemd" 2>/dev/null || true) != '0:750:directory' ||
  $(stat -c '%u:%a:%F' "$runtime_checksums" 2>/dev/null || true) != '0:640:regular file' ||
  $(stat -c '%u:%a:%F' "$runtime_signature" 2>/dev/null || true) != '0:640:regular file' ||
  $(sha256sum "$runtime_checksums" 2>/dev/null | awk '{ print $1 }') != "$runtime_release" ||
  $(wc -l <"$runtime_checksums" 2>/dev/null || true) -ne 22 ||
  ${#runtime_signature_fingerprints[@]} -ne 1 ||
  ${runtime_signature_fingerprints[0]:-} != "$RUNTIME_SIGNER" ]] ||
  grep -Evq \
    '^[a-f0-9]{64}  (systemd/)?[A-Za-z0-9@._-]+$' \
    "$runtime_checksums" ||
  [[ $(
    {
      awk '{ print $2 }' "$runtime_checksums"
      printf '%s\n' \
        RUNTIME_CHECKSUMS.sha256 \
        RUNTIME_CHECKSUMS.sha256.asc
    } | LC_ALL=C sort
  ) != $(
    find "$RUNTIME_ROOT" -mindepth 1 \
      -type f -printf '%P\n' | LC_ALL=C sort
  ) ]] ||
  [[ $(find "$RUNTIME_ROOT" -mindepth 1 \
    -type l -print -quit) ]] ||
  [[ $(
    find "$RUNTIME_ROOT" -mindepth 1 -maxdepth 1 \
      -type d ! -name systemd -print -quit
  ) ]] ||
  [[ $(find "$RUNTIME_ROOT/systemd" -mindepth 1 \
    -type d -print -quit) ]] ||
  ! (
    cd "$RUNTIME_ROOT"
    sha256sum --check --status RUNTIME_CHECKSUMS.sha256
  ); then
  echo 'installed backup runtime integrity check failed' >&2
  exit 1
fi
while IFS= read -r runtime_file; do
  runtime_mode=640
  if [[ "$runtime_file" == *.sh ]]; then
    runtime_mode=750
  fi
  if [[ $(stat -c '%u:%a:%F' "$RUNTIME_ROOT/$runtime_file" 2>/dev/null || true) != "0:$runtime_mode:regular file" ]]; then
    echo 'installed backup runtime file ownership or mode is unsafe' >&2
    exit 1
  fi
done < <(
  {
    awk '{ print $2 }' "$runtime_checksums"
    printf '%s\n' \
      RUNTIME_CHECKSUMS.sha256 \
      RUNTIME_CHECKSUMS.sha256.asc
  }
)

install -d -m 0700 "$STATE_ROOT" "$LOG_ROOT"
if [[ -L "$LOCK_ROOT" ||
  -e "$LOCK_ROOT" && ! -d "$LOCK_ROOT" ]]; then
  echo 'backup lock directory is unsafe' >&2
  exit 1
fi
install -o root -g root -m 0700 -d "$LOCK_ROOT"
if [[ $(stat -c '%u:%a:%F' "$LOCK_ROOT" 2>/dev/null || true) != '0:700:directory' ]]; then
  echo 'backup lock directory metadata is unsafe' >&2
  exit 1
fi
if [[ ! -e "$LOCK_PATH" && ! -L "$LOCK_PATH" ]]; then
  (
    set -o noclobber
    : >"$LOCK_PATH"
  ) 2>/dev/null || true
fi
if [[ ! -f "$LOCK_PATH" || -L "$LOCK_PATH" ||
  $(stat -c '%u:%a:%h:%s' "$LOCK_PATH" 2>/dev/null || true) != '0:600:1:0' ]]; then
  echo 'backup maintenance lock file is unsafe' >&2
  exit 1
fi
exec 9<>"$LOCK_PATH"
if [[ ! -f /proc/self/fd/9 ||
  $(stat -Lc '%u:%a:%h:%s' /proc/self/fd/9 2>/dev/null || true) != '0:600:1:0' ]]; then
  echo 'opened backup maintenance lock descriptor is unsafe' >&2
  exit 1
fi
if ! flock --exclusive --wait 300 9; then
  echo 'another OpenClaw backup maintenance run holds the lock' >&2
  exit 75
fi

if ! command -v timeout >/dev/null; then
  echo 'required timeout command is unavailable' >&2
  exit 1
fi

bounded() {
  local duration=$1
  shift
  timeout --foreground --signal=TERM --kill-after=5s \
    "$duration" "$@"
}

user_systemctl() {
  bounded 60s systemctl --user "$@"
}

system_systemctl() {
  bounded 60s systemctl "$@"
}

unit_was_running() {
  local scope=$1
  local unit=$2
  local state
  if [[ "$scope" == user ]]; then
    state=$(user_systemctl is-active "$unit" 2>/dev/null || true)
  else
    state=$(system_systemctl is-active "$unit" 2>/dev/null || true)
  fi
  [[ "$state" == active || "$state" == activating || "$state" == reloading ]]
}

container_is_running() {
  [[ $(bounded 5s docker inspect --format '{{.State.Running}}' "$1" 2>/dev/null || true) == true ]]
}

retry() {
  local attempts=$1
  local delay=$2
  shift 2
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if "$@"; then
      return 0
    fi
    sleep "$delay"
  done
  return 1
}

bridge_health() {
  curl --fail --silent --show-error \
    --connect-timeout 3 --max-time 5 \
    http://127.0.0.1:8787/health |
    jq -e '.ok == true and .db == true' >/dev/null
}

public_bridge_health() {
  curl --fail --silent --show-error \
    --connect-timeout 3 --max-time 8 \
    https://api.felipeotarola.com/health |
    jq -e '.ok == true and .db == true' >/dev/null
}

gateway_health() {
  curl --fail --silent --show-error \
    --connect-timeout 3 --max-time 5 \
    http://127.0.0.1:18789/health \
    >/dev/null &&
    bounded 10s openclaw health --json |
      jq -e '.ok == true' >/dev/null
}

managed_browser_status() {
  bounded 10s openclaw browser \
    --browser-profile "$MANAGED_BROWSER_PROFILE" \
    status --json
}

managed_browser_health() {
  managed_browser_status |
    jq -e \
      --arg profile "$MANAGED_BROWSER_PROFILE" '
        .profile == $profile and
        .running == true and
        .cdpReady == true
      ' >/dev/null
}

managed_browser_stopped() {
  managed_browser_status |
    jq -e \
      --arg profile "$MANAGED_BROWSER_PROFILE" '
        .profile == $profile and
        .running == false
      ' >/dev/null
}

scope_is_frozen() {
  [[ $(system_systemctl show "$1" --property=FreezerState --value 2>/dev/null || true) == frozen ]]
}

swap_is_confidential() {
  local swap_count
  local swap_source
  local swap_source_path
  local mapped_source
  local crypt_status
  swap_count=$(
    awk 'NR > 1 { count += 1 } END { print count + 0 }' \
      /proc/swaps
  )
  [[ "$swap_count" == 1 ]] || return 1
  swap_source=$(awk 'NR == 2 { print $1 }' /proc/swaps)
  if [[ "$swap_source" == /dev/* ]]; then
    swap_source_path=$swap_source
  elif [[ "$swap_source" == /* ]]; then
    # Some kernels abbreviate device-mapper sources as /dm-N in
    # /proc/swaps rather than /dev/dm-N.
    swap_source_path="/dev$swap_source"
  else
    return 1
  fi
  mapped_source=$(
    readlink -f "/dev/mapper/$CRYPTSWAP_NAME" 2>/dev/null ||
      true
  )
  [[ -n "$mapped_source" &&
    $(readlink -f "$swap_source_path" 2>/dev/null || true) == "$mapped_source" ]] ||
    return 1
  crypt_status=$(cryptsetup status "$CRYPTSWAP_NAME" 2>/dev/null) ||
    return 1
  grep -Eq '^[[:space:]]*type:[[:space:]]+PLAIN$' \
    <<<"$crypt_status" &&
    grep -Eq '^[[:space:]]*cipher:[[:space:]]+aes-xts-plain64$' \
      <<<"$crypt_status" &&
    grep -Eq '^[[:space:]]*keysize:[[:space:]]+256 bits$' \
      <<<"$crypt_status" &&
    grep -Fq "loop:    $CRYPTSWAP_BACKING_FILE" \
      <<<"$crypt_status"
}

swap_configuration_is_reviewed() {
  local crypttab_mapping_count
  local crypttab_exact_count
  local fstab_swap_count
  local fstab_exact_count

  [[ $(stat -c '%u:%a:%F:%s' "$CRYPTSWAP_BACKING_FILE" 2>/dev/null || true) == "0:600:regular file:$CRYPTSWAP_BACKING_BYTES" ]] ||
    return 1
  [[ $(stat -c '%u:%a:%F' /etc/crypttab 2>/dev/null || true) == '0:644:regular file' ]] ||
    return 1
  [[ $(stat -c '%u:%a:%F' /etc/fstab 2>/dev/null || true) == '0:644:regular file' ]] ||
    return 1

  read -r crypttab_mapping_count crypttab_exact_count < <(
    awk '
      /^[[:space:]]*($|#)/ { next }
      $1 == "openclaw-cryptswap" {
        mappings += 1
        if (NF == 4 && $2 == "/swapfile" && $3 == "/dev/urandom" && $4 == "plain,cipher=aes-xts-plain64,size=256,hash=sha256,swap") {
          exact += 1
        }
      }
      END { print mappings + 0, exact + 0 }
    ' /etc/crypttab
  )
  [[ "$crypttab_mapping_count" == 1 &&
    "$crypttab_exact_count" == 1 ]] ||
    return 1

  read -r fstab_swap_count fstab_exact_count < <(
    awk '
      /^[[:space:]]*($|#)/ { next }
      $3 == "swap" {
        swaps += 1
        if (NF == 6 && $1 == "/dev/mapper/openclaw-cryptswap" && $2 == "none" && $3 == "swap" && $4 == "sw,nofail" && $5 == "0" && $6 == "0") {
          exact += 1
        }
      }
      END { print swaps + 0, exact + 0 }
    ' /etc/fstab
  )
  [[ "$fstab_swap_count" == 1 &&
    "$fstab_exact_count" == 1 ]]
}

list_cron_sessions() {
  local listing
  local session_id
  local service
  if ! listing=$(loginctl list-sessions --no-legend --no-pager 2>/dev/null); then
    return 1
  fi
  while read -r session_id _; do
    [[ -n "$session_id" ]] || continue
    if ! service=$(
      loginctl show-session "$session_id" \
        --property=Service --value 2>/dev/null
    ); then
      return 1
    fi
    if [[ "$service" == cron ]]; then
      printf '%s\n' "$session_id"
    fi
  done <<<"$listing"
}

cron_cgroup_is_empty() {
  local cgroup_root="/sys/fs/cgroup${CRON_CGROUP:-}"
  local pid
  local process_files
  local process_file
  local processes
  if [[ -z ${CRON_CGROUP:-} || ! "$CRON_CGROUP" =~ ^/[A-Za-z0-9_.@:/-]+$ ]]; then
    return 1
  fi
  [[ -d "$cgroup_root" ]] || return 0
  if ! process_files=$(
    find "$cgroup_root" -type f -name cgroup.procs -print 2>/dev/null
  ); then
    return 1
  fi
  [[ -n "$process_files" ]] || return 1
  while IFS= read -r process_file; do
    if ! processes=$(<"$process_file"); then
      return 1
    fi
    if [[ -n "$processes" ]]; then
      while IFS= read -r pid; do
        [[ "$pid" =~ ^[1-9][0-9]*$ ]] || return 1
      done <<<"$processes"
      return 1
    fi
  done <<<"$process_files"
  return 0
}

cron_observation_is_clean() {
  local sessions
  cron_cgroup_is_empty || return 1
  if ! sessions=$(list_cron_sessions); then
    return 1
  fi
  [[ -z "$sessions" ]]
}

cron_is_quiesced() {
  cron_observation_is_clean || return 1
  sleep 1
  cron_observation_is_clean
}

wait_for_cron_quiescence() {
  if retry 600 1 cron_is_quiesced; then
    return 0
  fi
  echo 'cron work did not quiesce within 10 minutes' >&2
  local sessions
  sessions=$(list_cron_sessions | paste -sd, -)
  if [[ -n "$sessions" ]]; then
    echo "remaining cron login sessions: $sessions" >&2
  fi
  local cgroup_root="/sys/fs/cgroup${CRON_CGROUP:-}"
  if [[ -d "$cgroup_root" ]]; then
    find "$cgroup_root" -type f -name cgroup.procs -exec cat {} + \
      2>/dev/null |
      sort -nu |
      sed 's/^/remaining cron cgroup PID: /' >&2
  fi
  return 1
}

load_active_state() {
  if [[ ! -e "$ACTIVE_STATE" && ! -L "$ACTIVE_STATE" ]]; then
    return 1
  fi
  local metadata
  metadata=$(stat -c '%u:%a:%F:%h:%s' "$ACTIVE_STATE" 2>/dev/null || true)
  if [[ ! "$metadata" =~ ^0:600:regular\ file:1:[1-9][0-9]{0,3}$ ]] ||
    ! jq -e \
      --arg state_root "$STATE_ROOT" '
        [
          "bridgeWasRunning",
          "cronWasRunning",
          "frozenScope",
          "gatewayWasRunning",
          "managedBrowserWasRunning",
          "qaaWasRunning",
          "runDirectory",
          "runId",
          "runningContainers",
          "schema",
          "swapWasActive"
        ] as $expected_keys |
        [
          "agent-os-bridge",
          "openclaw-sbx-agent-charles-c5870675",
          "openclaw-sbx-agent-linda-a1c79fb4",
          "openclaw-sbx-agent-agnes-b92b654d",
          "openclaw-sbx-agent-sladdis-00c345bc"
        ] as $allowed_containers |
        .runningContainers as $containers |
        (keys | sort) == $expected_keys and
        .schema == "openclaw-backup-maintenance-state/v1" and
        (.runId |
          type == "string" and
          test("^[0-9]{8}T[0-9]{6}Z$")) and
        .runDirectory == ($state_root + "/runs/" + .runId) and
        ([.gatewayWasRunning, .qaaWasRunning, .cronWasRunning,
          .bridgeWasRunning, .managedBrowserWasRunning,
          .swapWasActive] |
          all(.[]; type == "boolean")) and
        ($containers |
          type == "array" and
          length <= 5 and
          (unique | length) == length) and
        ([
          $containers[] as $container |
          select(($allowed_containers | index($container)) == null)
        ] | length) == 0 and
        .bridgeWasRunning ==
          (($containers | index("agent-os-bridge")) != null) and
        (
          .frozenScope == null or
          (
            .frozenScope |
            type == "string" and
            test("^session-[1-9][0-9]*\\.scope$")
          )
        )
      ' "$ACTIVE_STATE" >/dev/null; then
    echo 'maintenance state file ownership or mode is unsafe' >&2
    return 2
  fi
  RUN_ID=$(jq -er '.runId' "$ACTIVE_STATE")
  RUN_DIR=$(jq -er '.runDirectory' "$ACTIVE_STATE")
  GATEWAY_WAS_RUNNING=$(
    jq -r 'if .gatewayWasRunning then 1 else 0 end' \
      "$ACTIVE_STATE"
  )
  QAA_WAS_RUNNING=$(
    jq -r 'if .qaaWasRunning then 1 else 0 end' \
      "$ACTIVE_STATE"
  )
  CRON_WAS_RUNNING=$(
    jq -r 'if .cronWasRunning then 1 else 0 end' \
      "$ACTIVE_STATE"
  )
  BRIDGE_WAS_RUNNING=$(
    jq -r 'if .bridgeWasRunning then 1 else 0 end' \
      "$ACTIVE_STATE"
  )
  MANAGED_BROWSER_WAS_RUNNING=$(
    jq -r 'if .managedBrowserWasRunning then 1 else 0 end' \
      "$ACTIVE_STATE"
  )
  SWAP_WAS_ACTIVE=$(
    jq -r 'if .swapWasActive then 1 else 0 end' \
      "$ACTIVE_STATE"
  )
  RUNNING_CONTAINERS_CSV=$(
    jq -r '.runningContainers | join(",")' "$ACTIVE_STATE"
  )
  FROZEN_SCOPE=$(jq -r '.frozenScope // ""' "$ACTIVE_STATE")
}

restore_production() {
  if [[ ${RESTORE_ATTEMPTED:-0} == 1 ]]; then
    return 0
  fi
  RESTORE_ATTEMPTED=1
  local failed=0
  local resume_memory_safe=1
  local swap_failed=0

  if [[ ${SWAP_WAS_ACTIVE:-0} == 1 ]]; then
    if ! swap_configuration_is_reviewed; then
      echo 'reviewed encrypted swap configuration changed; production remains stopped' >&2
      failed=1
      swap_failed=1
    elif ! bounded 30s swapoff --all; then
      echo 'failed to clear swap before exact encrypted restoration' >&2
      failed=1
      swap_failed=1
    elif ! bounded 30s swapon "/dev/mapper/$CRYPTSWAP_NAME"; then
      echo 'failed to restore the exact encrypted swap mapping' >&2
      failed=1
      swap_failed=1
    elif ! swap_is_confidential; then
      echo 'reviewed encrypted swap did not become the sole active swap mapping' >&2
      failed=1
      swap_failed=1
    fi
  elif [[ $(awk 'NR > 1 { count += 1 } END { print count + 0 }' /proc/swaps) -ne 0 ]]; then
    echo 'maintenance state forbids swap but an active mapping exists' >&2
    failed=1
    swap_failed=1
  fi
  if [[ "$swap_failed" == 1 ]]; then
    bounded 30s swapoff --all >/dev/null 2>&1 || true
    if [[ $(awk 'NR > 1 { count += 1 } END { print count + 0 }' /proc/swaps) -ne 0 ]]; then
      echo 'unsafe swap remains active; manual recovery is required' >&2
      resume_memory_safe=0
    fi
  fi

  if [[ -n ${FROZEN_SCOPE:-} &&
    "$resume_memory_safe" == 0 ]]; then
    echo "credential-bearing scope $FROZEN_SCOPE remains frozen because unsafe swap could not be cleared" >&2
  elif [[ -n ${FROZEN_SCOPE:-} ]]; then
    system_systemctl thaw "$FROZEN_SCOPE" >/dev/null 2>&1 || true
    for _ in {1..30}; do
      if [[ $(system_systemctl show "$FROZEN_SCOPE" --property=FreezerState --value 2>/dev/null || true) != frozen ]]; then
        break
      fi
      sleep 1
    done
    if [[ $(system_systemctl show "$FROZEN_SCOPE" --property=FreezerState --value 2>/dev/null || true) == frozen ]]; then
      echo "failed to thaw $FROZEN_SCOPE" >&2
      failed=1
    fi
  fi

  if [[ "$swap_failed" == 1 ]]; then
    echo 'credential-bearing production workloads remain stopped because swap restoration was unsafe' >&2
    RESTORE_ATTEMPTED=0
    RESTORED_SUCCESSFULLY=0
    return 1
  fi

  IFS=',' read -r -a prior_containers <<<"${RUNNING_CONTAINERS_CSV:-}"
  local container
  for container in "${prior_containers[@]}"; do
    [[ -n "$container" ]] || continue
    if ! container_is_running "$container"; then
      bounded 30s docker start "$container" >/dev/null || failed=1
    fi
    retry 10 2 container_is_running "$container" || {
      echo "container failed to remain running: $container" >&2
      failed=1
    }
  done

  if [[ ${BRIDGE_WAS_RUNNING:-0} == 1 ]]; then
    retry 12 2 bridge_health || {
      echo 'Agent OS bridge failed its local health check' >&2
      failed=1
    }
    retry 8 2 public_bridge_health || {
      echo 'Agent OS bridge failed its public health check' >&2
      failed=1
    }
  fi

  if [[ ${GATEWAY_WAS_RUNNING:-0} == 1 ]]; then
    user_systemctl start "$GATEWAY_UNIT" || failed=1
    retry 8 2 gateway_health || {
      echo 'OpenClaw gateway failed its health check' >&2
      failed=1
    }
    if [[ ${MANAGED_BROWSER_WAS_RUNNING:-0} == 1 ]]; then
      bounded 30s openclaw browser \
        --browser-profile "$MANAGED_BROWSER_PROFILE" \
        start --json >/dev/null || failed=1
      retry 8 2 managed_browser_health || {
        echo 'managed OpenClaw browser failed its health check' >&2
        failed=1
      }
    fi
  fi

  if [[ ${CRON_WAS_RUNNING:-0} == 1 ]]; then
    system_systemctl start "$CRON_UNIT" || failed=1
  fi

  if [[ ${QAA_WAS_RUNNING:-0} == 1 ]]; then
    system_systemctl stop "$QAA_UNIT" >/dev/null 2>&1 || true
    echo 'QAA remains stopped: its pre-existing agent token is expired or revoked'
  fi

  if [[ "$failed" != 0 ]]; then
    RESTORE_ATTEMPTED=0
    RESTORED_SUCCESSFULLY=0
  else
    RESTORED_SUCCESSFULLY=1
  fi
  return "$failed"
}

archive_active_state() {
  local suffix=$1
  if [[ -f "$ACTIVE_STATE" ]]; then
    local archive_directory=${RUN_DIR:-$STATE_ROOT}
    mv "$ACTIVE_STATE" \
      "$archive_directory/maintenance-state-$suffix.json"
    sync -f "$archive_directory"
    sync -f "$STATE_ROOT"
  fi
}

recover_stale_maintenance() {
  local load_status=0
  load_active_state || load_status=$?
  if [[ "$load_status" != 0 ]]; then
    if [[ "$load_status" == 2 ]]; then
      echo 'unsafe or invalid maintenance state requires manual review' >&2
      return 1
    fi
    if [[ "$MODE" == --recover-only ]]; then
      echo 'no stale OpenClaw backup maintenance state'
      return 0
    fi
    return 1
  fi
  echo 'recovering production from stale OpenClaw backup maintenance state'
  if restore_production; then
    archive_active_state recovered
    return 0
  fi
  echo 'production recovery from stale maintenance state failed' >&2
  return 1
}

if [[ "$MODE" == --recover-only ]]; then
  recover_stale_maintenance
  exit $?
fi

if [[ -e "$ACTIVE_STATE" || -L "$ACTIVE_STATE" ]]; then
  recover_stale_maintenance
  exit $?
fi

if [[ ! -f "$BACKUP_ENV" ]]; then
  echo "missing $BACKUP_ENV" >&2
  exit 1
fi
if [[ $(stat -c '%u:%a:%F' "$BACKUP_ENV") != '0:600:regular file' ]]; then
  echo 'backup environment file ownership or mode is unsafe' >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a
source "$BACKUP_ENV"
set +a

for variable in \
  OPENCLAW_BACKUP_OUTPUT_DIR \
  OPENCLAW_BACKUP_GPG_RECIPIENT \
  OPENCLAW_BACKUP_GPG_SIGNER \
  OPENCLAW_BACKUP_PLAINTEXT_STAGING_ROOT \
  OPENCLAW_BACKUP_INGEST_URL \
  OPENCLAW_BACKUP_REMOTE_PROBE_URL \
  OPENCLAW_BACKUP_HOST_ID \
  OPENCLAW_BACKUP_BLOB_STORE_ID \
  OPENCLAW_BACKUP_INGEST_SECRET_FILE \
  GNUPGHOME; do
  if [[ -z ${!variable:-} ]]; then
    echo "required backup setting is missing: $variable" >&2
    exit 1
  fi
done
if [[ "$OPENCLAW_BACKUP_PLAINTEXT_STAGING_ROOT" != "$EXPECTED_STAGING_ROOT" ||
  $(stat -c '%u:%a:%F' "$EXPECTED_STAGING_ROOT" 2>/dev/null || true) != '0:700:directory' ]]; then
  echo 'backup plaintext staging root is not the private service mount' >&2
  exit 1
fi
staging_mount_target=$(
  findmnt --noheadings --output TARGET \
    --target "$EXPECTED_STAGING_ROOT" |
    awk '{$1=$1; print}'
)
staging_mount_type=$(
  findmnt --noheadings --output FSTYPE \
    --target "$EXPECTED_STAGING_ROOT" |
    awk '{$1=$1; print}'
)
staging_mount_options=$(
  findmnt --noheadings --output OPTIONS \
    --target "$EXPECTED_STAGING_ROOT" |
    awk '{$1=$1; print}'
)
if [[ "$staging_mount_target" != "$EXPECTED_STAGING_ROOT" ||
  "$staging_mount_type" != tmpfs ||
  ",$staging_mount_options," != *,rw,* ||
  ",$staging_mount_options," != *,nosuid,* ||
  ",$staging_mount_options," != *,nodev,* ||
  ",$staging_mount_options," != *,noexec,* ||
  ",$staging_mount_options," != *,noswap,* ]]; then
  echo 'backup plaintext staging mount lacks required noswap isolation' >&2
  exit 1
fi
if ! swap_configuration_is_reviewed ||
  ! swap_is_confidential; then
  echo 'active swap or its configuration is not the reviewed ephemeral dm-crypt mapping' >&2
  exit 1
fi

RUN_ID=$(date -u +%Y%m%dT%H%M%SZ)
RUN_DIR="$STATE_ROOT/runs/$RUN_ID"
LOG_FILE="$LOG_ROOT/$RUN_ID.log"
install -d -m 0700 "$RUN_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "OpenClaw backup maintenance started at $RUN_ID"

GATEWAY_WAS_RUNNING=0
QAA_WAS_RUNNING=0
CRON_WAS_RUNNING=0
BRIDGE_WAS_RUNNING=0
MANAGED_BROWSER_WAS_RUNNING=0
unit_was_running user "$GATEWAY_UNIT" && GATEWAY_WAS_RUNNING=1
unit_was_running system "$QAA_UNIT" && QAA_WAS_RUNNING=1
unit_was_running system "$CRON_UNIT" && CRON_WAS_RUNNING=1
if ! REPORTED_CRON_CGROUP=$(
  system_systemctl show "$CRON_UNIT" --property=ControlGroup --value 2>/dev/null
); then
  echo 'cron control group query failed' >&2
  exit 1
fi
if [[ -n "$REPORTED_CRON_CGROUP" &&
  "$REPORTED_CRON_CGROUP" != /system.slice/cron.service ]]; then
  echo 'cron control group could not be resolved safely' >&2
  exit 1
fi
CRON_CGROUP=/system.slice/cron.service
container_is_running "$BRIDGE_CONTAINER" && BRIDGE_WAS_RUNNING=1
if [[ "$GATEWAY_WAS_RUNNING" == 1 ]]; then
  MANAGED_BROWSER_STATUS=$(managed_browser_status)
  jq -e \
    --arg profile "$MANAGED_BROWSER_PROFILE" '
      .profile == $profile and
      (.running | type == "boolean") and
      (.cdpReady | type == "boolean")
    ' <<<"$MANAGED_BROWSER_STATUS" >/dev/null
  if jq -e '.running == true' \
    <<<"$MANAGED_BROWSER_STATUS" >/dev/null; then
    MANAGED_BROWSER_WAS_RUNNING=1
  fi
fi

RUNNING_CONTAINERS=()
if [[ "$BRIDGE_WAS_RUNNING" == 1 ]]; then
  RUNNING_CONTAINERS+=("$BRIDGE_CONTAINER")
fi
for container in "${SANDBOX_CONTAINERS[@]}"; do
  if container_is_running "$container"; then
    RUNNING_CONTAINERS+=("$container")
  fi
done
RUNNING_CONTAINERS_CSV=$(IFS=,; echo "${RUNNING_CONTAINERS[*]}")
FROZEN_SCOPE=
RESTORE_ATTEMPTED=0
RESTORED_SUCCESSFULLY=0
SWAP_WAS_ACTIVE=0
if [[ $(awk 'NR > 1 { count += 1 } END { print count + 0 }' /proc/swaps) -gt 0 ]]; then
  SWAP_WAS_ACTIVE=1
fi

write_active_state() {
  local partial="$ACTIVE_STATE.partial"
  jq -n \
    --arg run_id "$RUN_ID" \
    --arg run_directory "$RUN_DIR" \
    --arg gateway "$GATEWAY_WAS_RUNNING" \
    --arg qaa "$QAA_WAS_RUNNING" \
    --arg cron "$CRON_WAS_RUNNING" \
    --arg bridge "$BRIDGE_WAS_RUNNING" \
    --arg browser "$MANAGED_BROWSER_WAS_RUNNING" \
    --arg containers "$RUNNING_CONTAINERS_CSV" \
    --arg frozen_scope "$FROZEN_SCOPE" \
    --arg swap "$SWAP_WAS_ACTIVE" '
      {
        schema: "openclaw-backup-maintenance-state/v1",
        runId: $run_id,
        runDirectory: $run_directory,
        gatewayWasRunning: ($gateway == "1"),
        qaaWasRunning: ($qaa == "1"),
        cronWasRunning: ($cron == "1"),
        bridgeWasRunning: ($bridge == "1"),
        managedBrowserWasRunning: ($browser == "1"),
        runningContainers:
          (if $containers == "" then [] else ($containers | split(",")) end),
        frozenScope:
          (if $frozen_scope == "" then null else $frozen_scope end),
        swapWasActive: ($swap == "1")
      }
    ' >"$partial"
  chmod 0600 "$partial"
  sync -f "$partial"
  mv "$partial" "$ACTIVE_STATE"
  sync -f "$STATE_ROOT"
}

cd "$RUNTIME_ROOT"
read -r staging_available_blocks staging_block_size < <(
  stat --file-system --format='%a %S' \
    "$EXPECTED_STAGING_ROOT"
)
STAGING_AVAILABLE_BYTES=$((staging_available_blocks * staging_block_size))
node openclaw-backup.mjs \
  --include-browser-profiles \
  --production-data required \
  --host-recovery include \
  --json >"$RUN_DIR/capacity-preflight.json"
jq -e \
  --arg staging_root "$EXPECTED_STAGING_ROOT" \
  --argjson staging_available "$STAGING_AVAILABLE_BYTES" '
    .payloadClass == "core+browser" and
    .postgres.available == true and
    (.postgres.bytesEstimate |
      type == "number" and floor == . and . > 0) and
    .productionData.mode == "required" and
    .productionData.available == true and
    (.productionData.publicSchemaBytesEstimate |
      type == "number" and floor == . and . >= 0) and
    (.productionData.mediaDeclaredBytes |
      type == "number" and floor == . and . >= 0) and
    (.productionData.authBytesEstimate |
      type == "number" and floor == . and . > 0) and
    (.productionData.authControlPlaneBytesEstimate |
      type == "number" and floor == . and . > 0) and
    .plaintextStagingRoot == $staging_root and
    .plaintextStaging.schema ==
      "openclaw-backup-staging-budget/v1" and
    (.plaintextStaging.requiredBytes |
      type == "number" and floor == . and . > 0 and
      . <= $staging_available) and
    ([.hostRecovery.paths[] |
      select(.required == true and .present != true)] |
      length) == 0 and
    .hostRecovery.rootCrontab.required == true and
    .hostRecovery.rootCrontab.present == true
  ' "$RUN_DIR/capacity-preflight.json" >/dev/null
STAGING_REQUIRED_BYTES=$(
  jq -er '.plaintextStaging.requiredBytes' \
    "$RUN_DIR/capacity-preflight.json"
)
if [[ ! "$STAGING_REQUIRED_BYTES" =~ ^[1-9][0-9]*$ ||
  "$STAGING_REQUIRED_BYTES" -gt "$STAGING_AVAILABLE_BYTES" ]]; then
  echo 'capacity preflight produced an unsafe staging requirement' >&2
  exit 1
fi

write_active_state

on_exit() {
  local status=$?
  trap - EXIT
  if ! restore_production; then
    status=1
  fi
  if [[ ${RESTORED_SUCCESSFULLY:-0} == 1 ]]; then
    if [[ "$status" == 0 ]]; then
      archive_active_state complete
    else
      archive_active_state failed
    fi
  else
    echo 'maintenance state retained for boot guard recovery' >&2
  fi
  echo "OpenClaw backup maintenance finished with status $status"
  exit "$status"
}
trap on_exit EXIT

if [[ "$MANAGED_BROWSER_WAS_RUNNING" == 1 ]]; then
  bounded 30s openclaw browser \
    --browser-profile "$MANAGED_BROWSER_PROFILE" \
    stop --json >/dev/null
  retry 30 1 managed_browser_stopped
fi
if [[ "$GATEWAY_WAS_RUNNING" == 1 ]]; then
  user_systemctl stop "$GATEWAY_UNIT"
fi
system_systemctl stop "$QAA_UNIT"
if [[ "$CRON_WAS_RUNNING" == 1 ]]; then
  system_systemctl stop "$CRON_UNIT"
fi
wait_for_cron_quiescence
if ((${#RUNNING_CONTAINERS[@]} > 0)); then
  bounded 90s docker stop --time 30 \
    "${RUNNING_CONTAINERS[@]}" >/dev/null
fi

sleep 2
mapfile -t CODEX_PIDS < <(pgrep -f "$CODEX_PATTERN" || true)

if ((${#CODEX_PIDS[@]} > 0)); then
  CODEX_CGROUP=
  for pid in "${CODEX_PIDS[@]}"; do
    cgroup=$(awk -F: '$1 == "0" { print $3 }' "/proc/$pid/cgroup")
    if [[ ! "$cgroup" =~ ^/user\.slice/user-0\.slice/session-[1-9][0-9]*\.scope$ ]]; then
      echo "Codex process $pid is outside an allowed interactive session scope" >&2
      exit 1
    fi
    if [[ -z "$CODEX_CGROUP" ]]; then
      CODEX_CGROUP=$cgroup
    elif [[ "$CODEX_CGROUP" != "$cgroup" ]]; then
      echo 'Codex processes span more than one interactive session scope' >&2
      exit 1
    fi
  done
  FROZEN_SCOPE=${CODEX_CGROUP##*/}
  write_active_state
  echo "freezing verified interactive Codex scope $FROZEN_SCOPE in 10 seconds"
  sleep 10
  system_systemctl freeze "$FROZEN_SCOPE"
  retry 30 1 scope_is_frozen "$FROZEN_SCOPE"
fi

swap_used_kib=$(
  awk '
    $1 == "SwapTotal:" { total = $2 }
    $1 == "SwapFree:" { free = $2 }
    END { print total - free }
  ' /proc/meminfo
)
memory_available_kib=$(
  awk '$1 == "MemAvailable:" { print $2 }' /proc/meminfo
)
staging_tmpfs_kib=$(((STAGING_TMPFS_BYTES + 1023) / 1024))
if [[ ! "$swap_used_kib" =~ ^[0-9]+$ ||
  ! "$memory_available_kib" =~ ^[0-9]+$ ||
  "$memory_available_kib" -lt \
    $((swap_used_kib + staging_tmpfs_kib + MIN_CAPTURE_PROCESS_HEADROOM_KIB)) ]]; then
  echo 'insufficient physical-memory headroom for swapoff plus the full plaintext tmpfs ceiling' >&2
  exit 1
fi
swapoff --all
if [[ $(awk 'NR > 1 { count += 1 } END { print count + 0 }' /proc/swaps) -ne 0 ]]; then
  echo 'swap remained active; plaintext capture refused' >&2
  exit 1
fi

cd "$RUNTIME_ROOT"
BACKUP_ARGS=(
  --execute
  --output-dir "$OPENCLAW_BACKUP_OUTPUT_DIR"
  --recipient "$OPENCLAW_BACKUP_GPG_RECIPIENT"
  --signer "$OPENCLAW_BACKUP_GPG_SIGNER"
  --postgres required
  --production-data required
  --include-browser-profiles
  --host-recovery include
  --consistency quiesced
  --plaintext-staging "$OPENCLAW_BACKUP_PLAINTEXT_STAGING_ROOT"
  --allow-same-device
  --json
)
PREFLIGHT_ARGS=(
  --include-browser-profiles
  --production-data required
  --json
)
if [[ -n "$FROZEN_SCOPE" ]]; then
  BACKUP_ARGS+=(--frozen-codex-scope "$FROZEN_SCOPE")
  PREFLIGHT_ARGS+=(--frozen-codex-scope "$FROZEN_SCOPE")
fi

node openclaw-backup.mjs "${PREFLIGHT_ARGS[@]}" \
  >"$RUN_DIR/quiescence-preflight.json"
jq -e \
  --argjson staging_available "$STAGING_AVAILABLE_BYTES" '
  .payloadClass == "core+browser" and
  .inventory.sqliteDatabaseCount >= 135 and
  .inventory.browserProfiles.required == true and
  .inventory.browserProfiles.profileCount >= 4 and
  (.inventory.browserProfiles.missingCriticalPaths | length) == 0 and
  .productionData.mode == "required" and
  .productionData.available == true and
  .productionData.authUsers >= 1 and
  .productionData.authControlPlaneMethod ==
    "supabase-management-read-only-get" and
  .productionData.authControlPlaneEndpoints == 5 and
  .productionData.mediaRows >= 48 and
  .productionData.mediaObjects >= 44 and
  (.productionData.mediaDeclaredBytes |
    type == "number" and floor == . and . >= 0) and
  .plaintextStagingRoot ==
    "/run/openclaw-backup-tmp" and
  .plaintextStaging.schema ==
    "openclaw-backup-staging-budget/v1" and
  (.plaintextStaging.requiredBytes |
    type == "number" and floor == . and . > 0 and
    . <= $staging_available) and
  .quiescencePreflight.allKnownWritersStopped == true
' \
  "$RUN_DIR/quiescence-preflight.json" >/dev/null
QUIESCED_STAGING_REQUIRED_BYTES=$(
  jq -er '.plaintextStaging.requiredBytes' \
    "$RUN_DIR/quiescence-preflight.json"
)
memory_available_kib=$(
  awk '$1 == "MemAvailable:" { print $2 }' /proc/meminfo
)
if [[ ! "$memory_available_kib" =~ ^[0-9]+$ ||
  "$memory_available_kib" -lt \
    $((staging_tmpfs_kib + MIN_CAPTURE_PROCESS_HEADROOM_KIB)) ]]; then
  echo 'quiesced host lacks RAM for the full plaintext tmpfs ceiling plus process headroom' >&2
  exit 1
fi
docker exec agent-os-postgres pg_isready -U agent_os -d agent_os >/dev/null

node openclaw-backup.mjs "${BACKUP_ARGS[@]}" \
  >"$RUN_DIR/backup-result.json"
jq -e '
  .ok == true and
  .schema == "openclaw-backup-result/v1" and
  .payloadClass == "core+browser" and
  (.payloadManifestEntries |
    type == "number" and floor == . and . > 0) and
  .productionData.included == true and
  .productionData.schema ==
    "openclaw-agent-os-production-capture/v2" and
  .productionData.auth.userCount >= 1 and
  .productionData.authControlPlane.artifactCount == 5 and
  .productionData.authControlPlane.consistency ==
    "canonical-before-after" and
  .productionData.recoveryCapabilities
    .supabaseAuthControlPlaneMetadata == true and
  .productionData.media.rowCount >= 48 and
  .productionData.media.uniqueObjectCount >= 44 and
  .productionData.recoveryCapabilities.fullProductionRecovery ==
    false
' \
  "$RUN_DIR/backup-result.json" >/dev/null
SET_DIRECTORY=$(jq -er '.directory' "$RUN_DIR/backup-result.json")
SET_PARENT=$(realpath --canonicalize-existing "$(dirname "$SET_DIRECTORY")")
EXPECTED_PARENT=$(realpath --canonicalize-existing "$OPENCLAW_BACKUP_OUTPUT_DIR")
SET_NAME=$(basename "$SET_DIRECTORY")
if [[ "$SET_PARENT" != "$EXPECTED_PARENT" ||
  ! "$SET_NAME" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{16}$ ]]; then
  echo 'backup result returned an unexpected set directory' >&2
  exit 1
fi

if ! restore_production; then
  echo 'production health restoration failed' >&2
  exit 1
fi

node verify-openclaw-backup.mjs "$SET_DIRECTORY" --json \
  >"$RUN_DIR/outer-verification.json"
PAYLOAD_MANIFEST_ENTRIES=$(
  jq -er '.payloadManifestEntries' \
    "$RUN_DIR/backup-result.json"
)
PRODUCTION_DATA_JSON=$(
  jq -cer '.productionData' \
    "$RUN_DIR/backup-result.json"
)
jq -e \
  --argjson entries "$PAYLOAD_MANIFEST_ENTRIES" \
  --argjson production_data "$PRODUCTION_DATA_JSON" '
    .ok == true and
    .payloadClass == "core+browser" and
    .payloadManifestEntries == $entries and
    .productionData == $production_data
  ' "$RUN_DIR/outer-verification.json" >/dev/null

node upload-openclaw-backup.mjs "$SET_DIRECTORY" --json \
  >"$RUN_DIR/upload-plan.json"
jq -e '
  .mode == "dry_run" and
  .payloadClass == "core+browser" and
  .payloadManifestEntries == $entries and
  .productionData == $production_data and
  .localIntegrity == "sha256-ok" and
  .endpointConfigured == true and
  .hostIdConfigured == true and
  .storeIdConfigured == true and
  .secretFileConfigured == true
' --argjson entries "$PAYLOAD_MANIFEST_ENTRIES" \
  --argjson production_data "$PRODUCTION_DATA_JSON" \
  "$RUN_DIR/upload-plan.json" >/dev/null
PLANNED_FILES=$(jq -er '.files' "$RUN_DIR/upload-plan.json")
PLANNED_BYTES=$(jq -er '.bytes' "$RUN_DIR/upload-plan.json")

node upload-openclaw-backup.mjs \
  "$SET_DIRECTORY" --execute --json \
  >"$RUN_DIR/upload-receipt.json"
jq -e \
  --arg set_id "$SET_NAME" \
  --argjson files "$PLANNED_FILES" \
  --argjson bytes "$PLANNED_BYTES" \
  --argjson entries "$PAYLOAD_MANIFEST_ENTRIES" \
  --argjson production_data "$PRODUCTION_DATA_JSON" '
    .ok == true and
    .schema == "openclaw-backup-upload-result/v2" and
    .payloadClass == "core+browser" and
    .payloadManifestEntries == $entries and
    .productionData == $production_data and
    .setId == $set_id and
    .uploadedFiles == $files and
    .uploadedBytes == $bytes and
    (.objects | type == "array" and length == $files) and
    ([.objects[].sizeBytes] | add) == $bytes and
    (.objectRootSha256 |
      type == "string" and test("^[a-f0-9]{64}$")) and
    (.completionMarker | type == "string") and
    (.completionMarker | endswith("/manifest.json.gpg")) and
    .completionMarker == .objects[-1].pathname
  ' \
  "$RUN_DIR/upload-receipt.json" >/dev/null

node probe-openclaw-backup.mjs \
  "$RUN_DIR/upload-receipt.json" --execute --json \
  >"$RUN_DIR/remote-probe.json"
jq -e \
  --arg set_id "$SET_NAME" \
  --slurpfile receipt "$RUN_DIR/upload-receipt.json" '
    .schema == "openclaw-backup-remote-probe/v2" and
    .ok == true and
    .setId == $set_id and
    ($receipt | length == 1) and
    .objectCount == $receipt[0].uploadedFiles and
    .totalBytes == $receipt[0].uploadedBytes and
    .objectRootSha256 == $receipt[0].objectRootSha256 and
    .completionMarker == $receipt[0].completionMarker
  ' "$RUN_DIR/remote-probe.json" >/dev/null

printf '%s\n' "$SET_DIRECTORY" >"$RUN_DIR/completed-set-path"
echo "OpenClaw encrypted backup uploaded successfully: $(basename "$SET_DIRECTORY")"
