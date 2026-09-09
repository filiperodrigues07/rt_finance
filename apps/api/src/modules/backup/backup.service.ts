import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import * as argon2 from "argon2";
import { backupFileSchema, type BackupFile, type RestoreResult, type AuthUser } from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { DomainError, NotFoundError } from "../../common/errors/domain-error";
import { HouseholdsService } from "../households/households.service";

type Row = Record<string, unknown>;

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly households: HouseholdsService,
  ) {}

  // ---------------- export ----------------
  async export(householdId: string): Promise<BackupFile> {
    const hid = householdId;
    const [
      household,
      members,
      categories,
      accounts,
      creditCards,
      creditCardInvoices,
      installmentPlans,
      installments,
      recurringExpenses,
      recurringRuns,
      transactions,
      transactionComments,
      attachments,
      financialGoals,
      goalContributions,
      budgets,
    ] = await Promise.all([
      this.prisma.household.findUniqueOrThrow({ where: { id: hid } }),
      this.prisma.householdMember.findMany({
        where: { householdId: hid },
        select: { id: true, displayName: true, color: true, role: true },
      }),
      this.prisma.category.findMany({ where: { householdId: hid } }),
      this.prisma.account.findMany({ where: { householdId: hid } }),
      this.prisma.creditCard.findMany({ where: { householdId: hid } }),
      this.prisma.creditCardInvoice.findMany({ where: { creditCard: { householdId: hid } } }),
      this.prisma.installmentPlan.findMany({ where: { householdId: hid } }),
      this.prisma.installment.findMany({ where: { plan: { householdId: hid } } }),
      this.prisma.recurringExpense.findMany({ where: { householdId: hid } }),
      this.prisma.recurringRun.findMany({ where: { recurringExpense: { householdId: hid } } }),
      this.prisma.transaction.findMany({ where: { householdId: hid } }),
      this.prisma.transactionComment.findMany({ where: { transaction: { householdId: hid } } }),
      this.prisma.transactionAttachment.findMany({ where: { transaction: { householdId: hid } } }),
      this.prisma.financialGoal.findMany({ where: { householdId: hid } }),
      this.prisma.goalContribution.findMany({ where: { goal: { householdId: hid } } }),
      this.prisma.budget.findMany({ where: { householdId: hid } }),
    ]);

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      household: { timezone: household.timezone, currency: household.currency },
      members,
      categories,
      accounts,
      creditCards,
      creditCardInvoices,
      installmentPlans,
      installments,
      recurringExpenses,
      recurringRuns,
      transactions,
      transactionComments,
      transactionAttachments: attachments.map((a) => {
        const { data, ...rest } = a;
        return { ...rest, dataBase64: Buffer.from(data).toString("base64") };
      }),
      financialGoals,
      goalContributions,
      budgets,
    } as unknown as BackupFile;
  }

  // ---------------- restore ----------------
  async restore(
    actor: AuthUser,
    fileJson: unknown,
    password: string,
    confirm: string,
  ): Promise<RestoreResult> {
    if (actor.role !== "OWNER") {
      throw new ForbiddenException("Apenas o dono pode restaurar um backup");
    }
    if (confirm !== "RESTAURAR") throw new DomainError('Digite "RESTAURAR" para confirmar');

    const user = await this.prisma.user.findUnique({ where: { id: actor.id } });
    if (!user) throw new NotFoundError("Usuário");
    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) throw new DomainError("Senha incorreta");

    const parsed = backupFileSchema.safeParse(fileJson);
    if (!parsed.success) {
      throw new DomainError("Arquivo de backup inválido ou de uma versão não suportada");
    }
    const b = parsed.data;
    const hid = actor.householdId;

    // todo memberId citado precisa existir neste household (senão é backup de outro casal)
    const currentMembers = new Set(
      (
        await this.prisma.householdMember.findMany({
          where: { householdId: hid },
          select: { id: true },
        })
      ).map((m) => m.id),
    );
    const referenced = new Set<string>();
    for (const t of b.transactions) {
      if (typeof t.memberId === "string") referenced.add(t.memberId);
      if (typeof t.createdById === "string") referenced.add(t.createdById);
    }
    for (const c of b.transactionComments) {
      if (typeof c.authorMemberId === "string") referenced.add(c.authorMemberId);
    }
    for (const g of b.goalContributions) {
      if (typeof g.memberId === "string") referenced.add(g.memberId);
    }
    if ([...referenced].some((id) => !currentMembers.has(id))) {
      throw new DomainError("Este backup é de outro household (as pessoas não conferem)");
    }

    const withHid = (rows: Row[]): Row[] => rows.map((r) => ({ ...r, householdId: hid }));
    const restored: Record<string, number> = {};

    await this.prisma.$transaction(
      async (tx) => {
        const t = tx as unknown as Record<string, { createMany: (a: { data: Row[] }) => Promise<unknown> }>;
        const insert = async (key: string, rows: Row[]) => {
          if (rows.length) await t[key]!.createMany({ data: rows });
          restored[key] = rows.length;
        };

        await this.households.wipeHouseholdData(tx, hid, {
          accounts: true,
          cards: true,
          categories: true,
          seedCategories: false, // o backup traz as próprias categorias
        });

        await insert("category", withHid(b.categories));
        await insert("account", withHid(b.accounts));
        await insert("creditCard", withHid(b.creditCards));
        await insert("recurringExpense", withHid(b.recurringExpenses));
        await insert("financialGoal", withHid(b.financialGoals));
        await insert("budget", withHid(b.budgets));
        await insert("installmentPlan", withHid(b.installmentPlans));
        // faturas: paymentTransactionId é FK p/ transação — adia e religa depois
        await insert(
          "creditCardInvoice",
          b.creditCardInvoices.map((r) => ({ ...r, paymentTransactionId: null })),
        );
        await insert("installment", b.installments);
        await insert("transaction", withHid(b.transactions));

        for (const inv of b.creditCardInvoices) {
          if (typeof inv.paymentTransactionId === "string") {
            await tx.creditCardInvoice.update({
              where: { id: inv.id as string },
              data: { paymentTransactionId: inv.paymentTransactionId },
            });
          }
        }

        await insert("transactionComment", b.transactionComments);
        await insert(
          "transactionAttachment",
          b.transactionAttachments.map((r) => {
            const { dataBase64, ...rest } = r as Row & { dataBase64: string };
            return { ...rest, data: Buffer.from(dataBase64, "base64") };
          }),
        );
        await insert("recurringRun", b.recurringRuns);
        await insert("goalContribution", b.goalContributions);

        await tx.auditLog.create({
          data: {
            householdId: hid,
            actorUserId: actor.id,
            action: "RESTORE_DATA",
            entity: "household",
            entityId: hid,
            after: { restored, exportedAt: b.exportedAt } as Prisma.InputJsonObject,
          },
        });
      },
      { timeout: 120_000, maxWait: 20_000 },
    );

    this.logger.log(`restore concluído p/ household ${hid}: ${JSON.stringify(restored)}`);
    return { restored };
  }
}
