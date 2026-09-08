import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../lib/prisma.service";
import { NotFoundError, DomainError } from "../../common/errors/domain-error";
import { ReportsService } from "../reports/reports.service";
import { WhatsAppService } from "../whatsapp/whatsapp.types";
import {
  ShareCardService,
  type TxCardInput,
  type InvoiceCardInput,
} from "./share-card.service";

const INVOICE_STATUS_LABEL: Record<string, string> = {
  OPEN: "Aberta",
  CLOSED: "Fechada",
  PAID: "Paga",
  OVERDUE: "Vencida",
};

@Injectable()
export class ShareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly cards: ShareCardService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  private async actorName(householdId: string, memberId: string): Promise<string> {
    const m = await this.prisma.householdMember.findFirst({
      where: { id: memberId, householdId },
      select: { displayName: true },
    });
    return m?.displayName ?? "alguém";
  }

  async transactionPng(householdId: string, memberId: string, txId: string): Promise<Buffer> {
    const tx = await this.prisma.transaction.findFirst({
      where: { id: txId, householdId },
      select: {
        description: true,
        amountCents: true,
        type: true,
        date: true,
        category: { select: { name: true, color: true } },
        member: { select: { displayName: true } },
        account: { select: { name: true } },
        creditCard: { select: { name: true } },
      },
    });
    if (!tx) throw new NotFoundError("Transação");
    const input: TxCardInput = {
      description: tx.description,
      amountCents: tx.amountCents,
      type: tx.type,
      date: tx.date.toISOString().slice(0, 10),
      categoryName: tx.category?.name ?? null,
      categoryColor: tx.category?.color ?? null,
      memberName: tx.member.displayName,
      sourceName: tx.account?.name ?? tx.creditCard?.name ?? null,
    };
    return this.cards.renderTransaction(input, await this.actorName(householdId, memberId));
  }

  async monthPng(
    householdId: string,
    memberId: string,
    range: { from?: string; to?: string },
  ): Promise<Buffer> {
    const dash = await this.reports.dashboard(householdId, range);
    return this.cards.renderMonth(dash, await this.actorName(householdId, memberId));
  }

  async invoicePng(householdId: string, memberId: string, invoiceId: string): Promise<Buffer> {
    const inv = await this.prisma.creditCardInvoice.findFirst({
      where: { id: invoiceId, creditCard: { householdId } },
      select: {
        referenceMonth: true,
        totalCents: true,
        dueDate: true,
        status: true,
        creditCard: { select: { name: true } },
      },
    });
    if (!inv) throw new NotFoundError("Fatura");
    const input: InvoiceCardInput = {
      cardName: inv.creditCard.name,
      referenceMonth: inv.referenceMonth.toISOString().slice(0, 10),
      totalCents: inv.totalCents,
      dueDate: inv.dueDate.toISOString().slice(0, 10),
      statusLabel: INVOICE_STATUS_LABEL[inv.status] ?? inv.status,
    };
    return this.cards.renderInvoice(input, await this.actorName(householdId, memberId));
  }

  /** Envia um PNG já pronto para o WhatsApp do membro escolhido. */
  async sendToWhatsapp(
    householdId: string,
    toMemberId: string,
    png: Buffer,
    caption: string,
  ): Promise<{ ok: true }> {
    const [target, household] = await Promise.all([
      this.prisma.householdMember.findFirst({
        where: { id: toMemberId, householdId },
        select: { displayName: true, user: { select: { phoneE164: true } } },
      }),
      this.prisma.household.findUnique({
        where: { id: householdId },
        select: { whatsappInstance: true },
      }),
    ]);
    if (!target) throw new NotFoundError("Membro");
    if (!target.user.phoneE164) {
      throw new DomainError(`${target.displayName} não tem WhatsApp cadastrado`);
    }

    const res = await this.whatsapp.sendImage(
      target.user.phoneE164,
      png,
      caption,
      household?.whatsappInstance || undefined,
    );
    await this.prisma.whatsappMessage.create({
      data: {
        householdId,
        providerMessageId: res.providerMessageId,
        direction: "OUTBOUND",
        fromPhone: "",
        toPhone: target.user.phoneE164,
        type: "IMAGE",
        text: caption,
        rawPayload: {},
        status: "sent",
      },
    });
    return { ok: true };
  }
}
