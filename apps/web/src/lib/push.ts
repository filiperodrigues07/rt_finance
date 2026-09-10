import { api } from "./api";

/** Web Push: registro da inscrição do navegador junto à API. */

export type PushState = "unsupported" | "denied" | "granted" | "default";

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function pushPermission(): PushState {
  if (!pushSupported()) return "unsupported";
  return Notification.permission as PushState;
}

function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** true se já há uma inscrição ativa neste dispositivo. */
export async function pushIsSubscribed(): Promise<boolean> {
  const reg = await readyRegistration();
  if (!reg) return false;
  return Boolean(await reg.pushManager.getSubscription());
}

/** Pede permissão, assina e registra na API. Lança em erro. */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error("Este navegador não suporta notificações push.");
  const { publicKey } = await api.get<{ publicKey: string }>("/push/vapid-key");
  if (!publicKey) throw new Error("Push não está configurado no servidor.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permissão de notificação negada.");

  const reg = await readyRegistration();
  if (!reg) throw new Error("Instale o app (adicionar à tela inicial) para receber notificações.");

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(publicKey),
    }));

  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api.post("/push/subscribe", {
    endpoint: json.endpoint,
    keys: json.keys,
    userAgent: navigator.userAgent.slice(0, 400),
  });
}

/** Cancela a inscrição no dispositivo e na API. */
export async function disablePush(): Promise<void> {
  const reg = await readyRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    await api.post("/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
}
