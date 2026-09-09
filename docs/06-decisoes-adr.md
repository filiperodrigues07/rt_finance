# 06 — Decisões arquiteturais (ADRs)

Formato curto: **Contexto · Decisão · Alternativas · Consequências**. Status de todas:
**Aceita** (ETAPA 1). Datas: 2026-09-03.

---

## ADR-0001 — Monorepo pnpm + Turborepo {#adr-0001}

**Contexto.** Back e front em TypeScript compartilham DTOs, o formato `AiResult` e
utilitários de dinheiro/data. Duplicar isso gera divergência.

**Decisão.** Monorepo com `pnpm` workspaces + Turborepo. Pacote `@rt-finance/shared`
com schemas Zod, tipos e utils, sem dependência de Nest/React.

**Alternativas.** (a) Dois repositórios + pacote publicado num registry privado — mais
cerimônia, versionamento manual. (b) Copiar tipos — divergência garantida.

**Consequências.** Um `pnpm install`; build/test incrementais com cache; disciplina de
fronteiras de dependência (shared não importa framework).

---

## ADR-0002 — Backend NestJS (adapter Fastify) {#adr-0002}

**Contexto.** O pedido exige "arquitetura modular e escalável" e prevê virar SaaS. Há
muitas preocupações transversais (auth, validação, erros, escopo de tenant, rate limit).

**Decisão.** NestJS com adapter Fastify. Módulos por domínio; Guards (JWT), Interceptors
(logging, envelope, tenant), Exception Filter global, Pipe de validação Zod (`nestjs-zod`).

**Alternativas.** (a) Fastify puro — mais leve, mas exige montar à mão a estrutura
modular e o transversal; **reavaliável** se o time preferir enxuto. (b) Express — sem
estrutura. (c) NestJS + Express — mais lento que Fastify sem ganho aqui.

**Consequências.** Mais boilerplate inicial; em troca, fronteiras claras e onboarding
previsível. Fastify mantém boa performance de I/O.

---

## ADR-0003 — Prisma + PostgreSQL; dinheiro em centavos inteiros {#adr-0003}

**Contexto.** Projeto pede Prisma + PostgreSQL. Dinheiro exige exatidão; parcelamento
exige rateio sem erro de arredondamento.

**Decisão.** Prisma ORM. Todo valor monetário é `Int` em centavos (`amountCents`).
Datas de competência `@db.Date`; timestamps `@db.Timestamptz` em UTC; cálculo de mês e
vencimento em `America/Sao_Paulo` na aplicação.

**Alternativas.** (a) `Decimal(12,2)` do Postgres — legível, mas exige cuidado de
arredondamento em toda conta e conversão constante. (b) `Float` — proibido (erro
binário).

**Consequências.** Toda entrada/saída converte centavos ↔ reais nas bordas
(`packages/shared/money.ts`). Rateio de parcelas vira aritmética inteira exata.

---

## ADR-0004 — Multi-tenant desde já: `Household` {#adr-0004}

**Contexto.** O enunciado descreve uma "conta do casal" compartilhada. Futuro SaaS =
muitos casais.

**Decisão.** `Household` é a fronteira de tenant. Toda entidade financeira tem
`householdId`. `HouseholdMember` liga `User` ↔ `Household` com papel e `displayName`.
Um interceptor injeta o filtro `householdId` em toda leitura.

**Alternativas.** (a) Só `User` + flag/relacionamento "parceiro" — quebra ao adicionar
o 2º tenant; migração dolorosa depois. (b) Schema-per-tenant no Postgres — exagero para
2 usuários.

**Consequências.** Custo quase nulo agora (uma coluna + guard). SaaS depois é
onboarding de household, não reescrita de modelo.

---

## ADR-0005 — Camada `AIService` + `NvidiaProvider` {#adr-0005}

**Contexto.** IA inicial é a da NVIDIA, mas deve poder trocar (Gemini/OpenAI/local) sem
mexer no domínio. A saída da IA não pode virar movimentação sem validação.

**Decisão.** Interface `AIService` (`interpret`, `answerQuery`, `summarize`). Provider
`NvidiaProvider` usa o endpoint **OpenAI-compatível** da NVIDIA NIM
(`/chat/completions`, `response_format` JSON). Saída validada por `AiResult` (união
discriminada Zod); JSON malformado → 1 retry de reparo → `unknown`. A IA devolve
**hints** de texto, nunca IDs; o backend resolve contra os dados reais. Chave só no
backend.

**Alternativas.** (a) Chamar o SDK do provedor direto nos handlers — acopla domínio ao
fornecedor. (b) Function-calling nativo — usar quando o modelo suportar bem; o contrato
Zod continua sendo a fonte de verdade.

**Consequências.** Trocar de provedor = nova classe + `AI_PROVIDER` no env. Toda
resposta de IA é auditável (`AiInteraction`).

---

## ADR-0006 — WhatsApp via Evolution API (self-hosted), atrás de `WhatsAppService` {#adr-0006}

**Contexto.** Uso pessoal imediato de um casal. Meta Cloud API é oficial mas tem
fricção (app Meta, verificação, templates aprovados para proativo). Evolution API
(Baileys) usa o número real e sobe rápido.

**Decisão.** Interface `WhatsAppService` (`sendText`, `sendImage`, `verifyWebhook`,
`parseInbound`). Provider inicial `EvolutionProvider`, rodando como serviço próprio no
compose com **volume de sessão**. Idempotência por `providerMessageId`; allowlist dos 2
telefones; token no webhook.

**Alternativas.** (a) Meta Cloud API — escolhida como **destino de migração** para o
SaaS (a interface já isola). (b) Twilio — custo recorrente. (c) `whatsapp-web.js` — mais
frágil que a Evolution para operar.

**Consequências.** Risco de bloqueio pelos termos da Meta (aceito para uso pessoal).
Operação exige cuidar de reconexão/repareamento e do volume. Migrar para Meta = trocar
uma classe + configurar templates para as notificações proativas.

---

## ADR-0007 — Jobs/agendamento com pg-boss {#adr-0007}

**Contexto.** Precisamos de agendados (fechamento de fatura, recorrências, lembretes,
alertas de orçamento, resumo semanal, expiração de confirmação) e de filas leves.

**Decisão.** `pg-boss` sobre o mesmo PostgreSQL. Sem Redis. O worker roda no
mesmo processo da API na ETAPA 6 (separável depois).

**Alternativas.** (a) Redis + BullMQ — mais observável e robusto sob carga; +1 serviço
e +1 custo. Fica documentado como upgrade do SaaS. (b) `node-cron` in-process — sem
persistência nem locking entre instâncias.

**Consequências.** Uma dependência a menos. Jobs transacionais com o banco. Se o volume
crescer muito, migrar para BullMQ.

---

## ADR-0007b — Deploy em VPS com Docker Compose {#adr-0007b}

**Contexto.** O webhook do WhatsApp precisa de URL HTTPS pública e estável. Queremos
custo baixo e controle total do servidor.

**Decisão.** VPS única com `docker-compose.prod.yml`: `api`, `web` (nginx que faz o
proxy de `/api`), `postgres`, `evolution` e `redis` numa rede interna do compose. Só o
`web` publica porta; um proxy TLS do host (Caddy/nginx) fica na frente. Migrations
rodam no start da API (`prisma migrate deploy`).

**Alternativas.** (a) PaaS (Railway / Render) — menos admin de servidor, mais caro e
menos controle. (b) Vercel (web) + API gerenciada — separa a operação em dois lugares.
Nenhuma foi adotada; o deploy ficou na VPS.

**Consequências.** `evolution` precisa de volume fixo (sessão única). Deploy = `git
pull` + `docker compose up -d --build`. Backup do Postgres é responsabilidade do cron
do host.

---

## ADR-0008 — Estado de confirmação em `AiConversation` (Postgres) {#adr-0008}

**Contexto.** Operações ambíguas ou de valor alto precisam de confirmação `1/2/3`
antes de escrever. Precisamos guardar o rascunho e expirá-lo.

**Decisão.** `AiConversation` com `state`, `pendingAction` (JSONB com o Draft **já
resolvido**), `pendingExpiresAt`. Job `pending-expire` (a cada 5 min) reverte pendências
vencidas. Uma conversa ativa por `(memberId, channel)`.

**Alternativas.** (a) Redis com TTL — +1 serviço só para isso. (b) Guardar o texto cru
e re-chamar a IA na confirmação — custo e risco de reinterpretar diferente.

**Consequências.** Confirmar não gasta token de IA. Histórico de conversa fica no banco
(útil para debugging e para o SaaS).

---

## ADR-0009 — Parcelas materializadas em `Transaction` (eager) {#adr-0009}

**Contexto.** "Comprometimento futuro" e todos os relatórios precisam enxergar parcelas
como despesas datadas.

**Decisão.** Ao criar um `InstallmentPlan`, gerar as N `Installment` **e** as N
`Transaction` (uma por parcela, `date` = vencimento, `status = PENDING` até a fatura
fechar, `invoiceId` da competência). Rateio pela regra de resto (doc 02 §4.2).

**Alternativas.** Materializar a `Transaction` só quando a parcela entra na fatura —
menos linhas, mas toda agregação (dashboard, gráfico de comprometimento, limite usado)
precisa unir `Transaction` + parcelas futuras com lógica especial.

**Consequências.** Mais linhas em `Transaction` (12–24 por compra parcelada). Em troca,
uma única query cobre todos os relatórios. Editar/cancelar o plano cascateia nas
parcelas e transações associadas.

---

## ADR-0010 — Competência de fatura determinística {#adr-0010}

**Contexto.** Precisamos saber, sem ambiguidade, em qual fatura cada compra cai.

**Decisão.** Fórmula fechada a partir de `closingDay`/`dueDay` e da data da compra (doc
02 §4.3), com clamp para meses curtos. `CreditCardInvoice` única por
`(creditCardId, referenceMonth)`, criada sob demanda. `totalCents` é cache.

**Alternativas.** Deixar o usuário escolher a fatura a cada compra — atrito e erro.

**Consequências.** Regra testável isoladamente. Mudança de `closingDay` a partir de uma
data não reprocessa o passado (documentar).

---

## ADR-0011 — Consultas da IA por templates parametrizados {#adr-0011}

**Contexto.** A IA precisa responder perguntas financeiras sem gerar SQL (injeção,
alucinação, dados de outro household).

**Decisão.** `QueryTemplate` (enum) + parâmetros tipados. O backend executa agregações
Prisma pré-escritas e passa os números para a IA só **formatar** a resposta.

**Alternativas.** (a) Text-to-SQL — risco alto e difícil de auditar. (b) Expor uma API
de "consulta genérica" — reinventa SQL.

**Consequências.** Cada nova pergunta suportada = novo template + teste. Cobertura
inicial: 9 templates (doc 01 §4.3), cobre todas as perguntas do enunciado.

---

## ADR-0012 — Frontend React + Vite + Tailwind + shadcn/ui + Recharts {#adr-0012}

**Contexto.** Painel precisa ser bonito, responsivo, com dark mode padrão e gráficos
interativos, aparência de app financeiro premium.

**Decisão.** React + Vite + TypeScript; Tailwind com tokens em CSS custom properties
(estratégia `class` para dark/light); shadcn/ui (Radix — acessível); Recharts;
lucide-react; TanStack Query (estado de servidor); React Hook Form + Zod; Zustand para
tema e filtros globais.

**Alternativas.** (a) Next.js — SSR desnecessário para um painel autenticado; +
complexidade de deploy. (b) MUI/Chakra — mais pesado e opinativo visualmente. (c)
Chart.js no front — Recharts integra melhor com React/estado.

**Consequências.** Build estático simples (nginx ou Cloudflare Pages). Componentes de
UI ficam no repo (shadcn copia o código), fácil de customizar o tema.

---

## ADR-0013 — Gráfico para WhatsApp com chartjs-node-canvas {#adr-0013}

**Contexto.** Algumas respostas ficam melhores como imagem (donut de categorias, etc.).

**Decisão.** `chartjs-node-canvas` (Chart.js sobre `@napi-rs/canvas`) renderiza PNG no
backend; enviado via `WhatsAppService.sendImage`.

**Alternativas.** (a) Playwright/headless Chrome renderizando um componente Recharts —
imagem idêntica ao web, mas +150 MB de Chromium e mais lento. (b) QuickChart hospedado —
dependência externa e dados saindo do backend.

**Consequências.** Estilo do gráfico do WhatsApp é definido separado do Recharts do web
(pequena duplicação de tema aceitável).

---

## ADR-0014 — Segurança {#adr-0014}

**Contexto.** App de dinheiro, com webhook público e chave de IA. Mesmo pessoal, precisa
de boas práticas.

**Decisão.** Argon2id; JWT access 15 min + refresh rotativo com detecção de reuso
(hash em `Session`, `familyId`); cookie `httpOnly`/`SameSite=Lax` no web; Helmet; CORS
allowlist; `@nestjs/throttler` (global + estrito em auth/webhook); allowlist de
telefones + token/assinatura no webhook + idempotência; Zod em toda fronteira; Prisma
parametrizado + IA sem SQL; `AuditLog` para mutações de dinheiro; segredos só no
backend; exception filter sem vazar stack; `pg_dump` agendado.

**Alternativas.** bcrypt (ok, Argon2id é preferível); sessão server-side pura (mais
estado; JWT+refresh é suficiente aqui).

**Consequências.** Um pouco mais de código de infraestrutura de auth. Base pronta para
multiusuário do SaaS.

---

## ADR-0015 — Observabilidade e testes {#adr-0015}

**Contexto.** Precisamos diagnosticar erros de IA/webhook/jobs e não regredir regras
financeiras.

**Decisão.** `pino` estruturado + request id; exception filter → envelope de erro
normalizado; Sentry opcional (`SENTRY_DSN`). Testes: Vitest (unit — money/date, rateio,
competência, resolvers de hint, templates), Nest testing + Supertest (integração da API
contra Postgres de teste via testcontainers), Playwright (2–3 fluxos felizes E2E:
login→dashboard, criar transação manual, criar cartão).

**Consequências.** Regras críticas (rateio, competência, orçamento) cobertas por teste
desde a ETAPA 2. Custo de CI moderado (Postgres efêmero).
