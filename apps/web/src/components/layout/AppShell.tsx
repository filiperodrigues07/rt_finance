import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Moon, Sun, Menu, X, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/Button";
import { NotificationsBell } from "./NotificationsBell";
import { UserMenu } from "./UserMenu";
import { CommandPalette } from "@/components/CommandPalette";
import { NAV, MOBILE_NAV } from "./nav";

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
    return (
      <svg
        viewBox="0 0 36 36"
        className="size-9"
        role="img"
        aria-label="RT Finance"
      >
        <rect width="36" height="36" rx="9" fill="rgb(var(--accent))" />
        <text
          x="18"
          y="19"
          textAnchor="middle"
          dominantBaseline="central"
          fill="rgb(var(--accent-fg))"
          fontSize="15"
          fontWeight="700"
          letterSpacing="-0.5"
          fontFamily="Inter, system-ui, sans-serif"
        >
          RT
        </text>
      </svg>
    );
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
  const items = NAV.filter((n) => !n.admin || user?.isSuperAdmin);
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          onClick={item.soon ? (e) => e.preventDefault() : onNavigate}
          title={collapsed ? item.label : undefined}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg py-2 text-sm transition-colors",
              collapsed ? "justify-center px-2" : "px-3",
              item.soon
                ? "cursor-not-allowed text-muted/50"
                : isActive
                  ? "nav-active font-medium text-accent"
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
      ))}
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
  // rótulos de rotas que não estão no menu (só para o <title> da aba)
  const EXTRA_TITLES: Record<string, string> = {
    "/categorias": "Categorias",
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
      className={cn(
        "min-h-screen lg:grid",
        collapsed ? "lg:grid-cols-[68px_1fr]" : "lg:grid-cols-[260px_1fr]",
      )}
    >
      {/* sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-surface p-3 lg:flex">
        {/* seta central para recolher / expandir */}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className="absolute -right-3 top-1/2 z-20 grid size-6 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface text-muted shadow-card transition-colors hover:text-fg"
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
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="animate-in absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-surface p-3">
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

      <div className="flex min-h-screen flex-col">
        {/* topbar */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-bg/80 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="size-5" />
          </Button>

          {/* busca global — abre a paleta de comandos (⌘/Ctrl + K) */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("rt:cmdk"))}
            className="hidden items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-fg sm:flex"
          >
            <Search className="size-3.5" />
            <span>Buscar</span>
            <kbd className="rounded border border-border px-1 py-px text-[10px]">Ctrl K</kbd>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden"
            onClick={() => window.dispatchEvent(new Event("rt:cmdk"))}
            aria-label="Buscar"
          >
            <Search className="size-4" />
          </Button>

          <div className="flex-1" />
          <NotificationsBell />
          <ThemeToggle />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">{children}</main>

        <footer className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 text-center text-[11px] leading-relaxed text-muted sm:px-6 lg:pb-6">
          © {new Date().getFullYear()} RT Finance. Todos os direitos reservados. · Desenvolvido por
          Filipe Rodrigues
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
