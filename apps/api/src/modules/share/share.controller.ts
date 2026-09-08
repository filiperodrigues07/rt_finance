import { Body, Controller, Get, Param, Post, Query, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import {
  idParam,
  shareMonthQuery,
  shareWhatsappBody,
  type AuthUser,
  type ShareTarget,
  type ShareWhatsappBody,
} from "@rt-finance/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { PrismaService } from "../../lib/prisma.service";
import { ShareService } from "./share.service";

const CAPTION = {
  transaction: "Dá uma olhada nesse lançamento 👀",
  month: "Nosso resumo do mês 📊",
  invoice: "Fatura do cartão 💳",
} as const;

function sendPng(res: FastifyReply, buf: Buffer, filename: string): Buffer {
  void res.header("content-type", "image/png");
  void res.header("content-disposition", `attachment; filename="${filename}"`);
  return buf;
}

@Controller("share")
export class ShareController {
  constructor(
    private readonly service: ShareService,
    private readonly prisma: PrismaService,
  ) {}

  /** Membros do household que podem receber o card (para o seletor de destino). */
  @Get("targets")
  async targets(@CurrentUser() user: AuthUser): Promise<ShareTarget[]> {
    const members = await this.prisma.householdMember.findMany({
      where: { householdId: user.householdId },
      select: { id: true, displayName: true, user: { select: { phoneE164: true } } },
      orderBy: { displayName: "asc" },
    });
    return members.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      hasPhone: Boolean(m.user.phoneE164),
    }));
  }

  @Get("transaction/:id")
  async transaction(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<Buffer> {
    const buf = await this.service.transactionPng(user.householdId, user.memberId, params.id);
    return sendPng(res, buf, "rt-finance-lancamento.png");
  }

  @Get("month")
  async month(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(shareMonthQuery)) q: { from?: string; to?: string },
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<Buffer> {
    const buf = await this.service.monthPng(user.householdId, user.memberId, q);
    return sendPng(res, buf, "rt-finance-resumo-mes.png");
  }

  @Get("invoice/:id")
  async invoice(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<Buffer> {
    const buf = await this.service.invoicePng(user.householdId, user.memberId, params.id);
    return sendPng(res, buf, "rt-finance-fatura.png");
  }

  @Post("transaction/:id/whatsapp")
  async transactionWhatsapp(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Body(new ZodValidationPipe(shareWhatsappBody)) body: ShareWhatsappBody,
  ) {
    const png = await this.service.transactionPng(user.householdId, user.memberId, params.id);
    return this.service.sendToWhatsapp(user.householdId, body.toMemberId, png, CAPTION.transaction);
  }

  @Post("month/whatsapp")
  async monthWhatsapp(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(shareWhatsappBody)) body: ShareWhatsappBody,
  ) {
    const png = await this.service.monthPng(user.householdId, user.memberId, {
      from: body.from,
      to: body.to,
    });
    return this.service.sendToWhatsapp(user.householdId, body.toMemberId, png, CAPTION.month);
  }

  @Post("invoice/:id/whatsapp")
  async invoiceWhatsapp(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Body(new ZodValidationPipe(shareWhatsappBody)) body: ShareWhatsappBody,
  ) {
    const png = await this.service.invoicePng(user.householdId, user.memberId, params.id);
    return this.service.sendToWhatsapp(user.householdId, body.toMemberId, png, CAPTION.invoice);
  }
}
