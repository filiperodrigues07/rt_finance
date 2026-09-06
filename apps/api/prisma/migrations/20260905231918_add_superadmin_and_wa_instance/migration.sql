-- User: super-admin global (gerencia households pela tela /admin)
ALTER TABLE "User" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Household: instância própria da Evolution (número de WhatsApp por casal)
ALTER TABLE "Household" ADD COLUMN "whatsappInstance" TEXT;
CREATE UNIQUE INDEX "Household_whatsappInstance_key" ON "Household"("whatsappInstance");

-- Data patch: o primeiro dono (OWNER mais antigo) vira super-admin.
UPDATE "User" SET "isSuperAdmin" = true
WHERE "id" = (
  SELECT hm."userId" FROM "HouseholdMember" hm
  JOIN "User" u ON u."id" = hm."userId"
  WHERE hm."role" = 'OWNER'
  ORDER BY u."createdAt" ASC
  LIMIT 1
);
