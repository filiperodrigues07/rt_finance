import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Moon, Sun, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { NotificationsBell } from "./NotificationsBell";
import { NAV, MOBILE_NAV } from "./nav";

/** rótulos curtos no menu inferior do mobile (evita quebra/corte em telas ~360px) */
const MOBILE_LABELS: Record<string, string> = {
  "/": "Início",
  "/configuracoes": "Config",
};

function Brand() {
  return (
    <div className="px-1">
      <div className="inline-flex rounded-xl bg-[#0B0D12] px-3 py-2.5 dark:bg-transparent dark:px-0 dark:py-0">
        <img src="/brand-logo.png" alt="RT Finance" className="h-11 w-auto" />
      </div>
      <div className="mt-1.5 text-[10px] uppercase tracking-wide text-muted">
        assistente do casal
      </div>
    </div>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
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
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              item.soon
                ? "cursor-not-allowed text-muted/50"
                : isActive
                  ? "bg-accent/10 font-medium text-accent"
                  : "text-muted hover:bg-surface-2 hover:text-fg",
            )
          }
        >
          <item.icon className="size-[18px]" />
          <span className="flex-1">{item.label}</span>
          {item.soon && <span className="text-[10px] uppercase tracking-wide">em breve</span>}
        </NavLink>
      ))}
    </nav>
  );
}

function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema">
      {resolved === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { hueChosen, setHue } = useTheme();

  // cor padrão por pessoa no primeiro acesso (Julia = rosa, senão azul). Trocável em Configurações.
  useEffect(() => {
    if (!hueChosen && user) setHue(/jul/i.test(user.displayName) ? "pink" : "blue");
  }, [hueChosen, user, setHue]);

  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  // rótulos de rotas que não estão no menu (evita cair em "RT Finance" no topo/aba)
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
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      {/* sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-surface p-3 lg:flex">
        <div className="py-3">
          <Brand />
        </div>
        <div className="mt-2 flex-1 overflow-y-auto">
          <NavItems />
        </div>
        <UserBox user={user} onLogout={logout} />
      </aside>

      {/* drawer mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="animate-in absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-surface p-3">
            <div className="flex items-center justify-between py-3">
              <Brand />
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="mt-2 flex-1 overflow-y-auto">
              <NavItems onNavigate={() => setMobileOpen(false)} />
            </div>
            <UserBox user={user} onLogout={logout} />
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
          <p className="flex-1 truncate text-sm font-semibold" aria-hidden="true">
            {current}
          </p>
          <NotificationsBell />
          <ThemeToggle />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">{children}</main>

        <footer className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 text-center text-[11px] leading-relaxed text-muted sm:px-6 lg:pb-6">
          © {new Date().getFullYear()} RT Finance. Todos os direitos reservados. ·{" "}
          Desenvolvido por Filipe Rodrigues
        </footer>

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
              <span className="w-full truncate text-center">{MOBILE_LABELS[item.to] ?? item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

function UserBox({
  user,
  onLogout,
}: {
  user: { displayName: string; email: string; avatarUrl?: string | null } | null;
  onLogout: () => void;
}) {
  if (!user) return null;
  return (
    <div className="mt-2 flex items-center gap-2.5 rounded-lg border border-border p-2">
      <Avatar name={user.displayName} src={user.avatarUrl} size={32} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-xs font-medium">{user.displayName}</div>
        <div className="truncate text-[10px] text-muted">{user.email}</div>
      </div>
      <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Sair">
        <LogOut className="size-4" />
      </Button>
    </div>
  );
}
