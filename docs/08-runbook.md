# 08 — Runbook operacional

Procedimentos rápidos para operar o RT Finance em produção (Fly.io).

## Logs e status

```bash
fly logs -a rt-finance-api
fly status -a rt-finance-api
fly ssh console -a rt-finance-api
```

`GET https://rt-finance-api.fly.dev/health` → `{ "status": "ok", "db": true }`.

## WhatsApp caiu / desconectou

Sintoma: mensagens não chegam; `/api/whatsapp/webhook` sem tráfego.

```bash
E=https://rt-finance-evolution.fly.dev ; K=<EVOLUTION_API_KEY>
curl $E/instance/connectionState/rtfinance -H "apikey: $K"
# se != "open":
curl $E/instance/connect/rtfinance -H "apikey: $K"     # novo QR — reparear
```

Se a instância sumiu (raro): recriar (`/instance/create`) + reconfigurar o webhook
(`/webhook/set/rtfinance`) — ver `docs/ETAPA-7.md`. O volume `evolution_data` normalmente
preserva a sessão entre restarts; se o volume foi perdido, reparear.

## Reprocessar uma fatura de cartão

O total da fatura é cache. Para forçar recálculo, rode o job de fechamento (idempotente)
ou dispare pelo painel:

```bash
# via API (autenticado): não há endpoint público de recálculo; usar prisma studio
fly ssh console -a rt-finance-api
  cd /app/apps/api && npx prisma studio   # ajustar manualmente se necessário
```

Ou aguardar o job diário `5 3 * * *` (`SchedulerService.closeInvoices`), que recalcula
`totalCents` de toda fatura `OPEN` cujo fechamento passou.

## Rodar os jobs manualmente

Os jobs são cron in-process. Para forçar agora, use os endpoints equivalentes
(autenticado como membro do household):

- Gerar recorrências: `POST /api/recurring-expenses/generate`
- Checar orçamentos: `POST /api/budgets/check`

Fechamento de fatura / lembretes / resumo semanal: só via cron (ou reiniciar a máquina
perto do horário). Se precisar de gatilho manual, adicionar um endpoint protegido.

## Seed / criar usuários

```bash
fly ssh console -a rt-finance-api
  cd /app/apps/api
  SEED_OWNER_EMAIL=... SEED_OWNER_PASSWORD=... SEED_PARTNER_EMAIL=... SEED_PARTNER_PASSWORD=... \
  node --import tsx prisma/seed.ts
```

O seed é **idempotente**: se já existe household, não faz nada. Para um segundo casal
(SaaS), criar outro household via API/painel (a modelagem já suporta).

## Trocar o modelo de IA

```bash
fly secrets set -a rt-finance-api NVIDIA_MODEL="<outro-modelo-instruct>"
# ou trocar de provedor implementando AIService e ajustando AI_PROVIDER
```

Sem `NVIDIA_API_KEY`, a API cai automaticamente no `MockAiProvider` (regras locais).

## Rotacionar segredos

```bash
fly secrets set -a rt-finance-api JWT_ACCESS_SECRET="$(openssl rand -base64 48)" \
                                   JWT_REFRESH_SECRET="$(openssl rand -base64 48)"
```

Isso invalida todos os access tokens na hora e os refresh tokens no próximo uso
(assinatura muda) — todos precisam logar de novo. Trocar a senha de um usuário pelo
painel já revoga as sessões dele.

## Backup / restore

```bash
# backup
fly mpg connect -a rt-finance-db          # abre psql; ou pegar a URL e:
pg_dump "$DATABASE_URL" -Fc -f rtfinance-$(date +%F).dump
# restore (banco limpo)
pg_restore -d "$NEW_DATABASE_URL" --clean --if-exists rtfinance-YYYY-MM-DD.dump
cd apps/api && pnpm exec prisma migrate deploy
```

## Rollback de deploy

```bash
fly releases -a rt-finance-api
fly deploy -a rt-finance-api --image <imagem-da-release-anterior>
```

Migrations são forward-only; um rollback de código que dependa de schema antigo exige
uma migration de compensação. Preferir corrigir para frente.
