import { Injectable } from "@nestjs/common";
import type { CreateAccountBody, UpdateAccountBody } from "@rt-finance/shared";
import type { Account } from "@prisma/client";
import { PrismaService } from "../../lib/prisma.service";
import { NotFoundError } from "../../common/errors/domain-error";

export interface AccountWithBalance extends Account {
  balanceCents: number;
}

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(householdId: string, includeArchived = false): Promise<AccountWithBalance[]> {
    const accounts = await this.prisma.account.findMany({
      where: { householdId, archivedAt: includeArchived ? undefined : null },
      orderBy: { name: "asc" },
    });
    return Promise.all(accounts.map((a) => this.withBalance(a)));
  }

  async get(householdId: string, id: string): Promise<AccountWithBalance> {
    const account = await this.prisma.account.findFirst({ where: { id, householdId } });
    if (!account) throw new NotFoundError("Conta");
    return this.withBalance(account);
  }

  private async withBalance(account: Account): Promise<AccountWithBalance> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ["type"],
      where: {
        accountId: account.id,
        status: { in: ["CONFIRMED", "CLEARED"] },
      },
      _sum: { amountCents: true },
    });
    const sumOf = (t: "INCOME" | "EXPENSE") =>
      grouped.find((g) => g.type === t)?._sum.amountCents ?? 0;
    const balanceCents = account.openingBalanceCents + sumOf("INCOME") - sumOf("EXPENSE");
    return { ...account, balanceCents };
  }

  async create(householdId: string, body: CreateAccountBody): Promise<Account> {
    return this.prisma.account.create({
      data: {
        householdId,
        name: body.name,
        type: body.type,
        openingBalanceCents: body.openingBalanceCents,
      },
    });
  }

  async update(householdId: string, id: string, body: UpdateAccountBody): Promise<Account> {
    const current = await this.get(householdId, id);
    return this.prisma.account.update({
      where: { id: current.id },
      data: {
        name: body.name,
        type: body.type,
        openingBalanceCents: body.openingBalanceCents,
      },
    });
  }

  async remove(householdId: string, id: string): Promise<{ archived: boolean }> {
    const account = await this.get(householdId, id);
    const inUse = await this.prisma.transaction.count({ where: { accountId: id } });
    if (inUse > 0) {
      await this.prisma.account.update({
        where: { id: account.id },
        data: { archivedAt: new Date() },
      });
      return { archived: true };
    }
    await this.prisma.account.delete({ where: { id: account.id } });
    return { archived: false };
  }
}
