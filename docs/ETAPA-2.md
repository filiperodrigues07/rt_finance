# ETAPA 2 — Backend (concluída)

Fundação do monorepo + API NestJS com o domínio financeiro central. Tudo abaixo foi
verificado localmente contra PostgreSQL 16/17 (migration, seed, boot e smoke test dos
fluxos ponta a ponta).

## O que foi criado

### Monorepo
- `pnpm` workspaces + Turborepo. Node 22 (pnpm via `corepack`).
- `packages/tsconfig`, `packages/eslint-config` (presets compartilhados).
- `packages/shared` (`@rt-finance/shared`): schemas Zod, enums, `AiResult` (contrato da
  IA), constantes (query templates, categorias-sistema) e utilitários:
  - `money.ts` — `toCents`, `fromCents`, `formatBRL`, **`splitInstallments`** (rateio com
    regra de resto: as primeiras `r` parcelas recebem +1 centavo), `sumCents`, `percentOf`.
  - `date.ts` — fuso `America/Sao_Paulo`, `resolvePeriod`, `clampDayToMonth`, `addMonths`,
    **`invoiceCompetence`** (competência determinística de fatura, doc 02 §4.3).
  - **21 testes unitários** cobrindo essas regras (`pnpm --filter @rt-finance/shared test`).

### API (`apps/api`, `@rt-finance/api`)
NestJS 10 + adapter **Fastify**, Prisma 5 + PostgreSQL, `pino` (logs estruturados +
request id), `@nestjs/throttler` (rate limit), `@fastify/helmet`, `@fastify/cookie`.

- **Config**: `env.schema.ts` valida `process.env` com Zod no boot (o processo não sobe
  sem os segredos obrigatórios).
- **Auth**: senha com **Argon2id**; **JWT** access (15 min) + **refresh token rotativo**
  opaco (hash em `Session`, `familyId`, **detecção de reuso** → revoga a família);
  cookie `httpOnly`/`SameSite=Lax`. Guard global `JwtAuthGuard` (+ `@Public()`).
  Rotas: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`.
- **Escopo multi-tenant**: `@CurrentHousehold()` extrai o `householdId` do token; todo
  service filtra por ele. Nenhuma query cross-household.
- **Erros**: `AllExceptionsFilter` → envelope `{ statusCode, error, message, requestId,
  timestamp, path }`; mapeia erros do Prisma (P2002→409, P2025→404, P2003→422).
- **Validação**: `ZodValidationPipe` em todo `@Body`/`@Query`/`@Param`.

### Módulos e endpoints (todos sob prefixo `/api`, exceto `/health`)

| Módulo | Endpoints | Regras |
|---|---|---|
| health | `GET /health` | checa o banco |
| households | `GET/PATCH /household`, `GET /household/members`, `PATCH /household/members/:id`, `GET/PATCH /me/profile`, `POST /me/change-password` | papéis (OWNER protege alterações), no mínimo 1 OWNER, troca de senha revoga sessões |
| categories | CRUD `/categories` | únicas por household; sistema/em uso → arquiva em vez de excluir; `resolveByName` (para a IA) |
| accounts | CRUD `/accounts` | `balanceCents` = abertura + Σ INCOME − Σ EXPENSE (CONFIRMED/CLEARED) |
| credit-cards | CRUD `/credit-cards`, `GET /credit-cards/:id/invoices` | limite usado/disponível; `resolveByHint` (nome/banco/últimos 4) |
| invoices | `GET /invoices/:id` | `resolveInvoiceForDate` (upsert por competência), `recalcTotal` |
| transactions | `GET/POST/PATCH/DELETE /transactions`, `POST /transactions/transfer`, `POST /transactions/:id/duplicate` | valor > 0; exatamente 1 meio de pagamento; despesa/receita em cartão anexa e recalcula a fatura; transferência = par de linhas ligadas por `transferGroupId`; parcela não pode ser editada avulsa; filtros (período, tipo, status, categoria, membro, conta, cartão, busca) + paginação/ordenação |
| installments | `GET/POST /installments/plans`, `DELETE /installments/plans/:id`, `GET /installments/future-commitment` | cria plano + N parcelas + N transações (`PENDING`, `date` = vencimento) numa transação Prisma; cada parcela vinculada à fatura da competência; cancelar remove parcelas `PENDING`; **comprometimento futuro** por mês |

### Banco
- `apps/api/prisma/schema.prisma` — 24 models, enums, índices e constraints do doc 02.
- Migration inicial: `apps/api/prisma/migrations/20260903*_init/` (717 linhas).
- `apps/api/prisma/seed.ts` — idempotente: household "Casa RT", 2 usuários
  (Filipe OWNER / Julia MEMBER), 16 categorias de sistema, preferências de notificação.

## Como rodar

```bash
corepack enable
pnpm install
pnpm --filter @rt-finance/shared build
cp apps/api/.env.example apps/api/.env      # ajuste DATABASE_URL e segredos
pnpm db:migrate                             # prisma migrate dev
pnpm db:seed
pnpm --filter @rt-finance/api dev           # http://localhost:3333/api
pnpm --filter @rt-finance/shared test       # 21 testes
```

Sem Docker, aponte `DATABASE_URL` para um PostgreSQL local; o papel do banco precisa de
`CREATEDB` (Prisma usa um shadow database em `migrate dev`).

## Smoke test verificado (resumo)

login → me → categorias (16) → cria conta e cartão Nubank (fecha dia 10, vence 17) →
despesa de R$ 85 no mercado (conta) → despesa de R$ 120 no cartão em 12/09 → **fatura
criada automaticamente na competência 10/2026** (fecha 10/10, vence 17/10) → parcelamento
"TV" R$ 2.400 em 12x (compra 03/09) → 1ª parcela na fatura de setembro, R$ 200/mês por 12
meses no comprometimento futuro → limite usado do cartão = R$ 2.520 → validações 400
(sem meio de pagamento) e 401 (sem token).

## Pendências assumidas para etapas seguintes

- Testes de integração da API (auth + CRUD contra Postgres efêmero / testcontainers) —
  as regras críticas de cálculo já têm cobertura unitária em `@rt-finance/shared`.
- Wiring do ESLint flat config (deps já declaradas em `packages/eslint-config`).
- `nest build` usa `tsconfig.build.json` com `incremental: false` de propósito
  (`deleteOutDir` + `.tsbuildinfo` obsoleto gerava `dist` vazio).
- Ajuste fino de `AuthModule` como `@Global()` para o `APP_GUARD` enxergar o `JwtService`.
