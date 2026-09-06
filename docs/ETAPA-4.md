# ETAPA 4 — WhatsApp: webhook e mensageria (concluída)

Loop completo WhatsApp → Backend → resposta, **ainda sem IA**. A interpretação de
linguagem natural entra na ETAPA 5; aqui o roteador reconhece alguns comandos e já
responde com dados reais (`saldo`, `resumo`).

Verificado localmente com o provider `console` (simula o envio): 5 mensagens de entrada
processadas, 5 respostas geradas, reentrega do mesmo `providerMessageId` ignorada
(idempotência), tudo persistido em `WhatsappMessage`.

## Componentes (`apps/api/src/modules/whatsapp/`)

| Arquivo | Papel |
|---|---|
| `whatsapp.types.ts` | `InboundMessage` (formato normalizado) e a **classe abstrata `WhatsAppService`** — contrato/token de DI: `sendText`, `sendImage`, `verifyWebhook`, `parseInbound` |
| `providers/evolution.provider.ts` | Provider real da **Evolution API v2** (`POST /message/sendText/{instance}`, `POST /message/sendMedia/{instance}`, header `apikey`; parsing do evento `messages.upsert`). Rotas/campos conferidos contra a doc da v2 — revisar ao trocar a versão da imagem |
| `providers/console.provider.ts` | Provider de dev: não chama nada, só loga o que enviaria. Reusa o parser do Evolution. Selecionado com `WHATSAPP_PROVIDER=console` |
| `phone.ts` | `toE164BR`, `phonesMatch` (tolera o 9º dígito do celular e o código do país) |
| `formatters.ts` | Textos pt-BR: ajuda, não autorizado, fallback, `saldo`, `resumo`, `quem sou eu` |
| `message-router.service.ts` | Orquestra: persiste entrada (idempotente), checa allowlist, resolve o membro pelo telefone, roteia o comando, envia a resposta e persiste a saída |
| `whatsapp.controller.ts` | `POST /api/whatsapp/webhook` (público, rate-limit próprio, **sempre 200** para evitar reenvio) e `GET /api/whatsapp/webhook` (challenge) |

Seleção de provider no `whatsapp.module.ts` via `useFactory` lendo `WHATSAPP_PROVIDER`.

## Fluxo do webhook

```
POST /api/whatsapp/webhook
  → verifyWebhook(headers, query)         # token compartilhado (x-webhook-token / ?token=)
  → parseInbound(body)                    # ignora grupos, broadcast, fromMe, eventos != messages.upsert
  → para cada InboundMessage:
      persistInbound()                    # WhatsappMessage INBOUND; P2002 (dup) → ignora
      isAllowed(fromPhone)?               # WHATSAPP_ALLOWLIST (vazio = libera, só dev)
      resolveSender(fromPhone)            # HouseholdMember cujo user.phoneE164 casa (phonesMatch)
      roteia:
        ""/ajuda/oi/menu/start  → ajuda
        ping                    → pong
        id / quem sou eu        → identidade
        saldo                   → ReportsService.dashboard → texto
        resumo                  → ReportsService.dashboard → resumo do mês
        (qualquer outra)        → fallback ("IA chega na ETAPA 5")
      sendText() + WhatsappMessage OUTBOUND
  → { ok: true }  (200)
```

Erros no processamento são logados e respondidos com uma mensagem genérica — o webhook
nunca devolve 5xx (evita tempestade de reentregas).

## Config

`.env` (ver `apps/api/.env.example`):

```
WHATSAPP_PROVIDER=console            # ou "evolution"
EVOLUTION_BASE_URL=http://localhost:8080
EVOLUTION_API_KEY=...
EVOLUTION_INSTANCE=rtfinance
WHATSAPP_WEBHOOK_TOKEN=...           # header x-webhook-token OU ?token= no webhook
WHATSAPP_ALLOWLIST=+55XXXXXXXXXXX,+55YYYYYYYYYYY
```

O telefone de cada pessoa fica em `User.phoneE164` (edite em Configurações no painel ou
no seed via `SEED_OWNER_PHONE` / `SEED_PARTNER_PHONE`).

## Subir a Evolution API (dev)

```bash
docker compose --profile whatsapp up -d evolution     # sobe a imagem v2.1.1 + volume
# criar a instância
curl -X POST http://localhost:8080/instance/create \
  -H 'apikey: dev-evolution-key' -H 'content-type: application/json' \
  -d '{"instanceName":"rtfinance","integration":"WHATSAPP-BAILEYS"}'
# configurar o webhook para apontar para a API (túnel se local: cloudflared/ngrok)
curl -X POST http://localhost:8080/webhook/set/rtfinance \
  -H 'apikey: dev-evolution-key' -H 'content-type: application/json' \
  -d '{"webhook":{"enabled":true,"url":"https://SEU-TUNEL/api/whatsapp/webhook","events":["MESSAGES_UPSERT"],"headers":{"x-webhook-token":"SEU_TOKEN"}}}'
# parear
curl http://localhost:8080/instance/connect/rtfinance -H 'apikey: dev-evolution-key'   # devolve o QR
```

> Os nomes de rota/campo acima são da Evolution v2.1.x. Ao fixar outra versão da imagem,
> confira a doc dessa versão antes de usar (não assuma).

## Testar sem Evolution (provider `console`)

```bash
curl -X POST http://localhost:3333/api/whatsapp/webhook -H 'content-type: application/json' -d '{
  "event":"messages.upsert","instance":"rtfinance",
  "data":{"key":{"remoteJid":"5511987654321@s.whatsapp.net","fromMe":false,"id":"MSG1"},
          "pushName":"Filipe","messageTimestamp":1788000000,
          "message":{"conversation":"resumo"}}}'
# a resposta aparece no log da API: "WhatsApp(console) → +5511987654321  📊 *Resumo de ...*"
```

## Pendências para etapas seguintes

- ETAPA 5: `MessageRouter` chama `AIService.interpret` antes do fallback; máquina de
  estados de confirmação em `AiConversation`; templates de consulta.
- Verificação de assinatura HMAC quando/se migrar para a Meta Cloud API (hoje é token
  compartilhado, suficiente para a Evolution).
