import { Injectable, Logger } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { PrismaService } from "../../lib/prisma.service";
import { ENV, type Env } from "../../config/env.schema";
import { ReportsService } from "../reports/reports.service";
import { FinanceAssistant } from "../ai/finance-assistant.service";
import { TranscriptionService } from "../ai/transcription.service";
import { WhatsAppService, type InboundMessage } from "./whatsapp.types";
import { phonesMatch } from "./phone";
import * as fmt from "./formatters";

interface ResolvedSender {
  householdId: string;
  householdName: string;
  memberId: string;
  displayName: string;
  userId: string;
  whatsappInstance: string | null;
}

@Injectable()
export class MessageRouter {
  private readonly logger = new Logger(MessageRouter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
    private readonly reports: ReportsService,
    private readonly assistant: FinanceAssistant,
    private readonly transcription: TranscriptionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private allowlist(): string[] {
    return this.env.WHATSAPP_ALLOWLIST.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private isAllowed(phone: string): boolean {
    const list = this.allowlist();
    if (list.length === 0) return true; // dev: sem allowlist, libera
    return list.some((p) => phonesMatch(p, phone));
  }

  private async resolveSender(phone: string): Promise<ResolvedSender | null> {
    const members = await this.prisma.householdMember.findMany({
      include: {
        user: { select: { id: true, phoneE164: true } },
        household: { select: { name: true, whatsappInstance: true } },
      },
    });
    const match = members.find(
      (m) => m.user.phoneE164 && phonesMatch(m.user.phoneE164, phone),
    );
    if (!match) return null;
    return {
      householdId: match.householdId,
      householdName: match.household.name,
      memberId: match.id,
      displayName: match.displayName,
      userId: match.user.id,
      whatsappInstance: match.household.whatsappInstance,
    };
  }

  /** Persiste a mensagem recebida (idempotente por providerMessageId). Retorna false se duplicada. */
  async persistInbound(msg: InboundMessage): Promise<boolean> {
    try {
      await this.prisma.whatsappMessage.create({
        data: {
          providerMessageId: msg.providerMessageId,
          direction: "INBOUND",
          fromPhone: msg.fromPhone,
          toPhone: msg.toPhone || "",
          type: msg.type,
          text: msg.text,
          rawPayload: msg.raw as object,
        },
      });
      return true;
    } catch (err) {
      // P2002 = já existe (reentrega do webhook)
      if ((err as { code?: string }).code === "P2002") return false;
      throw err;
    }
  }

  private async reply(
    to: string,
    text: string,
    sender?: { householdId: string; whatsappInstance: string | null } | null,
    fallbackInstance?: string | null,
  ): Promise<void> {
    const instance = sender?.whatsappInstance ?? fallbackInstance ?? undefined;
    const res = await this.whatsapp.sendText(to, text, instance || undefined);
    await this.prisma.whatsappMessage.create({
      data: {
        householdId: sender?.householdId ?? null,
        providerMessageId: res.providerMessageId,
        direction: "OUTBOUND",
        fromPhone: "",
        toPhone: to,
        type: "TEXT",
        text,
        rawPayload: {},
        status: "sent",
      },
    });
  }

  async handle(msg: InboundMessage): Promise<void> {
    const fresh = await this.persistInbound(msg);
    if (!fresh) {
      this.logger.debug(`mensagem ${msg.providerMessageId} já processada`);
      return;
    }

    // Autorização = ter um número cadastrado num membro (gerido pela tela). O
    // WHATSAPP_ALLOWLIST do .env é só uma trava global EXTRA e opcional.
    const sender = await this.resolveSender(msg.fromPhone);
    if (!sender || !this.isAllowed(msg.fromPhone)) {
      this.logger.warn(`número não autorizado: ${msg.fromPhone}`);
      await this.reply(msg.fromPhone, fmt.notAuthorized(), null, msg.instance);
      return;
    }

    // Defesa: a mensagem tem que ter chegado pela instância do household do remetente.
    const expectedInstance = sender.whatsappInstance ?? this.env.EVOLUTION_INSTANCE;
    if (msg.instance && msg.instance !== expectedInstance) {
      this.logger.warn(
        `instância divergente: msg via "${msg.instance}", esperado "${expectedInstance}" (${sender.householdName})`,
      );
      return;
    }

    // Áudio (nota de voz): transcreve e segue como se fosse texto.
    if (msg.type === "AUDIO") {
      const media = await this.whatsapp
        .fetchAudio(msg.raw, sender.whatsappInstance ?? undefined)
        .catch(() => null);
      const transcript = media
        ? await this.transcription.transcribe(Buffer.from(media.base64, "base64"), media.mimetype)
        : null;
      if (!transcript) {
        await this.reply(msg.fromPhone, fmt.audioUnavailable(), sender);
        return;
      }
      this.logger.log(`áudio transcrito (${sender.householdName}): "${transcript.slice(0, 80)}"`);
      await this.prisma.whatsappMessage
        .update({
          where: { providerMessageId: msg.providerMessageId },
          data: { text: transcript, type: "TEXT" },
        })
        .catch(() => {});
      msg = { ...msg, text: transcript, type: "TEXT" };
    }

    const text = (msg.text ?? "").trim();
    const cmd = text.toLowerCase().replace(/[!.?]/g, "").trim();

    try {
      if (!text) {
        await this.reply(msg.fromPhone, fmt.help(sender.displayName), sender);
        return;
      }
      if (["ajuda", "help", "menu", "oi", "olá", "ola", "start", "/start"].includes(cmd)) {
        await this.reply(msg.fromPhone, fmt.help(sender.displayName), sender);
        return;
      }
      if (cmd === "ping") {
        await this.reply(msg.fromPhone, "pong ✅", sender);
        return;
      }
      if (["id", "quem sou eu", "eu"].includes(cmd)) {
        await this.reply(
          msg.fromPhone,
          fmt.whoAmI({
            displayName: sender.displayName,
            householdName: sender.householdName,
            phone: msg.fromPhone,
          }),
          sender,
        );
        return;
      }
      if (cmd === "saldo") {
        const report = await this.reports.dashboard(sender.householdId, { months: 6 });
        await this.reply(msg.fromPhone, fmt.balance(report), sender);
        return;
      }
      if (["resumo", "resumo do mes", "resumo do mês", "resumo mensal"].includes(cmd)) {
        const report = await this.reports.dashboard(sender.householdId, { months: 6 });
        await this.reply(msg.fromPhone, fmt.monthSummary(report), sender);
        return;
      }

      // Tudo o mais vai para o assistente de IA (interpretação + confirmação).
      const out = await this.assistant.handle({
        householdId: sender.householdId,
        memberId: sender.memberId,
        memberName: sender.displayName,
        channel: "WHATSAPP",
        text,
        messageId: null,
      });
      if (out.image) {
        const res = await this.whatsapp.sendImage(msg.fromPhone, out.image, out.reply, sender.whatsappInstance || undefined);
        await this.prisma.whatsappMessage.create({
          data: {
            householdId: sender.householdId,
            providerMessageId: res.providerMessageId,
            direction: "OUTBOUND",
            fromPhone: "",
            toPhone: msg.fromPhone,
            type: "IMAGE",
            text: out.reply,
            rawPayload: {},
            status: "sent",
          },
        });
      } else {
        await this.reply(msg.fromPhone, out.reply, sender);
      }
    } catch (err) {
      this.logger.error({ err }, "erro ao processar mensagem");
      await this.reply(
        msg.fromPhone,
        "Ops, algo deu errado ao processar sua mensagem. Tente novamente.",
        sender,
      );
    }
  }
}
