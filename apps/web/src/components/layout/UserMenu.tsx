import { useEffect, useRef, useState } from "react";
import { LogOut, Moon, Sun, Monitor, UserCog, ChevronsUpDown } from "lucide-react";
import { ACCENTS, type Accent } from "@rt-finance/shared";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { useHousehold } from "@/lib/hooks";
import { useTheme, type ThemePref } from "@/lib/theme";
import { getPrefs, onPrefsChange } from "@/lib/preferences";
import { Avatar } from "@/components/ui/Avatar";
import { Segmented } from "@/components/ui/Segmented";
import { UserDialog } from "@/pages/users/UserDialog";

const ACCENT_DOT: Record<Accent, string> = {
  blue: "#3b82f6",
  pink: "#ec4899",
  violet: "#8b5cf6",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  slate: "#64748b",
};

/**
 * Cartão do usuário na barra lateral: abre um popover ao clicar na foto, com
 * tema (modo + cor), atalho pro perfil e sair.
 */
export function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
  const { user, logout } = useAuth();
  const { pref, setPref, hue, setHue } = useTheme();
  const household = useHousehold();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [nick, setNick] = useState(() => getPrefs().defaults.nickname ?? "");
  useEffect(() => onPrefsChange(() => setNick(getPrefs().defaults.nickname ?? "")), []);
  const ref = useRef<HTMLDivElement>(null);
  const selfMember = household.data?.members.find((m) => m.user.id === user?.id) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  return (
    <div ref={ref} className="relative mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Conta e preferências"
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg border border-border text-left transition-colors hover:bg-surface-2",
          collapsed ? "justify-center p-1" : "p-2",
          open && "bg-surface-2",
        )}
      >
        <Avatar name={user.displayName} src={user.avatarUrl} size={32} />
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-xs font-medium">{nick || user.displayName}</div>
              <div className="truncate text-[10px] text-muted">{user.email}</div>
            </div>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted" />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "animate-pop absolute z-50 w-72 overflow-hidden rounded-xl border border-border bg-elevated p-1.5 shadow-pop",
            collapsed
              ? "bottom-0 left-[calc(100%+10px)]"
              : "bottom-[calc(100%+8px)] left-0 right-0",
          )}
        >
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar name={user.displayName} src={user.avatarUrl} size={36} />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-medium">{nick || user.displayName}</div>
              <div className="truncate text-xs text-muted">{user.email}</div>
            </div>
          </div>

          <div className="my-1 border-t border-border" />

          <div className="px-2 py-1.5">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
              Tema
            </div>
            <Segmented<ThemePref>
              full
              size="sm"
              value={pref}
              onChange={setPref}
              options={[
                { value: "dark", label: "Escuro", icon: <Moon className="size-3.5" /> },
                { value: "light", label: "Claro", icon: <Sun className="size-3.5" /> },
                { value: "system", label: "Auto", icon: <Monitor className="size-3.5" /> },
              ]}
            />
            <div className="mt-2 flex gap-1.5">
              {ACCENTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-label={a}
                  aria-pressed={hue === a}
                  onClick={() => setHue(a)}
                  className={cn(
                    "size-6 rounded-full ring-offset-2 ring-offset-elevated transition",
                    hue === a ? "ring-2 ring-fg/60" : "ring-1 ring-border hover:ring-fg/30",
                  )}
                  style={{ background: ACCENT_DOT[a] }}
                />
              ))}
            </div>
          </div>

          <div className="my-1 border-t border-border" />

          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setProfileOpen(true);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-fg transition-colors hover:bg-surface-2"
          >
            <UserCog className="size-4" /> Meu perfil
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-negative transition-colors hover:bg-negative/10"
          >
            <LogOut className="size-4" /> Sair
          </button>
        </div>
      )}

      <UserDialog
        member={profileOpen ? selfMember : null}
        onClose={() => setProfileOpen(false)}
        isOwner={user.role === "OWNER"}
      />
    </div>
  );
}
