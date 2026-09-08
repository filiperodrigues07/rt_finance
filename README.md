<div align="center">

# RT Finance

**Assistente financeiro de casal — WhatsApp como interface principal, painel web como centro de análise.**

Mande *"gastei 85 no mercado"* ou um **áudio** pelo WhatsApp e o RT Finance
interpreta, categoriza e registra. Depois acompanhe tudo no painel: dashboards,
gráficos, faturas de cartão, orçamentos, metas e relatórios.

`React + Vite` · `NestJS + Fastify` · `PostgreSQL + Prisma` · `Evolution API (WhatsApp)` · `NVIDIA NIM + Groq (IA)`

</div>

---

## Índice

- [O que ele faz](#o-que-ele-faz)
- [Arquitetura](#arquitetura)
- [Stack](#stack)
- [Rodando localmente](#rodando-localmente)
- [WhatsApp + IA](#whatsapp--ia)
- [Estrutura do monorepo](#estrutura-do-monorepo)
- [Scripts](#scripts)
- [Testes](#testes)
- [Deploy](#deploy)
- [Convenções](#convenções)
- [Documentação](#documentação)
- [Segurança](#segurança)

---

## O que ele faz

### Lançar e consultar pelo WhatsApp
- **Linguagem natural por IA** — *"paguei 120 de luz ontem"*, *"quanto gastamos esse mês?"*,
  *"comprei uma TV de 3000 em 10x no Nubank"*. A IA classifica, resolve
  categoria/cartão/conta/responsável e pede confirmação (`1` sim / `2` não / `3` editar).
- **Áudio (nota de voz)** — transcrição via Groq Whisper e depois o mesmo fluxo do texto.
- **Comandos rápidos** — `saldo`, `resumo`, `ajuda`.
- **Consultas com gráfico** — algumas respostas voltam como imagem gerada no servidor.
- **Autorização por telefone** — só respondem os números cadastrados nos membros do
  household (gerido pela tela, sem mexer em `.env`).

### Painel web
- **Dashboard** — saldo, receitas/despesas, faturas em aberto, vencimentos; donut por
  categoria, evolução mensal, gasto por pessoa/cartão, comprometimento futuro.
- **Transações** — CRUD, lançamento rápido, duplicar, marcar como pago, ações em massa
  (recategorizar, responsável, exportar, excluir). Filtros por tipo, categoria,
  responsável, cartão, conta, período, **faixa de valor** e **busca ampla**
  (descrição + notas + valor).
- **Carteira** — contas, cartões (limite, faturas, compras parceladas), recorrências
  (contas fixas com geração automática) e orçamentos por categoria com alertas.
- **Metas** — objetivos com aportes e marcos.
- **Importação de extratos/faturas** — **OFX**, **PDF** e **imagem (PNG/JPG)**. PDF/imagem
  passam por OCR local + extração por IA; tela de revisão antes de confirmar.
- **Anexos** — boleto e comprovante por lançamento (guardados no banco).
- **Relatórios** — projeções, tendências, comparativo por pessoa; export **PDF com a
  identidade da marca** (capa, KPIs, gráficos, tabela paginada), **Excel** e **CSV**.
- **Notificações** — fatura a vencer, orçamento estourado, meta atingida (web + WhatsApp).
- **Autenticação** — login por e-mail, **redefinição de senha por e-mail** (link com
  expiração), política de senha (maiúscula + minúscula + número + símbolo) e mostrar/ocultar.
- **Configurações** (seções recolhíveis) — **WhatsApp** (conexão + números autorizados),
  **E-mail** (SMTP global do sistema + toggle de *resumo semanal* por household) e
  *Zona de perigo* (limpar dados para começar do zero). Tema (claro/escuro/sistema +
  acento azul/rosa por usuário) fica no menu do usuário; perfil e senha, em **Usuários**.
- **Multi-casal** — cada `Household` é isolado. Um **super-admin** cria e gerencia
  households em `/admin`; cada household tem **seu próprio número de WhatsApp**.

---

## Arquitetura

```
┌──────────────┐   webhook    ┌───────────────────────────┐   Prisma   ┌────────────┐
│ Evolution API│ ───────────▶ │        API (NestJS)       │ ─────────▶ │ PostgreSQL │
│  (WhatsApp)  │ ◀─────────── │  message-router → IA →     │ ◀───────── │            │
└──────┬───────┘   sendText   │  transactions / reports…   │            └────────────┘
       │ Baileys              └──────┬─────────────┬───────┘
   ┌───▼────┐                        │             │ REST /api
   │ Redis  │ (cache da sessão)      │             │
   └────────┘                   ┌────▼────┐   ┌────▼──────────┐
                                │ NVIDIA  │   │  Painel web   │
                                │  NIM    │   │ React + Vite  │
                                │ (LLM)   │   └───────────────┘
                                │ + Groq  │
                                │ (STT)   │
                                └─────────┘
```

- **Multi-tenant** — toda linha financeira tem `householdId`; o JWT carrega
  `hid`/`mid`/`role`/`sa` (super-admin).
- **Camadas trocáveis** — `WhatsAppService` (provider `evolution` ou `console`) e
  `AIService` (provider `nvidia` ou `mock`). Sem chave → cai no mock/console.
- **Roteamento de mensagens** — por telefone do remetente **+** instância da Evolution,
  garantindo isolamento entre casais.
- **Resiliência do WhatsApp** — cache da sessão do Baileys no **Redis** (não em arquivo)
  e um **cron de saúde** que re-sobe a sessão sozinho quando o socket cai (sem QR).

Detalhes: [`docs/01-arquitetura.md`](docs/01-arquitetura.md) ·
[`docs/03-fluxo-whatsapp-ia.md`](docs/03-fluxo-whatsapp-ia.md).

---

## Stack

| Camada | Tecnologias |
|---|---|
| **Backend** | Node 22 · TypeScript · NestJS 10 (adapter **Fastify**) · Prisma 5 · **PostgreSQL 16+** · `@nestjs/schedule` (cron em processo) · Zod · JWT + refresh rotativo · Argon2id · pino · `nodemailer` (SMTP) · `pdfkit` + `@fontsource/inter` (relatórios) |
| **Frontend** | React 18 · Vite 5 · Tailwind CSS 3 · Recharts · TanStack Query 5 · react-router 6 · lucide-react · PWA · componentes de UI próprios |
| **Importação** | `tesseract.js` (OCR) · `sharp` (pré-processo de imagem) · `pdfjs-dist` + `pdf-parse` (PDF) · parser OFX próprio |
| **Integrações** | **Evolution API** v2.3.1 (WhatsApp self-hosted, Baileys) · **NVIDIA NIM** `nemotron-3-super-120b` (interpretação, endpoint OpenAI-compatível) · **Groq** `whisper-large-v3` (transcrição de áudio) |
| **Infra** | Monorepo **pnpm 9 + Turborepo** · Docker Compose (dev e prod) · Redis (cache da sessão) · Fly.io como alternativa (`fly/*.toml`) |

---

## Rodando localmente

**Pré-requisitos:** Node **22+**, **pnpm** (via `corepack`), **PostgreSQL 16+** e
**Docker** (para Evolution API + Redis, opcional se não for usar WhatsApp).

```bash
corepack enable
pnpm install
pnpm --filter @rt-finance/shared build

# Banco: use um PostgreSQL local OU suba o do compose
docker compose --profile db up -d          # opcional

cp apps/api/.env.example apps/api/.env      # ajuste DATABASE_URL / segredos
pnpm db:migrate                             # aplica as migrations
pnpm db:seed                                # household "Casa RT" + Filipe/Julia + categorias

pnpm dev                                    # shared (watch) + API (:3333) + web (:5173)
```

- Painel: <http://localhost:5173> (proxy `/api` → `:3333`)
- API: <http://localhost:3333/api> · health: `/api/health`
- Login de teste: **`filipe@rtfinance.local`** / **`rtfinance123`**

Variáveis: [`.env.example`](.env.example) ·
[`apps/api/.env.example`](apps/api/.env.example) ·
[`apps/web/.env.example`](apps/web/.env.example).

---

## WhatsApp + IA

Tudo é **opcional** para desenvolver o painel — sem chaves, a IA usa regras locais
(`mock`) e o WhatsApp só loga no console.

### 1. Evolution API + Redis (WhatsApp real)

```bash
docker compose --profile whatsapp up -d    # sobe evolution (:8080) + redis (:6379)
```

No `apps/api/.env`:

```ini
WHATSAPP_PROVIDER=evolution
EVOLUTION_BASE_URL=http://localhost:8080
EVOLUTION_API_KEY=dev-evolution-key
WHATSAPP_WEBHOOK_TOKEN=dev-webhook-token
```

Depois: **Painel → Configurações → WhatsApp → Conectar / Gerar QR** e escaneie com o
celular do bot. Cada household pareia o seu próprio número.

### 2. NVIDIA NIM (interpretação por IA)

```ini
AI_PROVIDER=nvidia
NVIDIA_API_KEY=nvapi-...          # https://build.nvidia.com  — só no backend
NVIDIA_MODEL=nvidia/nemotron-3-super-120b-a12b
```

### 3. Groq Whisper (transcrição de áudio) — opcional

```ini
GROQ_API_KEY=gsk_...             # https://console.groq.com/keys
GROQ_STT_MODEL=whisper-large-v3
```

Sem `GROQ_API_KEY`, áudios recebem um aviso pedindo texto. Falhas de áudio dão
mensagens específicas (áudio longo demais / formato ruim / tenta de novo); o teto
de tamanho é `AUDIO_MAX_BYTES` e o timeout das chamadas à Evolution é
`WHATSAPP_HTTP_TIMEOUT_MS`.

### 4. E-mail (SMTP) — opcional

Reset de senha e resumo semanal usam um **SMTP global** configurável em
**Configurações → E-mail** (só super-admin), com fallback para `SMTP_*` do `.env`.
Sem nenhum dos dois, o link/resumo só é registrado no log.

```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=voce@gmail.com         # Gmail: use uma "Senha de app" (2FA obrigatório)
SMTP_PASS=xxxxxxxxxxxxxxxx
MAIL_FROM=RT Finance <voce@gmail.com>
```

---

## Estrutura do monorepo

```
rt_finance/
├─ apps/
│  ├─ api/                 # NestJS + Fastify + Prisma
│  │  ├─ prisma/           # schema, migrations, seed
│  │  └─ src/modules/      # auth, households, transactions, credit-cards, invoices,
│  │     installments, recurring-expenses, budgets, goals, reports, imports,
│  │     attachments, notifications, ai, whatsapp, admin, scheduler, health
│  └─ web/                 # React + Vite + Tailwind (PWA)
│     └─ src/{pages,components,lib}
├─ packages/
│  ├─ shared/              # schemas Zod + tipos + utilitários de dinheiro/data (ESM)
│  ├─ eslint-config/
│  └─ tsconfig/
├─ docs/                   # arquitetura, banco, fluxos, ADRs, runbook, deploy
├─ deploy/                 # init do banco da Evolution
├─ fly/                    # fly.io toml (alternativa de deploy)
├─ docker-compose.yml      # dev: postgres (profile db) · evolution+redis (profile whatsapp)
└─ docker-compose.prod.yml # prod: api + web (nginx) + postgres + evolution + redis
```

Árvore comentada: [`docs/04-estrutura-de-pastas.md`](docs/04-estrutura-de-pastas.md).

---

## Scripts

Na raiz (Turborepo):

| Comando | O que faz |
|---|---|
| `pnpm dev` | shared (watch) + API + web |
| `pnpm build` | build de todos os pacotes |
| `pnpm typecheck` | `tsc --noEmit` em todos |
| `pnpm lint` | ESLint |
| `pnpm test` | testes unitários |
| `pnpm db:migrate` | `prisma migrate dev` |
| `pnpm db:deploy` | `prisma migrate deploy` (produção) |
| `pnpm db:seed` | popula household + usuários + categorias |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:reset` | recria o banco (destrutivo) |

Por pacote: `pnpm --filter @rt-finance/api dev`, `pnpm --filter @rt-finance/web build`, etc.

---

## Testes

```bash
pnpm --filter @rt-finance/shared test    # utilitários de dinheiro/data (Vitest)
pnpm --filter @rt-finance/api test       # unitários (parsers OFX, intent-parser, imports)
pnpm --filter @rt-finance/api test:int   # integração e2e — sobe o AppModule + PostgreSQL
```

O e2e usa um banco separado (`rtfinance_test`); rode `prisma migrate deploy` nele antes.
CI em [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

---

## Deploy

**VPS com Docker Compose** (recomendado) — sobe API + painel (nginx) + PostgreSQL +
Evolution + Redis numa rede interna; só o painel fica exposto (coloque um proxy TLS
na frente).

```bash
cp deploy/vps/.env.prod.example deploy/vps/.env.prod   # e preencha
cd deploy/vps
docker compose --env-file .env.prod pull               # imagens GHCR (workflow publish-images)
docker compose --env-file .env.prod up -d
```

O container da API roda `prisma migrate deploy` no boot. O `assertProdHardening`
**recusa subir** se, em produção, faltar: `AUTH_COOKIE_SECURE=true`, segredos JWT
fortes, `WEB_ORIGIN`/`API_PUBLIC_URL` reais e — com `WHATSAPP_PROVIDER=evolution` —
`EVOLUTION_BASE_URL`, `EVOLUTION_API_KEY`, `WHATSAPP_WEBHOOK_TOKEN`; com
`AI_PROVIDER=nvidia`, `NVIDIA_API_KEY`.

Passo a passo (DNS, TLS, migrations, backups): [`docs/05-deploy.md`](docs/05-deploy.md).
**Antes de subir, siga o [`SECURITY.md`](SECURITY.md)** — rotacionar chaves, segredos
JWT fortes, `AUTH_COOKIE_SECURE=true`, `WEB_ORIGIN` real, backup do Postgres.

**Fly.io** — 4 apps (`api` · `web` · `evolution` · Postgres) + Upstash Redis (plano
Free) para a sessão do WhatsApp. Configs em [`fly/`](fly/), runbook completo em
[`docs/05-deploy.md`](docs/05-deploy.md#1-flyio--passo-a-passo).

---

## Convenções

- **Dinheiro**: sempre inteiro em **centavos** (`amountCents`). Nunca `float`.
- **Datas de competência**: `Date` sem hora. **Timestamps**: `timestamptz` em UTC.
  Todo cálculo de "mês" e vencimento usa o fuso `America/Sao_Paulo`.
- **Idioma**: código e identificadores em inglês; textos de UI e do bot em pt-BR.
- **Tenant**: toda entidade financeira pertence a um `Household`.
- **Segredos**: só em `apps/api/.env` (gitignored). Nunca em `.env.example` nem no front.

---

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/01-arquitetura.md`](docs/01-arquitetura.md) | Visão geral, componentes, camadas `AIService` / `WhatsAppService` |
| [`docs/02-banco-de-dados.md`](docs/02-banco-de-dados.md) | Schema Prisma anotado, ER, regras de dinheiro, competência de fatura |
| [`docs/03-fluxo-whatsapp-ia.md`](docs/03-fluxo-whatsapp-ia.md) | Fluxo WhatsApp → IA → Backend, máquina de confirmação, contrato `AiResult` |
| [`docs/04-estrutura-de-pastas.md`](docs/04-estrutura-de-pastas.md) | Árvore do monorepo comentada |
| [`docs/05-deploy.md`](docs/05-deploy.md) | Deploy VPS/Compose e Fly.io, Evolution, backups |
| [`docs/06-decisoes-adr.md`](docs/06-decisoes-adr.md) | Decisões arquiteturais (ADRs) |
| [`docs/07-roadmap-etapas.md`](docs/07-roadmap-etapas.md) | Roadmap por etapas |
| [`docs/08-runbook.md`](docs/08-runbook.md) | Operação em produção (WhatsApp caiu, reprocessar fatura, rollback) |
| [`docs/ETAPA-2.md`](docs/ETAPA-2.md) … [`ETAPA-7.md`](docs/ETAPA-7.md) | O que foi entregue em cada etapa |

---

## Segurança

Relatos de vulnerabilidade e o checklist de hardening de produção estão em
[`SECURITY.md`](SECURITY.md). Resumo: chaves de IA/Evolution só no backend, o texto de
extratos/faturas enviado à IA passa por `maskPii()` (mascara cartão/CPF/CNPJ), e a
imagem da fatura nunca sai do servidor (OCR é local).

---

<div align="center">

© Filipe Rodrigues — projeto pessoal. Todos os direitos reservados.

</div>
