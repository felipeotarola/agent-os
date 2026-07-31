#!/usr/bin/env bash

set -Eeuo pipefail
umask 027

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

PROJECT_ROOT=/root/.openclaw/workspace/agent-os
SOURCE_ROOT="$PROJECT_ROOT/scripts"
UNIT_SOURCE_ROOT="$PROJECT_ROOT/infra/openclaw-backup-systemd"
INSTALL_ROOT=/usr/local/libexec/openclaw-backup
RELEASES_ROOT="$INSTALL_ROOT/releases"
CURRENT_LINK="$INSTALL_ROOT/current"
RUNTIME_GNUPGHOME=/etc/openclaw-backup/gnupg
RUNTIME_SIGNER=A21CDBA4C148498DD96AE3B25BD3DABE32ED63DD
SUPABASE_CA_DESTINATION=/etc/openclaw-backup/supabase-prod-ca-2021.crt
SUPABASE_CA_SHA256=700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7

RUNTIME_FILES=(
  install-openclaw-backup-runtime.sh
  openclaw-backup-alert.sh
  openclaw-backup-healthcheck.sh
  openclaw-backup-maintenance.sh
  openclaw-backup-external.mjs
  openclaw-backup-path-security.mjs
  openclaw-backup-schema.mjs
  openclaw-backup.mjs
  probe-openclaw-backup.mjs
  recover-openclaw-backup-manifest.mjs
  restore-openclaw-backup.mjs
  retain-openclaw-backups.mjs
  supabase-prod-ca-2021.crt
  upload-openclaw-backup.mjs
  verify-openclaw-backup.mjs
)

UNIT_FILES=(
  README.md
  openclaw-backup-alert@.service
  openclaw-backup-gpg-agent.service
  openclaw-backup-healthcheck.service
  openclaw-backup-healthcheck.timer
  openclaw-backup-maintenance-guard.service
  openclaw-backup-maintenance.service
  openclaw-backup-maintenance.timer
)

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo 'OpenClaw backup runtime installation requires root' >&2
  exit 1
fi

runtime_signature_valid() {
  local release_path=$1
  local signature_status
  local -a signature_fingerprints
  if ! signature_status=$(
    gpg --homedir "$RUNTIME_GNUPGHOME" \
      --batch --status-fd 1 --verify \
      "$release_path/RUNTIME_CHECKSUMS.sha256.asc" \
      "$release_path/RUNTIME_CHECKSUMS.sha256" 2>/dev/null
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

verify_runtime_release() {
  local release_path=$1
  local release_id=$2
  local expected_manifest_paths
  local actual_manifest_paths
  local expected_file_paths
  local actual_file_paths
  local expected_checksum_lines
  local runtime_file
  local runtime_mode

  expected_manifest_paths=$(
    {
      printf '%s\n' "${RUNTIME_FILES[@]}"
      for runtime_file in "${UNIT_FILES[@]}"; do
        printf 'systemd/%s\n' "$runtime_file"
      done
    } | LC_ALL=C sort
  )
  actual_manifest_paths=$(
    awk '{ print $2 }' \
      "$release_path/RUNTIME_CHECKSUMS.sha256" 2>/dev/null |
      LC_ALL=C sort
  )
  expected_file_paths=$(
    {
      printf '%s\n' "$expected_manifest_paths"
      printf '%s\n' \
        RUNTIME_CHECKSUMS.sha256 \
        RUNTIME_CHECKSUMS.sha256.asc
    } | LC_ALL=C sort
  )
  actual_file_paths=$(
    find "$release_path" -mindepth 1 \
      -type f -printf '%P\n' 2>/dev/null |
      LC_ALL=C sort
  )

  expected_checksum_lines=$((${#RUNTIME_FILES[@]} + ${#UNIT_FILES[@]}))
  if [[ ! -d "$release_path" || -L "$release_path" ||
    $(stat -c '%u:%a:%F' "$release_path" 2>/dev/null || true) != '0:750:directory' ||
    $(stat -c '%u:%a:%F' "$release_path/systemd" 2>/dev/null || true) != '0:750:directory' ||
    $(stat -c '%u:%a:%F' "$release_path/RUNTIME_CHECKSUMS.sha256" 2>/dev/null || true) != '0:640:regular file' ||
    $(stat -c '%u:%a:%F' "$release_path/RUNTIME_CHECKSUMS.sha256.asc" 2>/dev/null || true) != '0:640:regular file' ||
    $(sha256sum "$release_path/RUNTIME_CHECKSUMS.sha256" 2>/dev/null | awk '{ print $1 }') != "$release_id" ||
    $(wc -l <"$release_path/RUNTIME_CHECKSUMS.sha256" 2>/dev/null || true) -ne $expected_checksum_lines ]] ||
    grep -Evq \
      '^[a-f0-9]{64}  (systemd/)?[A-Za-z0-9@._-]+$' \
      "$release_path/RUNTIME_CHECKSUMS.sha256" ||
    [[ "$actual_manifest_paths" != "$expected_manifest_paths" ||
      "$actual_file_paths" != "$expected_file_paths" ]] ||
    [[ $(find "$release_path" -mindepth 1 \
      -type l -print -quit) ]] ||
    [[ $(
      find "$release_path" -mindepth 1 -maxdepth 1 \
        -type d ! -name systemd -print -quit
    ) ]] ||
    [[ $(find "$release_path/systemd" -mindepth 1 \
      -type d -print -quit) ]] ||
    ! (
      cd "$release_path"
      sha256sum --check --status RUNTIME_CHECKSUMS.sha256
    ) ||
    ! runtime_signature_valid "$release_path"; then
    return 1
  fi

  while IFS= read -r runtime_file; do
    runtime_mode=640
    if [[ "$runtime_file" == *.sh ]]; then
      runtime_mode=750
    fi
    if [[ $(stat -c '%u:%a:%F' "$release_path/$runtime_file" 2>/dev/null || true) != "0:$runtime_mode:regular file" ]]; then
      return 1
    fi
  done < <(
    {
      awk '{ print $2 }' \
        "$release_path/RUNTIME_CHECKSUMS.sha256"
      printf '%s\n' \
        RUNTIME_CHECKSUMS.sha256 \
        RUNTIME_CHECKSUMS.sha256.asc
    }
  )
}

if [[ $(stat -c '%u:%a:%F' "$RUNTIME_GNUPGHOME" 2>/dev/null || true) != '0:700:directory' ]]; then
  echo 'backup runtime signing home is missing or unsafe' >&2
  exit 1
fi
signer_listing=$(
  gpg --homedir "$RUNTIME_GNUPGHOME" --batch \
    --with-colons --list-secret-keys "$RUNTIME_SIGNER"
)
if [[ $(
  awk -F: '$1 == "fpr" { print toupper($10); exit }' \
    <<<"$signer_listing"
) != "$RUNTIME_SIGNER" ]]; then
  echo 'backup runtime signing key is unavailable' >&2
  exit 1
fi

for file in "${RUNTIME_FILES[@]}"; do
  source_path="$SOURCE_ROOT/$file"
  if [[ ! -f "$source_path" || -L "$source_path" ]]; then
    echo "missing or unsafe runtime source: $file" >&2
    exit 1
  fi
done
for file in "${UNIT_FILES[@]}"; do
  source_path="$UNIT_SOURCE_ROOT/$file"
  if [[ ! -f "$source_path" || -L "$source_path" ]]; then
    echo "missing or unsafe systemd source: $file" >&2
    exit 1
  fi
done

if [[ $(
  sha256sum "$SOURCE_ROOT/supabase-prod-ca-2021.crt" |
    awk '{ print $1 }'
) != "$SUPABASE_CA_SHA256" ]]; then
  echo 'pinned Supabase root certificate source is invalid' >&2
  exit 1
fi

install -o root -g root -m 0750 -d \
  "$INSTALL_ROOT" "$RELEASES_ROOT"
if [[ $(stat -c '%u:%a:%F' "$INSTALL_ROOT") != '0:750:directory' ||
  $(stat -c '%u:%a:%F' "$RELEASES_ROOT") != '0:750:directory' ]]; then
  echo 'backup runtime installation root is unsafe' >&2
  exit 1
fi

staging=$(
  mktemp -d "$RELEASES_ROOT/.staging.XXXXXXXX"
)
if [[ ! "$staging" =~ ^/usr/local/libexec/openclaw-backup/releases/\.staging\.[A-Za-z0-9]{8}$ ]]; then
  echo 'backup runtime staging path is unsafe' >&2
  exit 1
fi
chmod 0750 "$staging"
install -o root -g root -m 0750 -d "$staging/systemd"

for file in "${RUNTIME_FILES[@]}"; do
  mode=0640
  if [[ "$file" == *.sh ]]; then
    mode=0750
  fi
  install -o root -g root -m "$mode" \
    "$SOURCE_ROOT/$file" "$staging/$file"
done
for file in "${UNIT_FILES[@]}"; do
  install -o root -g root -m 0640 \
    "$UNIT_SOURCE_ROOT/$file" "$staging/systemd/$file"
done

(
  cd "$staging"
  checksum_paths=("${RUNTIME_FILES[@]}")
  for file in "${UNIT_FILES[@]}"; do
    checksum_paths+=("systemd/$file")
  done
  sha256sum "${checksum_paths[@]}" >RUNTIME_CHECKSUMS.sha256
)
chmod 0640 "$staging/RUNTIME_CHECKSUMS.sha256"
gpg --homedir "$RUNTIME_GNUPGHOME" \
  --batch --yes --armor --detach-sign \
  --local-user "$RUNTIME_SIGNER" \
  --output "$staging/RUNTIME_CHECKSUMS.sha256.asc" \
  "$staging/RUNTIME_CHECKSUMS.sha256"
chmod 0640 "$staging/RUNTIME_CHECKSUMS.sha256.asc"
release_id=$(
  sha256sum "$staging/RUNTIME_CHECKSUMS.sha256" |
    awk '{ print $1 }'
)
if [[ ! "$release_id" =~ ^[a-f0-9]{64}$ ]]; then
  echo 'backup runtime release identity is invalid' >&2
  exit 1
fi
if ! verify_runtime_release "$staging" "$release_id"; then
  echo 'new backup runtime release is unsafe' >&2
  exit 1
fi

release_path="$RELEASES_ROOT/$release_id"
if [[ -e "$release_path" || -L "$release_path" ]]; then
  if ! verify_runtime_release "$release_path" "$release_id"; then
    echo 'existing backup runtime release is unsafe' >&2
    exit 1
  fi
  find "$staging" -xdev -depth -delete
else
  mv "$staging" "$release_path"
fi
if ! verify_runtime_release "$release_path" "$release_id"; then
  echo 'installed backup runtime release is unsafe' >&2
  exit 1
fi

if [[ -e "$CURRENT_LINK" && ! -L "$CURRENT_LINK" ]]; then
  echo 'backup runtime current path is not a symlink' >&2
  exit 1
fi
next_link="$INSTALL_ROOT/.current.$release_id.$$"
ln -s "releases/$release_id" "$next_link"
mv -Tf "$next_link" "$CURRENT_LINK"

install -o root -g root -m 0644 \
  "$release_path/supabase-prod-ca-2021.crt" \
  "$SUPABASE_CA_DESTINATION"
if [[ $(stat -c '%u:%a:%F:%s' "$SUPABASE_CA_DESTINATION") != '0:644:regular file:1367' ||
  $(sha256sum "$SUPABASE_CA_DESTINATION" | awk '{ print $1 }') != "$SUPABASE_CA_SHA256" ]]; then
  echo 'installed Supabase root certificate is invalid' >&2
  exit 1
fi

for file in "${UNIT_FILES[@]}"; do
  [[ "$file" == README.md ]] && continue
  install -o root -g root -m 0644 \
    "$release_path/systemd/$file" \
    "/etc/systemd/system/$file"
done
systemctl daemon-reload

for file in "${UNIT_FILES[@]}"; do
  [[ "$file" == README.md ]] && continue
  cmp --silent \
    "$release_path/systemd/$file" \
    "/etc/systemd/system/$file"
done
systemd-analyze verify \
  /etc/systemd/system/openclaw-backup-gpg-agent.service \
  /etc/systemd/system/openclaw-backup-maintenance.service \
  /etc/systemd/system/openclaw-backup-maintenance-guard.service \
  /etc/systemd/system/openclaw-backup-maintenance.timer \
  /etc/systemd/system/openclaw-backup-alert@.service \
  /etc/systemd/system/openclaw-backup-healthcheck.service \
  /etc/systemd/system/openclaw-backup-healthcheck.timer

printf 'openclaw_backup_runtime_installed=%s\n' "$release_id"
