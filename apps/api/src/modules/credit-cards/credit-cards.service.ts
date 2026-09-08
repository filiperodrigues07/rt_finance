import { Injectable } from "@nestjs/common";
import type { CreateCreditCardBody, UpdateCreditCardBody, CreditCardLimits } from "@rt-finance/shared";
import type { CreditCard, Prisma } from "@prisma/client";
import { PrismaService } from "../../lib/prisma.service";
import { NotFoundError } from "../../common/errors/domain-error";

const MEMBER_SELECT = {
  select: {
    id: true,
    displayName: true,
    color: true,
    user: { select: { avatarUrl: true } },
  },
} satisfies Prisma.HouseholdMemberDefaultArgs;

type MemberDto = {
  id: string;
  displayName: string;
  color: string;
  user: { avatarUrl: string | null };
} | null;

export interface CreditCardWithLimits extends CreditCard {
  limits: CreditCardLimits;
  member: MemberDto;
}

@Injectable()
export class CreditCardsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertMember(householdId: string, memberId: string): Promise<void> {
    const found = await this.prisma.householdMember.findFirst({
      where: { id: memberId, householdId },
      select: { id: true },
    });
    if (!found) throw new NotFoundError("Membro");
  }

  async list(householdId: string): Promise<CreditCardWithLimits[]> {
    const cards = await this.prisma.creditCard.findMany({
      where: { householdId },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: { member: MEMBER_SELECT },
    });
    return Promise.all(cards.map((c) => this.withLimits(c)));
  }

  async get(householdId: string, id: string): Promise<CreditCardWithLimits> {
    const card = await this.prisma.creditCard.findFirst({
      where: { id, householdId },
      include: { member: MEMBER_SELECT },
    });
    if (!card) throw new NotFoundError("Cartão");
    return this.withLimits(card);
  }

  /** Igual a get, mas sem calcular limites (uso interno). */
  async getRaw(householdId: string, id: string): Promise<CreditCard> {
    const card = await this.prisma.creditCard.findFirst({ where: { id, householdId } });
    if (!card) throw new NotFoundError("Cartão");
    return card;
  }

  private async withLimits(
    card: CreditCard & { member: MemberDto },
  ): Promise<CreditCardWithLimits> {
    // Limite utilizado = despesas no cartão que ainda não foram pagas (fatura != PAID).
    const agg = await this.prisma.transaction.aggregate({
      where: {
        creditCardId: card.id,
        type: "EXPENSE",
        status: { in: ["PENDING", "CONFIRMED", "CLEARED"] },
        OR: [{ invoiceId: null }, { invoice: { status: { not: "PAID" } } }],
      },
      _sum: { amountCents: true },
    });
    const usedCents = agg._sum.amountCents ?? 0;
    return {
      ...card,
      limits: {
        limitCents: card.limitCents,
        usedCents,
        availableCents: card.limitCents - usedCents,
      },
    };
  }

  async create(householdId: string, body: CreateCreditCardBody): Promise<CreditCard> {
    if (body.memberId) await this.assertMember(householdId, body.memberId);
    return this.prisma.creditCard.create({
      data: {
        householdId,
        name: body.name,
        bank: body.bank ?? null,
        bankId: body.bankId ?? null,
        memberId: body.memberId ?? null,
        brand: body.brand ?? null,
        last4: body.last4 ?? null,
        limitCents: body.limitCents,
        closingDay: body.closingDay,
        dueDay: body.dueDay,
        color: body.color,
        icon: body.icon,
        status: body.status,
      },
    });
  }

  async update(householdId: string, id: string, body: UpdateCreditCardBody): Promise<CreditCard> {
    const current = await this.getRaw(householdId, id);
    if (body.memberId) await this.assertMember(householdId, body.memberId);
    return this.prisma.creditCard.update({
      where: { id: current.id },
      data: {
        name: body.name,
        bank: body.bank ?? undefined,
        bankId: body.bankId === undefined ? undefined : body.bankId,
        memberId: body.memberId === undefined ? undefined : body.memberId,
        brand: body.brand ?? undefined,
        last4: body.last4 ?? undefined,
        limitCents: body.limitCents,
        closingDay: body.closingDay,
        dueDay: body.dueDay,
        color: body.color,
        icon: body.icon,
        status: body.status,
      },
    });
  }

  async remove(householdId: string, id: string): Promise<{ archived: boolean }> {
    const card = await this.getRaw(householdId, id);
    const inUse = await this.prisma.transaction.count({ where: { creditCardId: id } });
    if (inUse > 0) {
      await this.prisma.creditCard.update({
        where: { id: card.id },
        data: { status: "INACTIVE" },
      });
      return { archived: true };
    }
    await this.prisma.creditCard.delete({ where: { id: card.id } });
    return { archived: false };
  }

  /** Resolve um nome livre (vindo da IA) para um cartão. Match por nome/banco/last4. */
  async resolveByHint(householdId: string, hint: string): Promise<CreditCard | null> {
    const term = hint.trim();
    return this.prisma.creditCard.findFirst({
      where: {
        householdId,
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { bank: { contains: term, mode: "insensitive" } },
          { last4: term.replace(/\D/g, "").slice(-4) || undefined },
        ],
      },
    });
  }
}
