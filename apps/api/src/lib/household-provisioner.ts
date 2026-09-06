import { randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import type { PrismaClient } from "@prisma/client";
import { SYSTEM_CATEGORIES } from "@rt-finance/shared";

const NOTIFICATION_TYPES = [
  "INVOICE_DUE",
  "BILL_DUE",
  "BUDGET_THRESHOLD",
  "BUDGET_EXCEEDED",
  "GOAL_MILESTONE",
  "WEEKLY_SUMMARY",
] as const;

export interface ProvisionMember {
  name: string;
  email: string;
  password: string;
  phoneE164?: string | null;
}

export interface ProvisionInput {
  householdName: string;
  timezone?: string;
  currency?: string;
  /** true = o dono também vira super-admin global (usado só no seed inicial). */
  superAdmin?: boolean;
  /** instância da Evolution deste household. Ausente → gera uma nova (hh-xxxxxxxx). */
  whatsappInstance?: string;
  owner: ProvisionMember;
  partner?: ProvisionMember;
}

export interface ProvisionResult {
  householdId: string;
  ownerUserId: string;
  partnerUserId?: string;
}

/** Aceita PrismaClient ou PrismaService (subclasse). */
type Db = Pick<PrismaClient, "household" | "user" | "category" | "notificationPreference">;

/**
 * Cria um household completo do zero: dono (+ parceiro opcional), categorias do
 * sistema e preferências de notificação padrão. Usado pelo seed e pela tela /admin.
 */
export async function provisionHousehold(db: Db, input: ProvisionInput): Promise<ProvisionResult> {
  const email = input.owner.email.trim().toLowerCase();
  const partnerEmail = input.partner?.email.trim().toLowerCase();

  const [ownerHash, partnerHash] = await Promise.all([
    argon2.hash(input.owner.password, { type: argon2.argon2id }),
    input.partner
      ? argon2.hash(input.partner.password, { type: argon2.argon2id })
      : Promise.resolve<string | null>(null),
  ]);

  const household = await db.household.create({
    data: {
      name: input.householdName.trim(),
      timezone: input.timezone || "America/Sao_Paulo",
      currency: input.currency || "BRL",
      // cada household tem a própria instância de WhatsApp (número/bot separado)
      whatsappInstance: input.whatsappInstance || `hh-${randomBytes(4).toString("hex")}`,
    },
  });

  const owner = await db.user.create({
    data: {
      name: input.owner.name.trim(),
      email,
      passwordHash: ownerHash,
      phoneE164: input.owner.phoneE164 || null,
      avatarColor: "#3B82F6",
      isSuperAdmin: input.superAdmin === true,
      memberships: {
        create: {
          householdId: household.id,
          role: "OWNER",
          displayName: input.owner.name.trim(),
          color: "#3B82F6",
        },
      },
    },
  });

  let partnerUserId: string | undefined;
  if (input.partner && partnerHash && partnerEmail) {
    const partner = await db.user.create({
      data: {
        name: input.partner.name.trim(),
        email: partnerEmail,
        passwordHash: partnerHash,
        phoneE164: input.partner.phoneE164 || null,
        avatarColor: "#EC4899",
        memberships: {
          create: {
            householdId: household.id,
            role: "MEMBER",
            displayName: input.partner.name.trim(),
            color: "#EC4899",
          },
        },
      },
    });
    partnerUserId = partner.id;
  }

  await db.category.createMany({
    data: SYSTEM_CATEGORIES.map((c) => ({
      householdId: household.id,
      name: c.name,
      icon: c.icon,
      color: c.color,
      kind: c.kind,
      isSystem: true,
    })),
  });

  await db.notificationPreference.createMany({
    data: NOTIFICATION_TYPES.map((type) => ({
      householdId: household.id,
      type,
      enabled: true,
      channelWeb: true,
      channelWhatsapp: true,
      thresholdPercent: type === "BUDGET_THRESHOLD" ? 80 : null,
      leadDays: type === "INVOICE_DUE" || type === "BILL_DUE" ? 2 : null,
    })),
  });

  return { householdId: household.id, ownerUserId: owner.id, partnerUserId };
}
