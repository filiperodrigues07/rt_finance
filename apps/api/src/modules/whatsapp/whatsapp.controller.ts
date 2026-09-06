import { Body, Controller, Get, Headers, Logger, Post, Query, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { FastifyRequest } from "fastify";
import { PrismaService } from "../../lib/prisma.service";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentHousehold } from "../../common/decorators/current-user.decorator";
import { WhatsAppService } from "./whatsapp.types";
import { MessageRouter } from "./message-router.service";
import { EvolutionAdminService } from "./evolution-admin.service";

@Controller("whatsapp")
export class WhatsappController {
  private readonly logger = new Logger("WhatsappWebhook");

  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly router: MessageRouter,
    private readonly admin: EvolutionAdminService,
    private readonly prisma: PrismaService,
  ) {}

  /** Instância da Evolution do household. Em `connect`, cria uma se ainda não tiver. */
  private async instanceFor(householdId: string, opts: { create?: boolean } = {}): Promise<string> {
    const hh = await this.prisma.household.findUnique({
      where: { id: householdId },
      select: { whatsappInstance: true },
    });
    if (hh?.whatsappInstance) return hh.whatsappInstance;
    if (!opts.create) return "";
    const name = `hh-${householdId.slice(-8)}`;
    await this.prisma.household.update({
      where: { id: householdId },
      data: { whatsappInstance: name },
    });
    return name;
  }

  // ---------- painel (autenticado, escopo = household do usuário) ----------
  @Get("status")
  async status(@CurrentHousehold() householdId: string) {
    const inst = await this.instanceFor(householdId);
    return this.admin.status(inst || undefined);
  }

  @Post("connect")
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async connect(@CurrentHousehold() householdId: string) {
    const inst = await this.instanceFor(householdId, { create: true });
    return this.admin.connect(inst);
  }

  @Post("webhook-setup")
  async webhookSetup(@CurrentHousehold() householdId: string) {
    const inst = await this.instanceFor(householdId, { create: true });
    return this.admin.setWebhook(inst);
  }

  @Post("logout")
  async logout(@CurrentHousehold() householdId: string) {
    const inst = await this.instanceFor(householdId);
    return this.admin.logout(inst || undefined);
  }

  @Post("restart")
  async restart(@CurrentHousehold() householdId: string) {
    const inst = await this.instanceFor(householdId);
    return this.admin.restart(inst || undefined);
  }

  @Public()
  @Get("webhook")
  verify(@Query() query: Record<string, string>): string {
    // alguns provedores fazem um GET de verificação; ecoamos o challenge se houver
    return query["hub.challenge"] ?? query["challenge"] ?? "ok";
  }

  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post("webhook")
  async webhook(
    @Req() req: FastifyRequest,
    @Headers() headers: Record<string, string>,
    @Query() query: Record<string, string>,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    if (!this.whatsapp.verifyWebhook(headers, query)) {
      this.logger.warn("webhook rejeitado: token inválido");
      // Respondemos 200 para o provider não ficar reenviando, mas não processamos.
      return { ok: true };
    }

    try {
      const messages = this.whatsapp.parseInbound(body);
      for (const msg of messages) {
        await this.router.handle(msg);
      }
    } catch (err) {
      this.logger.error({ err, id: (req as { id?: string }).id }, "falha ao processar webhook");
    }

    // Sempre 200: evita tempestade de reentregas do Evolution.
    return { ok: true };
  }
}
