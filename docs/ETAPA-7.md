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
| Cookie de refresh | `AUTH_COOKIE_SECURE=true` em produção (`.env.prod`), `httpOnly`, `SameSite=Lax` |
| CORS | restrito a `WEB_ORIGIN` (env) |
| Helmet + compressão | `@fastify/helmet` + `@fastify/compress` (gzip > 1 KB — verificado) |
| Env validado no boot | `env.schema.ts` (Zod) — processo não sobe sem `JWT_*` / `DATABASE_URL` |
| Segredos | só no backend; `NVIDIA_API_KEY` etc no `.env.prod` da VPS, nunca no repo/`.env.example` |
| SQL | Prisma parametriza; a IA nunca emite SQL (só `queryTemplate`) |

## Otimização

- **Web code-splitting**: rotas via `React.lazy` + `Suspense`; `manualChunks` separa
  `react`, `recharts` (434 KB → só carrega no Dashboard/Relatórios) e
  `@tanstack/react-query`. Carga inicial de páginas sem gráfico caiu de ~900 KB para
  ~350 KB.
- **API**: `@fastify/compress` global.
- Índices do Prisma revisados (já definidos no schema: `(householdId,date)`,
  `(householdId,categoryId,date)`, `(creditCardId,date)`, `(invoiceId)`, etc).

## Deploy — VPS + Docker Compose

Arquivos:

```
apps/api/Dockerfile         multi-stage (deps → build → runtime node:22-slim + openssl)
apps/web/Dockerfile         build Vite → nginx:1.27-alpine
apps/web/nginx.conf.template :8080, /assets cache 1a, proxy /api → api:3333, SPA fallback
.dockerignore
docker-compose.prod.yml     api + web(nginx) + postgres + evolution + redis numa rede interna
.github/workflows/ci.yml    lint/typecheck/unit/integração/build com Postgres de serviço
.github/workflows/publish-images.yml  build/push das imagens api/web para o GHCR
```

Passo a passo completo (config, subir, seed, proxy TLS): **`docs/05-deploy.md`**.
Resumo: `git clone` → `cp .env.prod.example .env.prod` (preencher) →
`docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build` →
`... exec api pnpm --filter @rt-finance/api db:seed`. A API roda
`prisma migrate deploy` no start.

### Evolution API (parear o WhatsApp)

O pareamento é feito pelo painel: **Configurações → WhatsApp → Conectar / Gerar QR**.
Cada household cria a própria instância (`hh-xxxxxxxx`) e o webhook é configurado
automaticamente. Diagnóstico manual está no `docs/08-runbook.md`.

## Backups

- `pg_dump` no cron do host (comando em `docs/08-runbook.md`).
- Restore: banco limpo → `psql`/`pg_restore` → `prisma migrate deploy`.

## Runbook — ver `docs/08-runbook.md`

## Pendências (backlog pós-lançamento)

- Export XLSX/PDF (hoje só CSV).
- Alerta de orçamento em tempo real no `create` de transação (hoje: job diário + botão).
- Migrar jobs para pg-boss/BullMQ se subir para múltiplas réplicas.
- Sentry (`SENTRY_DSN` já previsto no env).
- E2E de UI (Playwright) — 2-3 fluxos.
