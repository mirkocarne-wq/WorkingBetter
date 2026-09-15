#!/usr/bin/env bash
# Backup logico del database del server (pg_dump dentro il container postgres). Usato dal timer systemd wb-backup.timer.
# Uso: infra/rocky9/backup.sh [cartella]   → /var/backups/workingbetter/wb-YYYYmmdd-HHMMSS.dump (tiene gli ultimi 30)
# Ripristino: docs/15 §8. NOTES_MASTER_KEY (in .env) va salvata a parte: senza chiave i dati cifrati sono irrecuperabili.
set -euo pipefail
cd "$(dirname "$0")/../.."
DIR="${1:-/var/backups/workingbetter}"
mkdir -p "$DIR"
OUT="$DIR/wb-$(date +%Y%m%d-%H%M%S).dump"
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U wb --format=custom --compress=6 --no-owner --no-privileges workingbetter > "$OUT"
echo "backup scritto: $OUT ($(du -h "$OUT" | cut -f1))"
ls -1t "$DIR"/wb-*.dump 2>/dev/null | tail -n +31 | xargs -r rm -f
