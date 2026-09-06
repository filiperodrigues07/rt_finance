# 04 — Estrutura de pastas (monorepo)

Monorepo **pnpm workspaces + Turborepo**. Três workspaces publicáveis (`apps/api`,
`apps/web`) e pacotes internos (`packages/*`). O `packages/shared` é o que permite
**um só conjunto de schemas Zod e tipos** para API, parser de IA e formulários web.

```
rt-finance/
├─ package.json                 # scripts raiz (dev, build, lint, test) via turbo
├─ pnpm-workspace.yaml
├─ turbo.json                   # pipeline de build/test com cache
├─ tsconfig.base.json
├─ .editorconfig  .gitignore  .nvmrc
├─ .env.example
├─ docker-compose.yml           # DEV local: postgres + evolution-api
├─ README.md
│
├─ docs/                        # ← esta ETAPA
│  ├─ 01-arquitetura.md
│  ├─ 02-banco-de-dados.md
│  ├─ 03-fluxo-whatsapp-ia.md
│  ├─ 04-estrutura-de-pastas.md
│  ├─ 05-deploy.md
│  ├─ 06-decisoes-adr.md
│  └─ 07-roadmap-etapas.md
│
├─ fly/                         # infra de produção (ETAPA 7)
│  ├─ api.fly.toml
│  ├─ web.fly.toml
│  └─ evolution.fly.toml
│
├─ packages/
│  ├─ shared/                   # @rt-finance/shared — SEM dependência de Nest/React
│  │  ├─ package.json
│  │  └─ src/
│  │     ├─ index.ts
│  │     ├─ schemas/            # DTOs de request/response (Zod) por recurso
│  │     │  ├─ transaction.ts   credit-card.ts  category.ts  installment.ts
│  │     │  ├─ recurring.ts     budget.ts       goal.ts      auth.ts  report.ts
│  │     ├─ intents.ts          # AiResult (união discriminada) — ver doc 03
│  │     ├─ types/              # tipos derivados (z.infer) + enums espelhando o Prisma
│  │     ├─ constants/          # QueryTemplate, categorias-sistema, limites
│  │     ├─ money.ts            # toCents, fromCents, formatBRL, splitInstallments
│  │     └─ date.ts             # períodos, firstDayOfMonth, invoiceCompetence, TZ
│  ├─ tsconfig/                 # @rt-finance/tsconfig — presets (base, node, react)
│  └─ eslint-config/            # @rt-finance/eslint-config — regras compartilhadas
│
└─ apps/
   ├─ api/                      # @rt-finance/api — NestJS + Fastify
   │  ├─ package.json
   │  ├─ nest-cli.json  tsconfig.json  tsconfig.build.json
   │  ├─ Dockerfile
   │  ├─ prisma/
   │  │  ├─ schema.prisma
   │  │  ├─ migrations/
   │  │  └─ seed.ts
   │  ├─ test/                  # e2e (Nest testing + Supertest) + setup testcontainers
   │  └─ src/
   │     ├─ main.ts             # bootstrap Fastify, Helmet, CORS, pipes/filtros globais
   │     ├─ app.module.ts
   │     ├─ config/
   │     │  ├─ env.schema.ts    # Zod: valida process.env no boot
   │     │  └─ config.module.ts
   │     ├─ lib/
   │     │  ├─ prisma.service.ts   # + extensão de query p/ escopo de household
   │     │  ├─ logger.ts           # pino + request id
   │     │  └─ pgboss.service.ts   # fila/agendamento
   │     ├─ common/
   │     │  ├─ guards/          # jwt-auth.guard.ts  roles.guard.ts
   │     │  ├─ interceptors/    # logging  response-envelope  tenant-scope
   │     │  ├─ filters/         # http-exception.filter.ts (envelope de erro)
   │     │  ├─ pipes/           # zod-validation.pipe.ts
   │     │  └─ decorators/      # @CurrentUser  @CurrentHousehold  @Public
   │     ├─ modules/
   │     │  ├─ auth/            # controller, service, strategies, dto (de shared)
   │     │  ├─ households/      # + membros, papéis, tenant guard
   │     │  ├─ users/
   │     │  ├─ categories/
   │     │  ├─ accounts/
   │     │  ├─ transactions/    # service com regras (valor>0, meio de pgto, transfer)
   │     │  ├─ credit-cards/
   │     │  ├─ invoices/        # competência, fechamento, pagamento
   │     │  ├─ installments/    # plano + parcelas + materialização + rateio
   │     │  ├─ recurring-expenses/
   │     │  ├─ budgets/
   │     │  ├─ goals/
   │     │  ├─ notifications/   # + preferences
   │     │  ├─ reports/         # agregações dashboard + export CSV/XLSX/PDF
   │     │  ├─ whatsapp/
   │     │  │  ├─ whatsapp.controller.ts     # POST /whatsapp/webhook
   │     │  │  ├─ whatsapp.service.ts        # interface
   │     │  │  ├─ providers/evolution.provider.ts
   │     │  │  ├─ message-router.service.ts  # orquestra IA→validação→domínio→resposta
   │     │  │  ├─ hint-resolver.service.ts   # categoria/cartão/membro/pagamento
   │     │  │  └─ formatters.ts              # textos de saída (pt-BR)
   │     │  ├─ ai/
   │     │  │  ├─ ai.service.ts              # interface AIService
   │     │  │  ├─ providers/nvidia.provider.ts
   │     │  │  ├─ prompts/                   # system + few-shots
   │     │  │  ├─ intent-parser.ts           # valida AiResult (Zod) + reparo
   │     │  │  └─ query-templates/           # 1 arquivo por template
   │     │  └─ charts/
   │     │     └─ chart-renderer.service.ts  # chartjs-node-canvas → PNG
   │     └─ jobs/
   │        ├─ invoice-close.job.ts
   │        ├─ recurring-generate.job.ts
   │        ├─ due-reminders.job.ts
   │        ├─ budget-check.job.ts
   │        ├─ weekly-summary.job.ts
   │        ├─ pending-expire.job.ts
   │        └─ backup.job.ts
   │
   └─ web/                      # @rt-finance/web — React + Vite
      ├─ package.json  vite.config.ts  tailwind.config.ts  index.html
      ├─ Dockerfile             # build → nginx estático (ou Cloudflare Pages)
      └─ src/
         ├─ main.tsx  App.tsx
         ├─ routes/             # /login /dashboard /transactions /cards /bills
         │                      # /recurrences /goals /reports /categories /users /settings
         ├─ components/
         │  ├─ ui/              # shadcn/ui (button, card, dialog, table, sheet, ...)
         │  ├─ layout/          # sidebar, topbar, mobile-bottom-nav, theme-toggle
         │  └─ charts/          # DonutByCategory, MonthlyEvolution, ByMember,
         │                      # ByCard, FutureCommitment (Recharts, tokens de tema)
         ├─ features/
         │  ├─ dashboard/       # cards (saldo/receitas/despesas/faturas/contas) + gráficos
         │  ├─ transactions/    # tabela: criar/editar/excluir/duplicar/filtrar + form manual
         │  ├─ cards/           # cartões, limites, faturas, parcelas futuras
         │  ├─ bills/           # contas fixas (recurring)
         │  ├─ recurrences/
         │  ├─ goals/
         │  ├─ reports/         # relatórios + export
         │  ├─ categories/      # CRUD (nome/emoji/cor)
         │  ├─ users/           # membros do household
         │  ├─ settings/        # tema, notificações, WhatsApp
         │  └─ auth/
         ├─ lib/
         │  ├─ api-client.ts    # fetch tipado; injeta access token; refresh transparente
         │  ├─ query.ts         # QueryClient + hooks (useTransactions, useDashboard, ...)
         │  ├─ auth.tsx         # contexto de sessão
         │  └─ format.ts        # formatBRL, formatDate (reusa @rt-finance/shared)
         ├─ stores/             # zustand: theme, filtros globais do dashboard
         └─ styles/             # globals.css + tokens (CSS custom properties, dark/light)
```

## Nomes de pacote

| Pasta | `name` no `package.json` |
|---|---|
| `apps/api` | `@rt-finance/api` |
| `apps/web` | `@rt-finance/web` |
| `packages/shared` | `@rt-finance/shared` |
| `packages/tsconfig` | `@rt-finance/tsconfig` |
| `packages/eslint-config` | `@rt-finance/eslint-config` |

## Fronteiras de dependência

- `packages/shared` **não** importa Nest nem React (só `zod` e utilitários puros).
- `apps/api` e `apps/web` importam `@rt-finance/shared`.
- `apps/web` **nunca** importa de `apps/api` (só fala via HTTP).
- Segredos (`NVIDIA_API_KEY`, `EVOLUTION_API_KEY`, `JWT_*`) só existem em `apps/api`.
  `apps/web` só conhece `VITE_API_URL`.
