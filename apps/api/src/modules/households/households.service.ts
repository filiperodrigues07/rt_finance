import { randomBytes } from "node:crypto";
import { Injectable, ForbiddenException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import * as argon2 from "argon2";
import {
  SYSTEM_CATEGORIES,
  type UpdateHouseholdBody,
  type UpdateMemberBody,
  type UpdateProfileBody,
  type ChangePasswordBody,
  type CreateMemberBody,
  type ResetDataBody,
  type ResetDataResult,
  type HouseholdEmailPrefsBody,
  type HouseholdEmailPrefsDto,
  type AuthUser,
} from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { ConflictError, DomainError, NotFoundError } from "../../common/errors/domain-error";
import { MailService, HOUSEHOLD_EMAIL_KEY, type HouseholdEmailPrefs } from "../mail/mail.service";

const MEMBER_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phoneE164: true,
  avatarColor: true,
  avatarUrl: true,
} as const;

@Injectable()
export class HouseholdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // ---------------- preferência de e-mail do household ----------------

  private async emailPrefs(householdId: string): Promise<HouseholdEmailPrefs | null> {
    const row = await this.prisma.setting.findUnique({
      where: { householdId_key: { householdId, key: HOUSEHOLD_EMAIL_KEY } },
    });
    return (row?.value as HouseholdEmailPrefs | undefined) ?? null;
  }

  async getEmailPrefs(householdId: string): Promise<HouseholdEmailPrefsDto> {
    const prefs = await this.emailPrefs(householdId);
    return {
      weeklyEnabled: prefs?.weeklyEnabled ?? false,
      emailReady: await this.mail.isReady(),
    };
  }

  async updateEmailPrefs(
    actor: AuthUser,
    body: HouseholdEmailPrefsBody,
  ): Promise<HouseholdEmailPrefsDto> {
    if (actor.role !== "OWNER") throw new ForbiddenException("Apenas o dono edita isto");
    const existing = await this.emailPrefs(actor.householdId);
    const value = {
      weeklyEnabled: body.weeklyEnabled,
      weeklyLastRunIso: existing?.weeklyLastRunIso,
    } as unknown as Prisma.InputJsonObject;
    await this.prisma.setting.upsert({
      where: { householdId_key: { householdId: actor.householdId, key: HOUSEHOLD_EMAIL_KEY } },
      create: { householdId: actor.householdId, key: HOUSEHOLD_EMAIL_KEY, value },
      update: { value },
    });
    return this.getEmailPrefs(actor.householdId);
  }

  async getHousehold(householdId: string) {
    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
      include: {
        members: {
          include: { user: { select: MEMBER_USER_SELECT } },
          orderBy: { joinedAt: "asc" },
        },
      },
    });
    if (!household) throw new NotFoundError("Household");
    return household;
  }

  async updateHousehold(actor: AuthUser, body: UpdateHouseholdBody) {
    if (actor.role !== "OWNER") throw new ForbiddenException("Apenas o dono pode alterar o household");
    return this.prisma.household.update({
      where: { id: actor.householdId },
      data: { name: body.name, timezone: body.timezone, currency: body.currency?.toUpperCase() },
    });
  }

  async listMembers(householdId: string) {
    return this.prisma.householdMember.findMany({
      where: { householdId },
      include: { user: { select: MEMBER_USER_SELECT } },
      orderBy: { joinedAt: "asc" },
    });
  }

  /** OWNER cria um novo usuário + membro. */
  async createMember(actor: AuthUser, body: CreateMemberBody) {
    if (actor.role !== "OWNER") throw new ForbiddenException("Apenas o dono pode criar usuários");
    const email = body.email.toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictError("Já existe um usuário com esse e-mail");

    const passwordHash = await argon2.hash(body.password, { type: argon2.argon2id });
    const user = await this.prisma.user.create({
      data: {
        name: body.name,
        email,
        passwordHash,
        phoneE164: body.phoneE164 ?? null,
        avatarColor: body.color,
        memberships: {
          create: {
            householdId: actor.householdId,
            role: body.role,
            displayName: body.displayName,
            color: body.color,
          },
        },
      },
      include: { memberships: { where: { householdId: actor.householdId } } },
    });
    return { id: user.id, memberId: user.memberships[0]?.id, email: user.email };
  }

  /** OWNER redefine a senha de um membro; devolve a senha temporária (mostrada uma vez). */
  async resetMemberPassword(actor: AuthUser, memberId: string) {
    if (actor.role !== "OWNER") throw new ForbiddenException("Apenas o dono pode redefinir senhas");
    const member = await this.prisma.householdMember.findFirst({
      where: { id: memberId, householdId: actor.householdId },
      include: { user: { select: { id: true } } },
    });
    if (!member) throw new NotFoundError("Membro");

    const tempPassword = randomBytes(9).toString("base64url"); // ~12 chars
    const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });
    await this.prisma.user.update({ where: { id: member.user.id }, data: { passwordHash } });
    await this.prisma.session.updateMany({
      where: { userId: member.user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { tempPassword };
  }

  async updateMember(actor: AuthUser, memberId: string, body: UpdateMemberBody) {
    const member = await this.prisma.householdMember.findFirst({
      where: { id: memberId, householdId: actor.householdId },
    });
    if (!member) throw new NotFoundError("Membro");
    if (body.role && actor.role !== "OWNER") {
      throw new ForbiddenException("Apenas o dono pode alterar papéis");
    }
    if (body.role === "MEMBER" && member.role === "OWNER") {
      const owners = await this.prisma.householdMember.count({
        where: { householdId: actor.householdId, role: "OWNER" },
      });
      if (owners <= 1) throw new DomainError("O household precisa de ao menos um dono");
    }

    const userData: { phoneE164?: string | null; email?: string } = {};

    if (body.phoneE164 !== undefined) {
      if (actor.role !== "OWNER" && member.userId !== actor.id) {
        throw new ForbiddenException("Só o dono pode alterar o telefone de outro membro");
      }
      if (body.phoneE164) {
        const clash = await this.prisma.user.findFirst({
          where: { phoneE164: body.phoneE164, id: { not: member.userId } },
          select: { id: true },
        });
        if (clash) throw new ConflictError("Esse número já está em uso por outro usuário");
      }
      userData.phoneE164 = body.phoneE164;
    }

    if (body.email !== undefined) {
      if (actor.role !== "OWNER" && member.userId !== actor.id) {
        throw new ForbiddenException("Só o dono pode alterar o e-mail de outro membro");
      }
      const clash = await this.prisma.user.findFirst({
        where: { email: body.email, id: { not: member.userId } },
        select: { id: true },
      });
      if (clash) throw new ConflictError("Já existe um usuário com esse e-mail");
      userData.email = body.email;
    }

    if (Object.keys(userData).length > 0) {
      await this.prisma.user.update({ where: { id: member.userId }, data: userData });
    }

    return this.prisma.householdMember.update({
      where: { id: member.id },
      data: { displayName: body.displayName, color: body.color, role: body.role },
    });
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...MEMBER_USER_SELECT, createdAt: true },
    });
    if (!user) throw new NotFoundError("Usuário");
    return user;
  }

  async updateProfile(userId: string, body: UpdateProfileBody) {
    if (typeof body.avatarUrl === "string" && body.avatarUrl.startsWith("data:")) {
      const b64 = body.avatarUrl.split(",")[1] ?? "";
      const bytes = Math.floor((b64.length * 3) / 4);
      if (bytes > 200_000) {
        throw new DomainError("A imagem de perfil deve ter no máximo ~200 KB.");
      }
    }
    if (body.email) {
      const clash = await this.prisma.user.findFirst({
        where: { email: body.email, id: { not: userId } },
        select: { id: true },
      });
      if (clash) throw new ConflictError("Já existe um usuário com esse e-mail");
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        name: body.name,
        email: body.email,
        phoneE164: body.phoneE164,
        avatarColor: body.avatarColor,
        avatarUrl: body.avatarUrl,
      },
      select: MEMBER_USER_SELECT,
    });
  }

  async changePassword(userId: string, body: ChangePasswordBody) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("Usuário");
    const ok = await argon2.verify(user.passwordHash, body.currentPassword).catch(() => false);
    if (!ok) throw new DomainError("Senha atual incorreta");
    const passwordHash = await argon2.hash(body.newPassword, { type: argon2.argon2id });
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    // Revoga todas as sessões: obriga novo login em todos os dispositivos.
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { changed: true };
  }

  /**
   * Limpa os dados do household para começar do zero. IRREVERSÍVEL.
   * Sempre apaga o histórico (lançamentos, parcelas, faturas, recorrências, metas,
   * orçamentos, importações, anexos, notificações e conversas do bot).
   * Opcionalmente também apaga contas, cartões e/ou categorias (categorias são
   * recriadas com as padrão do sistema). Mantém: household, usuários e sessões.
   */
  async resetData(actor: AuthUser, body: ResetDataBody): Promise<ResetDataResult> {
    if (actor.role !== "OWNER") {
      throw new ForbiddenException("Apenas o dono pode limpar os dados");
    }
    const user = await this.prisma.user.findUnique({ where: { id: actor.id } });
    if (!user) throw new NotFoundError("Usuário");
    const ok = await argon2.verify(user.passwordHash, body.password).catch(() => false);
    if (!ok) throw new DomainError("Senha incorreta");

    const hid = actor.householdId;
    const cleared: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      // histórico (ordem respeita as FKs; muitos filhos caem por cascade)
      await tx.goalContribution.deleteMany({ where: { goal: { householdId: hid } } });
      await tx.financialGoal.deleteMany({ where: { householdId: hid } });
      await tx.budget.deleteMany({ where: { householdId: hid } });
      await tx.recurringRun.deleteMany({ where: { recurringExpense: { householdId: hid } } });
      await tx.recurringExpense.deleteMany({ where: { householdId: hid } });
      await tx.installment.deleteMany({ where: { plan: { householdId: hid } } });
      await tx.installmentPlan.deleteMany({ where: { householdId: hid } });
      await tx.transaction.deleteMany({ where: { householdId: hid } }); // cascade nos anexos
      await tx.creditCardInvoice.deleteMany({ where: { creditCard: { householdId: hid } } });
      await tx.importRow.deleteMany({ where: { batch: { householdId: hid } } });
      await tx.importBatch.deleteMany({ where: { householdId: hid } });
      await tx.whatsappMessage.deleteMany({ where: { householdId: hid } });
      await tx.aiInteraction.deleteMany({ where: { conversation: { householdId: hid } } });
      await tx.aiConversation.deleteMany({ where: { householdId: hid } });
      await tx.notification.deleteMany({ where: { householdId: hid } });
      cleared.push("histórico");

      if (body.alsoCards) {
        await tx.creditCard.deleteMany({ where: { householdId: hid } });
        cleared.push("cartões");
      }
      if (body.alsoAccounts) {
        await tx.account.deleteMany({ where: { householdId: hid } });
        cleared.push("contas");
      }
      if (body.alsoCategories) {
        await tx.category.deleteMany({ where: { householdId: hid } });
        await tx.category.createMany({
          data: SYSTEM_CATEGORIES.map((c) => ({
            householdId: hid,
            name: c.name,
            icon: c.icon,
            color: c.color,
            kind: c.kind,
            isSystem: true,
          })),
        });
        cleared.push("categorias (recriadas as padrão)");
      }

      await tx.auditLog.create({
        data: {
          householdId: hid,
          actorUserId: actor.id,
          action: "RESET_DATA",
          entity: "household",
          entityId: hid,
          after: { cleared },
        },
      });
    });

    return { cleared };
  }
}
