-- Backfill: cada household precisa da própria instância de WhatsApp.
-- A household mais antiga fica com a instância default do ambiente ('rtfinance').
UPDATE "Household" SET "whatsappInstance" = 'rtfinance'
WHERE "whatsappInstance" IS NULL
  AND "id" = (SELECT "id" FROM "Household" ORDER BY "createdAt" ASC LIMIT 1);

-- As demais ganham uma instância própria derivada do id.
UPDATE "Household" SET "whatsappInstance" = 'hh-' || substr(md5("id"), 1, 8)
WHERE "whatsappInstance" IS NULL;
