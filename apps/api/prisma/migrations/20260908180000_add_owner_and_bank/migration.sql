-- Conta e cartão: dono (membro do household, opcional) + banco (id da lista estática BANKS).

-- Account
ALTER TABLE "Account" ADD COLUMN "memberId" TEXT;
ALTER TABLE "Account" ADD COLUMN "bankId" TEXT;

-- CreditCard (mantém a coluna "bank" livre para retrocompat)
ALTER TABLE "CreditCard" ADD COLUMN "bankId" TEXT;
ALTER TABLE "CreditCard" ADD COLUMN "memberId" TEXT;

-- índices dos FKs
CREATE INDEX "Account_memberId_idx" ON "Account"("memberId");
CREATE INDEX "CreditCard_memberId_idx" ON "CreditCard"("memberId");

-- FKs (SET NULL: remover um membro não apaga a conta/cartão dele)
ALTER TABLE "Account" ADD CONSTRAINT "Account_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
