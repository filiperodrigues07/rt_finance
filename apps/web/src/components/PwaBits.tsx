import { useEffect, useState } from "react";
import { WifiOff, Download, X } from "lucide-react";

/** Aviso fino quando cai a conexão. */
export function ConnectivityBar() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (online) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-warning/15 px-3 py-1.5 text-center text-xs text-warning">
      <WifiOff className="size-3.5 shrink-0" /> Sem conexão — algumas coisas podem não carregar.
    </div>
  );
}

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "rt-install-dismissed";
const VISITS_KEY = "rt-visits";

function bumpVisits(): number {
  try {
    if (!sessionStorage.getItem("rt-visit-counted")) {
      sessionStorage.setItem("rt-visit-counted", "1");
      const n = Number(localStorage.getItem(VISITS_KEY) ?? "0") + 1;
      localStorage.setItem(VISITS_KEY, String(n));
      return n;
    }
    return Number(localStorage.getItem(VISITS_KEY) ?? "0");
  } catch {
    return 0;
  }
}

/** Convite discreto pra instalar o PWA (Android/desktop; iOS não expõe o evento). */
export function InstallNudge() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      const dismissed = (() => {
        try {
          return localStorage.getItem(DISMISS_KEY) === "1";
        } catch {
          return false;
        }
      })();
      if (dismissed) return;
      setEvt(e as BIPEvent);
      setShow(bumpVisits() >= 3);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!show || !evt) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-2 text-sm">
      <Download className="size-4 shrink-0 text-accent" />
      <span className="flex-1">Instale o RT Finance na tela inicial.</span>
      <button
        className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-fg"
        onClick={async () => {
          await evt.prompt();
          dismiss();
        }}
      >
        Instalar
      </button>
      <button className="p-1 text-muted hover:text-fg" onClick={dismiss} aria-label="Dispensar">
        <X className="size-4" />
      </button>
    </div>
  );
}
