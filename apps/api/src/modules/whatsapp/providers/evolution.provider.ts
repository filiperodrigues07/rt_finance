import { Inject, Injectable, Logger } from "@nestjs/common";
import { ENV, type Env } from "../../../config/env.schema";
import { digits, toE164BR } from "@rt-finance/shared";
import {
  WhatsAppService,
  type InboundMessage,
  type SendResult,
  type StatusUpdate,
} from "../whatsapp.types";

/**
 * Provider da Evolution API (self-hosted, v2.x — atendai/evolution-api).
 * Rotas/campos conferidos contra a doc da v2; se trocar a versão da imagem, revisar aqui.
 *   - envio texto:  POST {base}/message/sendText/{instance}   body { number, text }
 *   - envio mídia:  POST {base}/message/sendMedia/{instance}   body { number, mediatype, media, caption }
 *   - entrada:      webhook evento "messages.upsert" com { data: { key, message, pushName, ... } }
 * Autenticação da API: header "apikey". Autenticação do webhook: token compartilhado nosso.
 */

/** Quanto tempo guardamos o JID resolvido de um telefone (raramente muda). */
const JID_TTL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class EvolutionProvider extends WhatsAppService {
  private readonly logger = new Logger(EvolutionProvider.name);
  /** `instância:dígitosDoTelefone` → JID da conversa no WhatsApp. */
  private readonly jidCache = new Map<string, { number: string; at: number }>();

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  private get base(): string {
    const b = this.env.EVOLUTION_BASE_URL;
    if (!b) throw new Error("EVOLUTION_BASE_URL não configurado");
    return b.replace(/\/$/, "");
  }

  private async call<T>(path: string, body: unknown): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.env.WHATSAPP_HTTP_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "content-type": "application/json",
          apikey: this.env.EVOLUTION_API_KEY ?? "",
        },
        body: JSON.stringify(body),
      });
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? (JSON.parse(text) as unknown) : undefined;
    } catch {
      if (!res.ok) throw new Error(`Evolution API ${res.status}`);
      throw new Error("Evolution API: resposta não-JSON");
    }
    if (!res.ok) {
      this.logger.error({ status: res.status }, "Evolution API respondeu erro");
      throw new Error(`Evolution API ${res.status}`);
    }
    return json as T;
  }

  /** `call` com 1 retentativa em timeout / erro de rede / 5xx (só para envios curtos). */
  private async callRetry<T>(path: string, body: unknown): Promise<T> {
    try {
      return await this.call<T>(path, body);
    } catch (err) {
      const m = (err as Error).message;
      const retryable =
        (err as Error).name === "AbortError" ||
        /Evolution API 5\d\d/.test(m) ||
        /fetch failed|network|ECONN|ETIMEDOUT/i.test(m);
      if (!retryable) throw err;
      await new Promise((r) => setTimeout(r, 1000));
      return this.call<T>(path, body);
    }
  }

  private inst(instance?: string): string {
    return instance || this.env.EVOLUTION_INSTANCE;
  }

  /**
   * Guarda "telefone que conhecemos" → "JID da conversa", aprendido de uma mensagem
   * recebida. É a fonte de verdade: veio do próprio WhatsApp. Serve para os envios que
   * partem do sistema (alertas, resumo semanal, card compartilhado), onde só temos o
   * telefone salvo no cadastro.
   */
  private rememberJid(phone: string, jid: string, instance?: string | null): void {
    if (!jid.includes("@")) return;
    const inst = this.inst(instance ?? undefined);
    const at = Date.now();
    for (const variant of new Set([digits(phone), digits(jid)])) {
      if (variant) this.jidCache.set(`${inst}:${variant}`, { number: jid, at });
    }
  }

  /**
   * Devolve o endereço de envio para a Evolution.
   *
   * Se já for um JID (`...@s.whatsapp.net` / `...@lid`), passa direto — o `createJid`
   * da Evolution repassa JIDs sem tocar. Isso importa porque o WhatsApp novo endereça
   * conversas por LID: responder no telefone quando a conversa é LID devolve 201 com um
   * id de mensagem normal, mas nada aparece para o destinatário.
   *
   * Só temos o telefone (alerta, resumo, card)? Usa o JID aprendido de uma mensagem
   * anterior; se não houver, pergunta o JID canônico à Evolution. Em último caso devolve
   * os dígitos — melhor tentar enviar do que falhar.
   */
  private async resolveTarget(target: string, instance?: string): Promise<string> {
    if (target.includes("@")) return target;

    const raw = digits(target);
    if (!raw) return raw;

    const inst = this.inst(instance);
    const cacheKey = `${inst}:${raw}`;
    const hit = this.jidCache.get(cacheKey);
    if (hit && Date.now() - hit.at < JID_TTL_MS) return hit.number;

    try {
      const rows = await this.call<{ jid?: string; exists?: boolean }[]>(
        `/chat/whatsappNumbers/${inst}`,
        { numbers: [raw] },
      );
      const found = Array.isArray(rows) ? rows.find((r) => r?.exists && r?.jid) : undefined;
      if (found?.jid) {
        this.jidCache.set(cacheKey, { number: found.jid, at: Date.now() });
        return found.jid;
      }
      this.logger.warn(`número ${raw} não existe no WhatsApp; enviando assim mesmo`);
    } catch (err) {
      this.logger.warn(`falha ao resolver o JID de ${raw}: ${(err as Error).message}`);
    }
    return raw;
  }

  async sendText(toPhone: string, text: string, instance?: string): Promise<SendResult> {
    const number = await this.resolveTarget(toPhone, instance);
    const json = await this.callRetry<{ key?: { id?: string }; status?: string }>(
      `/message/sendText/${this.inst(instance)}`,
      { number, text },
    );
    return { providerMessageId: json.key?.id ?? `out_${Date.now()}`, status: json.status };
  }

  async sendImage(
    toPhone: string,
    png: Buffer,
    caption?: string,
    instance?: string,
  ): Promise<SendResult> {
    const number = await this.resolveTarget(toPhone, instance);
    const json = await this.call<{ key?: { id?: string }; status?: string }>(
      `/message/sendMedia/${this.inst(instance)}`,
      {
        number,
        mediatype: "image",
        mimetype: "image/png",
        media: png.toString("base64"),
        fileName: "rt-finance.png",
        caption: caption ?? "",
      },
    );
    return { providerMessageId: json.key?.id ?? `out_${Date.now()}`, status: json.status };
  }

  async fetchAudio(
    raw: unknown,
    instance?: string,
  ): Promise<{ base64: string; mimetype: string } | null> {
    const item = raw as Record<string, any> | undefined;
    if (!item?.key) return null;
    try {
      // Evolution v2.3.7 exige a mensagem completa (key + message.audioMessage), não só a key —
      // ele não persiste a mensagem p/ resolver pela key (DATABASE_SAVE_DATA_NEW_MESSAGE=false).
      const json = await this.call<{ base64?: string; mimetype?: string; media?: string }>(
        `/chat/getBase64FromMediaMessage/${this.inst(instance)}`,
        { message: item, convertToMp4: false },
      );
      const base64 = json.base64 ?? json.media ?? null;
      if (!base64) return null;
      // ~3/4 do comprimento base64 = bytes decodificados
      if (base64.length * 0.75 > this.env.AUDIO_MAX_BYTES) {
        this.logger.warn("áudio acima do limite; ignorado antes de decodificar");
        return null;
      }
      return { base64, mimetype: json.mimetype ?? "audio/ogg" };
    } catch (err) {
      this.logger.warn(`falha ao baixar áudio: ${(err as Error).message}`);
      return null;
    }
  }

  async fetchImage(
    raw: unknown,
    instance?: string,
  ): Promise<{ base64: string; mimetype: string } | null> {
    const item = raw as Record<string, any> | undefined;
    if (!item?.key) return null;
    try {
      const json = await this.call<{ base64?: string; mimetype?: string; media?: string }>(
        `/chat/getBase64FromMediaMessage/${this.inst(instance)}`,
        { message: item, convertToMp4: false },
      );
      const base64 = json.base64 ?? json.media ?? null;
      if (!base64) return null;
      if (base64.length * 0.75 > 8 * 1024 * 1024) {
        this.logger.warn("imagem acima de 8 MB; ignorada");
        return null;
      }
      return { base64, mimetype: json.mimetype ?? "image/jpeg" };
    } catch (err) {
      this.logger.warn(`falha ao baixar imagem: ${(err as Error).message}`);
      return null;
    }
  }

  verifyWebhook(
    headers: Record<string, unknown>,
    query: Record<string, unknown>,
  ): boolean {
    const expected = this.env.WHATSAPP_WEBHOOK_TOKEN;
    if (!expected) {
      // Sem token configurado: só liberamos fora de produção.
      return this.env.NODE_ENV !== "production";
    }
    const header = String(
      headers["x-webhook-token"] ??
        headers["x-hub-signature-256"] ??
        (typeof headers["authorization"] === "string"
          ? (headers["authorization"] as string).replace(/^Bearer\s+/i, "")
          : ""),
    );
    const q = String(query["token"] ?? "");
    return header === expected || q === expected;
  }

  /**
   * Lê o evento `messages.update` — é ele que diz se a mensagem REALMENTE chegou.
   * Aceitar o envio só significa que a Evolution enfileirou (status "PENDING"); sem
   * este evento não temos como saber que uma resposta sumiu no caminho.
   */
  parseStatusUpdates(payload: unknown): StatusUpdate[] {
    const root = payload as Record<string, unknown> | undefined;
    if (!root) return [];
    const event = String(root["event"] ?? "").toLowerCase().replace(/_/g, ".");
    if (event !== "messages.update") return [];

    const data = root["data"];
    const items = Array.isArray(data) ? data : data ? [data] : [];
    const out: StatusUpdate[] = [];
    for (const item of items) {
      const m = item as Record<string, any>;
      const id = String(m?.keyId ?? m?.key?.id ?? m?.id ?? "");
      const status = String(m?.status ?? m?.update?.status ?? "");
      if (id && status) out.push({ providerMessageId: id, status });
    }
    return out;
  }

  parseInbound(payload: unknown): InboundMessage[] {
    const root = payload as Record<string, unknown> | undefined;
    if (!root) return [];

    const event = String(root["event"] ?? "").toLowerCase().replace(/_/g, ".");
    if (event && event !== "messages.upsert") return [];

    const data = root["data"];
    const items = Array.isArray(data) ? data : data ? [data] : [];
    const out: InboundMessage[] = [];

    // nome da instância que recebeu (Evolution manda em vários lugares conforme a versão)
    const rootInstance =
      (typeof root["instance"] === "string" && root["instance"]) ||
      (typeof root["instanceName"] === "string" && (root["instanceName"] as string)) ||
      null;

    for (const item of items) {
      const m = item as Record<string, any>;
      const key = m?.key ?? {};
      if (key.fromMe) continue;
      const remoteJid = String(key.remoteJid ?? "");
      if (remoteJid.endsWith("@g.us") || remoteJid.endsWith("@broadcast")) continue;

      // WhatsApp novo entrega a 1ª mensagem com um ID mascarado "…@lid".
      // O número real vem em senderPn / participantPn / previousRemoteJid.
      const candidates = [
        key.senderPn,
        key.participantPn,
        m?.senderPn,
        !remoteJid.endsWith("@lid") ? remoteJid : null,
        !String(key.previousRemoteJid ?? "").endsWith("@lid") ? key.previousRemoteJid : null,
        key.participant,
      ];
      const jid = String(candidates.find((c) => typeof c === "string" && c && !String(c).endsWith("@lid")) ?? remoteJid);
      if (!jid || jid.endsWith("@lid")) {
        this.logger.warn(`mensagem sem número identificável (remoteJid=${remoteJid}); ignorada`);
        continue;
      }

      const msg = m?.message ?? {};
      let text: string | null = null;
      let type: InboundMessage["type"] = "OTHER";
      if (typeof msg.conversation === "string") {
        text = msg.conversation;
        type = "TEXT";
      } else if (typeof msg?.extendedTextMessage?.text === "string") {
        text = msg.extendedTextMessage.text;
        type = "TEXT";
      } else if (msg?.imageMessage) {
        text = msg.imageMessage.caption ?? null;
        type = "IMAGE";
      } else if (msg?.audioMessage) {
        type = "AUDIO";
      } else if (msg?.documentMessage) {
        type = "DOCUMENT";
      }

      const tsRaw = Number(m?.messageTimestamp ?? 0);
      const timestamp = tsRaw > 0 ? new Date(tsRaw * 1000) : new Date();

      const fromPhone = toE164BR(jid);
      // Endereço da conversa: o que o WhatsApp usou, não o que deduzimos do telefone.
      // Com o WhatsApp novo isso costuma ser um "@lid" — responder no telefone nesse
      // caso cai numa conversa que o destinatário não vê.
      const fromJid = remoteJid || jid;
      this.rememberJid(
        fromPhone,
        fromJid,
        (typeof m?.instance === "string" && m.instance) || rootInstance,
      );

      out.push({
        providerMessageId: String(key.id ?? `in_${timestamp.getTime()}`),
        fromPhone,
        fromJid,
        toPhone: root["sender"] ? toE164BR(String(root["sender"])) : "",
        text: text?.trim() ?? null,
        type,
        timestamp,
        pushName: typeof m?.pushName === "string" ? m.pushName : null,
        instance: (typeof m?.instance === "string" && m.instance) || rootInstance,
        raw: item,
      });
    }
    return out;
  }
}
