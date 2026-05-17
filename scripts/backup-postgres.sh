#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BACKUP_DIR="${AGENT_OS_BACKUP_DIR:-$ROOT_DIR/backups/postgres}"
RETENTION_DAYS="${AGENT_OS_BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/agent_os_postgres_$TIMESTAMP.sql.gz"
TMP="$OUT.tmp"

mkdir -p "$BACKUP_DIR"

if ! docker compose ps postgres --status running >/dev/null 2>&1; then
  echo "postgres container is not running" >&2
  exit 1
fi

docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-agent_os}" "${POSTGRES_DB:-agent_os}" | gzip -9 > "$TMP"
mv "$TMP" "$OUT"
chmod 600 "$OUT"

# Verify gzip integrity and that the dump has real content.
gzip -t "$OUT"
if ! gzip -dc "$OUT" | head -n 20 | grep -q 'PostgreSQL database dump'; then
  echo "backup verification failed: dump header not found" >&2
  exit 1
fi

find "$BACKUP_DIR" -type f -name 'agent_os_postgres_*.sql.gz' -mtime +"$RETENTION_DAYS" -delete

BYTES="$(wc -c < "$OUT")"
echo "backup_ok path=$OUT bytes=$BYTES retention_days=$RETENTION_DAYS"
