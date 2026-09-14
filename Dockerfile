# syntax=docker/dockerfile:1.7
# Immagine unica multi-stage per API, worker e web (target: api | workers | web).
# Build: docker compose --profile app build   (oppure: docker build --target api -t wb-api .)

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 CI=1
RUN corepack enable && apk add --no-cache libc6-compat
WORKDIR /app

# ---- dipendenze (cache per lockfile) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/connectors/package.json packages/connectors/
COPY packages/api-client/package.json packages/api-client/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/workers/package.json apps/workers/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---- build di tutto il monorepo ----
FROM deps AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY tsconfig.base.json turbo.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm --filter @wb/shared build && pnpm --filter @wb/db build && pnpm --filter @wb/connectors build && pnpm --filter @wb/api-client build \
 && pnpm --filter @wb/api build && pnpm --filter @wb/workers build \
 && DOCKER_BUILD=1 pnpm --filter @wb/web build

# ---- API ----
FROM build AS api
ENV NODE_ENV=production API_PORT=4000
EXPOSE 4000
HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=24 CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "--enable-source-maps", "apps/api/dist/main.js"]

# ---- Worker ----
FROM build AS workers
ENV NODE_ENV=production
CMD ["node", "--enable-source-maps", "apps/workers/dist/main.js"]

# ---- Web (Next.js standalone) ----
FROM base AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=24 CMD wget -qO- http://127.0.0.1:3000/login || exit 1
CMD ["node", "apps/web/server.js"]
