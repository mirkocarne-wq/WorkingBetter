#!/usr/bin/env bash
# Crea il file .env per docker-compose.prod.yml generando i segreti. Non sovrascrive un .env esistente.
# Uso: infra/rocky9/init-env.sh <APP_HOST> <API_HOST> <CONSOLE_HOST> [email-letsencrypt|internal]
#   es. infra/rocky9/init-env.sh app.wb.esempio.it api.wb.esempio.it console.wb.esempio.it ops@esempio.it
#   Senza email (o con "internal") Caddy usa la propria CA: adatto a LAN e prove, il browser mostra un avviso (docs/15 §3).
# Variabili opzionali lette dall'ambiente: PLATFORM_BOOTSTRAP_EMAIL, CONSOLE_ALLOW, EMAIL_TRANSPORT, SMTP_URL, EMAIL_FROM.
set -euo pipefail
cd "$(dirname "$0")/../.."
APP_HOST="${1:?APP_HOST mancante (es. app.esempio.it)}"
API_HOST="${2:?API_HOST mancante (es. api.esempio.it)}"
CONSOLE_HOST="${3:?CONSOLE_HOST mancante (es. console.esempio.it)}"
CADDY_TLS="${4:-internal}"
if [[ -f .env ]]; then echo ".env esiste già: non lo tocco (cancellalo per rigenerarlo, perdendo i segreti)"; exit 1; fi

rand() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-"$1"; }
POSTGRES_PASSWORD=$(rand 32)
AUTH_SESSION_SECRET=$(rand 48)
NOTES_MASTER_KEY=$(openssl rand -hex 32)
PLATFORM_BOOTSTRAP_EMAIL="${PLATFORM_BOOTSTRAP_EMAIL:-ops@${APP_HOST#*.}}"
PLATFORM_BOOTSTRAP_PASSWORD=$(rand 20)

umask 077
cat > .env <<ENV
# Generato da infra/rocky9/init-env.sh il $(date -Iseconds). NON versionare. Copia NOTES_MASTER_KEY in un posto sicuro (docs/13 §5).
APP_HOST=$APP_HOST
API_HOST=$API_HOST
CONSOLE_HOST=$CONSOLE_HOST
# internal = CA locale di Caddy; un indirizzo email = Let's Encrypt (porte 80/443 raggiungibili da Internet)
CADDY_TLS=$CADDY_TLS
# reti ammesse alla console (CIDR separati da spazio), es. "10.0.0.0/8 203.0.113.4/32"
CONSOLE_ALLOW=${CONSOLE_ALLOW:-0.0.0.0/0 ::/0}

POSTGRES_PASSWORD=$POSTGRES_PASSWORD
AUTH_SESSION_SECRET=$AUTH_SESSION_SECRET
NOTES_MASTER_KEY=$NOTES_MASTER_KEY

# Primo operatore della console (creato al primo avvio dell'API se non ne esistono; cambio password al primo accesso)
PLATFORM_BOOTSTRAP_EMAIL=$PLATFORM_BOOTSTRAP_EMAIL
PLATFORM_BOOTSTRAP_PASSWORD=$PLATFORM_BOOTSTRAP_PASSWORD

# Email: log = solo nei log del worker; smtp = invio reale (SMTP_URL smtp://user:pass@host:587) o Mailpit di prova (docs/15 §6)
EMAIL_TRANSPORT=${EMAIL_TRANSPORT:-log}
SMTP_URL=${SMTP_URL:-}
EMAIL_FROM=${EMAIL_FROM:-WorkingBetter <no-reply@${APP_HOST#*.}>}
CALENDAR_ORGANIZER_EMAIL=no-reply@${APP_HOST#*.}

# Facoltative
AUTH_SESSION_TTL_HOURS=12
NEXT_PUBLIC_MANUAL_URL=
ENV
cat <<MSG
.env creato (permessi 600). Riepilogo:
  Web app   https://$APP_HOST
  API       https://$API_HOST   (OpenAPI: /docs)
  Console   https://$CONSOLE_HOST:8443   operatore: $PLATFORM_BOOTSTRAP_EMAIL / $PLATFORM_BOOTSTRAP_PASSWORD
  TLS       $CADDY_TLS
Conserva a parte NOTES_MASTER_KEY e la password dell'operatore. Ora: sudo infra/rocky9/deploy.sh
MSG
