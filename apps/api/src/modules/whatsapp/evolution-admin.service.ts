import { Inject, Injectable, Logger } from "@nestjs/common";
import { ENV, type Env } from "../../config/env.schema";
import { DomainError } from "../../common/errors/domain-error";

export interface WhatsappStatus {
  provider: string;
  enabled: boolean; // true se WHATSAPP_PROVIDER=evolution e a base URL está configurada
  evolutionReachable: boolean; // false se a Evolution API não respondeu
  state: "open" | "connecting" | "close" | "unknown";
  connected: boolean;
  number: string | null; // E.164 do número pareado, se conectado
  profileName: string | null;
  instance: string;
  webhookUrl: string;
  allowlist: string[];
}

export interface WhatsappQr {
  state: WhatsappStatus["state"];
  qrBase64: string | null; // data URI de imagem PNG do QR
  pairingCode: string | null; // código alternativo (parear por número)
}

/**
 * Administração da instância da Evolution API (criar, conectar/QR, status, webhook, logout).
 * NÃO faz parte do contrato `WhatsAppService` — é específico da Evolution.
 * Rotas conferidas contra a Evolution API v2.3.x; revisar ao trocar a versão da imagem.
 */
@Injectable()
export class EvolutionAdminService {
  private readonly logger = new Logger(EvolutionAdminService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  private get isEvolution(): boolean {
    return this.env.WHATSAPP_PROVIDER === "evolution" && Boolean(this.env.EVOLUTION_BASE_URL);
  }

  private assertEnabled(): void {
    if (this.env.WHATSAPP_PROVIDER !== "evolution") {
      throw new DomainError(
        "WhatsApp em modo de desenvolvimento (WHATSAPP_PROVIDER=console). Configure EVOLUTION_* e mude para 'evolution'.",
        "WhatsAppDevMode",
      );
    }
    if (!this.env.EVOLUTION_BASE_URL || !this.env.EVOLUTION_API_KEY) {
      throw new DomainError("EVOLUTION_BASE_URL / EVOLUTION_API_KEY não configurados.", "WhatsAppNotConfigured");
    }
  }

  private get base(): string {
    return (this.env.EVOLUTION_BASE_URL ?? "").replace(/\/$/, "");
  }
  /** Nome da instância a operar (o do household, quando informado; senão o default do env). */
  private inst(instance?: string): string {
    return instance || this.env.EVOLUTION_INSTANCE;
  }
  private get webhookUrl(): string {
    return `${this.env.API_PUBLIC_URL.replace(/\/$/, "")}/api/whatsapp/webhook`;
  }
  private allowlist(): string[] {
    return this.env.WHATSAPP_ALLOWLIST.split(",").map((s) => s.trim()).filter(Boolean);
  }

  private async call<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<{ ok: boolean; status: number; json: T | undefined; unreachable?: boolean }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const res = await fetch(`${this.base}${path}`, {
        method,
        signal: ctrl.signal,
        headers: {
          apikey: this.env.EVOLUTION_API_KEY ?? "",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json: T | undefined;
      try {
        json = text ? (JSON.parse(text) as T) : undefined;
      } catch {
        json = undefined;
      }
      if (!res.ok && res.status !== 404) {
        this.logger.warn(`Evolution ${method} ${path} -> ${res.status}: ${text.slice(0, 200)}`);
      }
      return { ok: res.ok, status: res.status, json };
    } catch (err) {
      this.logger.warn(`Evolution ${method} ${path} inacessível: ${(err as Error).message}`);
      return { ok: false, status: 0, json: undefined, unreachable: true };
    } finally {
      clearTimeout(timer);
    }
  }

  private normalizeState(raw: unknown): WhatsappStatus["state"] {
    const s = String(raw ?? "").toLowerCase();
    if (s === "open" || s === "connected") return "open";
    if (s === "connecting" || s === "qr" || s === "pairing") return "connecting";
    if (s === "close" || s === "closed" || s === "disconnected") return "close";
    return "unknown";
  }

  private jidToE164(jid: unknown): string | null {
    if (typeof jid !== "string") return null;
    const digits = jid.replace(/@.*/, "").replace(/\D/g, "");
    return digits ? `+${digits}` : null;
  }

  async status(instance?: string): Promise<WhatsappStatus> {
    const name = this.inst(instance);
    const shared = {
      provider: this.env.WHATSAPP_PROVIDER,
      enabled: this.isEvolution,
      instance: name,
      webhookUrl: this.webhookUrl,
      allowlist: this.allowlist(),
    };

    if (!this.isEvolution) {
      return {
        ...shared,
        evolutionReachable: false,
        state: "unknown",
        connected: false,
        number: null,
        profileName: null,
      };
    }

    // fetchInstances traz o número e o status; connectionState confirma o estado
    const list = await this.call<unknown[]>("GET", `/instance/fetchInstances?instanceName=${name}`);
    const conn = await this.call<{ instance?: { state?: string } }>(
      "GET",
      `/instance/connectionState/${name}`,
    );

    if (list.unreachable && conn.unreachable) {
      return {
        ...shared,
        evolutionReachable: false,
        state: "unknown",
        connected: false,
        number: null,
        profileName: null,
      };
    }

    const item = Array.isArray(list.json)
      ? (list.json.find((x) => {
          const o = x as Record<string, unknown>;
          const inst = (o.instance as Record<string, unknown>) ?? o;
          return (inst.instanceName ?? inst.name) === name;
        }) as Record<string, unknown> | undefined)
      : undefined;
    const inst = (item?.instance as Record<string, unknown>) ?? item ?? {};

    const state = this.normalizeState(
      conn.json?.instance?.state ?? inst.connectionStatus ?? inst.state ?? inst.status,
    );
    const number =
      this.jidToE164(inst.ownerJid ?? inst.owner ?? inst.wuid) ??
      (typeof inst.number === "string" ? `+${String(inst.number).replace(/\D/g, "")}` : null);

    return {
      ...shared,
      evolutionReachable: true,
      state,
      connected: state === "open",
      number,
      profileName: (inst.profileName as string) ?? null,
    };
  }

  private webhookBody() {
    return {
      url: this.webhookUrl,
      byEvents: false,
      base64: false,
      // MESSAGES_UPDATE traz a confirmação de entrega/leitura do que enviamos —
      // sem ela uma resposta pode sumir sem ninguém perceber.
      events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE"],
      ...(this.env.WHATSAPP_WEBHOOK_TOKEN
        ? { headers: { "x-webhook-token": this.env.WHATSAPP_WEBHOOK_TOKEN } }
        : {}),
    };
  }

  /** Cria a instância (com QR e webhook embutidos). Retorna a resposta da Evolution. */
  private async createInstance(name: string): Promise<Record<string, unknown>> {
    const res = await this.call<Record<string, unknown>>("POST", "/instance/create", {
      instanceName: name,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
      webhook: this.webhookBody(),
    });
    await this.applyRecommendedSettings(name).catch(() => {});
    return res.json ?? {};
  }

  /**
   * Settings que ajudam na estabilidade da sessão:
   *  - alwaysOnline: mantém o socket "quente" (menos desconexões).
   *  - readMessages: dispara o recibo de leitura — sem ele o destinatário às vezes
   *    fica preso em "aguardando esta mensagem".
   *  - groupsIgnore/syncFullHistory: menos tráfego = menos chance de key desync.
   */
  async applyRecommendedSettings(instance?: string): Promise<void> {
    const name = this.inst(instance);
    await this.call("POST", `/settings/set/${name}`, {
      rejectCall: false,
      msgCall: "",
      groupsIgnore: true,
      alwaysOnline: true,
      readMessages: true,
      readStatus: false,
      syncFullHistory: false,
    });
  }

  /**
   * Re-sobe a sessão usando as credenciais salvas (sem QR, quando ainda válidas).
   * Diferente do `connect()`, NÃO apaga/recria a instância. Usado pelo cron de saúde.
   */
  async reconnect(instance?: string): Promise<{ ok: true; state: WhatsappStatus["state"] }> {
    this.assertEnabled();
    const name = this.inst(instance);
    await this.call("GET", `/instance/connect/${name}`);
    const st = await this.status(name);
    return { ok: true, state: st.state };
  }

  /** Cria a instância se ainda não existir. */
  async ensureInstance(instance?: string): Promise<void> {
    this.assertEnabled();
    const name = this.inst(instance);
    const conn = await this.call("GET", `/instance/connectionState/${name}`);
    if (conn.status === 404 || conn.json === undefined) await this.createInstance(name);
  }

  /** Configura o webhook da instância para apontar para a nossa API. */
  async setWebhook(instance?: string): Promise<{ url: string }> {
    this.assertEnabled();
    const name = this.inst(instance);
    await this.ensureInstance(name);
    await this.call("POST", `/webhook/set/${name}`, {
      webhook: { enabled: true, ...this.webhookBody() },
    });
    await this.applyRecommendedSettings(name).catch(() => {});
    return { url: this.webhookUrl };
  }

  private extractQr(payload: Record<string, unknown> | undefined): WhatsappQr {
    const j = payload ?? {};
    const qc = (j.qrcode as Record<string, unknown> | undefined) ?? j;
    const raw = (qc.base64 as string) ?? (j.base64 as string) ?? (qc.code as string) ?? null;
    const qrBase64 = raw
      ? String(raw).startsWith("data:")
        ? String(raw)
        : `data:image/png;base64,${raw}`
      : null;
    const pairingCode = (qc.pairingCode as string) ?? (j.pairingCode as string) ?? null;
    return { state: "connecting", qrBase64, pairingCode };
  }

  /**
   * Gera um QR novo para parear. Se já estiver conectado, não faz nada.
   * Estratégia (Evolution v2.3): recria a instância — o QR vem na resposta do create.
   */
  async connect(instance?: string): Promise<WhatsappQr> {
    this.assertEnabled();
    const name = this.inst(instance);

    const st = await this.status(name);
    if (st.connected) return { state: "open", qrBase64: null, pairingCode: null };

    // instância sem QR fresco: apaga e recria (garante QR na resposta)
    await this.call("DELETE", `/instance/delete/${name}`);
    await new Promise((r) => setTimeout(r, 600));
    const created = await this.createInstance(name);

    let qr = this.extractQr(created);
    // fallback: alguns cenários entregam o QR só no /instance/connect logo depois
    if (!qr.qrBase64) {
      await new Promise((r) => setTimeout(r, 1500));
      const conn = await this.call<Record<string, unknown>>("GET", `/instance/connect/${name}`);
      qr = this.extractQr(conn.json);
    }
    return qr;
  }

  async logout(instance?: string): Promise<{ ok: true }> {
    this.assertEnabled();
    await this.call("DELETE", `/instance/logout/${this.inst(instance)}`);
    return { ok: true };
  }

  async restart(instance?: string): Promise<{ ok: true }> {
    this.assertEnabled();
    await this.call("POST", `/instance/restart/${this.inst(instance)}`);
    return { ok: true };
  }
}
