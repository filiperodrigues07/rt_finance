/** Mensagem de entrada já normalizada (independente do provider). */
export interface InboundMessage {
  providerMessageId: string;
  fromPhone: string; // E.164
  toPhone: string; // E.164 (número da instância) — pode ficar vazio se o provider não informar
  text: string | null;
  type: "TEXT" | "IMAGE" | "AUDIO" | "DOCUMENT" | "INTERACTIVE" | "OTHER";
  timestamp: Date;
  pushName: string | null;
  /** Nome da instância da Evolution que recebeu a mensagem (roteamento por household). */
  instance: string | null;
  raw: unknown;
}

export interface SendResult {
  providerMessageId: string;
}

/** Contrato de qualquer provider de WhatsApp. Usado como token de DI. */
export abstract class WhatsAppService {
  /** `instance` = instância da Evolution a usar; ausente → a default do env. */
  abstract sendText(toPhone: string, text: string, instance?: string): Promise<SendResult>;
  abstract sendImage(
    toPhone: string,
    png: Buffer,
    caption?: string,
    instance?: string,
  ): Promise<SendResult>;
  /** Valida a autenticidade da requisição do webhook. */
  abstract verifyWebhook(headers: Record<string, unknown>, query: Record<string, unknown>): boolean;
  /** Converte o payload bruto do provider em InboundMessage[] (ignora eventos irrelevantes). */
  abstract parseInbound(payload: unknown): InboundMessage[];
  /**
   * Baixa o áudio de uma mensagem recebida já decodificado (a mídia do WhatsApp é
   * criptografada). `raw` é o `InboundMessage.raw`. `null` se não for possível.
   */
  abstract fetchAudio(
    raw: unknown,
    instance?: string,
  ): Promise<{ base64: string; mimetype: string } | null>;
}
