#!/usr/bin/env bash
# Backup logico del database WorkingBetter (pg_dump in formato custom, compresso).
# Uso: DATABASE_URL=postgres://... scripts/backup.sh [cartella]   → backups/wb-YYYYmmdd-HHMMSS.dump
# Nota: NOTES_MASTER_KEY va salvata a parte nel secret manager (docs/13 §5): senza chiave i dati cifrati non si recuperano.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL mancante}"
DIR="${1:-backups}"
mkdir -p "$DIR"
OUT="$DIR/wb-$(date +%Y%m%d-%H%M%S).dump"
pg_dump --format=custom --compress=6 --no-owner --no-privileges --file="$OUT" "$DATABASE_URL"
echo "backup scritto: $OUT ($(du -h "$OUT" | cut -f1))"
# conservazione: tiene gli ultimi 30 file
ls -1t "$DIR"/wb-*.dump 2>/dev/null | tail -n +31 | xargs -r rm -f
