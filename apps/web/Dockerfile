# RT Finance — painel web (SPA estática servida por nginx). Contexto = raiz do monorepo.
#   docker build -f apps/web/Dockerfile -t rtfinance-web .
FROM node:22-slim AS builder
ENV PNPM_HOME=/pnpm PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages/shared/package.json           packages/shared/
COPY packages/tsconfig/package.json         packages/tsconfig/
COPY packages/eslint-config/package.json    packages/eslint-config/
COPY apps/api/package.json                  apps/api/
COPY apps/web/package.json                  apps/web/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @rt-finance/shared build && pnpm --filter @rt-finance/web build

# ---------- runtime ----------
FROM nginx:1.27-alpine AS runner
# template: o entrypoint da imagem substitui as variáveis por env ao subir
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
ENV API_UPSTREAM=api:3333 \
    NGINX_RESOLVER=127.0.0.11
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
