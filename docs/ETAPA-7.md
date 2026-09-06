# ETAPA 7 — Testes, segurança, otimização e deploy (concluída)

## Testes de integração

`apps/api/test/` — sobem o **AppModule inteiro** contra um PostgreSQL de teste
(`rtfinance_test`) e exercitam os fluxos ponta a ponta via `supertest`:

- `helpers.ts` — `resetDb()` (TRUNCATE … CASCADE), `seedMinimal()`, `createTestApp()`.
- `api.e2e.spec.ts` — **16 testes**: auth (401 / senha errada / `/me`), transações
  (criar, validação 400, saldo da conta, paginação), cartão + **competência de fatura**
  (compra em 12/09 → fatura de outubro, vence 17/10), parcelamento (12 parcelas, soma =
  total, comprometimento futuro), limite usado do cartão, **recorrência + idempotência**
  da geração, **orçamento** (% gasto), **meta** (milestone dispara notificação),
  dashboard e **export CSV**.
- `vitest.integration.config.ts` usa **`unplugin-swc`** (o transform padrão do
  vitest/esbuild não emite `design:paramtypes`, quebrando a injeção de dependência do
  NestJS).

```bash
# uma vez: criar e migrar o banco de teste
createdb rtfinance_test           # ou: psql -c "CREATE DATABASE rtfinance_test OWNER rtfinance"
pnpm --filter @rt-finance/api exec prisma migrate deploy   # com DATABASE_URL do teste
# rodar
pnpm --filter @rt-finance/api test:int
```

Total do projeto: **21 (shared) + 10 (parser IA) + 16 (integração) = 47 testes**.

## Segurança

| Item | Onde |
|---|---|
| Rate limit estrito no auth | `@Throttle({ limit: 10, ttl: 60s })` no `AuthController` (verificado: 10º/11º req → 429) |
| Rate limit no webhook | já em `WhatsappController` |
| Trilha de auditoria | `AuditInterceptor` global — grava `AuditLog` (ator + entidade + id + método) em toda mutação `POST/PATCH/DELETE` de rotas de dinheiro |
| Cookie de refresh | `AUTH_COOKIE_SECURE=true` em produção (`fly/api.fly.toml`), `httpOnly`, `SameSite=Lax` |
| CORS | restrito a `WEB_ORIGIN` (env) |
| Helmet + compressão | `@fastify/helmet` + `@fastify/compress` (gzip > 1 KB — verificado) |
| Env validado no boot | `env.schema.ts` (Zod) — processo não sobe sem `JWT_*` / `DATABASE_URL` |
| Segredos | só no backend; `NVIDIA_API_KEY` etc via `fly secrets`, nunca no repo/`.env.example` |
| SQL | Prisma parametriza; a IA nunca emite SQL (só `queryTemplate`) |

## Otimização

- **Web code-splitting**: rotas via `React.lazy` + `Suspense`; `manualChunks` separa
  `react`, `recharts` (434 KB → só carrega no Dashboard/Relatórios) e
  `@tanstack/react-query`. Carga inicial de páginas sem gráfico caiu de ~900 KB para
  ~350 KB.
- **API**: `@fastify/compress` global; `auto_stop_machines` no Fly para o web.
- Índices do Prisma revisados (já definidos no schema: `(householdId,date)`,
  `(householdId,categoryId,date)`, `(creditCardId,date)`, `(invoiceId)`, etc).

## Deploy — Fly.io

Arquivos:

```
apps/api/Dockerfile         multi-stage (deps → build → runtime node:22-slim + openssl)
apps/web/Dockerfile         build Vite → nginx:1.27-alpine
apps/web/nginx.conf         :8080, /assets cache 1a, proxy /api → rt-finance-api.internal, SPA fallback
.dockerignore
fly/api.fly.toml            release_command = prisma migrate deploy · health /health · 512 MB
fly/web.fly.toml            256 MB · auto-stop
fly/evolution.fly.toml      imagem atendai/evolution-api:v2.1.1 · volume evolution_data · NÃO escalar
.github/workflows/ci.yml    lint/typecheck/unit/integração/build com Postgres de serviço
```

### Passo a passo (primeiro deploy)

```bash
fly auth login
fly launch --no-deploy --copy-config -c fly/api.fly.toml        # cria rt-finance-api
fly launch --no-deploy --copy-config -c fly/web.fly.toml        # cria rt-finance-web
fly launch --no-deploy --copy-config -c fly/evolution.fly.toml  # cria rt-finance-evolution
fly volumes create evolution_data -a rt-finance-evolution -r gru -n 1 -s 1

# Postgres gerenciado
fly mpg create --name rt-finance-db --region gru                # anote a connection string

# segredos
fly secrets set -a rt-finance-api \
  DATABASE_URL="postgres://…rt-finance-db…" \
  JWT_ACCESS_SECRET="$(openssl rand -base64 48)" \
  JWT_REFRESH_SECRET="$(openssl rand -base64 48)" \
  NVIDIA_API_KEY="nvapi-…" \
  EVOLUTION_API_KEY="$(openssl rand -hex 24)" \
  WHATSAPP_WEBHOOK_TOKEN="$(openssl rand -hex 24)" \
  WHATSAPP_ALLOWLIST="+55XXXXXXXXXXX,+55YYYYYYYYYYY"
fly secrets set -a rt-finance-evolution AUTHENTICATION_API_KEY="<mesmo EVOLUTION_API_KEY>"

# deploy (a API roda `prisma migrate deploy` no release_command)
fly deploy -c fly/api.fly.toml
fly deploy -c fly/web.fly.toml
fly deploy -c fly/evolution.fly.toml

# seed inicial (uma vez) — SSH na máquina da API
fly ssh console -a rt-finance-api -C "node -e \"process.exit(0)\""   # smoke
fly ssh console -a rt-finance-api
  cd /app/apps/api && node --import tsx prisma/seed.ts   # ou rodar o seed compilado
```

> Preencher `SEED_OWNER_*` / `SEED_PARTNER_*` como secrets antes de rodar o seed, ou
> criar os usuários direto pelo painel depois e ajustar telefones em Configurações.

### Evolution API (parear o WhatsApp)

```bash
E=https://rt-finance-evolution.fly.dev
K=<EVOLUTION_API_KEY>
curl -X POST $E/instance/create -H "apikey: $K" -H 'content-type: application/json' \
  -d '{"instanceName":"rtfinance","integration":"WHATSAPP-BAILEYS"}'
curl -X POST $E/webhook/set/rtfinance -H "apikey: $K" -H 'content-type: application/json' -d '{
  "webhook":{"enabled":true,
    "url":"https://rt-finance-api.fly.dev/api/whatsapp/webhook",
    "events":["MESSAGES_UPSERT"],
    "headers":{"x-webhook-token":"<WHATSAPP_WEBHOOK_TOKEN>"}}}'
curl $E/instance/connect/rtfinance -H "apikey: $K"   # devolve o QR — parear no celular
curl $E/instance/connectionState/rtfinance -H "apikey: $K"   # deve ficar "open"
```

## Backups

- **Fly Managed Postgres** faz snapshots automáticos.
- Dump manual: `fly mpg connect -a rt-finance-db` → `pg_dump` para um bucket
  (Backblaze B2 / S3). Agendar via GitHub Action `schedule` ou um cron externo.
- Restore: banco limpo → `pg_restore` → `prisma migrate deploy`.

## Runbook — ver `docs/08-runbook.md`

## Pendências (backlog pós-lançamento)

- Export XLSX/PDF (hoje só CSV).
- Alerta de orçamento em tempo real no `create` de transação (hoje: job diário + botão).
- Migrar jobs para pg-boss/BullMQ se subir para múltiplas réplicas.
- Sentry (`SENTRY_DSN` já previsto no env).
- E2E de UI (Playwright) — 2-3 fluxos.
