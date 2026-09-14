# Comandi rapidi per l'ambiente Docker (macOS/Linux). Vedi docs/12-ambiente-test-docker.md
.PHONY: up down reset logs ps seed test shell-api shell-db infra infra-down build

up:            ## Avvia lo stack completo (build alla prima esecuzione)
	docker compose --profile app up -d --build

infra:         ## Solo Postgres, Redis e Mailpit (per lanciare API/web con pnpm in locale)
	docker compose up -d

down:          ## Ferma tutto, mantiene i dati
	docker compose --profile app --profile sso down

reset:         ## Ferma tutto e cancella il database (ricrea il tenant demo al prossimo up)
	docker compose --profile app --profile sso down -v

build:         ## Ricostruisce le immagini dopo modifiche al codice
	docker compose --profile app build

logs:          ## Log in tempo reale di API, worker e web
	docker compose --profile app logs -f api workers web

ps:            ## Stato dei servizi
	docker compose --profile app ps

seed:          ## Ricrea il tenant demo (dati di prova) senza toccare lo schema
	docker compose --profile app run --rm -e SEED_ARGS="-- --reset" migrate

test:          ## Esegue l'intera suite di test dentro il container di build
	docker compose --profile app run --rm --no-deps migrate sh -c "pnpm -r test"

shell-api:     ## Shell nel container API
	docker compose --profile app exec api sh

shell-db:      ## psql sul database
	docker compose exec postgres psql -U wb -d workingbetter

help:
	@grep -E '^[a-z-]+:.*##' Makefile | sed -E 's/:.*## /\t/' | column -t -s $$'\t'
