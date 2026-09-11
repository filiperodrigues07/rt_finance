/** Mensagem de entrada já normalizada (independente do provider). */
export interface InboundMessage {
  providerMessageId: string;
  fromPhone: string; // E.164
  /**
   * Endereço EXATO da conversa no WhatsApp (`key.remoteJid`), como veio do provider.
   * Pode ser `...@s.whatsapp.net` ou `...@lid`. É para cá que a resposta tem que ir:
   * remontar o número a partir do E.164 manda a mensagem para outra conversa, que o
   * destinatário nunca vê. Vazio se o provider não informar.
   */
  fromJid: string;
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
  /**
   * Status que o provider devolveu no envio (ex.: "PENDING"). Aceitar o envio NÃO é
   * garantia de entrega — a confirmação real chega depois por `messages.update`.
   */
  status?: string;
}

/** Confirmação de entrega/leitura de uma mensagem que enviamos. */
export interface StatusUpdate {
  providerMessageId: string;
  status: string;
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
  /** Extrai confirmações de entrega/leitura do payload do webhook (vazio se não houver). */
  abstract parseStatusUpdates(payload: unknown): StatusUpdate[];
  /**
   * Baixa o áudio de uma mensagem recebida já decodificado (a mídia do WhatsApp é
   * criptografada). `raw` é o `InboundMessage.raw`. `null` se não for possível.
   */
  abstract fetchAudio(
    raw: unknown,
    instance?: string,
  ): Promise<{ base64: string; mimetype: string } | null>;
  /** Igual ao fetchAudio, para mensagens de imagem (foto de recibo/NF). */
  abstract fetchImage(
    raw: unknown,
    instance?: string,
  ): Promise<{ base64: string; mimetype: string } | null>;
}
