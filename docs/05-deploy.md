# 05 — Deploy

Produção roda numa **VPS com Docker Compose** (arquivos prontos no repo).

> **Antes de qualquer deploy, leia o [`SECURITY.md`](../SECURITY.md)** e cumpra o
> checklist: rotacionar `NVIDIA_API_KEY` (a de dev foi exposta), segredos JWT fortes,
> `AUTH_COOKIE_SECURE=true` + TLS, `WEB_ORIGIN` real, `trustProxy` no IP do proxy.

---

## 1. VPS + Docker Compose

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

Health checks: `GET /health` (api), `GET /` (web).

---

## 2. Backups

- `pg_dump` no cron do host (exemplo na seção 1).
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
