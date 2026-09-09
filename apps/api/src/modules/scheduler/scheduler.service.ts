import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { Cron } from "@nestjs/schedule";
import { addDays, formatBRL, formatDateBR, todayIso } from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { ENV, type Env } from "../../config/env.schema";
import { dateOnly, toIsoDate } from "../../common/date-only";
import { InvoicesService } from "../invoices/invoices.service";
import { BudgetsService } from "../budgets/budgets.service";
import { NotificationsService } from "../notifications/notifications.service";
import { monthSummary } from "../whatsapp/formatters";
import { ReportsService } from "../reports/reports.service";
import { MailService, HOUSEHOLD_EMAIL_KEY, type HouseholdEmailPrefs } from "../mail/mail.service";
import { renderWeeklyDigest } from "../mail/weekly-digest";
import { BackupService } from "../backup/backup.service";

/**
 * Jobs agendados (via @nestjs/schedule — cron em processo, sem Redis/pg-boss).
 * Suficiente para uma instância única; migrar para pg-boss se houver múltiplas.
 * Tudo é idempotente: rodar de novo não duplica.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger("Scheduler");

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly budgets: BudgetsService,
    private readonly notifications: NotificationsService,
    private readonly reports: ReportsService,
    private readonly mail: MailService,
    private readonly backup: BackupService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private get enabled(): boolean {
    return this.env.JOBS_ENABLED;
  }

  @Cron("5 3 * * *")
  async closeInvoices(): Promise<void> {
    if (!this.enabled) return;
    const res = await this.invoices.closeDue();
    this.logger.log(`faturas: ${res.closed} fechadas, ${res.overdue} vencidas`);
    await this.dueReminders();
  }

  /** Backup automático conforme a frequência configurada por household. */
  @Cron("30 3 * * *")
  async runBackups(): Promise<void> {
    if (!this.enabled) return;
    await this.backup.runScheduledBackups();
  }

  @Cron("0 8 * * *")
  async checkBudgets(): Promise<void> {
    if (!this.enabled) return;
    const res = await this.budgets.checkAndNotify();
    this.logger.log(`orçamentos: ${res.checked} verificados, ${res.alerts} alertas`);
  }

  @Cron("*/30 * * * *")
  async expirePendingConfirmations(): Promise<void> {
    if (!this.enabled) return;
    const stale = await this.prisma.aiConversation.findMany({
      where: { state: { not: "IDLE" }, pendingExpiresAt: { lt: new Date() } },
    });
    for (const c of stale) {
      await this.prisma.aiConversation.update({
        where: { id: c.id },
        data: { state: "IDLE", pendingAction: undefined, pendingExpiresAt: null },
      });
    }
    if (stale.length) this.logger.log(`${stale.length} confirmações expiradas`);
  }

  /** Limpa sessões (refresh tokens) expiradas ou revogadas há mais de 30 dias. */
  @Cron("30 3 * * 0")
  async pruneSessions(): Promise<void> {
    if (!this.enabled) return;
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const res = await this.prisma.session.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }],
      },
    });
    if (res.count) this.logger.log(`sessões podadas: ${res.count}`);
  }

  @Cron("0 9 * * 1")
  async weeklySummary(): Promise<void> {
    if (!this.enabled) return;
    const households = await this.prisma.household.findMany({
      select: { id: true, name: true, timezone: true },
    });
    for (const h of households) {
      const monthReport = await this.reports.dashboard(h.id, {});
      await this.notifications.push({
        householdId: h.id,
        type: "WEEKLY_SUMMARY",
        title: "🗓️ Resumo da semana",
        body: monthSummary(monthReport),
        dedupe: `weekly:${h.id}:${toIsoDate(new Date())}`,
      });
      await this.weeklyEmail(h).catch((e) =>
        this.logger.error(`resumo semanal por e-mail (household ${h.id}): ${(e as Error).message}`),
      );
    }
  }

  /** Envia o resumo semanal (janela de 7 dias) por e-mail, se ativado no household. */
  private async weeklyEmail(h: { id: string; name: string; timezone: string | null }): Promise<void> {
    const row = await this.prisma.setting.findUnique({
      where: { householdId_key: { householdId: h.id, key: HOUSEHOLD_EMAIL_KEY } },
    });
    const cfg = row?.value as HouseholdEmailPrefs | undefined;
    if (!cfg?.weeklyEnabled) return;

    const tz = h.timezone ?? this.env.APP_TIMEZONE;
    const today = todayIso(tz);
    if (cfg.weeklyLastRunIso === today) return; // já rodou hoje

    const from = addDays(today, -7, tz);
    const report = await this.reports.dashboard(h.id, { from, to: today });
    const { subject, text, html } = renderWeeklyDigest({ householdName: h.name, report, tz });

    const members = await this.prisma.householdMember.findMany({
      where: { householdId: h.id },
      include: { user: { select: { email: true } } },
    });
    const emails = [...new Set(members.map((m) => m.user.email).filter(Boolean))];
    for (const to of emails) {
      await this.mail.sendWeeklyDigest(to, subject, text, html);
    }

    await this.prisma.setting.update({
      where: { householdId_key: { householdId: h.id, key: HOUSEHOLD_EMAIL_KEY } },
      data: { value: { ...cfg, weeklyLastRunIso: today } as unknown as Prisma.InputJsonObject },
    });
    this.logger.log(`resumo semanal enviado p/ ${emails.length} e-mail(s) do household ${h.id}`);
  }

  /** Lembretes de vencimento de fatura (leadDays configurável). */
  private async dueReminders(): Promise<void> {
    const households = await this.prisma.household.findMany({
      select: { id: true, timezone: true },
    });
    for (const h of households) {
      const pref = await this.prisma.notificationPreference.findUnique({
        where: { householdId_type: { householdId: h.id, type: "INVOICE_DUE" } },
      });
      const leadDays = pref?.leadDays ?? 2;
      const tz = h.timezone ?? this.env.APP_TIMEZONE;
      const limit = addDays(todayIso(tz), leadDays, tz);

      const invoices = await this.prisma.creditCardInvoice.findMany({
        where: {
          creditCard: { householdId: h.id },
          status: { in: ["CLOSED", "OVERDUE"] },
          paidAt: null,
          dueDate: { lte: dateOnly(limit) },
        },
        include: { creditCard: { select: { name: true, icon: true } } },
      });

      for (const inv of invoices) {
        await this.notifications.push({
          householdId: h.id,
          type: "INVOICE_DUE",
          title: `${inv.creditCard.icon} Fatura do ${inv.creditCard.name} vence em breve`,
          body: `${formatBRL(inv.totalCents)} vence em ${formatDateBR(toIsoDate(inv.dueDate), tz)}.`,
          dedupe: `invoice-due:${inv.id}`,
          data: { invoiceId: inv.id },
        });
      }
    }
  }
}
