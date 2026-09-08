# RT Finance — API (NestJS). Contexto de build = raiz do monorepo.
#   docker build -f apps/api/Dockerfile -t rtfinance-api .
FROM node:22-slim AS builder
ENV PNPM_HOME=/pnpm PATH="/pnpm:$PATH"
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# manifests primeiro (cache de dependências)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages/shared/package.json           packages/shared/
COPY packages/tsconfig/package.json         packages/tsconfig/
COPY packages/eslint-config/package.json    packages/eslint-config/
COPY apps/api/package.json                  apps/api/
COPY apps/web/package.json                  apps/web/
RUN pnpm install --frozen-lockfile

# código + build
COPY . .
RUN pnpm --filter @rt-finance/shared build \
 && pnpm --filter @rt-finance/api exec prisma generate \
 && pnpm --filter @rt-finance/api build

# ---------- runtime ----------
FROM node:22-slim AS runner
ENV NODE_ENV=production PNPM_HOME=/pnpm PATH="/pnpm:$PATH"
# fonts-dejavu-core / fonts-liberation2: necessárias para o sharp/librsvg renderizar
# texto nos PNGs (cards de compartilhamento, gráficos do WhatsApp) — senão sai tudo "tofu".
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates tini fonts-dejavu-core fonts-liberation2 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# leva a árvore pronta (node_modules do pnpm + builds)
COPY --from=builder /app ./

EXPOSE 3333
# aplica migrações e sobe
ENTRYPOINT ["tini", "--"]
CMD ["sh", "-c", "pnpm --filter @rt-finance/api exec prisma migrate deploy && node apps/api/dist/main.js"]
