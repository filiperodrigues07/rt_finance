# ETAPA 3 — Frontend / painel web (concluída)

`apps/web` — React 18 + Vite 5 + TypeScript + Tailwind 3 + Recharts + lucide-react +
TanStack Query. Dark mode como padrão (tokens em CSS variables, toggle persistido em
`localStorage`, sem flash). Totalmente responsivo: sidebar no desktop, menu inferior no
mobile, tabelas viram cards no celular.

Verificado: `pnpm build` do monorepo passa (shared + api + web); Vite dev serve o SPA,
faz proxy de `/api` para a API, login pelo proxy funciona e grava o cookie `rt_refresh`.

## Infra do frontend

- **`lib/api.ts`** — cliente `fetch` tipado. Access token só em memória; em `401` tenta
  **`/auth/refresh` uma vez** (dedup de chamadas concorrentes) via cookie httpOnly e
  repete a request; se falhar, dispara evento que desloga. `credentials: "include"`.
- **`lib/auth.tsx`** — no boot chama `tryRefresh()`; se ok, carrega `/auth/me`. Provê
  `useAuth()` (user, login, logout, refreshUser).
- **`lib/theme.tsx`**, **`lib/toast.tsx`** — tema e toasts (sem dependências extras).
- **`lib/query.ts`** — QueryClient (staleTime 30s, sem retry em 4xx).
- **`lib/hooks.ts`** — hooks de query/mutation por recurso, com invalidação cruzada
  (ex.: criar transação invalida dashboard, contas, cartões, comprometimento futuro).
- **`vite.config.ts`** — proxy `/api` → `http://localhost:3333` em dev; em produção o
  build é estático e o `/api` é servido pelo mesmo domínio (nginx/Cloudflare).

## Componentes

- `components/ui/` — `Button`, `Card`/`CardHeader`, `Field`/`Input`/`Select`/`Textarea`,
  `Dialog` (portal, ESC, backdrop, mobile bottom-sheet), `ConfirmDialog`, `Badge`,
  `Skeleton`, `Spinner`, `EmptyState`.
- `components/layout/AppShell.tsx` — sidebar + drawer mobile + topbar + bottom nav +
  toggle de tema + caixa de usuário. Nav: Dashboard, Transações, Cartões, Contas,
  Recorrências*, Metas*, Relatórios*, Categorias, Usuários, Configurações
  (*marcadas "em breve" — ETAPA 6).
- `components/charts/charts.tsx` (Recharts):
  - **Gastos por categoria** — donut + legenda (top 6 + "Outros").
  - **Evolução mensal** — barras receitas/despesas + linha de saldo (6 meses).
  - **Gastos por pessoa** e **por cartão** — barras horizontais.
  - **Comprometimento futuro** — barras por mês (12 meses).

## Telas

| Rota | Conteúdo |
|---|---|
| `/login` | e-mail + senha; erros inline |
| `/` Dashboard | seletor de período (este mês / mês passado / este ano); 5 cards (Saldo, Receitas, Despesas, Faturas em aberto, Vence em 15 dias); os 5 gráficos; skeletons |
| `/transacoes` | filtros (busca, tipo, categoria, responsável, cartão, intervalo de datas); tabela desktop / cards mobile; paginação; ações **criar / editar / excluir / duplicar**; parcela e transferência não editáveis avulsas (botões desabilitados); form de lançamento manual (tipo, valor, data, descrição, categoria, responsável, conta **ou** cartão, observações) |
| `/cartoes` | cards com barra de limite usado/disponível; criar/editar/excluir; expandir para ver **faturas** e **compras parceladas**; **nova compra parcelada** com prévia do valor da parcela; cancelar parcelamento |
| `/contas` | contas com saldo calculado; criar/editar/excluir; saldo somado |
| `/categorias` | grade com ícone/cor; criar/editar (nome, tipo, emoji, cor); categorias de sistema têm cadeado (não excluem) |
| `/usuarios` | membros do household, editar nome de exibição/cor (papel só para OWNER); dados do household |
| `/configuracoes` | tema; perfil (nome, telefone E.164, e-mail); troca de senha (desconecta outros dispositivos); aviso sobre WhatsApp/IA (ETAPAS 4-5) |
| `/recorrencias` `/metas` `/relatorios` | placeholder "chega na ETAPA 6" |

## API — módulo novo desta etapa

`reports` (`apps/api/src/modules/reports/`):

- `GET /api/reports/dashboard?from&to&months` — saldo somado das contas, receitas e
  despesas do período, resultado, faturas em aberto, faturas a vencer em 15 dias, e os
  recortes por categoria / membro / cartão + evolução mensal. Exclui transferências
  (`transferGroupId`) e canceladas dos totais de gasto/receita.
- `GET /api/reports/monthly-evolution?months` — série mensal (receitas, despesas, saldo).

## Como rodar (dev)

```bash
corepack enable && pnpm install
pnpm --filter @rt-finance/shared build
pnpm db:migrate && pnpm db:seed          # PostgreSQL rodando + apps/api/.env

pnpm --filter @rt-finance/api dev         # :3333
pnpm --filter @rt-finance/web dev         # :5173  (proxy /api → :3333)
# abrir http://localhost:5173  → login filipe@rtfinance.local / rtfinance123
```

`pnpm dev` na raiz sobe os três (shared em watch, api, web) via Turborepo.

## Notas técnicas

- **`@rt-finance/shared` agora é ESM** (`"type": "module"`, `moduleResolution: NodeNext`,
  imports relativos com `.js`). Motivo: o Rollup do Vite não resolvia named exports
  através do `__exportStar` de um build CommonJS. A API (CommonJS) consome via
  `require()` de ESM, suportado nativamente no Node 22.12+.
- Bundle do web em ~875 kB (Recharts pesa). Code-splitting por rota fica para a
  otimização da ETAPA 7.
- ESLint flat config ainda não está ligado (deps declaradas em `packages/eslint-config`).
