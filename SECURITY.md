# RT Finance — Segurança

Sistema com **dados financeiros do casal** (saldos, extratos, faturas, CPF em PDFs
importados). Este documento lista o que já está implementado e o checklist
obrigatório antes de qualquer deploy.

## Já implementado

- **Autenticação**: senha com `argon2id`; access token JWT curto (15 min); refresh
  token opaco (`randomBytes(48)`) guardado **hasheado** (SHA-256) no banco, com
  **rotação** e **detecção de reuso** (revoga a família de sessões). Cookie de
  refresh `httpOnly`; `sameSite=strict` + `secure` quando `AUTH_COOKIE_SECURE=true`.
- **Autorização**: guard JWT global; rotas OWNER-only checadas no serviço
  (criar/redefinir membro, alterar household).
- **Multi-tenant**: todo acesso a dado financeiro é filtrado por `householdId`
  vindo do token.
- **Validação**: Zod em todas as bordas (`ZodValidationPipe`); valores em centavos
  com limites; `amountCents` positivo.
- **Rate limiting**: global 120/min; `POST /auth/*` 10/min; `POST /imports` 6/min;
  `POST /transactions/quick` 30/min; `reset-password` 5/min.
- **Headers**: `@fastify/helmet` com CSP restritiva (`default-src 'none'`),
  `frame-ancestors 'none'`, CORP `same-site`, COOP `same-origin`, `noSniff`,
  HSTS (efetiva sob TLS).
- **Upload de importação**: limite 15 MB, 1 arquivo; allowlist de mimetype/extensão
  (`.ofx`/`.pdf`); o arquivo cru **não** é persistido (só as linhas extraídas).
- **PDF → IA**: antes de enviar à NVIDIA, o texto passa por `maskPii()` (mascara
  cartão, CPF, CNPJ, nº de conta). O texto extraído **nunca** é logado.
- **Avatar**: data-URI validado por regex + teto de ~200 KB (bytes decodificados).
- **Auditoria**: `AuditLog` para toda mutação de dinheiro e de household.
- **Housekeeping**: job semanal remove sessões expiradas/revogadas antigas.
- **Boot de produção**: a API **recusa subir** com `NODE_ENV=production` se
  `AUTH_COOKIE_SECURE=false`, segredos JWT fracos/placeholder, ou `WEB_ORIGIN`
  apontando para localhost.
- **Logs**: `authorization`, `cookie` e campos de senha são removidos do log.

## Checklist de deploy (obrigatório)

- [ ] **Rotacionar `NVIDIA_API_KEY`** — a chave atual foi exposta em chat durante o
      desenvolvimento. Gerar nova em build.nvidia.com e pôr só em `apps/api/.env`
      (nunca em `.env.example`, nunca no front).
- [ ] `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET`: 32+ caracteres aleatórios
      (`openssl rand -base64 48`), distintos.
- [ ] `AUTH_COOKIE_SECURE=true` e servir **só sob HTTPS** (TLS + HSTS).
- [ ] `AUTH_COOKIE_DOMAIN` = domínio real do painel.
- [ ] `WEB_ORIGIN` = origem exata do painel (sem `*`, sem localhost).
- [ ] `FastifyAdapter({ trustProxy: ... })`: trocar `true` pelo IP/CIDR do proxy
      reverso real (senão `req.ip` é falsificável e o rate limit fura).
- [ ] `EVOLUTION_API_KEY` e `WHATSAPP_WEBHOOK_TOKEN` fortes; webhook só acessível
      pela Evolution.
- [ ] PostgreSQL: usuário dedicado com permissão mínima, **backup automático** e
      **criptografia em repouso**; `DATABASE_URL` com `sslmode=require`.
- [ ] Retenção de log definida; sem PII em log agregado.
- [ ] Revisar `AuditLog` periodicamente; considerar alerta em `reset-password` e
      criação de usuário.
- [ ] LGPD: os dados são de um casal (titulares identificados). Ter base legal,
      permitir exportação (já há relatório PDF/Excel) e exclusão da conta.
- [ ] Dependências: `pnpm audit` no CI; atualizar `pdf-parse`/`pdfjs-dist` quando
      houver correção.
