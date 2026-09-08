# Deploy na VPS (Hostinger KVM1)

A VPS **não builda** nada. O GitHub Actions (`publish-images.yml`) builda as imagens
e publica no GHCR; a VPS só faz `pull`. Roda ao lado do outro projeto sem encostar
nele (containers `rtf-*`, rede/volumes próprios, Postgres em container).

Recursos: ~1,5 GB de RAM e ~3 GB de disco. Numa KVM1 (4 GB), **crie 2 GB de swap**
antes (passo 1).

---

## 1. Uma vez, no GitHub

1. Faça um push na `main` (ou Actions → **publish-images** → *Run workflow*).
2. Quando terminar, deixe os pacotes **públicos** (sem segredo dentro das imagens):
   repo → **Packages** → `rt_finance-api` → *Package settings* → **Change visibility → Public**.
   Idem `rt_finance-web`. (Alternativa: criar um PAT `read:packages` e `docker login ghcr.io` na VPS.)

## 2. Uma vez, na VPS

```bash
ssh root@147.93.9.13

# --- swap (segurança de RAM em build/import) ---
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# --- Docker (pule se já tiver, do outro projeto) ---
docker --version || curl -fsSL https://get.docker.com | sh

# --- código ---
git clone https://github.com/filiperodrigues07/rt_finance.git ~/rt_finance
cd ~/rt_finance/deploy/vps
cp .env.prod.example .env.prod

# --- segredos ---
echo "JWT_ACCESS_SECRET=$(openssl rand -hex 32)"   >> .env.prod
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)"  >> .env.prod
echo "EVOLUTION_API_KEY=$(openssl rand -hex 24)"   >> .env.prod
echo "WHATSAPP_WEBHOOK_TOKEN=$(openssl rand -hex 24)" >> .env.prod
nano .env.prod   # preencha POSTGRES_PASSWORD, NVIDIA_API_KEY, GROQ_API_KEY
                 # (apague as linhas duplicadas que o echo pode ter criado)
```

## 3. DNS (painel do domínio filiperodrigues.tech)

Registro **A**: `rtfinance` → `147.93.9.13`.

## 4. Subir

```bash
cd ~/rt_finance/deploy/vps
docker compose --env-file .env.prod pull
docker compose --env-file .env.prod up -d

# 80/443 livres? (nenhum proxy do outro projeto)
ss -tlnp | grep -E ':(80|443)\b' || echo "livres"
```

- **80/443 livres** → suba o Caddy embutido (TLS automático):
  ```bash
  docker compose --env-file .env.prod --profile edge up -d
  ```
- **80/443 ocupadas** (o outro projeto tem nginx/Caddy) → NÃO use o profile edge.
  Aponte esse proxy para `http://127.0.0.1:8088`. Exemplo nginx:
  ```nginx
  server {
    server_name rtfinance.filiperodrigues.tech;
    client_max_body_size 20m;
    location / { proxy_pass http://127.0.0.1:8088; proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme; }
  }
  # depois: certbot --nginx -d rtfinance.filiperodrigues.tech
  ```

## 5. Primeiro household + WhatsApp

```bash
docker compose --env-file .env.prod exec api pnpm --filter @rt-finance/api db:seed
```

Login em `https://rtfinance.filiperodrigues.tech` → `filipe@rtfinance.local` /
`rtfinance123` → **troque a senha** → **Configurações → WhatsApp → Gerar QR** →
escaneie com o celular do bot.

---

## Atualizar (só quando você quiser — nada é automático)

1. Buildar as imagens novas: GitHub → **Actions → publish-images → Run workflow**
   (ou `gh workflow run publish-images.yml`). Espere ficar verde.
2. Na VPS:
   ```bash
   cd ~/rt_finance/deploy/vps && git pull
   docker compose --env-file .env.prod pull
   docker compose --env-file .env.prod up -d
   ```

## Backup (cron do host)

```bash
docker compose --env-file .env.prod exec -T postgres \
  pg_dump -U rtfinance rtfinance | gzip > ~/backups/rtf-$(date +%F).sql.gz
```

## Diagnóstico

```bash
docker compose --env-file .env.prod ps
docker compose --env-file .env.prod logs -f api
docker stats --no-stream
free -h
```
