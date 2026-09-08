import type { AuthUser, LoginResponse } from "@rt-finance/shared";

const BASE = "/api";

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

type Listener = () => void;
const onUnauthorized = new Set<Listener>();
export function subscribeUnauthorized(fn: Listener): () => void {
  onUnauthorized.add(fn);
  return () => onUnauthorized.delete(fn);
}

export function getAccessToken(): string | null {
  return accessToken;
}
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function raw<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const isForm = init.body instanceof FormData;
  if (init.body && !isForm && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers, credentials: "include" });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const msg = Array.isArray(data?.message)
      ? data.message.join(" · ")
      : (data?.message ?? res.statusText);
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

/** Tenta renovar o access token via cookie httpOnly. Dedup de chamadas concorrentes. */
export async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = raw<LoginResponse>("/auth/refresh", { method: "POST", body: "{}" })
      .then((r) => {
        accessToken = r.tokens.accessToken;
        return true;
      })
      .catch(() => {
        accessToken = null;
        return false;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await raw<T>(path, init);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && !path.startsWith("/auth/")) {
      const ok = await tryRefresh();
      if (ok) return raw<T>(path, init);
      onUnauthorized.forEach((fn) => fn());
    }
    throw err;
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "DELETE",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),
};

/** Baixa um arquivo autenticado (relatórios PDF/Excel) e devolve o Blob. */
export async function download(path: string): Promise<{ blob: Blob; filename: string }> {
  const headers = new Headers();
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  let res = await fetch(`${BASE}${path}`, { headers, credentials: "include" });
  if (res.status === 401) {
    if (await tryRefresh()) {
      const h2 = new Headers();
      if (accessToken) h2.set("authorization", `Bearer ${accessToken}`);
      res = await fetch(`${BASE}${path}`, { headers: h2, credentials: "include" });
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = res.statusText;
    try {
      const j = JSON.parse(text);
      msg = Array.isArray(j?.message) ? j.message.join(" · ") : (j?.message ?? msg);
    } catch {
      /* corpo não-JSON */
    }
    throw new ApiError(res.status, msg);
  }
  const cd = res.headers.get("content-disposition") ?? "";
  const filename = /filename="?([^"]+)"?/.exec(cd)?.[1] ?? "download";
  return { blob: await res.blob(), filename };
}

/** Dispara o "salvar" no browser a partir de um Blob. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- endpoints de auth ----------
export async function login(email: string, password: string): Promise<AuthUser> {
  const r = await raw<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  accessToken = r.tokens.accessToken;
  return r.user;
}

export async function logout(): Promise<void> {
  try {
    await raw<void>("/auth/logout", { method: "POST", body: "{}" });
  } finally {
    accessToken = null;
  }
}

export function fetchMe(): Promise<AuthUser> {
  return api.get<AuthUser>("/auth/me");
}

/** Redefinição de senha por e-mail (rotas públicas — não passam pelo fluxo de refresh). */
export function forgotPassword(email: string): Promise<{ ok: true }> {
  return raw<{ ok: true }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function checkResetToken(token: string): Promise<{ valid: boolean }> {
  return raw<{ valid: boolean }>(`/auth/reset-password/check?token=${encodeURIComponent(token)}`);
}

export function resetPassword(token: string, password: string): Promise<{ ok: true }> {
  return raw<{ ok: true }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}
