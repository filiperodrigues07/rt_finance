# ETAPA 5 — IA: interpretação financeira (concluída)

Linguagem natural no WhatsApp vira lançamento ou consulta, com validação e confirmação.
Testado ponta a ponta com o modelo **`nvidia/nemotron-3-super-120b-a12b`** (NVIDIA NIM).

## Modelo escolhido

Consultei `/v1/models` da conta e testei candidatos com um prompt real de extração de
intenção:

| Modelo | JSON limpo? | Latência | Nota |
|---|---|---|---|
| **nvidia/nemotron-3-super-120b-a12b** | ✅ respeita `response_format:json_object` | ~3–8 s | **escolhido** |
| deepseek-ai/deepseek-v4-flash | — | — | 529 "overloaded" no teste |
| mistralai/mistral-large-2-instruct | — | — | 404 (não disponível na conta) |
| nvidia/nemotron-3.5-lightning-30b | ❌ despeja raciocínio | ~9 s | ignora o formato JSON |
| openai/gpt-oss-20b | ✅ | ~11 s | mais lento |

Truque necessário: o system prompt começa com `detailed thinking off` (convenção
Nemotron) para suprimir o `<think>` e devolver só o JSON.

> Trocar de modelo = mudar `NVIDIA_MODEL` no `.env`. Trocar de provedor (OpenAI, Gemini,
> local) = nova classe implementando `AIService`.

## Componentes (`apps/api/src/modules/ai/`)

| Arquivo | Papel |
|---|---|
| `ai.types.ts` | `AIService` (classe abstrata / token de DI): `interpret(text, ctx) -> { result: AiResult, meta }` |
| `providers/nvidia.provider.ts` | Chamada OpenAI-compatível (`POST {base}/chat/completions`), `response_format:json_object`, `temperature 0.1`; **1 retry com backoff** em 429/5xx/timeout; **1 tentativa de reparo** se o JSON não bater no schema; degrada para `unknown` (nunca derruba o webhook). Chave só no backend. |
| `providers/mock.provider.ts` | Interpretador por regras (regex) — sem rede, sem custo. Usado com `AI_PROVIDER=mock` ou quando falta `NVIDIA_API_KEY`. Cobre despesa/receita/parcelamento/consultas/confirmação. |
| `prompts.ts` | Monta o system prompt: injeta data de hoje + fuso, membros, categorias, cartões e contas do household, resumo da pendência, os 8 formatos de `AiResult`, descrições dos 9 templates e 4 few-shots. |
| `intent-parser.ts` | `extractJson` (tira ```` ``` ````, `<think>`, texto ao redor) + `AiResult.safeParse` (Zod, do `@rt-finance/shared`). |
| `hint-resolver.service.ts` | Resolve os *hints* de texto da IA para IDs reais: categoria (exato → parcial → "Outros"), cartão (nome/banco/final), membro ("eu" → remetente; nome → membro), pagamento (cartão citado → dinheiro → conta padrão). |
| `query-executor.service.ts` | Executa os 9 templates com agregações Prisma tipadas e formata a resposta em pt-BR (números exatos, sem passar de volta pela LLM). |
| `ai-conversation.service.ts` | Estado por `(membro, canal)` em `AiConversation`: `IDLE / AWAITING_CONFIRMATION / AWAITING_EDIT`, `pendingAction` (rascunho já resolvido, com IDs), expiração **lazy** na leitura (sem job). Grava telemetria em `AiInteraction`. |
| `finance-assistant.service.ts` | Orquestrador chamado pelo `MessageRouter`: contexto → `interpret` → telemetria → roteia por `kind`. |

## Fluxo

```
texto → FinanceAssistant.handle
  carrega AiConversation (+ expira pendência vencida)
  monta contexto (categorias/cartões/membros/contas/histórico/pendência)
  AIService.interpret → AiResult (Zod)   → grava AiInteraction
  SE havia pendência:
     confirmation_reply YES → efetiva (cria transação/parcelamento) → ✅
     NO  → descarta → "Ok, cancelei"
     EDIT/correção → reinterpreta como nova mensagem
     outra intenção clara → segue; ruído → "responda 1/2/3"
  SENÃO, por kind:
     create_expense/income:
        resolve categoria+membro+pagamento → monta CreateTransactionBody
        confiança ≥ 0.7 E não-ambíguo E valor < AI_CONFIRM_THRESHOLD_CENTS
           → grava direto → "✅ Despesa registrada!"
        senão → guarda pendingAction → card "🧾 ... 1️⃣ Sim 2️⃣ Não 3️⃣ Editar"
        (ambíguo + clarification → devolve a pergunta)
     create_installment_purchase:
        resolve cartão (obrigatório; pergunta se faltar) → competência da 1ª parcela
        SEMPRE confirma (operação importante)
     create_recurring → aviso ("ETAPA 6")
     query → resolve hints → QueryExecutor → texto (+ nota de gráfico no painel se wantsChart)
     help / unknown → textos de ajuda
```

Confirmar/cancelar **não** gasta token de IA — o `pendingAction` guarda o rascunho pronto.

## Verificado (WhatsApp → NVIDIA → banco → resposta)

| Mensagem | Resultado |
|---|---|
| "gastei 85 no mercado" | ✅ registrado direto — 🛒 Mercado, Conta Corrente |
| "gastei 32 no uber" | ✅ registrado direto — 🚗 Transporte |
| "comprei uma TV de 2400 em 12x no Nubank" | 🧾 card de confirmação (12× R$ 200,00, 1ª parcela fatura de setembro) → "1" → ✅ compra parcelada registrada |
| "paguei 890 de aluguel" | 🧾 confirmação (> limite) — 🏠 Casa → "2" → "Ok, cancelei" |
| "recebi 4500 de salário" | 🧾 confirmação — 💰 Salário → "1" → ✅ receita registrada |
| "quanto gastamos esse mês?" | 💸 total do período |
| "quanto a Julia gastou?" | 👤 Julia gastou R$ 0,00 |
| "quais foram as maiores despesas?" | 🔎 top 5 |
| "quanto temos de contas a pagar?" | 💳 faturas em aberto + vencimentos |
| "quanto já estou comprometido nos próximos meses?" | 📅 parcelas por mês (12 meses) |
| "qual a capital da França?" | "Não entendi 😅" + exemplos |

Telemetria por chamada em `AiInteraction`: intent, confidence, ~1.5k prompt tokens,
~200 completion, 2–5 s.

## Config

```
AI_PROVIDER=nvidia                              # ou "mock"
NVIDIA_API_KEY=nvapi-...                        # só no backend
NVIDIA_MODEL=nvidia/nemotron-3-super-120b-a12b
AI_CONFIRM_THRESHOLD_CENTS=50000               # acima disso, sempre confirma
PENDING_CONFIRMATION_TTL_MINUTES=30
```

## Pendências para a ETAPA 6

- `create_recurring` de fato criando `RecurringExpense`.
- Geração de gráfico como imagem no WhatsApp (`wantsChart`).
- `REMAINING_BUDGET` usando orçamentos reais (hoje devolve o resultado do mês).
- Job de expiração de pendências (hoje é lazy na leitura — suficiente, mas um job
  avisaria o usuário que a confirmação expirou).
