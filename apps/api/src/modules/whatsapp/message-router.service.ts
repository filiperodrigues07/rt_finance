import { Injectable, Logger } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { PrismaService } from "../../lib/prisma.service";
import { ENV, type Env } from "../../config/env.schema";
import { ReportsService } from "../reports/reports.service";
import { FinanceAssistant } from "../ai/finance-assistant.service";
import { TranscriptionService } from "../ai/transcription.service";
import { WhatsAppService, type InboundMessage, type StatusUpdate } from "./whatsapp.types";
import { phoneCandidates, phonesMatch } from "./phone";
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
    const memberInclude = {
      user: { select: { id: true, phoneE164: true } },
      household: { select: { name: true, whatsappInstance: true } },
    } as const;

    try {
      // 1) casamento direto contra o índice único de User.phoneE164
      const cands = phoneCandidates(phone);
      let user = cands.length
        ? await this.prisma.user.findFirst({
            where: { phoneE164: { in: cands } },
            select: { id: true, memberships: { include: memberInclude, take: 1 } },
          })
        : null;

      // 2) fallback difuso — só entre usuários que TÊM telefone (bem menor que "todos os membros")
      if (!user) {
        const withPhone = await this.prisma.user.findMany({
          where: { phoneE164: { not: null } },
          select: { id: true, phoneE164: true, memberships: { include: memberInclude, take: 1 } },
        });
        user = withPhone.find((u) => u.phoneE164 && phonesMatch(u.phoneE164, phone)) ?? null;
      }

      const m = user?.memberships[0];
      if (!m) return null;
      return {
        householdId: m.householdId,
        householdName: m.household.name,
        memberId: m.id,
        displayName: m.displayName,
        userId: m.user.id,
        whatsappInstance: m.household.whatsappInstance,
      };
    } catch (err) {
      this.logger.error(`resolveSender falhou: ${(err as Error).message}`);
      return null;
    }
  }

  /** Persiste a mensagem recebida (idempotente por providerMessageId). Retorna o id, ou null se duplicada. */
  async persistInbound(msg: InboundMessage): Promise<string | null> {
    try {
      const row = await this.prisma.whatsappMessage.create({
        data: {
          providerMessageId: msg.providerMessageId,
          direction: "INBOUND",
          fromPhone: msg.fromPhone,
          toPhone: msg.toPhone || "",
          type: msg.type,
          text: msg.text,
          rawPayload: msg.raw as object,
        },
        select: { id: true },
      });
      return row.id;
    } catch (err) {
      // P2002 = já existe (reentrega do webhook)
      if ((err as { code?: string }).code === "P2002") return null;
      throw err;
    }
  }

  /**
   * Aplica as confirmações de entrega/leitura vindas do webhook. É o que diferencia
   * "a Evolution aceitou o envio" de "a mensagem chegou": sem isso, uma resposta que
   * some no caminho fica registrada como enviada e ninguém percebe.
   */
  async applyStatusUpdates(updates: StatusUpdate[]): Promise<void> {
    for (const u of updates) {
      const done = await this.prisma.whatsappMessage.updateMany({
        where: { providerMessageId: u.providerMessageId, direction: "OUTBOUND" },
        data: { status: u.status },
      });
      if (done.count && /^(ERROR|SERVER_ACK_ERROR|FAILED)$/i.test(u.status)) {
        this.logger.error(`WhatsApp não entregou a mensagem ${u.providerMessageId}: ${u.status}`);
      }
    }
  }

  /** reply() que engole o próprio erro — para uso no caminho de recuperação. */
  private async safeReply(
    to: string,
    text: string,
    sender?: { householdId: string; whatsappInstance: string | null } | null,
    fallbackInstance?: string | null,
  ): Promise<void> {
    try {
      await this.reply(to, text, sender, fallbackInstance);
    } catch (err) {
      this.logger.error(`falha ao enviar resposta de erro: ${(err as Error).message}`);
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
        status: res.status ?? "sent",
      },
    });
  }

  async handle(msg: InboundMessage): Promise<void> {
    const messageId = await this.persistInbound(msg);
    if (!messageId) {
      this.logger.debug(`mensagem ${msg.providerMessageId} já processada`);
      return;
    }

    // Responder SEMPRE no endereço exato da conversa que o WhatsApp mandou. Remontar o
    // número a partir do E.164 abre outra conversa e a resposta some para o destinatário.
    const replyTo = msg.fromJid || msg.fromPhone;

    // Autorização = ter um número cadastrado num membro (gerido pela tela). O
    // WHATSAPP_ALLOWLIST do .env é só uma trava global EXTRA e opcional.
    const sender = await this.resolveSender(msg.fromPhone);
    if (!sender || !this.isAllowed(msg.fromPhone)) {
      this.logger.warn("número não autorizado");
      await this.safeReply(replyTo, fmt.notAuthorized(), null, msg.instance);
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
      const result = media
        ? await this.transcription.transcribe(Buffer.from(media.base64, "base64"), media.mimetype)
        : ({ ok: false, reason: "transient" } as const); // media null = não baixou (rede/instância/grande demais)
      if (!result.ok) {
        await this.safeReply(replyTo, fmt.audioProblem(result.reason), sender);
        return;
      }
      this.logger.debug(`áudio transcrito (${result.text.length} chars)`);
      await this.prisma.whatsappMessage
        .update({
          where: { providerMessageId: msg.providerMessageId },
          data: { text: result.text, type: "TEXT" },
        })
        .catch(() => {});
      msg = { ...msg, text: result.text, type: "TEXT" };
    }

    const text = (msg.text ?? "").trim();
    const cmd = text.toLowerCase().replace(/[!.?]/g, "").trim();

    try {
      if (!text) {
        await this.reply(replyTo, fmt.help(sender.displayName), sender);
        return;
      }
      if (["ajuda", "help", "menu", "oi", "olá", "ola", "start", "/start"].includes(cmd)) {
        await this.reply(replyTo, fmt.help(sender.displayName), sender);
        return;
      }
      if (cmd === "ping") {
        await this.reply(replyTo, "pong ✅", sender);
        return;
      }
      if (["id", "quem sou eu", "eu"].includes(cmd)) {
        await this.reply(
          replyTo,
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
        await this.reply(replyTo, fmt.balance(report), sender);
        return;
      }
      if (["resumo", "resumo do mes", "resumo do mês", "resumo mensal"].includes(cmd)) {
        const report = await this.reports.dashboard(sender.householdId, { months: 6 });
        await this.reply(replyTo, fmt.monthSummary(report), sender);
        return;
      }

      // Tudo o mais vai para o assistente de IA (interpretação + confirmação).
      const out = await this.assistant.handle({
        householdId: sender.householdId,
        memberId: sender.memberId,
        memberName: sender.displayName,
        channel: "WHATSAPP",
        text,
        messageId,
      });
      if (out.image) {
        const res = await this.whatsapp.sendImage(replyTo, out.image, out.reply, sender.whatsappInstance || undefined);
        await this.prisma.whatsappMessage.create({
          data: {
            householdId: sender.householdId,
            providerMessageId: res.providerMessageId,
            direction: "OUTBOUND",
            fromPhone: "",
            toPhone: replyTo,
            type: "IMAGE",
            text: out.reply,
            rawPayload: {},
            status: res.status ?? "sent",
          },
        });
      } else {
        await this.reply(replyTo, out.reply, sender);
      }
    } catch (err) {
      this.logger.error(`erro ao processar mensagem ${msg.providerMessageId}: ${(err as Error).message}`);
      await this.safeReply(
        replyTo,
        "Ops, algo deu errado ao processar sua mensagem. Tente novamente.",
        sender,
      );
    }
  }
}
