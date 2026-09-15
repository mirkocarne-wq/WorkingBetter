#!/usr/bin/env bash
# Deploy/aggiornamento sul server: aggiorna il codice, costruisce le immagini, applica le migrazioni, riavvia i servizi.
# Uso: infra/rocky9/deploy.sh [--no-pull] [--branch <nome>]      (guida: docs/15 §5 e §9)
set -euo pipefail
cd "$(dirname "$0")/../.."
PULL=1; BRANCH=""
while [[ $# -gt 0 ]]; do case "$1" in --no-pull) PULL=0;; --branch) BRANCH="$2"; shift;; *) echo "argomento sconosciuto: $1"; exit 1;; esac; shift; done
[[ -f .env ]] || { echo ".env mancante: esegui prima infra/rocky9/init-env.sh"; exit 1; }
COMPOSE=(docker compose -f docker-compose.prod.yml)
PROFILES=()
if grep -q '^SMTP_URL=smtp://mailpit' .env; then PROFILES=(--profile mailtest); fi

if [[ $PULL -eq 1 ]]; then
  echo "== git: aggiornamento del codice"
  [[ -n "$BRANCH" ]] && git checkout -q "$BRANCH"
  git pull --ff-only
fi
echo "== versione: $(git rev-parse --short HEAD) ($(git rev-parse --abbrev-ref HEAD))"

echo "== build delle immagini (la prima volta richiede alcuni minuti)"
"${COMPOSE[@]}" "${PROFILES[@]}" build --pull

echo "== migrazioni"
"${COMPOSE[@]}" run --rm migrate

echo "== avvio/aggiornamento dei servizi"
"${COMPOSE[@]}" "${PROFILES[@]}" up -d --remove-orphans

echo "== attesa dell'API"
for i in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T api wget -qO- http://127.0.0.1:4000/health/ready >/dev/null 2>&1; then echo "API pronta"; break; fi
  sleep 2
  [[ $i -eq 60 ]] && { echo "l'API non risponde: docker compose -f docker-compose.prod.yml logs api"; exit 1; }
done
"${COMPOSE[@]}" "${PROFILES[@]}" ps
envval() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
APP_HOST=$(envval APP_HOST); API_HOST=$(envval API_HOST); CONSOLE_HOST=$(envval CONSOLE_HOST)
cat <<MSG

Deploy completato.
  Web app   https://$APP_HOST
  API       https://$API_HOST/health
  Console   https://$CONSOLE_HOST:8443
Primo tenant (una volta sola): docker compose -f docker-compose.prod.yml run --rm migrate pnpm --filter @wb/db bootstrap -- --tenant "Nome" --slug nome --admin admin@esempio.it
Log:  docker compose -f docker-compose.prod.yml logs -f api workers web console caddy
MSG
