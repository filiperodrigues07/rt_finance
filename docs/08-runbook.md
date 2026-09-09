# 08 — Runbook operacional

Procedimentos rápidos para operar o RT Finance em produção (VPS + Docker Compose).

> Comandos rodam no diretório do stack de produção, com `docker-compose.prod.yml` e
> `.env.prod` (ver `docs/05-deploy.md`). Abreviação usada abaixo:
> `dc = docker compose -f docker-compose.prod.yml --env-file .env.prod`.

## Logs e status

```bash
dc ps
dc logs -f api
dc exec api sh
```

`GET https://<dominio>/health` → `{ "status": "ok", "db": true }` (sem prefixo `/api`).

## WhatsApp caiu / desconectou

Sintoma: mensagens não chegam; `/api/whatsapp/webhook` sem tráfego.

```bash
K=<EVOLUTION_API_KEY>
dc exec api sh -c "wget -qO- --header=\"apikey: $K\" http://evolution:8080/instance/connectionState/rtfinance"
# se != "open":
dc exec api sh -c "wget -qO- --header=\"apikey: $K\" http://evolution:8080/instance/connect/rtfinance"  # novo QR — reparear
```

Se a instância sumiu (raro): recriar (`/instance/create`) + reconfigurar o webhook
(`/webhook/set/rtfinance`) — ver `docs/ETAPA-7.md`. O volume da Evolution normalmente
preserva a sessão entre restarts; se o volume foi perdido, reparear.

## Reprocessar uma fatura de cartão

O total da fatura é cache. Para forçar recálculo, aguarde o job diário `5 3 * * *`
(`SchedulerService.closeInvoices`), que recalcula `totalCents` de toda fatura `OPEN`
cujo fechamento passou. Ajuste pontual:

```bash
dc exec postgres psql -U rtfinance rtfinance
```

## Rodar os jobs manualmente

Os jobs são cron in-process. Para forçar agora, use os endpoints equivalentes
(autenticado como membro do household):

- Gerar recorrências: `POST /api/recurring-expenses/generate`
- Checar orçamentos: `POST /api/budgets/check`

Fechamento de fatura / lembretes / resumo semanal: só via cron (ou reiniciar o
container `api` perto do horário). Se precisar de gatilho manual, adicionar um endpoint
protegido.

## Seed / criar usuários

```bash
dc exec api pnpm --filter @rt-finance/api db:seed
```

O seed é **idempotente**: se já existe household, não faz nada. Para um segundo casal,
criar outro household pela tela **Admin** (a modelagem já suporta).

## Trocar o modelo de IA

Edite `NVIDIA_MODEL` (ou `AI_PROVIDER`) no `.env.prod` e recrie a API:

```bash
dc up -d api
```

Sem `NVIDIA_API_KEY`, a API cai automaticamente no `MockAiProvider` (regras locais).

## Rotacionar segredos

Edite `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` no `.env.prod` e recrie a API:

```bash
dc up -d api
```

Isso invalida todos os access tokens na hora e os refresh tokens no próximo uso
(assinatura muda) — todos precisam logar de novo. Trocar a senha de um usuário pelo
painel já revoga as sessões dele.

## Backup / restore

```bash
# backup (agende no cron do host)
dc exec -T postgres pg_dump -U rtfinance rtfinance | gzip > rtfinance-$(date +%F).sql.gz

# restore (banco limpo)
gunzip -c rtfinance-YYYY-MM-DD.sql.gz | dc exec -T postgres psql -U rtfinance rtfinance
dc exec api pnpm --filter @rt-finance/api exec prisma migrate deploy
```

## Rollback de deploy

Volte o repo para o commit anterior e recrie (as imagens vêm do registry por tag/latest):

```bash
git reset --hard <commit-anterior>
dc pull && dc up -d
```

Migrations são forward-only; um rollback de código que dependa de schema antigo exige
uma migration de compensação. Preferir corrigir para frente.
