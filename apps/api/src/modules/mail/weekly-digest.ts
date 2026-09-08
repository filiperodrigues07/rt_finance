import { formatBRL, formatDateBR, type DashboardReport } from "@rt-finance/shared";

/** Monta o e-mail de resumo semanal a partir do dashboard (janela de 7 dias). */
export function renderWeeklyDigest(params: {
  householdName: string;
  report: DashboardReport;
  tz: string;
}): { subject: string; text: string; html: string } {
  const { householdName, report, tz } = params;
  const from = formatDateBR(report.range.from, tz);
  const to = formatDateBR(report.range.to, tz);
  const money = (c: number) => formatBRL(c);
  const positive = report.resultCents >= 0;

  const cats = report.byCategory.filter((c) => c.cents > 0).slice(0, 5);
  const members = report.byMember.filter((m) => m.cents > 0);

  const subject = `Resumo da semana · ${householdName} (${from}–${to})`;

  const text = [
    `Resumo da semana — ${householdName}`,
    `${from} a ${to}`,
    "",
    `Saldo atual: ${money(report.balanceCents)}`,
    `Receitas: ${money(report.incomeCents)}`,
    `Despesas: ${money(report.expenseCents)}`,
    `Resultado: ${positive ? "+" : ""}${money(report.resultCents)}`,
    report.invoicesOpenCents > 0 ? `Faturas em aberto: ${money(report.invoicesOpenCents)}` : "",
    "",
    cats.length ? "Onde foi o dinheiro:" : "",
    ...cats.map((c) => `  ${c.name}: ${money(c.cents)}`),
    "",
    members.length ? "Por pessoa:" : "",
    ...members.map((m) => `  ${m.displayName}: ${money(m.cents)}`),
    "",
    "RT Finance · assistente do casal",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const row = (label: string, value: string, strong = false) => `
    <tr>
      <td style="padding:6px 0;color:#475569;font-size:14px">${label}</td>
      <td style="padding:6px 0;text-align:right;font-size:14px;${strong ? "font-weight:700;color:#0f172a" : "color:#0f172a"}">${value}</td>
    </tr>`;

  const catRows = cats
    .map(
      (c) => `
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#334155">${c.icon ?? "•"} ${c.name}</td>
        <td style="padding:4px 0;text-align:right;font-size:13px;color:#334155">${money(c.cents)}</td>
      </tr>`,
    )
    .join("");

  const memberRows = members
    .map(
      (m) => `
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#334155">
          <span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${m.color};margin-right:6px"></span>${m.displayName}
        </td>
        <td style="padding:4px 0;text-align:right;font-size:13px;color:#334155">${money(m.cents)}</td>
      </tr>`,
    )
    .join("");

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
    <h2 style="margin:0 0 2px;font-size:18px">Resumo da semana</h2>
    <p style="margin:0 0 16px;color:#64748b;font-size:13px">${householdName} · ${from} a ${to}</p>

    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;margin-bottom:16px">
      ${row("Saldo atual", money(report.balanceCents), true)}
      ${row("Receitas", money(report.incomeCents))}
      ${row("Despesas", money(report.expenseCents))}
      ${row("Resultado", `${positive ? "+" : ""}${money(report.resultCents)}`, true)}
      ${report.invoicesOpenCents > 0 ? row("Faturas em aberto", money(report.invoicesOpenCents)) : ""}
    </table>

    ${
      cats.length
        ? `<p style="margin:0 0 4px;font-weight:600;font-size:14px">Onde foi o dinheiro</p>
           <table style="width:100%;border-collapse:collapse;margin-bottom:16px">${catRows}</table>`
        : ""
    }
    ${
      members.length
        ? `<p style="margin:0 0 4px;font-weight:600;font-size:14px">Por pessoa</p>
           <table style="width:100%;border-collapse:collapse;margin-bottom:16px">${memberRows}</table>`
        : ""
    }

    <p style="font-size:12px;color:#94a3b8;margin-top:24px">
      Você recebe este resumo porque ele está ativado em Configurações → E-mail.
      RT Finance · assistente do casal
    </p>
  </div>`;

  return { subject, text, html };
}
