import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import * as argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { AppModule } from "../src/app.module";

export const prisma = new PrismaClient();

export async function resetDb(): Promise<void> {
  // ordem não importa com TRUNCATE ... CASCADE
  const tables = [
    "AuditLog", "AiInteraction", "AiConversation", "WhatsappMessage",
    "GoalContribution", "FinancialGoal", "Budget",
    "TransactionComment", "TransactionAttachment",
    "HouseholdBackup", "PushSubscription",
    "Installment", "InstallmentPlan", "Transaction", "CreditCardInvoice", "CreditCard",
    "Account", "Category", "NotificationPreference", "Notification", "Setting", "AppSetting",
    "PasswordResetToken", "Session", "HouseholdMember", "User", "Household",
  ];
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE;`,
  );
}

export interface SeedResult {
  householdId: string;
  ownerMemberId: string;
  partnerMemberId: string;
  categoryMercado: string;
  categorySalario: string;
  accountId: string;
}

export async function seedMinimal(): Promise<SeedResult> {
  const hash = await argon2.hash("test1234", { type: argon2.argon2id });
  const household = await prisma.household.create({
    data: { name: "Test Household", timezone: "America/Sao_Paulo", currency: "BRL" },
  });
  const owner = await prisma.user.create({
    data: {
      name: "Owner",
      email: "owner@test.local",
      passwordHash: hash,
      phoneE164: "+5511900000001",
      isSuperAdmin: true,
      memberships: { create: { householdId: household.id, role: "OWNER", displayName: "Owner" } },
    },
    include: { memberships: true },
  });
  const partner = await prisma.user.create({
    data: {
      name: "Partner",
      email: "partner@test.local",
      passwordHash: hash,
      memberships: { create: { householdId: household.id, role: "MEMBER", displayName: "Partner" } },
    },
    include: { memberships: true },
  });
  const mercado = await prisma.category.create({
    data: { householdId: household.id, name: "Mercado", icon: "🛒", color: "#22C55E", kind: "EXPENSE", isSystem: true },
  });
  const salario = await prisma.category.create({
    data: { householdId: household.id, name: "Salário", icon: "💰", color: "#16A34A", kind: "INCOME", isSystem: true },
  });
  await prisma.category.create({
    data: { householdId: household.id, name: "Outros", icon: "📦", color: "#94A3B8", kind: "BOTH", isSystem: true },
  });
  await prisma.category.create({
    data: { householdId: household.id, name: "Contas", icon: "💡", color: "#EAB308", kind: "EXPENSE", isSystem: true },
  });
  const account = await prisma.account.create({
    data: { householdId: household.id, name: "Conta", type: "CHECKING", openingBalanceCents: 1_000_00 },
  });

  return {
    householdId: household.id,
    ownerMemberId: owner.memberships[0]!.id,
    partnerMemberId: partner.memberships[0]!.id,
    categoryMercado: mercado.id,
    categorySalario: salario.id,
    accountId: account.id,
  };
}

export async function createTestApp(): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.register(cookie as never);
  await app.register(multipart as never, { limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
  app.setGlobalPrefix("api", { exclude: ["health"] });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
