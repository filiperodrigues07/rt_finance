import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  AdminHouseholdRow,
  AuthUser,
  CreateHouseholdBody,
  CreateHouseholdResult,
  UpdateAdminHouseholdBody,
  EmailSettingsBody,
  EmailSettingsDto,
  EmailTestResult,
} from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { ConflictError, DomainError, NotFoundError } from "../../common/errors/domain-error";
import { provisionHousehold } from "../../lib/household-provisioner";
import { ENV, type Env } from "../../config/env.schema";
import { encryptSecret } from "../../common/secret-box";
import { MailService, APP_EMAIL_KEY, type GlobalEmailConfig } from "../mail/mail.service";

const EMAIL_DEFAULTS = { smtpHost: "smtp.gmail.com", smtpPort: 587, fromName: "RT Finance" };

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ---------------- config global de e-mail (SMTP) ----------------

  async getEmailSettings(): Promise<EmailSettingsDto> {
    const { cfg, configured, usingEnvFallback } = await this.mail.describe();
    return {
      smtpHost: cfg?.smtpHost ?? EMAIL_DEFAULTS.smtpHost,
      smtpPort: cfg?.smtpPort ?? EMAIL_DEFAULTS.smtpPort,
      smtpUser: cfg?.smtpUser ?? "",
      fromName: cfg?.fromName ?? EMAIL_DEFAULTS.fromName,
      configured,
      usingEnvFallback,
    };
  }

  async updateEmailSettings(body: EmailSettingsBody): Promise<EmailSettingsDto> {
    const existing = (
      await this.prisma.appSetting.findUnique({ where: { key: APP_EMAIL_KEY } })
    )?.value as GlobalEmailConfig | undefined;

    const newPass = body.smtpPass?.trim();
    const smtpPassEnc = newPass
      ? encryptSecret(newPass, this.env.JWT_ACCESS_SECRET)
      : (existing?.smtpPassEnc ?? "");

    const value: GlobalEmailConfig = {
      smtpHost: body.smtpHost,
      smtpPort: body.smtpPort,
      smtpUser: body.smtpUser,
      smtpPassEnc,
      fromName: body.fromName,
    };
    const jsonValue = value as unknown as Prisma.InputJsonObject;
    await this.prisma.appSetting.upsert({
      where: { key: APP_EMAIL_KEY },
      create: { key: APP_EMAIL_KEY, value: jsonValue },
      update: { value: jsonValue },
    });
    return this.getEmailSettings();
  }

  async testEmail(actor: AuthUser): Promise<EmailTestResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { email: true },
    });
    if (!user) throw new NotFoundError("Usuário");
    return this.mail.sendTest(user.email);
  }

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
