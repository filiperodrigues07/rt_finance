# 05 — Deploy

Duas opções: **VPS + Docker Compose** (implementada — arquivos prontos no repo) ou
**Fly.io** (plano, mais abaixo).

> **Antes de qualquer deploy, leia o [`SECURITY.md`](../SECURITY.md)** e cumpra o
> checklist: rotacionar `NVIDIA_API_KEY` (a de dev foi exposta), segredos JWT fortes,
> `AUTH_COOKIE_SECURE=true` + TLS, `WEB_ORIGIN` real, `trustProxy` no IP do proxy.

---

## 0. VPS + Docker Compose (recomendado para o uso atual)

Serve o painel e a API no mesmo domínio; Postgres e Evolution ficam numa rede
interna. Você coloca um proxy TLS (Caddy/Traefik/nginx do host) na frente.

**Arquivos:** `docker-compose.prod.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile`,
`apps/web/nginx.conf.template`, `deploy/init-evolution-db.sql`, `.env.prod.example`.
Inclui `redis` (cache da sessão do Baileys) — sobe junto.

```bash
# 1. no servidor, com Docker + Docker Compose instalados
git clone <repo> rt-finance && cd rt-finance

# 2. configuração
cp .env.prod.example .env.prod
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET
nano .env.prod            # preencha domínio, senhas, chave NVIDIA nova, etc.

# 3. subir (build + migrate deploy automático no start da API)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 4. criar o 1º household (super-admin). Uma vez só:
docker compose -f docker-compose.prod.yml exec api pnpm --filter @rt-finance/api db:seed
#   -> loga com SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD (ou os do .env)
```

O nginx do painel fica em `WEB_PORT` (default `8088`). Aponte seu proxy TLS:
`https://rtfinance.seudominio.com` → `web:80` (ou `localhost:8088`). Exemplo Caddy:

```
rtfinance.seudominio.com {
    reverse_proxy localhost:8088
}
```

### Multi-casal

- **Criar o 2º casal:** logue como super-admin → menu **Admin** → *Novo household*
  (nome + e-mail/senha do dono; parceiro opcional).
- **WhatsApp de cada casal:** cada dono entra com o próprio login → *Configurações →
  WhatsApp → Conectar* → escaneia o QR com o número **daquele casal**. O sistema
  cria uma instância própria na Evolution (`hh-xxxxxxxx`) e roteia entrada/saída
  por telefone + instância. `WHATSAPP_ALLOWLIST` deve ficar **vazio** (qualquer
  telefone cadastrado num household é aceito).
- A Evolution hospeda N instâncias no mesmo container — nada muda no compose.

### Operação

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f api
# atualizar depois de um git pull:
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
# backup do banco (agende no cron do host):
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U rtfinance rtfinance | gzip > backup-$(date +%F).sql.gz
```

---

## 1. Fly.io — passo a passo

Quatro apps na região `gru`: **api** (NestJS), **web** (nginx → proxy `/api`),
**evolution** (WhatsApp) e um **Postgres** (`fly postgres`, unmanaged). O cache da
sessão do Baileys usa **Upstash Redis** (plano Free) via `fly redis create`.

Topologia: o navegador só fala com `rt-finance-web.fly.dev`; o nginx encaminha
`/api/*` para `rt-finance-api.internal:8080` pela rede privada. API ↔ Evolution ↔
Postgres ↔ Redis, tudo por `*.internal` / `.flycast`.

Arquivos: [`fly/api.fly.toml`](../fly/api.fly.toml), [`fly/web.fly.toml`](../fly/web.fly.toml),
[`fly/evolution.fly.toml`](../fly/evolution.fly.toml). Rode tudo **da raiz do repo**.

### 1.1 Pré-requisitos

```bash
# instalar flyctl e logar (https://fly.io/docs/flyctl/install/)
fly auth login
fly auth whoami
```

### 1.2 Criar os apps (sem deployar ainda)

```bash
fly apps create rt-finance-api
fly apps create rt-finance-web
fly apps create rt-finance-evolution
```

### 1.3 Postgres

```bash
fly postgres create --name rt-finance-db --region gru \
  --vm-size shared-cpu-1x --volume-size 3 --initial-cluster-size 1

# cria a DATABASE_URL como secret em rt-finance-api (banco: rt_finance_api)
fly postgres attach rt-finance-db --app rt-finance-api

# 2º banco, para a Evolution
fly postgres connect --app rt-finance-db
  CREATE DATABASE evolution;
  \q
```

Anote a connection string do cluster (`fly postgres ...` mostra usuário/senha, ou
`fly secrets list --app rt-finance-db`). A URI da Evolution fica:
`postgres://<user>:<pass>@rt-finance-db.internal:5432/evolution`.

### 1.4 Redis (Upstash, plano Free)

```bash
fly redis create           # nome: rt-finance-redis · região gru · plano Free · eviction ON
fly redis status rt-finance-redis    # copie a "Private URL" (redis://default:...@fly-...upstash.io:6379)
```

### 1.5 Segredos

```bash
API_EVO_KEY="$(openssl rand -hex 24)"
WEBHOOK_TOKEN="$(openssl rand -hex 24)"

fly secrets set --app rt-finance-api \
  JWT_ACCESS_SECRET="$(openssl rand -hex 32)" \
  JWT_REFRESH_SECRET="$(openssl rand -hex 32)" \
  NVIDIA_API_KEY="nvapi-..." \
  GROQ_API_KEY="gsk_..." \
  EVOLUTION_API_KEY="$API_EVO_KEY" \
  WHATSAPP_WEBHOOK_TOKEN="$WEBHOOK_TOKEN" \
  WHATSAPP_ALLOWLIST=""
# DATABASE_URL já veio do `postgres attach`

fly secrets set --app rt-finance-evolution \
  AUTHENTICATION_API_KEY="$API_EVO_KEY" \
  DATABASE_CONNECTION_URI="postgres://<user>:<pass>@rt-finance-db.internal:5432/evolution" \
  CACHE_REDIS_URI="redis://default:<pass>@fly-rt-finance-redis.upstash.io:6379"
```

> Sem Groq, `GROQ_API_KEY` fica de fora e o bot só recusa áudios com um aviso.
> Sem Redis, edite `fly/evolution.fly.toml`: `CACHE_REDIS_ENABLED="false"` +
> `CACHE_LOCAL_ENABLED="true"` (a sessão fica no volume — funciona, só é menos robusto).

### 1.6 Deploy

```bash
fly deploy --config fly/evolution.fly.toml    # cria o volume evolution_data na 1ª vez
fly deploy --config fly/api.fly.toml          # release_command roda `prisma migrate deploy`
fly deploy --config fly/web.fly.toml
```

### 1.7 Primeiro household + WhatsApp

```bash
# cria o household inicial + super-admin (uma vez)
fly ssh console --app rt-finance-api --command "pnpm --filter @rt-finance/api db:seed"
```

Login em `https://rt-finance-web.fly.dev` com `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD`
(defina-os como secrets antes do seed, ou use os defaults do `seed.ts`).
Depois: **Configurações → WhatsApp → Conectar / Gerar QR** e escaneie com o celular do
bot. O `whatsapp-health.service` religa a sessão sozinho se cair.

### 1.8 Atualizações

```bash
git pull
fly deploy --config fly/api.fly.toml
fly deploy --config fly/web.fly.toml
# evolution: só quando trocar a versão da imagem no fly/evolution.fly.toml
```

Health checks: `GET /health` (api), `GET /` (web).

---

## 2. Backups

- **Compose:** `pg_dump` no cron do host (exemplo na seção 0).
- **Fly:** `fly postgres` faz snapshots automáticos do volume; para dump lógico:
  `fly postgres connect --app rt-finance-db` + `pg_dump`. Guarde fora do Fly.
- Restore: banco limpo → `pg_restore` → `prisma migrate deploy`.

---

## 3. Checklist de produção

- [ ] `env.schema.ts` recusa o boot com config insegura em `NODE_ENV=production`.
- [ ] `NVIDIA_API_KEY` e `GROQ_API_KEY` rotacionadas (as de dev foram expostas em chat).
- [ ] Segredos JWT ≥ 32 chars aleatórios; `AUTH_COOKIE_SECURE=true`.
- [ ] `WEB_ORIGIN` / `AUTH_COOKIE_DOMAIN` = domínio real do painel.
- [ ] `WHATSAPP_ALLOWLIST` vazio (autorização vem dos telefones dos membros).
- [ ] Rate limit ativo em `/auth/*` e no webhook.
- [ ] Backup do Postgres agendado e testado (restore).
- [ ] Volume da Evolution com snapshot; Redis com eviction ligada.
