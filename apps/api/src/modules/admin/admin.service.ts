import { Injectable } from "@nestjs/common";
import type {
  AdminHouseholdRow,
  AuthUser,
  CreateHouseholdBody,
  CreateHouseholdResult,
  UpdateAdminHouseholdBody,
} from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { ConflictError, DomainError, NotFoundError } from "../../common/errors/domain-error";
import { provisionHousehold } from "../../lib/household-provisioner";

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthUser): Promise<AdminHouseholdRow[]> {
    const households = await this.prisma.household.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        timezone: true,
        whatsappInstance: true,
        createdAt: true,
        _count: { select: { members: true, transactions: true } },
      },
    });
    return households.map((h) => ({
      id: h.id,
      name: h.name,
      timezone: h.timezone,
      createdAt: h.createdAt.toISOString(),
      memberCount: h._count.members,
      transactionCount: h._count.transactions,
      whatsappInstance: h.whatsappInstance,
      isMine: h.id === actor.householdId,
    }));
  }

  async create(body: CreateHouseholdBody): Promise<CreateHouseholdResult> {
    const emails = [body.owner.email, body.partner?.email]
      .filter(Boolean)
      .map((e) => e!.trim().toLowerCase());
    const clash = await this.prisma.user.findFirst({
      where: { email: { in: emails } },
      select: { email: true },
    });
    if (clash) throw new ConflictError(`Já existe usuário com o e-mail ${clash.email}`);

    const res = await provisionHousehold(this.prisma, {
      householdName: body.householdName,
      timezone: body.timezone,
      owner: body.owner,
      partner: body.partner,
    });
    return { id: res.householdId, ownerEmail: body.owner.email.trim().toLowerCase() };
  }

  async update(id: string, body: UpdateAdminHouseholdBody) {
    const found = await this.prisma.household.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundError("Household");
    return this.prisma.household.update({
      where: { id },
      data: { name: body.name, timezone: body.timezone },
      select: { id: true, name: true, timezone: true },
    });
  }

  async remove(actor: AuthUser, id: string, confirmName: string): Promise<{ deleted: true }> {
    if (id === actor.householdId) {
      throw new DomainError("Você não pode excluir o seu próprio household.");
    }
    const hh = await this.prisma.household.findUnique({ where: { id }, select: { name: true } });
    if (!hh) throw new NotFoundError("Household");
    if (confirmName.trim() !== hh.name) {
      throw new DomainError("O nome digitado não confere.");
    }
    // Household tem onDelete: Cascade em todos os filhos.
    await this.prisma.household.delete({ where: { id } });
    return { deleted: true };
  }
}
