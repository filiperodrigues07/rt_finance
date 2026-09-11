import { createHash } from "node:crypto";
import * as argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createTestApp, prisma, resetDb, seedMinimal, type SeedResult } from "./helpers";
import { BackupService } from "../src/modules/backup/backup.service";
import { NotificationsService } from "../src/modules/notifications/notifications.service";
import { GoalsService } from "../src/modules/goals/goals.service";

let app: NestFastifyApplication;
let http: ReturnType<typeof supertest>;
let seed: SeedResult;
let token: string;

beforeAll(async () => {
  await resetDb();
  seed = await seedMinimal();
  app = await createTestApp();
  http = supertest(app.getHttpServer());

  const res = await http
    .post("/api/auth/login")
    .send({ email: "owner@test.local", password: "test1234" });
  expect(res.status).toBe(200);
  token = res.body.tokens.accessToken;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe("auth", () => {
  it("rejeita sem token", async () => {
    const res = await http.get("/api/categories");
    expect(res.status).toBe(401);
  });
  it("rejeita senha errada", async () => {
    const res = await http.post("/api/auth/login").send({ email: "owner@test.local", password: "x" });
    expect(res.status).toBe(401);
  });
  it("/auth/me retorna o usuário", async () => {
    const res = await http.get("/api/auth/me").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("owner@test.local");
    expect(res.body.role).toBe("OWNER");
  });
});

describe("transações", () => {
  it("cria despesa em conta", async () => {
    const res = await http
      .post("/api/transactions")
      .set(auth())
      .send({
        type: "EXPENSE",
        amountCents: 8500,
        description: "Compra no mercado",
        date: "2026-09-03",
        categoryId: seed.categoryMercado,
        accountId: seed.accountId,
      });
    expect(res.status).toBe(201);
    expect(res.body.amountCents).toBe(8500);
    expect(res.body.invoiceId).toBeNull();
  });

  it("recusa despesa sem meio de pagamento (400)", async () => {
    const res = await http
      .post("/api/transactions")
      .set(auth())
      .send({ type: "EXPENSE", amountCents: 100, description: "x", date: "2026-09-03" });
    expect(res.status).toBe(400);
  });

  it("saldo da conta reflete a despesa", async () => {
    const res = await http.get("/api/accounts").set(auth());
    const acc = res.body.find((a: { id: string }) => a.id === seed.accountId);
    expect(acc.balanceCents).toBe(1_000_00 - 8500);
  });

  it("lista paginada", async () => {
    const res = await http.get("/api/transactions?pageSize=5").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.length).toBeLessThanOrEqual(5);
  });

  it("summary reflete os filtros e cobre todas as páginas", async () => {
    const all = await http.get("/api/transactions?pageSize=1").set(auth());
    expect(all.body.summary).toBeDefined();
    expect(typeof all.body.summary.incomeCents).toBe("number");
    expect(typeof all.body.summary.expenseCents).toBe("number");
    // só despesas → income zera, expense mantém
    const exp = await http.get("/api/transactions?type=EXPENSE&pageSize=1").set(auth());
    expect(exp.body.summary.incomeCents).toBe(0);
    expect(exp.body.summary.expenseCents).toBe(all.body.summary.expenseCents);
  });

  it("busca ampla (nota / valor) e faixa de valor", async () => {
    // sem categoria e em janeiro: não interfere no teste de orçamento (set/2026, categoria Mercado)
    await http
      .post("/api/transactions")
      .set(auth())
      .send({
        type: "EXPENSE",
        amountCents: 15000,
        description: "Conta de energia",
        notes: "boleto luz enel",
        date: "2026-01-05",
        accountId: seed.accountId,
      })
      .expect(201);

    const byNote = await http.get("/api/transactions?search=enel").set(auth());
    expect(byNote.body.data.some((t: { notes?: string }) => t.notes?.includes("enel"))).toBe(true);

    const byValue = await http.get("/api/transactions?search=150").set(auth());
    expect(byValue.body.data.some((t: { amountCents: number }) => t.amountCents === 15000)).toBe(true);

    const inRange = await http.get("/api/transactions?minCents=10000&maxCents=20000").set(auth());
    expect(inRange.body.data.length).toBeGreaterThanOrEqual(1);
    expect(inRange.body.data.every((t: { amountCents: number }) => t.amountCents >= 10000 && t.amountCents <= 20000)).toBe(true);

    const outOfRange = await http.get("/api/transactions?minCents=20001").set(auth());
    expect(outOfRange.body.data.every((t: { amountCents: number }) => t.amountCents >= 20001)).toBe(true);
  });
});

describe("cartão + fatura + parcelamento", () => {
  let cardId: string;

  it("cria cartão", async () => {
    const res = await http
      .post("/api/credit-cards")
      .set(auth())
      .send({ name: "Nubank", limitCents: 500_000, closingDay: 10, dueDay: 17 });
    expect(res.status).toBe(201);
    cardId = res.body.id;
  });

  it("despesa no cartão em 12/09 cai na fatura de outubro", async () => {
    const res = await http
      .post("/api/transactions")
      .set(auth())
      .send({
        type: "EXPENSE",
        amountCents: 12000,
        description: "Gasolina",
        date: "2026-09-12",
        creditCardId: cardId,
      });
    expect(res.status).toBe(201);
    expect(res.body.invoiceId).toBeTruthy();

    const inv = await http.get(`/api/credit-cards/${cardId}/invoices`).set(auth());
    expect(inv.body[0].referenceMonth.slice(0, 7)).toBe("2026-10");
    expect(inv.body[0].dueDate.slice(0, 10)).toBe("2026-10-17");
  });

  it("parcelamento cria N parcelas e comprometimento futuro", async () => {
    const res = await http
      .post("/api/installments/plans")
      .set(auth())
      .send({
        creditCardId: cardId,
        description: "TV",
        totalCents: 240000,
        installmentCount: 12,
        purchaseDate: "2026-09-03",
      });
    expect(res.status).toBe(201);

    const plan = await http.get(`/api/installments/plans/${res.body.id}`).set(auth());
    expect(plan.body.installments).toHaveLength(12);
    expect(plan.body.installments.reduce((a: number, i: { amountCents: number }) => a + i.amountCents, 0)).toBe(240000);

    const fc = await http.get("/api/installments/future-commitment?months=13").set(auth());
    const total = fc.body.reduce((a: number, m: { cents: number }) => a + m.cents, 0);
    expect(total).toBe(240000);
  });

  it("limite usado do cartão soma despesa + parcelas", async () => {
    const res = await http.get("/api/credit-cards").set(auth());
    const card = res.body.find((c: { id: string }) => c.id === cardId);
    expect(card.limits.usedCents).toBe(12000 + 240000);
  });
});

describe("pagar fatura de cartão", () => {
  let cardId: string;
  let invoiceId: string;

  const cardUsed = async () => {
    const res = await http.get("/api/credit-cards").set(auth());
    return res.body.find((c: { id: string }) => c.id === cardId).limits.usedCents as number;
  };
  const acctBalance = async () => {
    const res = await http.get("/api/accounts").set(auth());
    return res.body.find((a: { id: string }) => a.id === seed.accountId).balanceCents as number;
  };

  it("cartão com limite já utilizado entra no cálculo", async () => {
    const res = await http
      .post("/api/credit-cards")
      .set(auth())
      .send({ name: "Fatura Card", limitCents: 500_000, openingUsedCents: 30_000, closingDay: 10, dueDay: 17 });
    expect(res.status).toBe(201);
    cardId = res.body.id;
    expect(await cardUsed()).toBe(30_000);
  });

  it("despesa no cartão sobe o uso e gera fatura pagável", async () => {
    await http
      .post("/api/transactions")
      .set(auth())
      .send({ type: "EXPENSE", amountCents: 20_000, description: "Mercado", date: "2026-09-12", creditCardId: cardId });
    expect(await cardUsed()).toBe(50_000);

    const payable = await http.get("/api/invoices/payable").set(auth());
    const inv = payable.body.find((i: { creditCardId: string }) => i.creditCardId === cardId);
    expect(inv).toBeTruthy();
    expect(inv.totalCents).toBe(20_000);
    invoiceId = inv.id;
  });

  it("pagar debita a conta, baixa a fatura e libera o limite", async () => {
    const before = await acctBalance();
    const res = await http
      .post(`/api/invoices/${invoiceId}/pay`)
      .set(auth())
      .send({ accountId: seed.accountId });
    expect(res.status).toBeLessThan(300);
    expect(res.body.amountCents).toBe(20_000);

    const inv = await http.get(`/api/invoices/${invoiceId}`).set(auth());
    expect(inv.body.status).toBe("PAID");
    expect(inv.body.paidAt).toBeTruthy();
    expect(inv.body.paymentTransactionId).toBeTruthy();

    expect(await cardUsed()).toBe(30_000);
    expect(await acctBalance()).toBe(before - 20_000);
  });

  it("pagar de novo → 409", async () => {
    const res = await http
      .post(`/api/invoices/${invoiceId}/pay`)
      .set(auth())
      .send({ accountId: seed.accountId });
    expect(res.status).toBe(409);
  });
});

describe("fatura: saldo inicial, conciliação e quitar anteriores", () => {
  let cardId: string;
  let invoiceId: string;

  const cardUsed = async () => {
    const res = await http.get("/api/credit-cards").set(auth());
    return res.body.find((c: { id: string }) => c.id === cardId).limits.usedCents as number;
  };

  it("cria cartão e uma despesa que abre a fatura", async () => {
    const card = await http
      .post("/api/credit-cards")
      .set(auth())
      .send({ name: "Onboarding Card", limitCents: 1_000_000, closingDay: 10, dueDay: 17 });
    cardId = card.body.id;
    await http
      .post("/api/transactions")
      .set(auth())
      .send({ type: "EXPENSE", amountCents: 10_000, description: "compra", date: "2026-09-05", creditCardId: cardId });
    const invs = await http.get(`/api/credit-cards/${cardId}/invoices`).set(auth());
    invoiceId = invs.body[0].id;
    expect(invs.body[0].totalCents).toBe(10_000);
  });

  it("saldo inicial entra no total da fatura e no limite usado", async () => {
    const usedBefore = await cardUsed();
    const res = await http
      .patch(`/api/invoices/${invoiceId}`)
      .set(auth())
      .send({ openingBalanceCents: 50_000 });
    expect(res.status).toBe(200);
    expect(res.body.totalCents).toBe(60_000);
    expect(await cardUsed()).toBe(usedBefore + 50_000);
  });

  it("valor real + conciliação: somar a diferença ao saldo inicial", async () => {
    await http.patch(`/api/invoices/${invoiceId}`).set(auth()).send({ statementTotalCents: 75_000 });
    const d1 = await http.get(`/api/invoices/${invoiceId}/detail`).set(auth());
    expect(d1.body.diffCents).toBe(15_000); // 75.000 real − 60.000 app

    const adj = await http
      .post(`/api/invoices/${invoiceId}/adjust`)
      .set(auth())
      .send({ mode: "opening" });
    expect(adj.status).toBeLessThan(300);
    expect(adj.body.openingBalanceCents).toBe(65_000);
    expect(adj.body.totalCents).toBe(75_000);
    expect(adj.body.diffCents).toBe(0);
  });

  it("lançamento de ajuste: cria transação ADJUSTMENT e pode ser removido", async () => {
    await http.patch(`/api/invoices/${invoiceId}`).set(auth()).send({ statementTotalCents: 80_000 });
    const created = await http
      .post(`/api/invoices/${invoiceId}/adjust`)
      .set(auth())
      .send({ mode: "transaction", description: "diferença anuidade" });
    expect(created.body.adjustments).toHaveLength(1);
    expect(created.body.totalCents).toBe(80_000);
    const txId = created.body.adjustments[0].id;

    const back = await http.delete(`/api/invoices/adjustments/${txId}`).set(auth());
    expect(back.status).toBe(200);
    const d = await http.get(`/api/invoices/${invoiceId}/detail`).set(auth());
    expect(d.body.adjustments).toHaveLength(0);
    expect(d.body.totalCents).toBe(75_000);
  });

  it("marcar como conferida grava reconciledAt", async () => {
    const res = await http.post(`/api/invoices/${invoiceId}/reconcile`).set(auth());
    expect(res.status).toBeLessThan(300);
    expect(res.body.reconciledAt).toBeTruthy();
  });

  it("parcelamento com alreadyPaidCount lança só as restantes", async () => {
    const c = await http
      .post("/api/credit-cards")
      .set(auth())
      .send({ name: "Sofa Card", limitCents: 1_000_000, closingDay: 10, dueDay: 17 });
    const plan = await http
      .post("/api/installments/plans")
      .set(auth())
      .send({
        creditCardId: c.body.id,
        description: "Sofá",
        totalCents: 100_000,
        installmentCount: 10,
        purchaseDate: "2026-06-03",
        alreadyPaidCount: 3,
      });
    expect(plan.status).toBe(201);
    const full = await http.get(`/api/installments/plans/${plan.body.id}`).set(auth());
    const inst = full.body.installments as { number: number; status: string; transactionId: string | null }[];
    expect(inst).toHaveLength(10);
    expect(inst.filter((i) => i.status === "PAID")).toHaveLength(3);
    expect(inst.filter((i) => i.status === "PAID").every((i) => i.transactionId == null)).toBe(true);
    expect(inst.filter((i) => i.status === "SCHEDULED")).toHaveLength(7);

    const generatedTx = await prisma.transaction.count({
      where: { description: { startsWith: "Sofá (" } },
    });
    expect(generatedTx).toBe(7);
    // a 1ª parcela lançada é a de nº 4 → competência 2026-09
    const firstGen = await prisma.transaction.findFirst({
      where: { description: "Sofá (4/10)" },
    });
    expect(firstGen?.date.toISOString().slice(0, 7)).toBe("2026-09");
  });

  it("quitar faturas anteriores: passadas viram PAID e suas parcelas CLEARED", async () => {
    const other = await http
      .post("/api/credit-cards")
      .set(auth())
      .send({ name: "Legado Card", limitCents: 1_000_000, closingDay: 10, dueDay: 17 });
    const otherId = other.body.id;
    await http
      .post("/api/installments/plans")
      .set(auth())
      .send({
        creditCardId: otherId,
        description: "Geladeira",
        totalCents: 40_000,
        installmentCount: 4,
        purchaseDate: "2026-05-03",
      });

    const before = await http.get(`/api/credit-cards/${otherId}/invoices`).set(auth());
    expect(before.body).toHaveLength(4);

    const res = await http.post(`/api/credit-cards/${otherId}/settle-past-invoices`).set(auth()).send({});
    expect(res.status).toBeLessThan(300);
    expect(res.body.settled).toBe(4);

    const after = await http.get(`/api/credit-cards/${otherId}/invoices`).set(auth());
    expect(after.body.every((i: { status: string }) => i.status === "PAID")).toBe(true);

    const payable = await http.get("/api/invoices/payable").set(auth());
    expect(payable.body.some((i: { creditCardId: string }) => i.creditCardId === otherId)).toBe(false);

    const cleared = await prisma.transaction.count({
      where: { description: { startsWith: "Geladeira (" }, status: "CLEARED", paidAt: { not: null } },
    });
    expect(cleared).toBe(4);
  });
});

describe("dono + banco em contas/cartões", () => {
  it("cria conta com memberId + bankId e o GET devolve os dois + member", async () => {
    const res = await http
      .post("/api/accounts")
      .set(auth())
      .send({
        name: "Conta do casal",
        type: "CHECKING",
        openingBalanceCents: 0,
        memberId: seed.partnerMemberId,
        bankId: "nubank",
      });
    expect(res.status).toBe(201);

    const list = await http.get("/api/accounts").set(auth());
    const acc = list.body.find((a: { id: string }) => a.id === res.body.id);
    expect(acc.bankId).toBe("nubank");
    expect(acc.memberId).toBe(seed.partnerMemberId);
    expect(acc.member?.displayName).toBe("Partner");
  });

  it("cria cartão alimentação (MEAL_VOUCHER) e o saldo cai ao gastar", async () => {
    const acc = await http
      .post("/api/accounts")
      .set(auth())
      .send({
        name: "Vale alimentação",
        type: "MEAL_VOUCHER",
        openingBalanceCents: 60_000,
        memberId: seed.ownerMemberId,
      });
    expect(acc.status).toBe(201);
    const accId = acc.body.id;

    await http
      .post("/api/transactions")
      .set(auth())
      .send({ type: "EXPENSE", amountCents: 4_500, description: "Almoço", date: "2026-09-15", accountId: accId });

    const list = await http.get("/api/accounts").set(auth());
    const row = list.body.find((a: { id: string }) => a.id === accId);
    expect(row.type).toBe("MEAL_VOUCHER");
    expect(row.balanceCents).toBe(60_000 - 4_500);
  });

  it("recusa conta com memberId inexistente (404)", async () => {
    const res = await http
      .post("/api/accounts")
      .set(auth())
      .send({
        name: "Conta ruim",
        type: "CHECKING",
        openingBalanceCents: 0,
        memberId: "clnotarealmemberid00000000",
      });
    expect(res.status).toBe(404);
  });

  it("cria cartão com bankId + memberId e persiste", async () => {
    const res = await http
      .post("/api/credit-cards")
      .set(auth())
      .send({
        name: "C6",
        limitCents: 300_000,
        closingDay: 5,
        dueDay: 12,
        bankId: "c6",
        memberId: seed.ownerMemberId,
      });
    expect(res.status).toBe(201);

    const list = await http.get("/api/credit-cards").set(auth());
    const card = list.body.find((c: { id: string }) => c.id === res.body.id);
    expect(card.bankId).toBe("c6");
    expect(card.memberId).toBe(seed.ownerMemberId);
    expect(card.member?.displayName).toBe("Owner");
  });
});

describe("contas a pagar em série + orçamentos", () => {
  let seriesId = "";
  it("repeatMonths gera N contas a pagar mensais; só a do mês em Todas; não mexe no saldo", async () => {
    const catId = (await prisma.category.findFirst({ where: { name: "Contas" } }))!.id;
    const before = await http.get("/api/accounts").set(auth());
    const bal0 = before.body.find((a: { id: string }) => a.id === seed.accountId).balanceCents;

    const res = await http
      .post("/api/transactions")
      .set(auth())
      .send({
        type: "EXPENSE",
        amountCents: 180000,
        description: "Aluguel",
        date: "2026-09-10",
        dueDate: "2026-09-10",
        categoryId: catId,
        accountId: seed.accountId,
        status: "PENDING",
        repeatMonths: 6,
      });
    expect(res.status).toBe(201);
    seriesId = res.body.scheduleGroupId;
    expect(seriesId).toBeTruthy();

    const rows = await prisma.transaction.findMany({
      where: { scheduleGroupId: seriesId },
      orderBy: { dueDate: "asc" },
    });
    expect(rows.length).toBe(6);
    expect(rows.every((t) => t.status === "PENDING" && t.dueDate != null)).toBe(true);
    expect(rows[0].description).toBe("Aluguel (1/6)");
    expect(rows[5].description).toBe("Aluguel (6/6)");
    expect(rows[1].dueDate!.toISOString().slice(0, 7)).toBe("2026-10");

    const after = await http.get("/api/accounts").set(auth());
    const bal1 = after.body.find((a: { id: string }) => a.id === seed.accountId).balanceCents;
    expect(bal1).toBe(bal0); // agendado não mexe no saldo

    const sched = await http.get("/api/transactions?scheduled=true&pageSize=100").set(auth());
    const schedIds = new Set(sched.body.data.map((t: { id: string }) => t.id));
    expect(rows.every((t) => schedIds.has(t.id))).toBe(true);

    const todas = await http.get("/api/transactions?pageSize=100").set(auth());
    const todasIds = new Set(todas.body.data.map((t: { id: string }) => t.id));
    expect(todasIds.has(rows[0].id)).toBe(true); // a de setembro
    expect(rows.slice(1).some((t) => todasIds.has(t.id))).toBe(false); // futuras não
  });

  it("cancel-series remove a parcela e as próximas; mantém as já vencidas/pagas", async () => {
    const rows = await prisma.transaction.findMany({
      where: { scheduleGroupId: seriesId },
      orderBy: { dueDate: "asc" },
    });
    const third = rows[2];
    const r = await http.post(`/api/transactions/${third.id}/cancel-series`).set(auth());
    expect(r.status).toBe(201);
    expect(r.body.deleted).toBe(4); // 3,4,5,6
    const left = await prisma.transaction.count({ where: { scheduleGroupId: seriesId } });
    expect(left).toBe(2);
  });

  it("repeatMonths default = 1 lançamento único", async () => {
    const catId = (await prisma.category.findFirst({ where: { name: "Contas" } }))!.id;
    const res = await http.post("/api/transactions").set(auth()).send({
      type: "EXPENSE",
      amountCents: 5000,
      description: "Boleto único",
      date: "2026-09-20",
      dueDate: "2026-09-20",
      categoryId: catId,
      accountId: seed.accountId,
      status: "PENDING",
    });
    expect(res.status).toBe(201);
    expect(res.body.scheduleGroupId).toBeNull();
    expect(res.body.description).toBe("Boleto único");
  });

  it("orçamento calcula % gasto", async () => {
    await http
      .post("/api/budgets")
      .set(auth())
      .send({ categoryId: seed.categoryMercado, month: "2026-09-01", amountCents: 10000 });
    const res = await http.get("/api/budgets?month=2026-09-01").set(auth());
    const b = res.body.find((x: { categoryId: string }) => x.categoryId === seed.categoryMercado);
    expect(b.spentCents).toBe(8500);
    expect(b.percent).toBe(85);
  });

  it("rollover: sobra do mês anterior entra no disponível", async () => {
    const catId = (await prisma.category.findFirst({ where: { name: "Contas" } }))!.id;
    // agosto: orçou 100, gastou 30 → sobra 70
    await prisma.budget.create({
      data: { householdId: seed.householdId, categoryId: catId, month: new Date("2026-08-01"), amountCents: 10000 },
    });
    await http.post("/api/transactions").set(auth()).send({
      type: "EXPENSE",
      amountCents: 3000,
      description: "luz ago",
      date: "2026-08-15",
      categoryId: catId,
      accountId: seed.accountId,
    });
    // setembro: orça 50 com rollover
    await http
      .post("/api/budgets")
      .set(auth())
      .send({ categoryId: catId, month: "2026-09-01", amountCents: 5000, rollover: true });

    const res = await http.get("/api/budgets?month=2026-09-01").set(auth());
    const b = res.body.find((x: { categoryId: string }) => x.categoryId === catId);
    expect(b.carryCents).toBe(7000);
    expect(b.effectiveAmountCents).toBe(12000);
  });
});

describe("acerto do casal", () => {
  const M = () => new Date().toISOString().slice(0, 7);

  it("toggle do recurso: dono liga, membro comum recebe 403", async () => {
    const on = await http.put("/api/household/features").set(auth()).send({ settleUp: true });
    expect(on.status).toBe(200);
    expect(on.body.settleUp).toBe(true);

    const login = await http.post("/api/auth/login").send({ email: "partner@test.local", password: "test1234" });
    const forbidden = await http
      .put("/api/household/features")
      .set({ Authorization: `Bearer ${login.body.tokens.accessToken}` })
      .send({ settleUp: false });
    expect(forbidden.status).toBe(403);
  });

  it("settle-up soma por pagador e aponta quem deve", async () => {
    const day = `${M()}-05`;
    await http.post("/api/transactions").set(auth()).send({
      type: "EXPENSE",
      amountCents: 10000,
      description: "acerto owner",
      date: day,
      categoryId: seed.categoryMercado,
      accountId: seed.accountId,
      memberId: seed.ownerMemberId,
    });
    await http.post("/api/transactions").set(auth()).send({
      type: "EXPENSE",
      amountCents: 4000,
      description: "acerto partner",
      date: day,
      categoryId: seed.categoryMercado,
      accountId: seed.accountId,
      memberId: seed.partnerMemberId,
    });

    const from = `${M()}-01`;
    const to = `${M()}-28`;
    const res = await http.get(`/api/reports/settle-up?from=${from}&to=${to}`).set(auth());
    expect(res.status).toBe(200);
    const owner = res.body.perMember.find((m: { memberId: string }) => m.memberId === seed.ownerMemberId);
    expect(owner.paidCents).toBeGreaterThanOrEqual(10000);
    expect(res.body.net.fromMemberId).toBe(seed.partnerMemberId);
    expect(res.body.net.toMemberId).toBe(seed.ownerMemberId);

    // sem contas padrão distintas → não acerta, mas não quebra
    const settle = await http
      .post("/api/reports/settle-up/settle")
      .set(auth())
      .send({ from, to });
    expect(settle.status).toBeLessThan(300);
    expect(settle.body.ok).toBe(false);
  });
});

describe("metas com aporte automático", () => {
  it("runAutoContributions cria contribuição + transação e é idempotente no mês", async () => {
    // dia no fuso do household (o serviço usa todayIso(tz), não UTC)
    const spToday = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const day = Number(spToday.slice(8, 10));
    const goal = await http
      .post("/api/goals")
      .set(auth())
      .send({
        name: "Reserva auto",
        targetCents: 500000,
        autoContributeCents: 20000,
        autoContributeDay: Math.min(28, day),
        autoFromAccountId: seed.accountId,
      });
    expect(goal.status).toBe(201);

    const svc = app.get(GoalsService);
    const r1 = await svc.runAutoContributions();
    expect(r1.created).toBeGreaterThanOrEqual(1);
    const r2 = await svc.runAutoContributions();
    // idempotente: não cria de novo no mesmo mês
    const contribs = await prisma.goalContribution.count({ where: { goalId: goal.body.id } });
    expect(contribs).toBe(1);
    void r2;

    const g = await prisma.financialGoal.findUnique({ where: { id: goal.body.id } });
    expect(g!.currentCents).toBe(20000);
    const tx = await prisma.transaction.findFirst({
      where: { description: "Aporte automático: Reserva auto" },
    });
    expect(tx?.amountCents).toBe(20000);
  });
});

describe("metas", () => {
  it("aporte atualiza progresso e milestone", async () => {
    const goal = await http.post("/api/goals").set(auth()).send({ name: "Viagem", targetCents: 100000 });
    const contrib = await http
      .post(`/api/goals/${goal.body.id}/contributions`)
      .set(auth())
      .send({ amountCents: 60000, date: "2026-09-03" });
    expect(contrib.body.goal.currentCents).toBe(60000);

    const notifs = await http.get("/api/notifications?status=ALL&limit=10").set(auth());
    const milestones = notifs.body.filter((n: { type: string }) => n.type === "GOAL_MILESTONE");
    expect(milestones.length).toBeGreaterThanOrEqual(1);
  });
});

describe("contas a pagar + ações em massa + lançamento rápido", () => {
  let pendingId: string;

  it("cria agendado (PENDING + dueDate) que não entra no saldo nem no totalizador", async () => {
    const before = await http.get("/api/accounts").set(auth());
    const bal0 = before.body.find((a: { id: string }) => a.id === seed.accountId).balanceCents;
    const sum0 = (await http.get("/api/transactions?pageSize=1").set(auth())).body.summary;

    const res = await http
      .post("/api/transactions")
      .set(auth())
      .send({
        type: "EXPENSE",
        amountCents: 9900,
        description: "Boleto internet",
        date: "2026-09-04",
        dueDate: "2026-09-15",
        accountId: seed.accountId,
        status: "PENDING",
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
    pendingId = res.body.id;

    const after = await http.get("/api/accounts").set(auth());
    const bal1 = after.body.find((a: { id: string }) => a.id === seed.accountId).balanceCents;
    expect(bal1).toBe(bal0); // agendado não mexe no saldo

    // totalizador da aba "Todas" ignora o pendente; a aba "A pagar" o inclui
    const sum1 = (await http.get("/api/transactions?pageSize=1").set(auth())).body.summary;
    expect(sum1.expenseCents).toBe(sum0.expenseCents);
    const sched = (await http.get("/api/transactions?scheduled=true&pageSize=1").set(auth())).body
      .summary;
    expect(sched.expenseCents).toBeGreaterThanOrEqual(9900);
  });

  it("lista em ?scheduled=true e some após pagar", async () => {
    const list = await http.get("/api/transactions?scheduled=true").set(auth());
    expect(list.body.data.some((t: { id: string }) => t.id === pendingId)).toBe(true);

    const before = await http.get("/api/accounts").set(auth());
    const bal0 = before.body.find((a: { id: string }) => a.id === seed.accountId).balanceCents;

    const pay = await http.post(`/api/transactions/${pendingId}/pay`).set(auth()).send({});
    expect(pay.status).toBe(201);
    expect(pay.body.status).toBe("CONFIRMED");
    expect(pay.body.paidAt).toBeTruthy();

    const list2 = await http.get("/api/transactions?scheduled=true").set(auth());
    expect(list2.body.data.some((t: { id: string }) => t.id === pendingId)).toBe(false);

    const after = await http.get("/api/accounts").set(auth());
    const bal1 = after.body.find((a: { id: string }) => a.id === seed.accountId).balanceCents;
    expect(bal1).toBe(bal0 - 9900); // agora conta no saldo
  });

  it("lançamento rápido cria despesa categorizada", async () => {
    const res = await http
      .post("/api/transactions/quick")
      .set(auth())
      .send({ text: "gastei 40 no mercado" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("created");
    expect(res.body.transaction.type).toBe("EXPENSE");
    expect(res.body.transaction.amountCents).toBe(4000);
    expect(res.body.transaction.category?.name).toBe("Mercado");
  });

  it("lançamento rápido sem sentido → needs_form", async () => {
    const res = await http
      .post("/api/transactions/quick")
      .set(auth())
      .send({ text: "qual o sentido da vida" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("needs_form");
    expect(res.body.reason).toBeTruthy();
  });

  it("lançamento rápido de compra parcelada devolve preview (não grava)", async () => {
    await http
      .post("/api/credit-cards")
      .set(auth())
      .send({ name: "QuickCard", limitCents: 500_000, closingDay: 10, dueDay: 17 });

    const res = await http
      .post("/api/transactions/quick")
      .set(auth())
      .send({ text: "gastei 300 no cartão quickcard em 3x" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("preview");
    expect(res.body.plan.installmentCount).toBe(3);
    expect(res.body.plan.totalCents).toBe(30000);
    expect(res.body.plan.installmentCents).toBe(10000);

    const count = await prisma.installmentPlan.count({ where: { description: { contains: "quickcard", mode: "insensitive" } } });
    expect(count).toBe(0);
  });

  it("bulk delete ignora parcela e devolve skipped", async () => {
    const inst = await prisma.transaction.findFirst({ where: { installmentId: { not: null } } });
    const normal = await http
      .post("/api/transactions")
      .set(auth())
      .send({
        type: "EXPENSE",
        amountCents: 1234,
        description: "descartável",
        date: "2026-09-04",
        accountId: seed.accountId,
      });

    const res = await http
      .post("/api/transactions/bulk/delete")
      .set(auth())
      .send({ ids: [normal.body.id, inst!.id] });
    expect(res.status).toBe(201);
    expect(res.body.affected).toBe(1);
    expect(res.body.skipped).toHaveLength(1);
    expect(res.body.skipped[0].id).toBe(inst!.id);
  });
});

describe("exportação de relatório", () => {
  it("export.xlsx retorna planilha", async () => {
    const res = await http.get("/api/reports/export.xlsx?from=2026-09-01&to=2026-09-30").set(auth());
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml.sheet");
    expect(res.body.length ?? res.text.length).toBeGreaterThan(500);
  });

  it("export.pdf retorna PDF", async () => {
    const res = await http
      .get("/api/reports/export.pdf?from=2026-09-01&to=2026-09-30")
      .set(auth())
      .buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
  });
});

describe("anexos de lançamento (boleto/comprovante)", () => {
  let txId: string;
  let attId: string;
  const pdfBytes = Buffer.from("%PDF-1.4\n%fake boleto\n%%EOF");

  it("cria um lançamento agendado pra anexar o boleto", async () => {
    const res = await http
      .post("/api/transactions")
      .set(auth())
      .send({
        type: "EXPENSE",
        amountCents: 5000,
        description: "Boleto teste",
        date: "2026-09-04",
        dueDate: "2026-09-20",
        accountId: seed.accountId,
        status: "PENDING",
      });
    expect(res.status).toBe(201);
    txId = res.body.id;
  });

  it("anexa o boleto (PDF)", async () => {
    const res = await http
      .post(`/api/transactions/${txId}/attachments`)
      .set(auth())
      .field("kind", "BOLETO")
      .attach("file", pdfBytes, { filename: "boleto.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("BOLETO");
    expect(res.body.fileName).toBe("boleto.pdf");
    expect(res.body.sizeBytes).toBe(pdfBytes.length);
    attId = res.body.id;
  });

  it("lista o anexo", async () => {
    const res = await http.get(`/api/transactions/${txId}/attachments`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(attId);
  });

  it("baixa o arquivo e os bytes batem", async () => {
    const res = await http
      .get(`/api/transactions/attachments/${attId}/file`)
      .set(auth())
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(Buffer.compare(res.body as Buffer, pdfBytes)).toBe(0);
  });

  it("rejeita mimetype fora da allowlist", async () => {
    const res = await http
      .post(`/api/transactions/${txId}/attachments`)
      .set(auth())
      .field("kind", "RECEIPT")
      .attach("file", Buffer.from("<html></html>"), { filename: "pagina.html", contentType: "text/html" });
    expect(res.status).toBe(422);
  });

  it("rejeita arquivo maior que 5 MB", async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 1);
    const res = await http
      .post(`/api/transactions/${txId}/attachments`)
      .set(auth())
      .field("kind", "RECEIPT")
      .attach("file", big, { filename: "grande.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
  });

  it("exclui o anexo", async () => {
    const res = await http.delete(`/api/transactions/attachments/${attId}`).set(auth());
    expect(res.status).toBe(200);
    const list = await http.get(`/api/transactions/${txId}/attachments`).set(auth());
    expect(list.body).toHaveLength(0);
  });
});

describe("importação (OFX)", () => {
  const OFX = [
    "OFXHEADER:100",
    "DATA:OFXSGML",
    "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>",
    "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260905<TRNAMT>-73.40<FITID>IT-1<NAME>SUPERMERCADO SP<MEMO>compra</STMTTRN>",
    "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260906<TRNAMT>2500.00<FITID>IT-2<NAME>DEPOSITO CLIENTE</STMTTRN>",
    "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
  ].join("\n");
  let batchId: string;

  it("upload cria o batch e categoriza o que dá", async () => {
    const res = await http
      .post("/api/imports")
      .set(auth())
      .field("kind", "BANK")
      .field("accountId", seed.accountId)
      .attach("file", Buffer.from(OFX), { filename: "extrato.ofx", contentType: "application/x-ofx" });
    expect(res.status).toBe(201);
    expect(res.body.rowCount).toBe(2);
    batchId = res.body.id;
    const merc = res.body.rows.find((r: { description: string }) => r.description.includes("SUPERMERCADO"));
    expect(merc.categoryName).toBe("Mercado");
    expect(merc.state).toBe("COMMITTED"); // auto-importado
  });

  it("commit grava as linhas restantes como transações IMPORT", async () => {
    const res = await http.post(`/api/imports/${batchId}/commit`).set(auth()).send({});
    expect(res.status).toBe(201);
    const tx = await http.get("/api/transactions?search=DEPOSITO").set(auth());
    expect(tx.body.data[0].source).toBe("IMPORT");
    expect(tx.body.data[0].type).toBe("INCOME");
  });

  it("reimportar o mesmo arquivo marca tudo como duplicata", async () => {
    const res = await http
      .post("/api/imports")
      .set(auth())
      .field("kind", "BANK")
      .field("accountId", seed.accountId)
      .attach("file", Buffer.from(OFX), { filename: "extrato.ofx", contentType: "application/x-ofx" });
    expect(res.status).toBe(201);
    expect(res.body.rows.every((r: { state: string }) => r.state === "DUPLICATE")).toBe(true);
  });
});

describe("relatórios", () => {
  it("dashboard agrega o período", async () => {
    const res = await http.get("/api/reports/dashboard?months=3").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.expenseCents).toBeGreaterThan(0);
    expect(Array.isArray(res.body.byCategory)).toBe(true);
    expect(res.body.prev).toBeDefined();
    expect(typeof res.body.prev.expenseCents).toBe("number");
    expect(Array.isArray(res.body.prev.expenseByCategory)).toBe(true);
    expect(Array.isArray(res.body.incomeByCategory)).toBe(true);
    const incSum = res.body.incomeByCategory.reduce(
      (a: number, c: { cents: number }) => a + c.cents,
      0,
    );
    expect(incSum).toBe(res.body.incomeCents);
  });

  it("dashboard aceita filtros (pessoa, categoria, conta)", async () => {
    const full = await http.get("/api/reports/dashboard").set(auth());
    const byMember = await http
      .get(`/api/reports/dashboard?memberId=${seed.ownerMemberId}`)
      .set(auth());
    expect(byMember.status).toBe(200);
    // filtrado por 1 pessoa nunca soma mais que o total
    expect(byMember.body.expenseCents).toBeLessThanOrEqual(full.body.expenseCents);
    expect(byMember.body.byMember.every((m: { memberId: string }) => m.memberId === seed.ownerMemberId)).toBe(true);

    const byCat = await http
      .get(`/api/reports/dashboard?categoryId=${seed.categoryMercado}`)
      .set(auth());
    expect(byCat.status).toBe(200);
    expect(byCat.body.byCategory.every((c: { categoryId: string }) => c.categoryId === seed.categoryMercado)).toBe(true);

    const byAcc = await http
      .get(`/api/reports/dashboard?accountId=${seed.accountId}`)
      .set(auth());
    expect(byAcc.status).toBe(200);
    expect(typeof byAcc.body.balanceCents).toBe("number");
  });

  it("insights retorna uma lista", async () => {
    const res = await http.get("/api/reports/insights").set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeLessThanOrEqual(4);
  });

  it("pace v2 separa conta fixa do gasto variável e fecha a conta", async () => {
    const res = await http.get("/api/reports/pace").set(auth());
    expect(res.status).toBe(200);
    const p = res.body;
    expect(p.basisDays).toBe(60);
    expect(p.remainingDays).toBe(p.daysInMonth - p.daysElapsed);
    expect(p.discretionaryRemainingCents).toBe(p.discretionaryPerDayCents * p.remainingDays);
    expect(p.projectedSpendCents).toBe(
      p.spentSoFarCents + p.knownBillsRemainingCents + p.discretionaryRemainingCents,
    );
    expect(p.projectedResultCents).toBe(p.projectedIncomeCents - p.projectedSpendCents);
    // receita projetada nunca abaixo do que já entrou no mês
    expect(p.projectedIncomeCents).toBeGreaterThanOrEqual(p.incomeSoFarCents);
  });

  it("fluxo de caixa projetado: mês 0 usa a projeção realista do mês", async () => {
    const [cf, pace] = await Promise.all([
      http.get("/api/reports/cash-flow?months=4").set(auth()),
      http.get("/api/reports/pace").set(auth()),
    ]);
    expect(cf.status).toBe(200);
    expect(cf.body.length).toBe(4);
    expect(cf.body[0].incomeCents).toBe(pace.body.projectedIncomeCents);
    expect(cf.body[0].expenseCents).toBe(pace.body.projectedSpendCents);
  });

  it("análise do mês: cai nas regras quando a IA está indisponível (mock)", async () => {
    const res = await http.get("/api/reports/analysis").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.fonte).toBe("regras");
    expect(typeof res.body.resumo).toBe("string");
    expect(res.body.resumo.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.recomendacoes)).toBe(true);
    expect(res.body.recomendacoes.length).toBeGreaterThan(0);
    expect(typeof res.body.geradoEm).toBe("string");

    // cache: 2ª chamada devolve o mesmo geradoEm; force=1 refaz
    const again = await http.get("/api/reports/analysis").set(auth());
    expect(again.body.geradoEm).toBe(res.body.geradoEm);
    const forced = await http.get("/api/reports/analysis?force=1").set(auth());
    expect(forced.status).toBe(200);
  });

  it("exporta CSV", async () => {
    const res = await http.get("/api/reports/transactions.csv").set(auth());
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("Data;Tipo;Descrição");
  });
});

describe("backup / restore", () => {
  it("exporta e restaura sem perder dados (round-trip)", async () => {
    const dump = await http.get("/api/household/backup").set(auth());
    expect(dump.status).toBe(200);
    expect(dump.headers["content-disposition"]).toContain("rt-finance-backup-");
    const b = dump.body;
    expect(b.version).toBe(1);
    const before = {
      transaction: b.transactions.length,
      category: b.categories.length,
      creditCard: b.creditCards.length,
      financialGoal: b.financialGoals.length,
      installment: b.installments.length,
    };
    expect(before.transaction).toBeGreaterThan(0);

    const file = Buffer.from(JSON.stringify(b));
    const restore = await http
      .post("/api/household/restore")
      .set(auth())
      .field("password", "test1234")
      .field("confirm", "RESTAURAR")
      .attach("file", file, { filename: "backup.json", contentType: "application/json" });
    expect(restore.status).toBe(201);
    expect(restore.body.restored.transaction).toBe(before.transaction);

    const dump2 = await http.get("/api/household/backup").set(auth());
    expect(dump2.body.transactions.length).toBe(before.transaction);
    expect(dump2.body.categories.length).toBe(before.category);
    expect(dump2.body.creditCards.length).toBe(before.creditCard);
    expect(dump2.body.financialGoals.length).toBe(before.financialGoal);
    expect(dump2.body.installments.length).toBe(before.installment);
  });

  it("recusa senha errada, confirmação errada e não-dono", async () => {
    const file = Buffer.from(JSON.stringify((await http.get("/api/household/backup").set(auth())).body));
    const send = (extra: (r: ReturnType<typeof http.post>) => ReturnType<typeof http.post>) =>
      extra(http.post("/api/household/restore")).attach("file", file, {
        filename: "b.json",
        contentType: "application/json",
      });

    const badPw = await send((r) => r.set(auth()).field("password", "errada").field("confirm", "RESTAURAR"));
    expect(badPw.status).toBe(422);
    const badConfirm = await send((r) => r.set(auth()).field("password", "test1234").field("confirm", "sim"));
    expect(badConfirm.status).toBe(422);

    const partner = await http
      .post("/api/auth/login")
      .send({ email: "partner@test.local", password: "test1234" });
    const forbidden = await send((r) =>
      r
        .set("authorization", `Bearer ${partner.body.tokens.accessToken}`)
        .field("password", "test1234")
        .field("confirm", "RESTAURAR"),
    );
    expect(forbidden.status).toBe(403);
  });

  it("backup automático: configura, roda o job e mantém só os últimos 4", async () => {
    const svc = app.get(BackupService);

    const put = await http
      .put("/api/household/backup/settings")
      .set(auth())
      .send({ frequency: "daily", email: false, keepInApp: true });
    expect(put.status).toBe(200);
    expect(put.body.frequency).toBe("daily");

    const got = await http.get("/api/household/backup/settings").set(auth());
    expect(got.body.frequency).toBe("daily");
    expect(got.body.email).toBe(false);

    const partner = await http
      .post("/api/auth/login")
      .send({ email: "partner@test.local", password: "test1234" });
    const forbidden = await http
      .put("/api/household/backup/settings")
      .set("authorization", `Bearer ${partner.body.tokens.accessToken}`)
      .send({ frequency: "weekly" });
    expect(forbidden.status).toBe(403);

    // job: cria 1 AUTO; rodar de novo no mesmo dia não duplica
    await svc.runScheduledBackups();
    let hist = (await http.get("/api/household/backup/history").set(auth())).body;
    expect(hist.length).toBe(1);
    expect(hist[0].trigger).toBe("AUTO");
    await svc.runScheduledBackups();
    hist = (await http.get("/api/household/backup/history").set(auth())).body;
    expect(hist.length).toBe(1);

    // retenção: 5 snapshots → sobram 4
    for (let i = 0; i < 5; i++) await svc.snapshot(seed.householdId, "MANUAL", true);
    hist = (await http.get("/api/household/backup/history").set(auth())).body;
    expect(hist.length).toBe(4);

    // baixar um snapshot devolve JSON de backup válido
    const fileRes = await http.get(`/api/household/backup/history/${hist[0].id}`).set(auth());
    expect(fileRes.status).toBe(200);
    expect(fileRes.headers["content-disposition"]).toContain("rt-finance-backup-");
    const parsed = JSON.parse(fileRes.text);
    expect(parsed.version).toBe(1);
    expect(Array.isArray(parsed.transactions)).toBe(true);
  });
});

describe("limpar dados (zona de perigo)", () => {
  it("recusa senha errada", async () => {
    const res = await http
      .post("/api/household/reset-data")
      .set(auth())
      .send({ confirm: "LIMPAR", password: "errada", alsoAccounts: false, alsoCards: false, alsoCategories: false });
    expect(res.status).toBe(422);
  });

  it("recusa confirmação diferente de LIMPAR", async () => {
    const res = await http
      .post("/api/household/reset-data")
      .set(auth())
      .send({ confirm: "limpar", password: "test1234", alsoAccounts: false, alsoCards: false, alsoCategories: false });
    expect(res.status).toBe(400);
  });

  it("limpa histórico + recria categorias, mantém contas", async () => {
    const before = await http.get("/api/transactions?pageSize=1").set(auth());
    expect(before.body.total).toBeGreaterThan(0);

    const res = await http
      .post("/api/household/reset-data")
      .set(auth())
      .send({ confirm: "LIMPAR", password: "test1234", alsoAccounts: false, alsoCards: true, alsoCategories: true });
    expect(res.status).toBe(201);
    expect(res.body.cleared).toContain("histórico");
    expect(res.body.cleared).toContain("cartões");

    const txs = await http.get("/api/transactions?pageSize=1").set(auth());
    expect(txs.body.total).toBe(0);

    const cats = await http.get("/api/categories").set(auth());
    expect(cats.body.length).toBeGreaterThan(5); // recriadas as padrão

    const accs = await http.get("/api/accounts").set(auth());
    expect(accs.body.length).toBeGreaterThan(0); // contas mantidas

    const cards = await http.get("/api/credit-cards").set(auth());
    expect(cards.body.length).toBe(0); // cartões apagados
  });
});

describe("admin (super-admin: households)", () => {
  let partnerToken: string;
  let newHouseholdId: string;

  it("owner do seed é super-admin", async () => {
    const me = await http.get("/api/auth/me").set(auth());
    expect(me.body.isSuperAdmin).toBe(true);
  });

  it("não-admin recebe 403 em /admin/households", async () => {
    const login = await http
      .post("/api/auth/login")
      .send({ email: "partner@test.local", password: "test1234" });
    partnerToken = login.body.tokens.accessToken;
    const res = await http
      .get("/api/admin/households")
      .set({ Authorization: `Bearer ${partnerToken}` });
    expect(res.status).toBe(403);
  });

  it("super-admin cria um 2º household e o dono novo consegue logar", async () => {
    const res = await http
      .post("/api/admin/households")
      .set(auth())
      .send({
        householdName: "Casa Amigos",
        owner: { name: "Bruno", email: "bruno@amigos.local", password: "amigos12345" },
        partner: { name: "Carla", email: "carla@amigos.local", password: "amigos12345" },
      });
    expect(res.status).toBe(201);
    newHouseholdId = res.body.id;

    const login = await http
      .post("/api/auth/login")
      .send({ email: "bruno@amigos.local", password: "amigos12345" });
    expect(login.status).toBe(200);
    expect(login.body.user.isSuperAdmin).toBeFalsy();
    expect(login.body.user.householdId).toBe(newHouseholdId);

    // dono novo só enxerga os próprios dados (0 lançamentos, categorias do sistema)
    const txs = await http
      .get("/api/transactions?pageSize=1")
      .set({ Authorization: `Bearer ${login.body.tokens.accessToken}` });
    expect(txs.body.total).toBe(0);
    const cats = await http
      .get("/api/categories")
      .set({ Authorization: `Bearer ${login.body.tokens.accessToken}` });
    expect(cats.body.length).toBeGreaterThan(5);
  });

  it("e-mail duplicado é rejeitado (409)", async () => {
    const res = await http
      .post("/api/admin/households")
      .set(auth())
      .send({
        householdName: "Casa X",
        owner: { name: "Y", email: "bruno@amigos.local", password: "outrasenha1" },
      });
    expect(res.status).toBe(409);
  });

  it("super-admin lista e depois exclui o household criado", async () => {
    const list = await http.get("/api/admin/households").set(auth());
    expect(list.body.length).toBeGreaterThanOrEqual(2);
    const target = list.body.find((h: { id: string }) => h.id === newHouseholdId);
    expect(target.isMine).toBe(false);

    const del = await http
      .delete(`/api/admin/households/${newHouseholdId}`)
      .set(auth())
      .send({ confirmName: "nome errado" });
    expect(del.status).toBe(422);

    const del2 = await http
      .delete(`/api/admin/households/${newHouseholdId}`)
      .set(auth())
      .send({ confirmName: "Casa Amigos" });
    expect(del2.status).toBe(200);
  });
});

describe("telefone do membro (allowlist via tela)", () => {
  it("owner define o telefone de um membro", async () => {
    const members = await http.get("/api/household/members").set(auth());
    const partner = members.body.find((m: { role: string }) => m.role === "MEMBER");
    const res = await http
      .patch(`/api/household/members/${partner.id}`)
      .set(auth())
      .send({ phoneE164: "+5549988887777" });
    expect(res.status).toBe(200);
    const me = await http.get("/api/household").set(auth());
    const updated = me.body.members.find((m: { id: string }) => m.id === partner.id);
    expect(updated.user.phoneE164).toBe("+5549988887777");
  });

  it("rejeita número já usado por outro usuário", async () => {
    const members = await http.get("/api/household/members").set(auth());
    const owner = members.body.find((m: { role: string }) => m.role === "OWNER");
    const res = await http
      .patch(`/api/household/members/${owner.id}`)
      .set(auth())
      .send({ phoneE164: "+5549988887777" }); // já é do parceiro
    expect(res.status).toBe(409);
  });

  it("normaliza o que foi digitado, em qualquer formato", async () => {
    const members = await http.get("/api/household/members").set(auth());
    const owner = members.body.find((m: { role: string }) => m.role === "OWNER");
    for (const typed of ["(49) 99964-8111", "49 9964-8111", "5549999648111", "+554999648111"]) {
      const res = await http
        .patch(`/api/household/members/${owner.id}`)
        .set(auth())
        .send({ phoneE164: typed });
      expect(res.status).toBe(200);
      const hh = await http.get("/api/household").set(auth());
      const updated = hh.body.members.find((m: { id: string }) => m.id === owner.id);
      expect(updated.user.phoneE164).toBe("+5549999648111");
    }
    // devolve o número do seed — os testes do webhook dependem dele
    await http
      .patch(`/api/household/members/${owner.id}`)
      .set(auth())
      .send({ phoneE164: "+5511900000001" })
      .expect(200);
  });

  it("rejeita o que não dá para entender (400)", async () => {
    const members = await http.get("/api/household/members").set(auth());
    const owner = members.body.find((m: { role: string }) => m.role === "OWNER");
    const res = await http
      .patch(`/api/household/members/${owner.id}`)
      .set(auth())
      .send({ phoneE164: "123" });
    expect(res.status).toBe(400);
  });
});

describe("redefinição de senha por e-mail", () => {
  const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
  let victimId: string;

  beforeAll(async () => {
    const hash = await argon2.hash("test1234", { type: argon2.argon2id });
    const u = await prisma.user.create({
      data: {
        name: "Vítima Reset",
        email: "reset-victim@test.local",
        passwordHash: hash,
        memberships: { create: { householdId: seed.householdId, role: "MEMBER", displayName: "Vítima" } },
      },
    });
    victimId = u.id;
  });

  it("forgot-password com e-mail desconhecido → 200 e nenhum token", async () => {
    const res = await http.post("/api/auth/forgot-password").send({ email: "ninguem@nada.local" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const count = await prisma.passwordResetToken.count();
    expect(count).toBe(0);
  });

  it("forgot-password com e-mail real → 200 e cria 1 token pendente", async () => {
    const res = await http.post("/api/auth/forgot-password").send({ email: "reset-victim@test.local" });
    expect(res.status).toBe(200);
    const rows = await prisma.passwordResetToken.findMany({ where: { userId: victimId } });
    expect(rows.length).toBe(1);
    expect(rows[0]!.usedAt).toBeNull();
  });

  it("um novo forgot-password invalida o token anterior", async () => {
    await http.post("/api/auth/forgot-password").send({ email: "reset-victim@test.local" }).expect(200);
    const rows = await prisma.passwordResetToken.findMany({ where: { userId: victimId } });
    expect(rows.length).toBe(2);
    expect(rows.filter((r) => r.usedAt === null).length).toBe(1);
  });

  it("reset-password com token inválido → 422", async () => {
    const res = await http
      .post("/api/auth/reset-password")
      .send({ token: "nao-existe-esse-token", password: "NovaSenh4!" });
    expect(res.status).toBe(422);
  });

  it("reset-password com senha fraca → 400", async () => {
    const raw = "raw-token-fraca-000000000000";
    await prisma.passwordResetToken.create({
      data: { userId: victimId, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 600_000) },
    });
    const res = await http.post("/api/auth/reset-password").send({ token: raw, password: "fraca" });
    expect(res.status).toBe(400);
  });

  it("reset-password válido troca a senha, consome o token e derruba sessões", async () => {
    // sessão ativa da vítima (deve ser revogada ao final)
    const before = await http
      .post("/api/auth/login")
      .send({ email: "reset-victim@test.local", password: "test1234" });
    expect(before.status).toBe(200);
    const activeSessions = await prisma.session.count({ where: { userId: victimId, revokedAt: null } });
    expect(activeSessions).toBeGreaterThanOrEqual(1);

    const raw = "raw-token-ok-11111111111111111";
    await prisma.passwordResetToken.create({
      data: { userId: victimId, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 600_000) },
    });

    const res = await http
      .post("/api/auth/reset-password")
      .send({ token: raw, password: "NovaSenh4!" });
    expect(res.status).toBe(200);

    // senha antiga não entra mais, a nova entra
    await http
      .post("/api/auth/login")
      .send({ email: "reset-victim@test.local", password: "test1234" })
      .expect(401);
    await http
      .post("/api/auth/login")
      .send({ email: "reset-victim@test.local", password: "NovaSenh4!" })
      .expect(200);

    // token consumido + sessões antigas revogadas
    const used = await prisma.passwordResetToken.findFirst({ where: { tokenHash: sha256(raw) } });
    expect(used!.usedAt).not.toBeNull();
    const stillActive = await prisma.session.count({
      where: { userId: victimId, revokedAt: null, createdAt: { lt: used!.usedAt! } },
    });
    expect(stillActive).toBe(0);

    // token não pode ser reusado
    await http
      .post("/api/auth/reset-password")
      .send({ token: raw, password: "OutraSenh4!" })
      .expect(422);
  });
});

describe("config global de e-mail (SMTP)", () => {
  // o owner do seed é super-admin (isSuperAdmin: true)
  it("GET /admin/email-settings começa sem SMTP", async () => {
    const res = await http.get("/api/admin/email-settings").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
    expect(res.body.smtpUser).toBe("");
    expect(res.body).not.toHaveProperty("smtpPass");
  });

  it("PUT salva no AppSetting com a senha cifrada e não devolve a senha", async () => {
    const put = await http
      .put("/api/admin/email-settings")
      .set(auth())
      .send({
        smtpHost: "127.0.0.1",
        smtpPort: 2525,
        smtpUser: "bot@rtfinance.local",
        smtpPass: "app-password-secreta",
        fromName: "RT Finance",
      });
    expect(put.status).toBe(200);
    expect(put.body.configured).toBe(true);
    expect(put.body).not.toHaveProperty("smtpPass");

    const row = await prisma.appSetting.findUnique({ where: { key: "email" } });
    const stored = row!.value as { smtpPassEnc: string };
    expect(stored.smtpPassEnc).toMatch(/^v1:/);
    expect(stored.smtpPassEnc).not.toContain("app-password-secreta");
  });

  it("PUT sem smtpPass mantém a senha salva", async () => {
    const put = await http
      .put("/api/admin/email-settings")
      .set(auth())
      .send({
        smtpHost: "127.0.0.1",
        smtpPort: 2525,
        smtpUser: "bot@rtfinance.local",
        fromName: "Casa RT",
      });
    expect(put.status).toBe(200);
    expect(put.body.configured).toBe(true);
    expect(put.body.fromName).toBe("Casa RT");
  });

  it("não super-admin recebe 403 em /admin/email-settings", async () => {
    const login = await http
      .post("/api/auth/login")
      .send({ email: "partner@test.local", password: "test1234" });
    const partnerToken = login.body.tokens.accessToken;
    const res = await http
      .put("/api/admin/email-settings")
      .set({ Authorization: `Bearer ${partnerToken}` })
      .send({ smtpHost: "smtp.x", smtpPort: 587, smtpUser: "x@x.com", fromName: "x" });
    expect(res.status).toBe(403);
  });

  it("teste de e-mail com SMTP inalcançável responde ok:false (sem 500)", async () => {
    const res = await http.post("/api/admin/email-settings/test").set(auth());
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(false);
    expect(typeof res.body.error).toBe("string");
  });

  it("preferência do household: GET/PUT do resumo semanal", async () => {
    const before = await http.get("/api/household/email-settings").set(auth());
    expect(before.status).toBe(200);
    expect(before.body.weeklyEnabled).toBe(false);
    expect(before.body.emailReady).toBe(true); // já salvamos SMTP acima

    const put = await http
      .put("/api/household/email-settings")
      .set(auth())
      .send({ weeklyEnabled: true });
    expect(put.status).toBe(200);
    expect(put.body.weeklyEnabled).toBe(true);
  });
});

describe("webhook do WhatsApp", () => {
  const payload = (id: string, jid: string, textMsg: string) => ({
    event: "messages.upsert",
    instance: "rtfinance",
    data: {
      key: { remoteJid: jid, fromMe: false, id },
      message: { conversation: textMsg },
      messageTimestamp: 1_780_000_000,
      pushName: "Owner",
    },
  });
  const OWNER_JID = "5511900000001@s.whatsapp.net";

  it("mensagem de membro conhecido → 2xx, grava INBOUND + OUTBOUND", async () => {
    const res = await http.post("/api/whatsapp/webhook").send(payload("WA_1", OWNER_JID, "ping"));
    expect(res.status).toBeLessThan(300);
    expect(res.body).toEqual({ ok: true });
    const inbound = await prisma.whatsappMessage.findUnique({ where: { providerMessageId: "WA_1" } });
    expect(inbound?.direction).toBe("INBOUND");
    const outbound = await prisma.whatsappMessage.findFirst({
      where: { direction: "OUTBOUND", toPhone: { contains: "900000001" }, text: "pong ✅" },
    });
    expect(outbound).toBeTruthy();
  });

  it("reentrega do mesmo providerMessageId não duplica", async () => {
    await http.post("/api/whatsapp/webhook").send(payload("WA_1", OWNER_JID, "ping"));
    const count = await prisma.whatsappMessage.count({ where: { providerMessageId: "WA_1" } });
    expect(count).toBe(1);
  });

  it("número desconhecido → 2xx + resposta 'não autorizado'", async () => {
    const res = await http
      .post("/api/whatsapp/webhook")
      .send(payload("WA_2", "5599111112222@s.whatsapp.net", "oi"));
    expect(res.status).toBeLessThan(300);
    const outbound = await prisma.whatsappMessage.findFirst({
      where: { direction: "OUTBOUND", toPhone: { contains: "111112222" } },
    });
    expect(outbound?.text).toContain("não está autorizado");
  });

  it("'comprei ... em 12x no nubank' + '1' cria a compra parcelada", async () => {
    await http
      .post("/api/credit-cards")
      .set(auth())
      .send({ name: "Nubank", limitCents: 500_000, closingDay: 10, dueDay: 17 });

    const r1 = await http
      .post("/api/whatsapp/webhook")
      .send(payload("WA_INST_1", OWNER_JID, "comprei tv de 2400 em 12x no nubank"));
    expect(r1.status).toBeLessThan(300);

    const r2 = await http.post("/api/whatsapp/webhook").send(payload("WA_INST_2", OWNER_JID, "1"));
    expect(r2.status).toBeLessThan(300);

    const plan = await prisma.installmentPlan.findFirst({
      where: { creditCard: { name: "Nubank" } },
      include: { installments: true },
    });
    expect(plan).toBeTruthy();
    expect(plan!.installmentCount).toBe(12);
    expect(plan!.installments).toHaveLength(12);

    const confirm = await prisma.whatsappMessage.findFirst({
      where: { direction: "OUTBOUND", toPhone: { contains: "900000001" } },
      orderBy: { createdAt: "desc" },
    });
    expect(confirm?.text ?? "").toMatch(/parcel/i);
  });
});

describe("preferências do usuário", () => {
  it("GET começa com os defaults; PUT faz merge raso e persiste", async () => {
    const g0 = await http.get("/api/me/preferences").set(auth());
    expect(g0.status).toBe(200);
    expect(g0.body.theme.accent).toBe("blue");
    expect(g0.body.quickAddTemplates).toEqual([]);

    const p1 = await http
      .put("/api/me/preferences")
      .set(auth())
      .send({ theme: { accent: "violet" }, quickAddTemplates: [{ label: "Uber", text: "gastei 20 uber" }] });
    expect(p1.status).toBe(200);
    expect(p1.body.theme.accent).toBe("violet");
    expect(p1.body.theme.mode).toBe("dark"); // merge não zerou o resto
    expect(p1.body.quickAddTemplates).toHaveLength(1);

    const p2 = await http.put("/api/me/preferences").set(auth()).send({ defaultPeriod: "THIS_YEAR" });
    expect(p2.body.theme.accent).toBe("violet"); // preservado
    expect(p2.body.defaultPeriod).toBe("THIS_YEAR");

    const g1 = await http.get("/api/me/preferences").set(auth());
    expect(g1.body.theme.accent).toBe("violet");
    expect(g1.body.defaultPeriod).toBe("THIS_YEAR");
  });

  it("rejeita acento inválido (400)", async () => {
    const res = await http.put("/api/me/preferences").set(auth()).send({ theme: { accent: "turquesa" } });
    expect(res.status).toBe(400);
  });
});

describe("web push", () => {
  const endpoint = "https://push.example.com/sub/abc123";

  it("GET /push/vapid-key devolve chave (vazia se não configurado)", async () => {
    const res = await http.get("/api/push/vapid-key").set(auth());
    expect(res.status).toBe(200);
    expect(typeof res.body.publicKey).toBe("string");
  });

  it("subscribe grava a inscrição do usuário e é idempotente por endpoint", async () => {
    const body = { endpoint, keys: { p256dh: "p256dh-key", auth: "auth-key" }, userAgent: "vitest" };
    const r1 = await http.post("/api/push/subscribe").set(auth()).send(body);
    expect(r1.status).toBeLessThan(300);
    const r2 = await http.post("/api/push/subscribe").set(auth()).send(body);
    expect(r2.status).toBeLessThan(300);
    const count = await prisma.pushSubscription.count({ where: { endpoint } });
    expect(count).toBe(1);
  });

  it("disparar notificação com inscrições presentes não quebra", async () => {
    const svc = app.get(NotificationsService);
    await expect(
      svc.push({
        householdId: seed.householdId,
        type: "WEEKLY_SUMMARY",
        title: "teste push",
        body: "corpo",
      }),
    ).resolves.toBeUndefined();
  });

  it("unsubscribe remove a inscrição", async () => {
    const res = await http.post("/api/push/unsubscribe").set(auth()).send({ endpoint });
    expect(res.status).toBeLessThan(300);
    const count = await prisma.pushSubscription.count({ where: { endpoint } });
    expect(count).toBe(0);
  });
});

describe("comentários em transação", () => {
  let txId: string;
  let commentId: string;
  let partnerToken: string;
  let partnerUserId: string;

  beforeAll(async () => {
    const tx = await http
      .post("/api/transactions")
      .set(auth())
      .send({ type: "EXPENSE", amountCents: 34000, description: "Compra misteriosa", date: "2026-09-10", accountId: seed.accountId });
    txId = tx.body.id;
    const login = await http.post("/api/auth/login").send({ email: "partner@test.local", password: "test1234" });
    partnerToken = login.body.tokens.accessToken;
    partnerUserId = (await prisma.householdMember.findUnique({ where: { id: seed.partnerMemberId }, select: { userId: true } }))!.userId;
  });

  it("owner comenta → 201 com autor", async () => {
    const res = await http.post(`/api/transactions/${txId}/comments`).set(auth()).send({ body: "que gasto é esse de 340?" });
    expect(res.status).toBe(201);
    expect(res.body.author.displayName).toBe("Owner");
    commentId = res.body.id;
  });

  it("GET lista o comentário", async () => {
    const res = await http.get(`/api/transactions/${txId}/comments`).set(auth());
    expect(res.body).toHaveLength(1);
    expect(res.body[0].body).toContain("que gasto");
  });

  it("cria notificação TRANSACTION_COMMENT direcionada ao outro membro", async () => {
    const n = await prisma.notification.findFirst({ where: { type: "TRANSACTION_COMMENT" } });
    expect(n).toBeTruthy();
    expect(n!.userId).toBe(partnerUserId);
  });

  it("o autor NÃO vê a notificação; o outro membro vê", async () => {
    const asOwner = await http.get("/api/notifications?status=ALL&limit=50").set(auth());
    expect(asOwner.body.some((n: { type: string }) => n.type === "TRANSACTION_COMMENT")).toBe(false);
    const asPartner = await http.get("/api/notifications?status=ALL&limit=50").set({ Authorization: `Bearer ${partnerToken}` });
    expect(asPartner.body.some((n: { type: string }) => n.type === "TRANSACTION_COMMENT")).toBe(true);
  });

  it("GET /transactions traz _count.comments", async () => {
    const res = await http.get(`/api/transactions?search=misteriosa`).set(auth());
    const row = res.body.data.find((t: { id: string }) => t.id === txId);
    expect(row._count.comments).toBe(1);
  });

  it("não-autor não edita nem apaga (403)", async () => {
    const edit = await http.patch(`/api/transactions/comments/${commentId}`).set({ Authorization: `Bearer ${partnerToken}` }).send({ body: "hackeado" });
    expect(edit.status).toBe(403);
    const del = await http.delete(`/api/transactions/comments/${commentId}`).set({ Authorization: `Bearer ${partnerToken}` });
    expect(del.status).toBe(403);
  });

  it("autor apaga o próprio comentário", async () => {
    await http.delete(`/api/transactions/comments/${commentId}`).set(auth()).expect(200);
    const res = await http.get(`/api/transactions/${txId}/comments`).set(auth());
    expect(res.body).toHaveLength(0);
  });
});

describe("feed de atividade", () => {
  let txId: string;

  beforeAll(async () => {
    const tx = await http
      .post("/api/transactions")
      .set(auth())
      .send({ type: "EXPENSE", amountCents: 5000, description: "Padaria da esquina", date: "2026-09-11", accountId: seed.accountId });
    txId = tx.body.id;
    await http.post(`/api/transactions/${txId}/comments`).set(auth()).send({ body: "isso aqui foi você?" });
  });

  it("GET /activity funde comentário + notificação, ordenado por tempo", async () => {
    const res = await http.get("/api/activity?limit=25").set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body).toHaveProperty("nextCursor");

    const comment = res.body.items.find((i: { kind: string }) => i.kind === "comment");
    expect(comment).toBeTruthy();
    expect(comment.link).toBe(`/transacoes?comments=${txId}`);
    expect(comment.actor.displayName).toBe("Owner");

    const times = res.body.items.map((i: { at: string }) => i.at);
    const sorted = [...times].sort((a, b) => (a < b ? 1 : -1));
    expect(times).toEqual(sorted);
  });

  it("pagina com cursor", async () => {
    const first = await http.get("/api/activity?limit=1").set(auth());
    expect(first.body.items).toHaveLength(1);
    if (first.body.nextCursor) {
      const second = await http
        .get(`/api/activity?limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`)
        .set(auth());
      expect(second.status).toBe(200);
      expect(second.body.items[0]?.id).not.toBe(first.body.items[0]?.id);
    }
  });
});

describe("compartilhar card visual", () => {
  let txId: string;
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  beforeAll(async () => {
    // estabiliza os telefones (testes anteriores mexem na allowlist)
    await prisma.user.update({ where: { email: "owner@test.local" }, data: { phoneE164: "+5511900000001" } });
    await prisma.user.update({ where: { email: "partner@test.local" }, data: { phoneE164: null } });
    const tx = await http
      .post("/api/transactions")
      .set(auth())
      .send({ type: "EXPENSE", amountCents: 12900, description: "Jantar romântico", date: "2026-09-12", accountId: seed.accountId });
    txId = tx.body.id;
  });

  it("GET /share/transaction/:id → PNG", async () => {
    const res = await http.get(`/api/share/transaction/${txId}`).set(auth()).buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(Buffer.from(res.body).subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("GET /share/month → PNG", async () => {
    const res = await http
      .get("/api/share/month?from=2026-09-01&to=2026-09-30")
      .set(auth())
      .buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(Buffer.from(res.body).subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("GET /share/targets lista membros com flag de telefone", async () => {
    const res = await http.get("/api/share/targets").set(auth());
    expect(res.status).toBe(200);
    const owner = res.body.find((t: { displayName: string }) => t.displayName === "Owner");
    const partner = res.body.find((t: { displayName: string }) => t.displayName === "Partner");
    expect(owner.hasPhone).toBe(true);
    expect(partner.hasPhone).toBe(false);
  });

  it("POST /share/month/whatsapp → ok + WhatsappMessage OUTBOUND IMAGE", async () => {
    const res = await http
      .post("/api/share/month/whatsapp")
      .set(auth())
      .send({ toMemberId: seed.ownerMemberId, from: "2026-09-01", to: "2026-09-30" });
    expect(res.status).toBeLessThan(300);
    expect(res.body.ok).toBe(true);
    const msg = await prisma.whatsappMessage.findFirst({
      where: { direction: "OUTBOUND", type: "IMAGE" },
      orderBy: { createdAt: "desc" },
    });
    expect(msg).toBeTruthy();
  });

  it("POST whatsapp para membro sem telefone → 422", async () => {
    const res = await http
      .post(`/api/share/transaction/${txId}/whatsapp`)
      .set(auth())
      .send({ toMemberId: seed.partnerMemberId });
    expect(res.status).toBe(422);
  });
});
