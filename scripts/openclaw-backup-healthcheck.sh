#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

RUNTIME_ROOT=$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &&
    pwd -P
)
if [[ -d "$RUNTIME_ROOT/systemd" ]]; then
  UNIT_SOURCE_ROOT="$RUNTIME_ROOT/systemd"
else
  UNIT_SOURCE_ROOT="$RUNTIME_ROOT/../infra/openclaw-backup-systemd"
fi
BACKUP_ENV=/etc/openclaw-backup/uploader.env
STATE_ROOT=/var/lib/openclaw-backup/state
PLAN_PATH="$STATE_ROOT/healthcheck-plan.json"
LOCK_ROOT=/run/openclaw-backup
MAINTENANCE_LOCK="$LOCK_ROOT/maintenance.lock"
SCHEDULER_GATE=/etc/openclaw-backup/scheduler-enabled
VERCEL_AUTH=/root/.local/share/com.vercel.cli/auth.json
MAIN_VERCEL_TOKEN=/root/.openclaw/secrets/agent-os/VERCEL_ACCESS_TOKEN
RUNTIME_GNUPGHOME=/etc/openclaw-backup/gnupg
RUNTIME_SIGNER=11EAFE1BD7AD1BEE296B24565C8124C33417F2D7
EXPECTED_STAGING_ROOT=/run/openclaw-backup-tmp
STAGING_TMPFS_BYTES=$((1536 * 1024 * 1024))
CRYPTSWAP_NAME=openclaw-cryptswap
CRYPTSWAP_BACKING_FILE=/swapfile
CRYPTSWAP_BACKING_BYTES=$((2 * 1024 * 1024 * 1024))
SUPABASE_CA_FILE=/etc/openclaw-backup/supabase-prod-ca-2021.crt
SUPABASE_CA_SHA256=700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7
MIN_SIGNER_DAYS=30
WARN_SIGNER_DAYS=60
MAX_BACKUP_AGE_SECONDS=$((36 * 60 * 60))
MAX_FUTURE_SKEW_SECONDS=$((5 * 60))
MIN_SQLITE_DATABASES=135
MIN_CRITICAL_SQLITE_DATABASES=21

failures=()
warnings=()

fail() {
  failures+=("$1")
}

warn() {
  warnings+=("$1")
}

swap_is_confidential() {
  local swap_count
  local swap_source
  local mapped_source
  local crypt_status
  swap_count=$(
    awk 'NR > 1 { count += 1 } END { print count + 0 }' \
      /proc/swaps
  )
  [[ "$swap_count" == 1 ]] || return 1
  swap_source=$(awk 'NR == 2 { print $1 }' /proc/swaps)
  mapped_source=$(
    readlink -f "/dev/mapper/$CRYPTSWAP_NAME" 2>/dev/null ||
      true
  )
  [[ -n "$mapped_source" &&
    $(readlink -f "$swap_source" 2>/dev/null || true) == "$mapped_source" ]] ||
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
        if (NF == 4 &&
          $2 == "/swapfile" &&
          $3 == "/dev/urandom" &&
          $4 == "plain,cipher=aes-xts-plain64,size=256,hash=sha256,swap") {
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
        if (NF == 6 &&
          $1 == "/dev/mapper/openclaw-cryptswap" &&
          $2 == "none" &&
          $3 == "swap" &&
          $4 == "sw,nofail" &&
          $5 == "0" &&
          $6 == "0") {
          exact += 1
        }
      }
      END { print swaps + 0, exact + 0 }
    ' /etc/fstab
  )
  [[ "$fstab_swap_count" == 1 &&
    "$fstab_exact_count" == 1 ]]
}

runtime_signature_valid() {
  local signature_status
  local -a signature_fingerprints
  if ! signature_status=$(
    gpg --homedir "$RUNTIME_GNUPGHOME" \
      --batch --status-fd 1 --verify \
      "$RUNTIME_ROOT/RUNTIME_CHECKSUMS.sha256.asc" \
      "$RUNTIME_ROOT/RUNTIME_CHECKSUMS.sha256" 2>/dev/null
  ); then
    return 1
  fi
  mapfile -t signature_fingerprints < <(
    awk '
      $1 == "[GNUPG:]" && $2 == "VALIDSIG" {
        print toupper($3)
      }
    ' <<<"$signature_status"
  )
  [[ ${#signature_fingerprints[@]} -eq 1 &&
    ${signature_fingerprints[0]} == "$RUNTIME_SIGNER" ]]
}

if [[ -d "$RUNTIME_ROOT/systemd" ]]; then
  runtime_release=${RUNTIME_ROOT##*/}
  runtime_checksums="$RUNTIME_ROOT/RUNTIME_CHECKSUMS.sha256"
  runtime_signature="$RUNTIME_ROOT/RUNTIME_CHECKSUMS.sha256.asc"
  if [[ ! "$runtime_release" =~ ^[a-f0-9]{64}$ ||
    $(stat -c '%u:%a:%F' "$RUNTIME_ROOT" 2>/dev/null || true) != '0:750:directory' ||
    $(stat -c '%u:%a:%F' "$RUNTIME_ROOT/systemd" 2>/dev/null || true) != '0:750:directory' ||
    $(stat -c '%u:%a:%F' "$runtime_checksums" 2>/dev/null || true) != '0:640:regular file' ||
    $(stat -c '%u:%a:%F' "$runtime_signature" 2>/dev/null || true) != '0:640:regular file' ]]; then
    fail 'installed backup runtime metadata is unsafe'
  elif [[ $(sha256sum "$runtime_checksums" | awk '{ print $1 }') != "$runtime_release" ]]; then
    fail 'installed backup runtime release identity is invalid'
  elif [[ $(wc -l <"$runtime_checksums") -ne 22 ]] ||
    grep -Evq \
      '^[a-f0-9]{64}  (systemd/)?[A-Za-z0-9@._-]+$' \
      "$runtime_checksums"; then
    fail 'installed backup runtime checksum manifest is invalid'
  elif [[ $(
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
      -type d -print -quit) ]]; then
    fail 'installed backup runtime file set is invalid'
  elif ! (
    cd "$RUNTIME_ROOT"
    sha256sum --check --status RUNTIME_CHECKSUMS.sha256
  ); then
    fail 'installed backup runtime integrity check failed'
  elif ! runtime_signature_valid; then
    fail 'installed backup runtime signature is invalid'
  else
    while IFS= read -r runtime_file; do
      runtime_mode=640
      if [[ "$runtime_file" == *.sh ]]; then
        runtime_mode=750
      fi
      if [[ $(stat -c '%u:%a:%F' "$RUNTIME_ROOT/$runtime_file" 2>/dev/null || true) != "0:$runtime_mode:regular file" ]]; then
        fail 'installed backup runtime file ownership or mode is unsafe'
        break
      fi
    done < <(
      {
        awk '{ print $2 }' "$runtime_checksums"
        printf '%s\n' \
          RUNTIME_CHECKSUMS.sha256 \
          RUNTIME_CHECKSUMS.sha256.asc
      }
    )
  fi
elif [[ -e "$SCHEDULER_GATE" ]]; then
  fail 'backup runtime is not an installed immutable release'
else
  warn 'backup runtime installation pending before scheduler activation'
fi

join_messages() {
  local separator=
  local message
  for message in "$@"; do
    printf '%s%s' "$separator" "$message"
    separator='; '
  done
}

if [[ -L "$LOCK_ROOT" ||
  -e "$LOCK_ROOT" && ! -d "$LOCK_ROOT" ]]; then
  echo 'openclaw_backup_health_error: backup lock directory is unsafe' >&2
  exit 1
fi
install -o root -g root -m 0700 -d "$LOCK_ROOT"
if [[ $(stat -c '%u:%a:%F' "$LOCK_ROOT" 2>/dev/null || true) != '0:700:directory' ]]; then
  echo 'openclaw_backup_health_error: backup lock directory metadata is unsafe' >&2
  exit 1
fi
if [[ ! -e "$MAINTENANCE_LOCK" &&
  ! -L "$MAINTENANCE_LOCK" ]]; then
  (
    set -o noclobber
    : >"$MAINTENANCE_LOCK"
  ) 2>/dev/null || true
fi
if [[ ! -f "$MAINTENANCE_LOCK" || -L "$MAINTENANCE_LOCK" ||
  $(stat -c '%u:%a:%h:%s' "$MAINTENANCE_LOCK" 2>/dev/null || true) != '0:600:1:0' ]]; then
  echo 'openclaw_backup_health_error: backup maintenance lock file is unsafe' >&2
  exit 1
fi
exec 8<>"$MAINTENANCE_LOCK"
if [[ ! -f /proc/self/fd/8 ||
  $(stat -Lc '%u:%a:%h:%s' /proc/self/fd/8 2>/dev/null || true) != '0:600:1:0' ]]; then
  echo 'openclaw_backup_health_error: opened maintenance lock descriptor is unsafe' >&2
  exit 1
fi
if ! flock --shared --nonblock 8; then
  echo 'openclaw_backup_health_warning: maintenance run is active'
  echo 'openclaw_backup_health_deferred'
  exit 0
fi

if ! swap_configuration_is_reviewed ||
  ! swap_is_confidential; then
  echo 'openclaw_backup_health_error: active swap or its configuration is not the reviewed ephemeral dm-crypt mapping' >&2
  exit 1
fi
CONFIDENTIAL_SWAP=true

if [[ ! -f "$BACKUP_ENV" ||
  $(stat -c '%u:%a:%F' "$BACKUP_ENV" 2>/dev/null || true) != '0:600:regular file' ]]; then
  fail 'backup environment file is missing or unsafe'
else
  # shellcheck disable=SC1090
  set -a
  source "$BACKUP_ENV"
  set +a
fi

for variable in \
  OPENCLAW_BACKUP_OUTPUT_DIR \
  OPENCLAW_BACKUP_GPG_SIGNER \
  OPENCLAW_BACKUP_PLAINTEXT_STAGING_ROOT \
  OPENCLAW_BACKUP_INGEST_URL \
  OPENCLAW_BACKUP_HOST_ID \
  OPENCLAW_BACKUP_BLOB_STORE_ID \
  OPENCLAW_BACKUP_INGEST_SECRET_FILE \
  OPENCLAW_BACKUP_PRODUCTION_DATA_MODE \
  OPENCLAW_BACKUP_SUPABASE_ENV_FILE \
  OPENCLAW_BACKUP_SUPABASE_POOLER_HOST \
  OPENCLAW_BACKUP_SUPABASE_MANAGEMENT_TOKEN_FILE \
  OPENCLAW_BACKUP_MEDIA_BLOB_HOST \
  GNUPGHOME; do
  if [[ -z ${!variable:-} ]]; then
    fail "required setting missing: $variable"
  fi
done
if [[ -n ${OPENCLAW_BACKUP_PLAINTEXT_STAGING_ROOT:-} &&
  "$OPENCLAW_BACKUP_PLAINTEXT_STAGING_ROOT" != "$EXPECTED_STAGING_ROOT" ]]; then
  fail 'plaintext staging root is not the reviewed private mount'
fi

if [[ -z ${OPENCLAW_BACKUP_GPG_RECIPIENT:-} ]]; then
  if [[ -e "$SCHEDULER_GATE" ]]; then
    fail 'recovery recipient missing after scheduler activation'
  else
    warn 'recovery recipient pending before scheduler activation'
  fi
fi

if [[ -z ${OPENCLAW_BACKUP_REMOTE_PROBE_URL:-} &&
  ! -e "$SCHEDULER_GATE" ]]; then
  warn 'remote full-object probe pending before scheduler activation'
fi

if [[ -n ${GNUPGHOME:-} &&
  $(stat -c '%u:%a:%F' "$GNUPGHOME" 2>/dev/null || true) != '0:700:directory' ]]; then
  fail 'dedicated GnuPG home is missing or unsafe'
fi

if [[ -n ${OPENCLAW_BACKUP_OUTPUT_DIR:-} &&
  $(stat -c '%u:%a:%F' "$OPENCLAW_BACKUP_OUTPUT_DIR" 2>/dev/null || true) != '0:700:directory' ]]; then
  fail 'encrypted backup output directory is missing or unsafe'
fi
if [[ $(stat -c '%u:%a:%F:%s' "$SUPABASE_CA_FILE" 2>/dev/null || true) != '0:644:regular file:1367' ||
  $(sha256sum "$SUPABASE_CA_FILE" 2>/dev/null | awk '{ print $1 }') != "$SUPABASE_CA_SHA256" ]]; then
  fail 'pinned Supabase root certificate is missing or unsafe'
fi

for sensitive_file in \
  "${OPENCLAW_BACKUP_INGEST_SECRET_FILE:-}" \
  "${OPENCLAW_BACKUP_SUPABASE_ENV_FILE:-}" \
  "${OPENCLAW_BACKUP_SUPABASE_MANAGEMENT_TOKEN_FILE:-}"; do
  [[ -n "$sensitive_file" ]] || continue
  sensitive_metadata=$(
    stat -c '%u:%a:%F:%s' "$sensitive_file" 2>/dev/null ||
      true
  )
  if [[ ! "$sensitive_metadata" =~ ^0:600:regular\ file:[1-9][0-9]{0,6}$ ]]; then
    fail 'a referenced backup secret file is missing or unsafe'
  fi
done

if [[ "$CONFIDENTIAL_SWAP" == true ]] && (
  cd "$RUNTIME_ROOT"
  node --input-type=module <<'NODE'
import {
  validateRecipient,
  validateSigner
} from './openclaw-backup.mjs';
import {
  validateBlobStoreId,
  validateIngestEndpoint,
  validateUploadHostId
} from './upload-openclaw-backup.mjs';
import {
  validateProbeEndpoint
} from './probe-openclaw-backup.mjs';

try {
  const recipient = process.env.OPENCLAW_BACKUP_GPG_RECIPIENT || '';
  const signer = process.env.OPENCLAW_BACKUP_GPG_SIGNER || '';
  if (recipient) {
    await validateRecipient(recipient);
  }
  await validateSigner(signer, recipient);
  validateIngestEndpoint(process.env.OPENCLAW_BACKUP_INGEST_URL || '');
  validateUploadHostId(process.env.OPENCLAW_BACKUP_HOST_ID || '');
  validateBlobStoreId(process.env.OPENCLAW_BACKUP_BLOB_STORE_ID || '');
  if (process.env.OPENCLAW_BACKUP_REMOTE_PROBE_URL) {
    validateProbeEndpoint(process.env.OPENCLAW_BACKUP_REMOTE_PROBE_URL);
  }
  if (
    process.env.OPENCLAW_BACKUP_PRODUCTION_DATA_MODE !==
    'required'
  ) {
    throw new Error('production data mode must be required');
  }
} catch (error) {
  process.stderr.write(
    `openclaw_backup_runtime_validation_error: ${error.message}\n`
  );
  process.exitCode = 1;
}
NODE
); then
  :
elif [[ "$CONFIDENTIAL_SWAP" == true ]]; then
  fail 'cryptographic or endpoint runtime validation failed'
fi

if [[ -e "$VERCEL_AUTH" ]]; then
  fail 'broad Vercel CLI account authentication exists on the backup host'
fi

if [[ "$CONFIDENTIAL_SWAP" == true &&
  -e "$MAIN_VERCEL_TOKEN" ]]; then
  if [[ $(stat -c '%u:%a:%F' "$MAIN_VERCEL_TOKEN" 2>/dev/null || true) != '0:600:regular file' ]]; then
    fail 'main Vercel token file is unsafe'
  elif ! MAIN_VERCEL_TOKEN="$MAIN_VERCEL_TOKEN" \
    node --input-type=module <<'NODE'
import { readFile } from 'node:fs/promises';

const token = (
  await readFile(process.env.MAIN_VERCEL_TOKEN, 'utf8')
).trim();
if (
  token.length < 20 ||
  token.length > 4096 ||
  /[\s\u0000-\u001f\u007f]/.test(token)
) {
  throw new Error('Main Vercel token is malformed');
}
const endpoint = new URL(
  'https://api.vercel.com/v9/projects/prj_34kB2CWy4QtAQBioFlgnqQ8mEB0l'
);
endpoint.searchParams.set(
  'teamId',
  'team_vqtVFStVyWNQh2w5hOXKx6o0'
);
const response = await fetch(endpoint, {
  headers: {
    authorization: `Bearer ${token}`,
    accept: 'application/json'
  },
  redirect: 'error',
  signal: AbortSignal.timeout(10_000)
});
const declared = response.headers.get('content-length');
if (
  declared !== null &&
  (!/^[0-9]+$/.test(declared) || Number(declared) > 16_384)
) {
  throw new Error('Vercel isolation response is oversized');
}
const body = await response.text();
if (Buffer.byteLength(body, 'utf8') > 16_384) {
  throw new Error('Vercel isolation response is oversized');
}
let parsed;
try {
  parsed = JSON.parse(body);
} catch {
  throw new Error('Vercel isolation response is invalid');
}
if (
  response.status !== 403 ||
  parsed?.error?.code !== 'forbidden'
) {
  throw new Error(
    'Main Vercel token can access or ambiguously resolve the backup project'
  );
}
NODE
  then
    fail 'main Vercel identity is not proven isolated from backup control plane'
  fi
fi

if [[ $(systemctl is-enabled openclaw-backup-maintenance-guard.service 2>/dev/null || true) != enabled ]]; then
  fail 'maintenance boot guard is not enabled'
fi

for unit in \
  openclaw-backup-maintenance.service \
  openclaw-backup-maintenance-guard.service \
  openclaw-backup-maintenance.timer \
  'openclaw-backup-alert@.service' \
  openclaw-backup-healthcheck.service \
  openclaw-backup-healthcheck.timer; do
  if ! cmp --silent \
    "$UNIT_SOURCE_ROOT/$unit" \
    "/etc/systemd/system/$unit"; then
    fail "installed backup unit differs from reviewed source: $unit"
  fi
done

if [[ -n ${OPENCLAW_BACKUP_GPG_SIGNER:-} &&
  -n ${GNUPGHOME:-} ]]; then
  signer_listing=$(
    gpg --batch --with-colons \
      --list-secret-keys "$OPENCLAW_BACKUP_GPG_SIGNER" 2>/dev/null || true
  )
  signer_fingerprint=$(
    awk -F: '$1 == "fpr" { print toupper($10); exit }' \
      <<<"$signer_listing"
  )
  signer_expiry=$(
    awk -F: '$1 == "sec" { print $7; exit }' \
      <<<"$signer_listing"
  )
  if [[ "$signer_fingerprint" != "$OPENCLAW_BACKUP_GPG_SIGNER" ||
    ! "$signer_expiry" =~ ^[1-9][0-9]*$ ]]; then
    fail 'origin signing key is unavailable or malformed'
  else
    now_epoch=$(date +%s)
    signer_days=$(((signer_expiry - now_epoch) / 86400))
    if ((signer_days < MIN_SIGNER_DAYS)); then
      fail "origin signing key expires in ${signer_days} days"
    elif ((signer_days < WARN_SIGNER_DAYS)); then
      warn "origin signing key expires in ${signer_days} days"
    fi
  fi
fi

install -d -m 0700 "$STATE_ROOT"
if [[ "$CONFIDENTIAL_SWAP" == true ]] && (
  cd "$RUNTIME_ROOT"
  node openclaw-backup.mjs \
    --include-browser-profiles \
    --production-data skip \
    --host-recovery include \
    --json >"$PLAN_PATH"
); then
  if ! jq -e \
    --argjson min_sqlite "$MIN_SQLITE_DATABASES" \
    --argjson min_critical "$MIN_CRITICAL_SQLITE_DATABASES" '
    .payloadClass == "core+browser" and
    .inventory.sqliteDatabaseCount >= $min_sqlite and
    .inventory.expectedCriticalSqliteCount >= $min_critical and
    (.inventory.missingCriticalSqlitePaths | length) == 0 and
    (.inventory.invalidDatabaseCandidates | length) == 0 and
    .inventory.browserProfiles.required == true and
    .inventory.browserProfiles.profileCount >= 4 and
    (.inventory.browserProfiles.missingCriticalPaths | length) == 0 and
    .postgres.available == true and
    .productionData.mode == "skip" and
    .productionData.available == false and
    .productionData.reason == "explicitly_skipped" and
    ([.hostRecovery.paths[] |
      select(.required == true and .present != true)] |
      length) == 0 and
    .plaintextStagingRoot ==
      "/run/openclaw-backup-tmp" and
    .plaintextStaging.schema ==
      "openclaw-backup-staging-budget/v1" and
    (.plaintextStaging.requiredBytes |
      type == "number" and floor == . and . > 0) and
    (.tools | type == "object") and
    (.tools | length == 10) and
    .tools.tar == true and
    .tools.zstd == true and
    .tools.gpg == true and
    .tools.split == true and
    .tools.flock == true and
    .tools.du == true and
    .tools.cp == true and
    .tools.findmnt == true and
    .tools.swapoff == true and
    .tools.swapon == true
  ' "$PLAN_PATH" >/dev/null; then
    fail 'backup inventory or required tool coverage is unhealthy'
  fi
else
  if [[ "$CONFIDENTIAL_SWAP" == true ]]; then
    fail 'non-sensitive backup dry-run failed'
  fi
fi

if [[ -n ${OPENCLAW_BACKUP_OUTPUT_DIR:-} &&
  $(stat -c '%u:%a:%F' "$OPENCLAW_BACKUP_OUTPUT_DIR" 2>/dev/null || true) == '0:700:directory' &&
  -s "$PLAN_PATH" ]]; then
  available_bytes=$(
    df --output=avail --block-size=1 "$OPENCLAW_BACKUP_OUTPUT_DIR" |
      awk 'NR == 2 { print $1 }'
  )
  required_bytes=$(
    jq -er '
      .inventory.includedBytesEstimate +
      (1536 * 1024 * 1024) +
      (5 * 1024 * 1024 * 1024)
    ' \
      "$PLAN_PATH"
  )
  if [[ ! "$available_bytes" =~ ^[0-9]+$ ||
    ! "$required_bytes" =~ ^[0-9]+$ ||
    "$available_bytes" -lt "$required_bytes" ]]; then
    fail 'encrypted staging filesystem lacks the enforced backup margin'
  fi
fi

if [[ -n ${OPENCLAW_BACKUP_PLAINTEXT_STAGING_ROOT:-} ]]; then
  expected_temporary_filesystem="TemporaryFileSystem=$EXPECTED_STAGING_ROOT:rw,nosuid,nodev,noexec,noswap,size=1536M,mode=0700"
  if ! grep --fixed-strings --line-regexp \
    "$expected_temporary_filesystem" \
    "$UNIT_SOURCE_ROOT/openclaw-backup-maintenance.service" \
    >/dev/null; then
    fail 'maintenance unit lacks the reviewed ephemeral noswap mount'
  fi
fi

if [[ -e "$SCHEDULER_GATE" ]]; then
  if [[ $(systemctl is-enabled openclaw-backup-maintenance.timer 2>/dev/null || true) != enabled ||
    $(systemctl is-active openclaw-backup-maintenance.timer 2>/dev/null || true) != active ]]; then
    fail 'backup scheduler gate exists but timer is not enabled and active'
  fi

  latest_receipt=
  latest_epoch=-1
  while IFS= read -r -d '' candidate; do
    candidate_epoch=$(
      jq -er '
        .completedAtEpoch |
        select(type == "number" and floor == . and . > 0)
      ' "$candidate" 2>/dev/null || true
    )
    if [[ "$candidate_epoch" =~ ^[1-9][0-9]*$ ]] &&
      ((candidate_epoch > latest_epoch)); then
      latest_epoch=$candidate_epoch
      latest_receipt=$candidate
    fi
  done < <(
    find "$STATE_ROOT/runs" -mindepth 2 -maxdepth 2 \
      -name upload-receipt.json -type f -print0 2>/dev/null
  )

  if [[ -z "$latest_receipt" ]]; then
    fail 'no completed upload receipt exists after scheduler activation'
  else
    receipt_run_dir=$(dirname "$latest_receipt")
    receipt_metadata_safe=true
    for receipt_file in \
      "$latest_receipt" \
      "$receipt_run_dir/upload-plan.json" \
      "$receipt_run_dir/backup-result.json" \
      "$receipt_run_dir/outer-verification.json" \
      "$receipt_run_dir/completed-set-path"; do
      if [[ $(stat -c '%u:%a:%F' "$receipt_file" 2>/dev/null || true) != '0:600:regular file' ]]; then
        receipt_metadata_safe=false
      fi
    done
    completed_set_path=$(
      tr -d '\r\n' <"$receipt_run_dir/completed-set-path" \
        2>/dev/null || true
    )
    if [[ "$receipt_metadata_safe" != true ||
      -z "$completed_set_path" ]]; then
      fail 'latest backup receipt metadata is missing or unsafe'
    elif ! jq -e \
      --arg host_id "$OPENCLAW_BACKUP_HOST_ID" \
      --arg completed_set_path "$completed_set_path" \
      --slurpfile plan "$receipt_run_dir/upload-plan.json" \
      --slurpfile backup "$receipt_run_dir/backup-result.json" \
      --slurpfile outer "$receipt_run_dir/outer-verification.json" '
        .setId as $set_id |
        .ok == true and
        .schema == "openclaw-backup-upload-result/v2" and
        .payloadClass == "core+browser" and
        (.payloadManifestEntries |
          type == "number" and floor == . and . > 0) and
        .productionData.included == true and
        .productionData.auth.userCount >= 1 and
        .productionData.media.rowCount >= 48 and
        .productionData.media.uniqueObjectCount >= 44 and
        .productionData.recoveryCapabilities.fullProductionRecovery ==
          false and
        (.completedAt |
          type == "string" and
          test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$")) and
        (.completedAtEpoch | type == "number") and
        (.setId | test("^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{16}$")) and
        (.uploadedFiles | type == "number" and floor == . and . >= 2) and
        (.uploadedBytes | type == "number" and floor == . and . > 0) and
        (.objects | type == "array") and
        (.objects | length) == .uploadedFiles and
        ([.objects[].sizeBytes] | add) == .uploadedBytes and
        (.objectRootSha256 |
          type == "string" and test("^[a-f0-9]{64}$")) and
        (.completionMarker | type == "string") and
        (.completionMarker |
          startswith("openclaw-backups/v1/\($host_id)/\($set_id)/")) and
        (.completionMarker |
          test("/[a-f0-9]{64}-[1-9][0-9]*/manifest\\.json\\.gpg$")) and
        .completionMarker == .objects[-1].pathname and
        ($plan | length == 1) and
        $plan[0].mode == "dry_run" and
        $plan[0].payloadClass == .payloadClass and
        $plan[0].payloadManifestEntries ==
          .payloadManifestEntries and
        $plan[0].productionData == .productionData and
        $plan[0].localIntegrity == "sha256-ok" and
        $plan[0].setId == $set_id and
        $plan[0].files == .uploadedFiles and
        $plan[0].bytes == .uploadedBytes and
        ($backup | length == 1) and
        $backup[0].ok == true and
        $backup[0].schema == "openclaw-backup-result/v1" and
        $backup[0].payloadClass == .payloadClass and
        $backup[0].payloadManifestEntries ==
          .payloadManifestEntries and
        $backup[0].productionData == .productionData and
        $backup[0].setId == $set_id and
        $backup[0].directory == $completed_set_path and
        ($outer | length == 1) and
        $outer[0].ok == true and
        $outer[0].payloadClass == .payloadClass and
        $outer[0].payloadManifestEntries ==
          .payloadManifestEntries and
        $outer[0].productionData == .productionData
      ' "$latest_receipt" >/dev/null; then
      fail 'latest backup receipt is not bound to its local evidence'
    fi

    receipt_completed_at=$(
      jq -er '.completedAt' "$latest_receipt" 2>/dev/null || true
    )
    parsed_completed_epoch=$(
      date -u -d "$receipt_completed_at" +%s 2>/dev/null || true
    )
    if [[ ! "$parsed_completed_epoch" =~ ^[1-9][0-9]*$ ||
      "$parsed_completed_epoch" -ne "$latest_epoch" ]]; then
      fail 'latest backup completion timestamp fields disagree'
    fi

    now_epoch=$(date +%s)
    if ((latest_epoch > now_epoch + MAX_FUTURE_SKEW_SECONDS)); then
      fail 'latest completed backup timestamp is in the future'
    elif ((now_epoch - latest_epoch > MAX_BACKUP_AGE_SECONDS)); then
      fail 'latest completed backup is older than 36 hours'
    fi
  fi

  if [[ -z ${OPENCLAW_BACKUP_REMOTE_PROBE_URL:-} ]]; then
    fail 'remote completion-marker probe is not configured'
  elif [[ -n "$latest_receipt" &&
    -n ${receipt_run_dir:-} ]]; then
    probe_candidate="$receipt_run_dir/remote-probe.next.json"
    if ! (
      cd "$RUNTIME_ROOT"
      node probe-openclaw-backup.mjs \
        "$latest_receipt" --execute --json \
        >"$probe_candidate"
    ); then
      fail 'remote completion-marker probe failed'
    elif ! jq -e \
      --arg set_id "$(jq -er '.setId' "$latest_receipt")" \
      --slurpfile receipt "$latest_receipt" '
        .schema == "openclaw-backup-remote-probe/v2" and
        .ok == true and
        .setId == $set_id and
        ($receipt | length == 1) and
        .objectCount == $receipt[0].uploadedFiles and
        .totalBytes == $receipt[0].uploadedBytes and
        .objectRootSha256 == $receipt[0].objectRootSha256 and
        .completionMarker == $receipt[0].completionMarker
      ' "$probe_candidate" >/dev/null; then
      fail 'remote completion-marker probe result is invalid'
    else
      chmod 0600 "$probe_candidate"
      mv "$probe_candidate" \
        "$receipt_run_dir/remote-probe.json"
    fi
  fi
fi

if ((${#warnings[@]} > 0)); then
  printf 'openclaw_backup_health_warning: %s\n' \
    "$(join_messages "${warnings[@]}")"
fi
if ((${#failures[@]} > 0)); then
  printf 'openclaw_backup_health_error: %s\n' \
    "$(join_messages "${failures[@]}")" >&2
  exit 1
fi

if [[ -e "$SCHEDULER_GATE" ]]; then
  echo 'openclaw_backup_health_ok'
else
  echo 'openclaw_backup_readiness_pending'
fi
