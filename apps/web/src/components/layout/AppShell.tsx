import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { Moon, Sun, Menu, X, ChevronLeft, ChevronRight, Search, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { useHouseholdFeatures } from "@/lib/hooks";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/Button";
import { NotificationsBell } from "./NotificationsBell";
import { UserMenu } from "./UserMenu";
import { CommandPalette } from "@/components/CommandPalette";
import { ConnectivityBar, InstallNudge } from "@/components/PwaBits";
import { PullToRefresh } from "@/components/PullToRefresh";
import { Tooltip } from "@/components/ui/Tooltip";
import { NAV, NAV_GROUPS, MOBILE_NAV } from "./nav";

/** rótulos curtos no menu inferior do mobile (evita quebra/corte em telas ~360px) */
const MOBILE_LABELS: Record<string, string> = {
  "/": "Início",
  "/configuracoes": "Config",
};

const SIDEBAR_KEY = "rt-sidebar-collapsed";

function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setCollapsed((c) => {
      const n = !c;
      try {
        localStorage.setItem(SIDEBAR_KEY, n ? "1" : "0");
      } catch {
        /* ignore */
      }
      return n;
    });
  return { collapsed, toggle };
}

function Brand({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return <img src="/favicon.svg" alt="RT Finance" className="size-9 rounded-lg" />;
  }
  return (
    <div className="px-1">
      <div className="inline-flex rounded-xl bg-[#0B0D12] px-3 py-2.5 dark:bg-transparent dark:px-0 dark:py-0">
        <img src="/brand-logo.png" alt="RT Finance" className="h-11 w-auto" />
      </div>
      <div className="mt-1.5 text-[10px] uppercase tracking-wide text-muted">assistente do casal</div>
    </div>
  );
}

function NavItems({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const { user } = useAuth();
  const features = useHouseholdFeatures().data;
  const visible = NAV.filter(
    (n) =>
      (!n.admin || user?.isSuperAdmin) &&
      (!n.feature || features?.[n.feature]),
  );

  const link = (item: (typeof NAV)[number]) => {
    const el = (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === "/"}
        onClick={item.soon ? (e) => e.preventDefault() : onNavigate}
        className={({ isActive }) =>
          cn(
            "relative flex items-center gap-3 rounded-lg py-2 text-sm transition-colors duration-150",
            collapsed ? "justify-center px-2" : "px-3",
            item.soon
              ? "cursor-not-allowed text-muted/50"
              : isActive
                ? "nav-active font-medium text-accent before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent"
                : "text-muted hover:bg-surface-2 hover:text-fg",
          )
        }
      >
        <item.icon className="size-[18px] shrink-0" />
        {!collapsed && <span className="flex-1">{item.label}</span>}
        {!collapsed && item.soon && (
          <span className="text-[10px] uppercase tracking-wide">em breve</span>
        )}
      </NavLink>
    );
    return collapsed ? (
      <Tooltip key={item.to} label={item.label} side="right" className="block">
        {el}
      </Tooltip>
    ) : (
      el
    );
  };

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_GROUPS.map((g, gi) => {
        const items = visible.filter((n) => n.group === g.id);
        if (!items.length) return null;
        return (
          <div key={g.id} className={cn(gi > 0 && (collapsed ? "mt-2" : "mt-3"))}>
            {collapsed
              ? gi > 0 && <div className="mx-auto mb-2 h-px w-6 bg-border" />
              : (
                <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
                  {g.label}
                </div>
              )}
            <div className="flex flex-col gap-0.5">{items.map(link)}</div>
          </div>
        );
      })}
    </nav>
  );
}

function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema (escuro/claro)">
      {resolved === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

/** Força a rebuscar tudo — útil no PWA depois de lançar algo pelo bot. Gira enquanto busca. */
function RefreshButton() {
  const qc = useQueryClient();
  const fetching = useIsFetching();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => qc.invalidateQueries()}
      aria-label="Atualizar dados"
      title="Atualizar"
    >
      <RefreshCw className={cn("size-4", fetching > 0 && "animate-spin")} />
    </Button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { hueChosen, setHue } = useTheme();
  const { collapsed, toggle: toggleSidebar } = useSidebarCollapsed();

  // cor padrão por pessoa no primeiro acesso (Julia = rosa, senão azul). Trocável no menu do usuário.
  useEffect(() => {
    if (!hueChosen && user) setHue(/jul/i.test(user.displayName) ? "pink" : "blue");
  }, [hueChosen, user, setHue]);

  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  // fecha o drawer ao trocar de rota ou apertar Esc
  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  // gesto: arrastar da borda esquerda para dentro abre o menu (só no mobile)
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;
    const onStart = (e: TouchEvent) => {
      if (window.innerWidth >= 1024 || mobileOpen) return;
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
      tracking = startX <= 28;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (dx > 55 && dy < 45) {
        tracking = false;
        setMobileOpen(true);
      } else if (dx < -10 || dy > 60) {
        tracking = false;
      }
    };
    const stop = () => {
      tracking = false;
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", stop, { passive: true });
    document.addEventListener("touchcancel", stop, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", stop);
      document.removeEventListener("touchcancel", stop);
    };
  }, [mobileOpen]);
  // rótulos de rotas que não estão no menu (só para o <title> da aba)
  const EXTRA_TITLES: Record<string, string> = {
    "/importar": "Revisar importação",
  };
  const current =
    NAV.find((n) => n.to === pathname)?.label ??
    EXTRA_TITLES[`/${pathname.split("/")[1] ?? ""}`] ??
    "RT Finance";

  useEffect(() => {
    document.title = current === "RT Finance" ? "RT Finance" : `${current} · RT Finance`;
  }, [current]);

  return (
    <div
      style={{ "--rt-sidebar-w": collapsed ? "72px" : "264px" } as CSSProperties}
      className={cn(
        "min-h-dvh lg:grid",
        collapsed ? "lg:grid-cols-[72px_1fr]" : "lg:grid-cols-[264px_1fr]",
      )}
    >
      {/* sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-sidebar p-3 lg:flex">
        {/* seta central para recolher / expandir */}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className="absolute -right-3 top-16 z-20 grid size-6 place-items-center rounded-full border border-border bg-surface text-muted shadow-card transition-colors hover:text-fg"
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
        </button>

        <div className={cn("py-3", collapsed && "flex justify-center")}>
          <Brand compact={collapsed} />
        </div>
        <div className="mt-2 flex-1 overflow-y-auto">
          <NavItems collapsed={collapsed} />
        </div>
        <UserMenu collapsed={collapsed} />
      </aside>

      {/* drawer mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="animate-in absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div
            onTouchStart={(e) => {
              (e.currentTarget as HTMLElement).dataset.sx = String(e.touches[0]?.clientX ?? 0);
            }}
            onTouchEnd={(e) => {
              const sx = Number((e.currentTarget as HTMLElement).dataset.sx ?? 0);
              const ex = e.changedTouches[0]?.clientX ?? sx;
              if (sx - ex > 55) setMobileOpen(false);
            }}
            className="pt-safe animate-drawer absolute inset-y-0 left-0 flex w-[min(20rem,82vw)] flex-col border-r border-border bg-surface p-3"
          >
            <div className="flex items-center justify-between py-3">
              <Brand />
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Fechar menu">
                <X className="size-4" />
              </Button>
            </div>
            <div className="mt-2 flex-1 overflow-y-auto">
              <NavItems onNavigate={() => setMobileOpen(false)} />
            </div>
            <UserMenu />
          </div>
        </div>
      )}

      <div className="flex min-h-dvh flex-col">
        {/* topbar */}
        <header className="pt-safe sticky top-0 z-40 flex min-h-14 items-center gap-2 border-b border-border bg-bg/80 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="size-5" />
          </Button>

          <div className="hidden flex-1 lg:block" />

          {/* busca global — abre a paleta de comandos (⌘/Ctrl + K) */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("rt:cmdk"))}
            aria-label="Buscar transações e telas"
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-sm text-muted transition-colors hover:border-fg/25 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:h-10 lg:w-96 lg:flex-none"
          >
            <Search className="size-4 shrink-0" />
            <span className="truncate">Buscar transações, telas…</span>
            <kbd className="ml-auto hidden shrink-0 rounded border border-border bg-bg/50 px-1.5 py-0.5 font-sans text-[11px] text-muted sm:inline-block">
              Ctrl K
            </kbd>
          </button>

          <div className="hidden flex-1 lg:block" />
          <div className="flex items-center gap-0.5">
            <RefreshButton />
            <NotificationsBell />
            <ThemeToggle />
          </div>
        </header>

        <ConnectivityBar />
        <InstallNudge />

        <PullToRefresh>
          <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">{children}</main>
        </PullToRefresh>

        <footer className="mx-auto w-full max-w-6xl px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] pt-6 text-center text-[11px] leading-relaxed text-muted sm:px-6 lg:pb-6">
          © {new Date().getFullYear()} RT Finance. Todos os direitos reservados. · Desenvolvido por{" "}
          <a
            href="https://www.linkedin.com/in/filipe-rodrigues07"
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg underline decoration-border underline-offset-2 hover:text-accent"
          >
            Filipe Rodrigues
          </a>
        </footer>

        <CommandPalette />

        {/* bottom nav mobile */}
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-surface/95 backdrop-blur lg:hidden">
          {MOBILE_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex min-w-0 flex-col items-center gap-0.5 px-1 py-2.5 text-[10px] leading-none transition-colors",
                  isActive ? "text-accent" : "text-muted",
                )
              }
            >
              <item.icon className="size-5 shrink-0" />
              <span className="w-full truncate text-center">
                {MOBILE_LABELS[item.to] ?? item.label}
              </span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
