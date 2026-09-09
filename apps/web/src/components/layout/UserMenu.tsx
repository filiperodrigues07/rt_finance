import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Moon, Sun, Monitor, UserCog } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { useTheme, type ThemePref, type Hue } from "@/lib/theme";
import { Avatar } from "@/components/ui/Avatar";
import { Segmented } from "@/components/ui/Segmented";

/**
 * Cartão do usuário na barra lateral: abre um popover ao clicar na foto, com
 * tema (modo + cor), atalho pro perfil e sair.
 */
export function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
  const { user, logout } = useAuth();
  const { pref, setPref, hue, setHue } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-xs font-medium">{user.displayName}</div>
            <div className="truncate text-[10px] text-muted">{user.email}</div>
          </div>
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
              <div className="truncate text-sm font-medium">{user.displayName}</div>
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
            <div className="mt-2">
              <Segmented<Hue>
                full
                size="sm"
                value={hue}
                onChange={setHue}
                options={[
                  {
                    value: "blue",
                    label: "Azul",
                    icon: <span className="block size-2.5 rounded-full bg-[#3B82F6] ring-1 ring-white/20" />,
                  },
                  {
                    value: "pink",
                    label: "Rosa",
                    icon: <span className="block size-2.5 rounded-full bg-[#EC4899] ring-1 ring-white/20" />,
                  },
                ]}
              />
            </div>
          </div>

          <div className="my-1 border-t border-border" />

          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate("/usuarios");
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
    </div>
  );
}
