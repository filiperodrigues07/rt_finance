-- Nº fixo de lançamentos de uma recorrência (ex.: 12x). NULL = sem fim.
ALTER TABLE "RecurringExpense" ADD COLUMN "occurrenceCount" INTEGER;
