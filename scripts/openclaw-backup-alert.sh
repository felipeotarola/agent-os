#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

UNIT=${1:-openclaw-backup-maintenance.service}
if [[ ! "$UNIT" =~ ^[A-Za-z0-9_.@:-]+$ ]]; then
  echo 'invalid failed unit name' >&2
  exit 64
fi

CONFIG=/root/.openclaw/openclaw.json
STATE_ROOT=/var/lib/openclaw-backup/state/alerts
DEDUP_SECONDS=$((30 * 60))
install -d -m 0700 "$STATE_ROOT"
exec 9>"$STATE_ROOT/alert.lock"
flock --exclusive 9

LAST_SENT_FILE="$STATE_ROOT/${UNIT}.last-success"
now_epoch=$(date +%s)
last_sent=0
if [[ -f "$LAST_SENT_FILE" ]]; then
  if [[ $(stat -c '%u:%a:%F' "$LAST_SENT_FILE" 2>/dev/null || true) != '0:600:regular file' ]]; then
    echo 'backup alert deduplication state is unsafe' >&2
    exit 1
  fi
  last_sent=$(<"$LAST_SENT_FILE")
  if [[ ! "$last_sent" =~ ^[1-9][0-9]*$ ]]; then
    echo 'backup alert deduplication state is malformed' >&2
    exit 1
  fi
  if ((last_sent > now_epoch + 300)); then
    echo 'backup alert deduplication state is in the future' >&2
    exit 1
  fi
fi
if ((now_epoch - last_sent < DEDUP_SECONDS)); then
  echo "OpenClaw backup alert suppressed within deduplication window: $UNIT"
  exit 0
fi

TARGET=$(
  jq -er '
    [.channels.telegram.accounts.sladdis.allowFrom[]?] as $targets |
    if
      ($targets | length) == 1 and
      ($targets[0] | type) == "string" and
      ($targets[0] | test("^-?[0-9]+$"))
    then $targets[0]
    else error("expected one numeric Sladdis Telegram allowFrom target")
    end
  ' "$CONFIG"
)
TOKEN_FILE=$(jq -er '.channels.telegram.accounts.sladdis.tokenFile' "$CONFIG")
TOKEN_FILE=$(realpath --canonicalize-existing "$TOKEN_FILE")
if [[ "$TOKEN_FILE" != /root/.openclaw/secrets/* ||
  $(stat -c '%u:%a:%F' "$TOKEN_FILE" 2>/dev/null || true) != '0:600:regular file' ]]; then
  echo 'Sladdis Telegram token path is unsafe' >&2
  exit 1
fi
TOKEN=$(<"$TOKEN_FILE")
if [[ ! "$TOKEN" =~ ^[0-9]{6,}:[A-Za-z0-9_-]{20,}$ ]]; then
  echo 'Sladdis Telegram token is malformed' >&2
  exit 1
fi

if [[ -f /var/lib/openclaw-backup/state/maintenance-active.json ]]; then
  RECOVERY_NOTE='Maintenance-state finns kvar och boot-guarden försöker återställa produktionen.'
else
  RECOVERY_NOTE='Ingen aktiv maintenance-state finns registrerad.'
fi
MESSAGE="🚨 OpenClaw backup-enheten misslyckades på $(hostname -s). Tjänst: $UNIT. $RECOVERY_NOTE Kontrollera: journalctl -u $UNIT"

RESPONSE=$(
  printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$TOKEN" |
    curl \
      --config - \
      --fail \
      --silent \
      --show-error \
      --connect-timeout 10 \
      --max-time 30 \
      --request POST \
      --data-urlencode "chat_id=$TARGET" \
      --data-urlencode "text=$MESSAGE"
)
jq -e '.ok == true' <<<"$RESPONSE" >/dev/null

partial="$LAST_SENT_FILE.partial"
printf '%s\n' "$now_epoch" >"$partial"
chmod 0600 "$partial"
mv "$partial" "$LAST_SENT_FILE"
