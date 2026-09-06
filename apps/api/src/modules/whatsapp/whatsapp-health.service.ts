import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../lib/prisma.service";
import { ENV, type Env } from "../../config/env.schema";
import { EvolutionAdminService } from "./evolution-admin.service";

/**
 * Vigia a conexão de cada instância da Evolution e re-sobe a sessão sozinho quando
 * cai (sem QR — usa as credenciais salvas). É a defesa contra o "tem que ficar
 * reconectando": o socket do Baileys às vezes fecha e não volta por conta própria.
 *
 * NÃO recria a instância (isso exige QR e é só no fluxo manual do painel).
 */
@Injectable()
export class WhatsappHealthService {
  private readonly logger = new Logger("WhatsappHealth");
  /** falhas consecutivas de reconexão por instância — só para logar escalando. */
  private readonly fails = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: EvolutionAdminService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private get active(): boolean {
    return this.env.JOBS_ENABLED && this.env.WHATSAPP_PROVIDER === "evolution";
  }

  @Cron("*/5 * * * *")
  async check(): Promise<void> {
    if (!this.active) return;

    const households = await this.prisma.household.findMany({
      where: { whatsappInstance: { not: null } },
      select: { whatsappInstance: true, name: true },
    });

    for (const h of households) {
      const inst = h.whatsappInstance!;
      try {
        const st = await this.admin.status(inst);
        if (!st.evolutionReachable) continue; // Evolution fora do ar: nada a fazer aqui
        if (st.state === "open") {
          this.fails.delete(inst);
          continue;
        }
        if (st.state === "connecting") continue; // já está tentando (ou esperando QR)

        // state === "close" | "unknown": tenta re-subir a sessão
        const res = await this.admin.reconnect(inst);
        if (res.state === "open" || res.state === "connecting") {
          this.logger.log(`reconectado: ${inst} (${h.name}) → ${res.state}`);
          this.fails.delete(inst);
        } else {
          const n = (this.fails.get(inst) ?? 0) + 1;
          this.fails.set(inst, n);
          const msg = `sessão caída: ${inst} (${h.name}) — tentativa ${n} sem sucesso`;
          if (n >= 6) this.logger.error(`${msg}. Precisa reparear o número no painel.`);
          else this.logger.warn(msg);
        }
      } catch (err) {
        this.logger.warn(`falha ao checar ${inst}: ${(err as Error).message}`);
      }
    }
  }
}
