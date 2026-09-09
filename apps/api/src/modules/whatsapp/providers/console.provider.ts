import { Injectable, Logger } from "@nestjs/common";
import { EvolutionProvider } from "./evolution.provider";
import { WhatsAppService, type InboundMessage, type SendResult } from "../whatsapp.types";

/**
 * Provider de desenvolvimento: não chama nenhuma API — apenas registra o que "enviaria"
 * no log. O parsing de entrada reaproveita o do Evolution (mesmo formato de webhook).
 * Selecionado com WHATSAPP_PROVIDER=console.
 */
@Injectable()
export class ConsoleProvider extends WhatsAppService {
  private readonly logger = new Logger("WhatsApp(console)");

  constructor(private readonly evolution: EvolutionProvider) {
    super();
  }

  async sendText(toPhone: string, text: string, instance?: string): Promise<SendResult> {
    this.logger.log(`→ ${toPhone}${instance ? ` [${instance}]` : ""}\n${text}`);
    return { providerMessageId: `console_${Date.now()}` };
  }

  async sendImage(
    toPhone: string,
    png: Buffer,
    caption?: string,
    instance?: string,
  ): Promise<SendResult> {
    this.logger.log(`→ ${toPhone}${instance ? ` [${instance}]` : ""} [imagem ${png.length}B] ${caption ?? ""}`);
    return { providerMessageId: `console_${Date.now()}` };
  }

  verifyWebhook(): boolean {
    return true;
  }

  parseInbound(payload: unknown): InboundMessage[] {
    return this.evolution.parseInbound(payload);
  }

  parseStatusUpdates(payload: unknown) {
    return this.evolution.parseStatusUpdates(payload);
  }

  async fetchAudio(): Promise<{ base64: string; mimetype: string } | null> {
    return null;
  }
}
