/**
 * Trava local do app (por dispositivo). NÃO é autenticação — o login já aconteceu;
 * é só uma barreira de privacidade pra quem abre o celular. Config em localStorage.
 */

const K_ENABLED = "rt-lock";
const K_PIN = "rt-lock-pin"; // hash sha-256 hex
const K_AUTOLOCK = "rt-lock-min"; // minutos; 0 = sempre ao abrir
const K_CRED = "rt-lock-cred"; // id da credencial WebAuthn (base64url)

function ls(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function set(key: string, val: string | null): void {
  try {
    if (val == null) localStorage.removeItem(key);
    else localStorage.setItem(key, val);
  } catch {
    /* ignore */
  }
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function lockEnabled(): boolean {
  return ls(K_ENABLED) === "1" && (!!ls(K_PIN) || !!ls(K_CRED));
}
export function lockHasPin(): boolean {
  return !!ls(K_PIN);
}
export function autolockMin(): number {
  const n = Number(ls(K_AUTOLOCK));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
export async function setPin(pin: string): Promise<void> {
  set(K_PIN, await sha256Hex(pin));
}
export async function verifyPin(pin: string): Promise<boolean> {
  const h = ls(K_PIN);
  return !!h && h === (await sha256Hex(pin));
}
export function enableLock(min: number): void {
  set(K_ENABLED, "1");
  set(K_AUTOLOCK, String(min));
}
export function disableLock(): void {
  set(K_ENABLED, null);
  set(K_PIN, null);
  set(K_CRED, null);
}
export function clearPin(): void {
  set(K_PIN, null);
}
export function setAutolock(min: number): void {
  set(K_AUTOLOCK, String(min));
}

// ---------- biometria (WebAuthn, best-effort) ----------
const b64url = {
  enc: (buf: ArrayBuffer) =>
    btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, ""),
  dec: (s: string) => {
    const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out;
  },
};

export async function biometricAvailable(): Promise<boolean> {
  try {
    return (
      typeof window.PublicKeyCredential !== "undefined" &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}
export function biometricRegistered(): boolean {
  return !!ls(K_CRED);
}

export async function registerBiometric(): Promise<boolean> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: "RT Finance", id: location.hostname },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: "rt-finance-lock",
          displayName: "RT Finance",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return false;
    set(K_CRED, b64url.enc(cred.rawId));
    return true;
  } catch {
    return false;
  }
}

export async function verifyBiometric(): Promise<boolean> {
  const id = ls(K_CRED);
  if (!id) return false;
  try {
    const res = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: "public-key", id: b64url.dec(id) }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!res;
  } catch {
    return false;
  }
}
