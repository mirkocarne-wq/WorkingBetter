#!/usr/bin/env bash
# Ripristino di un backup creato da scripts/backup.sh su un database VUOTO (o da svuotare con --clean).
# Uso: DATABASE_URL=postgres://... scripts/restore.sh backups/wb-....dump [--clean]
# Dopo il ripristino: eseguire le migrazioni (pnpm --filter @wb/db migrate) se il backup è di una versione precedente,
# e verificare GET /health. Il ruolo applicativo (DB_APP_ROLE) e le policy RLS sono parte del dump.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL mancante}"
FILE="${1:?file di backup mancante}"
CLEAN=""
[[ "${2:-}" == "--clean" ]] && CLEAN="--clean --if-exists"
pg_restore --no-owner --no-privileges $CLEAN --dbname="$DATABASE_URL" "$FILE"
echo "ripristino completato da $FILE"
