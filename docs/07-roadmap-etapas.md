# 07 — Roadmap das ETAPAS 2 a 7

Cada ETAPA termina com: arquivos criados/modificados listados, instruções de execução
local, e o que passou a funcionar de ponta a ponta. **Antes de implementar qualquer
funcionalidade importante, a decisão técnica é explicada e, se houver opção melhor, ela
é sugerida** (regra 30 do enunciado).

---

## ETAPA 2 — Backend: fundação + domínio financeiro

**Objetivo:** API rodando com banco, auth e os módulos financeiros centrais.

- Scaffolding do monorepo: `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`,
  `packages/{shared,tsconfig,eslint-config}`, `apps/api`.
- `packages/shared`: `money.ts`, `date.ts`, `intents.ts` (`AiResult`), schemas Zod dos
  DTOs, `constants` (QueryTemplate, categorias-sistema).
- `apps/api`: bootstrap NestJS+Fastify, `env.schema.ts`, `PrismaService` (+ extensão de
  escopo por `householdId`), `logger`, exception filter, zod pipe, throttler, Helmet.
- Prisma: `schema.prisma` (doc 02), primeira migration, `seed.ts` (doc 02 §5).
- Módulos: `auth` (login, refresh rotativo, logout, guard, `@CurrentUser`/`@CurrentHousehold`),
  `households`, `users`, `categories`, `accounts`, `transactions` (regras: valor > 0,
  meio de pagamento, transferência como par), `credit-cards`, `invoices` (competência +
  fechamento manual), `installments` (plano + parcelas + materialização + rateio).
- `docker-compose.yml` (postgres + evolution) para o ambiente local.
- Testes unit: `money`, `date`, `splitInstallments`, `invoiceCompetence`. Integração:
  auth + CRUD de transações.

**Funciona ao fim:** criar usuários/household (seed), logar, cadastrar cartões e
categorias, lançar despesas/receitas e compras parceladas via REST, consultar faturas.

---

## ETAPA 3 — Frontend: painel web

**Objetivo:** painel utilizável para as operações do dia a dia.

- `apps/web`: Vite + Tailwind + tokens de tema (dark padrão + light), shadcn/ui,
  `api-client` (refresh transparente), TanStack Query, layout (sidebar desktop →
  bottom nav mobile), theme toggle.
- Telas: `login`; `dashboard` (5 cards + gráficos — dados via `reports`); `transactions`
  (tabela: criar/editar/excluir/duplicar/pesquisar/filtrar + formulário de lançamento
  manual com todos os campos do enunciado §15); `cards` (limites, faturas, parcelas
  futuras); `categories` (CRUD nome/emoji/cor); `users` (membros); `settings` (tema,
  preferências).
- Gráficos (Recharts): gastos por categoria (donut), evolução mensal (linha:
  receitas/despesas/saldo), gastos por pessoa, gastos por cartão, comprometimento
  futuro.
- Filtros globais (período/mês/ano/categoria/usuário/cartão/tipo) que atualizam todos
  os gráficos.
- Estados: skeleton loading, estados vazios, feedback de erro/sucesso.
- Decisão pendente: nginx próprio vs CDN estática para servir o build.
- E2E Playwright: login→dashboard, criar transação, criar cartão.

**Funciona ao fim:** casal usa o painel para tudo que hoje seria feito "no sistema",
sem depender do WhatsApp.

---

## ETAPA 4 — WhatsApp: webhook e mensageria

**Objetivo:** receber e responder mensagens (ainda sem IA — roteamento e eco
estruturado).

- `WhatsAppService` + `EvolutionProvider` (rotas/campos verificados contra a doc da
  versão fixada da imagem Evolution).
- `WhatsappController` `POST /whatsapp/webhook`: `verifyWebhook` (token), dedup por
  `providerMessageId`, persistência `WhatsappMessage`, resolução de membro pela
  allowlist.
- `MessageRouter` (esqueleto): sem IA ainda, reconhece comandos simples e responde;
  `formatters.ts` (textos pt-BR: ✅ despesa, 🧾 confirmação, 📊 resumo).
- serviço `evolution` no compose + volume; script de criação de instância e
  configuração de webhook; procedimento de pareamento (doc 05).
- Rate limit específico do webhook.

**Funciona ao fim:** mensagem do casal chega ao backend, é identificada e recebe
resposta formatada; base pronta para plugar a IA.

---

## ETAPA 5 — IA: interpretação financeira

**Objetivo:** linguagem natural vira lançamento/consulta com validação e confirmação.

- `AIService` + `NvidiaProvider` (endpoint OpenAI-compatível da NVIDIA NIM; `NVIDIA_MODEL`
  definido aqui com o usuário). `response_format` JSON; reparo + retry; `unknown` no
  pior caso.
- `prompts/` (system + few-shots), contexto injetado (categorias/cartões/membros/data/
  histórico/pendingAction).
- `intent-parser.ts`: valida `AiResult` (Zod).
- `hint-resolver.service.ts`: categoria (exato→trigram→Outros), cartão, membro,
  pagamento, data.
- `query-templates/`: os 9 templates → agregações Prisma; `answerQuery` formata.
- `AiConversation`: máquina de estados `IDLE/AWAITING_CONFIRMATION/AWAITING_EDIT`;
  `pendingAction`; job `pending-expire`.
- Limite `AI_CONFIRM_THRESHOLD_CENTS`; regra "confiança alta + não-ambíguo + abaixo do
  limite → grava direto, senão confirma".
- `AiInteraction` (telemetria).
- Testes: parser com payloads reais/sintéticos; resolvers; cada template; máquina de
  estados.

**Funciona ao fim:** "Gastei 85 no mercado", "Comprei TV de 2.400 em 12x no Nubank",
"Quanto gastamos esse mês?" — todos ponta a ponta pelo WhatsApp, com confirmação nas
operações importantes.

---

## ETAPA 6 — Funcionalidades avançadas

**Objetivo:** recorrências, metas, orçamentos, notificações, relatórios, gráfico no
WhatsApp.

- `recurring-expenses` + job `recurring-generate` (horizonte configurável, `RecurringRun`
  anti-duplicação, valor variável pergunta no WhatsApp).
- `budgets` + `budget-check` (alertas `THRESHOLD`/`EXCEEDED`, hook no create de
  transação).
- `goals` + `GoalContribution` + milestones.
- `notifications` + `NotificationPreference`; jobs `invoice-close`, `due-reminders`,
  `weekly-summary`; envio pelos canais WEB/WHATSAPP.
- `charts` (`chartjs-node-canvas`) + integração no `MessageRouter` para
  `QueryRequest.wantsChart`.
- `reports`: exportação CSV/XLSX/PDF; telas `bills`, `recurrences`, `goals`, `reports`
  no web.
- Decisão pendente: worker de jobs no mesmo processo vs serviço separado.

**Funciona ao fim:** todos os módulos do enunciado ativos; alertas chegando; "me mostra
os gastos do mês" responde com gráfico.

---

## ETAPA 7 — Testes, segurança, otimização e deploy

**Objetivo:** produção.

- Cobertura de testes das regras críticas; E2E dos fluxos principais; carga leve no
  webhook.
- Checklist de segurança (doc 05 §7): `env.schema` obrigatório, cookies `Secure`, CORS,
  rate limits, mascaramento de PII nos logs, headers.
- Performance: índices revisados sob dados reais, N+1 no `reports`, cache curto de
  agregações do dashboard.
- `docker-compose.prod.yml`, `Dockerfile`s, `prisma migrate deploy` no start, health checks.
- Evolution API em produção + pareamento + volume + snapshot.
- Backups (`backup.job`) + procedimento de restore testado.
- Observabilidade: Sentry, alerta no job de fechamento de fatura.
- `README` de execução local completo + `docs/` de operação (runbook: reconectar
  WhatsApp, reprocessar fatura, rodar seed).

**Funciona ao fim:** RT Finance no ar, casal usando WhatsApp + painel; base pronta para
evoluir para SaaS (onboarding de novos households, migração para Meta Cloud API,
Redis/BullMQ se necessário).

---

## Itens que dependem de você ao longo do caminho

| Quando | O que preciso de você |
|---|---|
| ETAPA 2 | Nomes/emails/senhas iniciais de Filipe e esposa para o seed (via `.env`), e os 2 telefones em E.164 |
| ETAPA 4 | Aparelho/linha para parear a Evolution API; versão da imagem Evolution que prefere fixar |
| ETAPA 5 | `NVIDIA_API_KEY` e o nome do modelo disponível na sua conta NVIDIA |
| ETAPA 7 | VPS (host, acesso SSH), destino dos backups, `SENTRY_DSN` (opcional) |
