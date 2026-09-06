/**
 * Seed inicial do RT Finance. Idempotente: se já existir um household, não faz nada.
 * Rodar com:  pnpm db:seed   (via `prisma db seed`, que carrega o .env)
 */
import { PrismaClient } from "@prisma/client";
import { provisionHousehold } from "../src/lib/household-provisioner";

const prisma = new PrismaClient();

function env(key: string, fallback: string): string {
  const v = process.env[key];
  return v && v.length > 0 ? v : fallback;
}

async function main(): Promise<void> {
  const existing = await prisma.household.findFirst({ select: { id: true } });
  if (existing) {
    console.log(`Seed ignorado: household ${existing.id} já existe.`);
    return;
  }

  const ownerPassword = env("SEED_OWNER_PASSWORD", "rtfinance123");
  const partnerPassword = env("SEED_PARTNER_PASSWORD", "rtfinance123");

  const res = await provisionHousehold(prisma, {
    householdName: env("SEED_HOUSEHOLD_NAME", "Casa RT"),
    timezone: env("APP_TIMEZONE", "America/Sao_Paulo"),
    currency: env("APP_DEFAULT_CURRENCY", "BRL"),
    superAdmin: true, // o primeiro dono é o super-admin
    whatsappInstance: env("EVOLUTION_INSTANCE", "rtfinance"), // usa a instância default do env
    owner: {
      name: env("SEED_OWNER_NAME", "Filipe"),
      email: env("SEED_OWNER_EMAIL", "filipe@rtfinance.local"),
      password: ownerPassword,
      phoneE164: process.env.SEED_OWNER_PHONE || null,
    },
    partner: {
      name: env("SEED_PARTNER_NAME", "Julia"),
      email: env("SEED_PARTNER_EMAIL", "julia@rtfinance.local"),
      password: partnerPassword,
      phoneE164: process.env.SEED_PARTNER_PHONE || null,
    },
  });

  console.log("Seed concluído:");
  console.log(`  household: ${res.householdId}`);
  console.log(`  owner:     ${env("SEED_OWNER_EMAIL", "filipe@rtfinance.local")}  senha: ${ownerPassword}`);
  console.log(`  partner:   ${env("SEED_PARTNER_EMAIL", "julia@rtfinance.local")}  senha: ${partnerPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
