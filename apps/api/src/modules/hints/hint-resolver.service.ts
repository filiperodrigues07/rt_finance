import { Injectable } from "@nestjs/common";
import type { Account, Category, CreditCard } from "@prisma/client";
import { BANKS } from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { CategoriesService } from "../categories/categories.service";
import { CreditCardsService } from "../credit-cards/credit-cards.service";

export interface ResolvedPayment {
  accountId: string | null;
  creditCardId: string | null;
  label: string;
}

@Injectable()
export class HintResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
    private readonly cards: CreditCardsService,
  ) {}

  async resolveCategory(
    householdId: string,
    hint: string | null | undefined,
    kind: "EXPENSE" | "INCOME",
  ): Promise<{ category: Category | null; guessed: boolean }> {
    if (hint) {
      const exact = await this.categories.resolveByName(householdId, hint);
      if (exact) return { category: exact, guessed: false };
      const partial = await this.prisma.category.findFirst({
        where: {
          householdId,
          archivedAt: null,
          OR: [
            { name: { contains: hint, mode: "insensitive" } },
            { name: { startsWith: hint.slice(0, 4), mode: "insensitive" } },
          ],
        },
      });
      if (partial) return { category: partial, guessed: true };
    }
    const fallback = await this.prisma.category.findFirst({
      where: { householdId, name: "Outros" },
    });
    return { category: fallback, guessed: true };
  }

  async resolveCard(
    householdId: string,
    hint: string | null | undefined,
  ): Promise<CreditCard | null> {
    if (!hint) return null;
    return this.cards.resolveByHint(householdId, hint);
  }

  /** Resolve um nome livre (vindo da IA) para uma conta. Match por nome ou banco. */
  async resolveAccount(
    householdId: string,
    hint: string | null | undefined,
  ): Promise<Account | null> {
    const term = (hint ?? "").trim();
    if (!term) return null;

    const byName = await this.prisma.account.findFirst({
      where: { householdId, archivedAt: null, name: { contains: term, mode: "insensitive" } },
    });
    if (byName) return byName;

    // "saldo do nubank" quando a conta se chama "Conta corrente" mas o banco é Nubank
    const low = term.toLowerCase();
    const bank = BANKS.find((b) => b.id === low || b.name.toLowerCase().includes(low));
    if (!bank) return null;
    return this.prisma.account.findFirst({
      where: { householdId, archivedAt: null, bankId: bank.id },
    });
  }

  async resolveMember(
    householdId: string,
    hint: string | null | undefined,
    fallbackMemberId: string,
  ): Promise<string> {
    if (!hint || /^(eu|meu|minha|mim|pra mim|para mim|nós|nos)$/i.test(hint.trim())) {
      return fallbackMemberId;
    }
    const member = await this.prisma.householdMember.findFirst({
      where: { householdId, displayName: { equals: hint.trim(), mode: "insensitive" } },
    });
    if (member) return member.id;
    const partial = await this.prisma.householdMember.findFirst({
      where: { householdId, displayName: { contains: hint.trim(), mode: "insensitive" } },
    });
    return partial?.id ?? fallbackMemberId;
  }

  async defaultAccountId(householdId: string): Promise<string | null> {
    const acc = await this.prisma.account.findFirst({
      where: { householdId, archivedAt: null },
      orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    });
    return acc?.id ?? null;
  }

  /** Decide meio de pagamento a partir do hint. Prioriza cartão citado. */
  async resolvePayment(
    householdId: string,
    hint: string | null | undefined,
  ): Promise<ResolvedPayment> {
    const h = (hint ?? "").trim().toLowerCase();

    if (h) {
      const card = await this.cards.resolveByHint(householdId, h);
      if (card) return { accountId: null, creditCardId: card.id, label: card.name };

      if (/dinheiro|esp[eé]cie|cash/.test(h)) {
        const cash = await this.prisma.account.findFirst({
          where: { householdId, archivedAt: null, type: "CASH" },
        });
        if (cash) return { accountId: cash.id, creditCardId: null, label: cash.name };
      }
    }

    const accountId = await this.defaultAccountId(householdId);
    const acc = accountId
      ? await this.prisma.account.findUnique({ where: { id: accountId } })
      : null;
    return { accountId, creditCardId: null, label: acc?.name ?? "conta padrão" };
  }
}
