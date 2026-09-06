# ETAPA 6 — Funcionalidades avançadas (concluída)

Recorrências, orçamentos, metas, notificações, jobs agendados, gráfico no WhatsApp e
export CSV. Verificado ponta a ponta (REST + WhatsApp com provider `console`).

## Backend — módulos novos

| Módulo | Endpoints | Regras |
|---|---|---|
| `recurring-expenses` | `GET/POST/PATCH/DELETE /recurring-expenses`, `POST /recurring-expenses/generate` | frequência WEEKLY/MONTHLY/YEARLY + `interval`; `generateDue()` cria `Transaction` + `RecurringRun` das ocorrências dentro do horizonte (`RECURRING_HORIZON_MONTHS`), **idempotente** por `(recurringExpenseId, period)`; `autoPost` → `CONFIRMED`/`PENDING`; valor nulo = variável (registra a ocorrência sem transação); despesa em cartão anexa à fatura |
| `budgets` | `GET/POST /budgets`, `POST /budgets/check`, `DELETE /budgets/:id` | teto mensal por categoria (opcional por membro); `list` devolve `spentCents`/`percent`; `checkAndNotify()` dispara `BUDGET_THRESHOLD` (≥ threshold, default 80%) e `BUDGET_EXCEEDED` (> 100%), 1× por orçamento/mês (dedupe) |
| `goals` | `GET/POST/PATCH/DELETE /goals`, `POST /goals/:id/contributions`, `DELETE /goals/:id/contributions/:cid` | `currentCents` = Σ aportes; ao cruzar 25/50/75/100% → `GOAL_MILESTONE`; 100% → `status = ACHIEVED` |
| `notifications` | `GET /notifications`, `GET /notifications/unread-count`, `GET/PATCH /notifications/preferences`, `POST /notifications/read-all`, `PATCH /notifications/:id/read`, `PATCH /notifications/:id/dismiss` | `push()` respeita `NotificationPreference`, faz dedupe e **entrega no WhatsApp** (canal `BOTH`/`WHATSAPP`) para os telefones dos membros |
| `charts` | — | `ChartRendererService`: SVG desenhado à mão → PNG via `sharp` (sem headless Chrome). `donut()` e `bars()` |
| `scheduler` | — | `@nestjs/schedule` (cron em processo, sem Redis/pg-boss — suficiente p/ 1 instância). Jobs abaixo. Guardado por `JOBS_ENABLED` |

### Jobs (`SchedulerService`)

| Cron | Job |
|---|---|
| `5 3 * * *` | fecha faturas cuja data de fechamento passou (`OPEN→CLOSED`, parcelas `SCHEDULED→BILLED`), marca `OVERDUE` as vencidas não pagas, e dispara `INVOICE_DUE` (leadDays) |
| `0 4 * * *` | gera lançamentos de recorrências |
| `0 8 * * *` | verifica orçamentos e dispara alertas |
| `*/30 * * * *` | expira confirmações pendentes vencidas (`AiConversation`) |
| `0 9 * * 1` | resumo semanal (`WEEKLY_SUMMARY`) |

> Decisão: `@nestjs/schedule` no lugar de pg-boss (ADR-0007). Cron em processo é mais
> simples e cobre uma instância Fly. Migrar para pg-boss/BullMQ se houver múltiplas
> réplicas. Alertas de orçamento rodam no job diário (+ botão "Verificar alertas" no
> painel), não a cada transação — evita um ciclo de dependência entre módulos.

## IA / WhatsApp

- `create_recurring` agora **cria a recorrência** de fato ("assina a Netflix de 39,90
  todo mês dia 15" → conta fixa criada).
- `query` com `wantsChart` → `FinanceAssistant.buildChart` gera PNG (donut de categorias
  ou barras de comprometimento futuro) e o `MessageRouter` envia como imagem
  (`WhatsappMessage` tipo `IMAGE`).
- `REMAINING_BUDGET` continua devolvendo o resultado do mês (orçamentos reais no texto
  ficam para um refino).

## Reports

- `GET /api/reports/transactions.csv?from&to` — CSV com BOM + separador `;` + decimais
  pt-BR (abre direto no Excel).

## Frontend — telas novas

| Rota | Conteúdo |
|---|---|
| `/recorrencias` | lista de contas fixas com valor/frequência/dia, criar/editar, ativar-desativar, botão **Gerar lançamentos** |
| `/metas` | cards com barra de progresso, criar meta, **aportar** (com histórico), troféu ao concluir |
| `/relatorios` | seletor de mês · **orçamentos por categoria** com barra (verde/âmbar/vermelho) + criar/remover · **Verificar alertas** · **Exportar CSV** |
| sino no topo | `NotificationsBell` — contador de não lidas, lista, marcar lida / dispensar, marcar todas |

## Verificado

- recorrência "Internet 120 dia 10" → generate → 3 lançamentos (ago/set/out) ✅
- orçamento Mercado 30000 → status 57% ✅; > 80% dispara `BUDGET_THRESHOLD`
- meta "Viagem" 1M, aporte 700k → milestones 25% e 50% notificados ✅
- WhatsApp: "gastos do mês com gráfico" → imagem PNG; "assina a Netflix…" → conta fixa criada
- CSV export com BOM/`;`/vírgula decimal ✅
- `pnpm build` verde nos 3 pacotes; DI sem ciclos; scheduler registrado.

## Pendências para a ETAPA 7

- Export XLSX/PDF (hoje só CSV).
- Alerta de orçamento em tempo real no create de transação (hoje: job diário + botão).
- Testes de integração dos jobs e dos novos módulos.
- Code-splitting do bundle web (~900 kB).
