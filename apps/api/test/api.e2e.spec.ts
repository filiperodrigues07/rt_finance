import { createHash } from "node:crypto";
import * as argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createTestApp, prisma, resetDb, seedMinimal, type SeedResult } from "./helpers";

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

describe("recorrências + orçamentos", () => {
  it("gera lançamentos de recorrência (idempotente)", async () => {
    const created = await http
      .post("/api/recurring-expenses")
      .set(auth())
      .send({
        name: "Internet",
        amountCents: 12000,
        categoryId: (await prisma.category.findFirst({ where: { name: "Contas" } }))!.id,
        frequency: "MONTHLY",
        dayOfMonth: 10,
        accountId: seed.accountId,
        startDate: "2026-08-01",
      });
    expect(created.status).toBe(201);

    const g1 = await http.post("/api/recurring-expenses/generate").set(auth());
    expect(g1.body.created).toBeGreaterThan(0);
    const g2 = await http.post("/api/recurring-expenses/generate").set(auth());
    expect(g2.body.created).toBe(0); // idempotente
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

  it("cria agendado (PENDING + dueDate) que não entra no saldo", async () => {
    const before = await http.get("/api/accounts").set(auth());
    const bal0 = before.body.find((a: { id: string }) => a.id === seed.accountId).balanceCents;

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
    expect(res.body.type).toBe("EXPENSE");
    expect(res.body.amountCents).toBe(4000);
    expect(res.body.category?.name).toBe("Mercado");
  });

  it("lançamento rápido sem sentido → 422", async () => {
    const res = await http
      .post("/api/transactions/quick")
      .set(auth())
      .send({ text: "qual o sentido da vida" });
    expect(res.status).toBe(422);
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
  });

  it("exporta CSV", async () => {
    const res = await http.get("/api/reports/transactions.csv").set(auth());
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("Data;Tipo;Descrição");
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

  it("rejeita formato inválido (400)", async () => {
    const members = await http.get("/api/household/members").set(auth());
    const owner = members.body.find((m: { role: string }) => m.role === "OWNER");
    const res = await http
      .patch(`/api/household/members/${owner.id}`)
      .set(auth())
      .send({ phoneE164: "49 99648-4444" });
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
