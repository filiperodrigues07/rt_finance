-- Limite já comprometido no cartão fora dos lançamentos do app.
ALTER TABLE "CreditCard" ADD COLUMN "openingUsedCents" INTEGER NOT NULL DEFAULT 0;
