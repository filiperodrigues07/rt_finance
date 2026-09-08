import { Controller, Get, Header, Query, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { dashboardQuery, type DashboardQuery } from "@rt-finance/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentHousehold } from "../../common/decorators/current-user.decorator";
import { ReportsService } from "./reports.service";
import { ReportExportService } from "./report-export.service";

function parseIds(raw?: string): string[] | undefined {
  const ids = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 500);
  return ids.length ? ids : undefined;
}

@Controller("reports")
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly exporter: ReportExportService,
  ) {}

  @Get("dashboard")
  dashboard(
    @CurrentHousehold() householdId: string,
    @Query(new ZodValidationPipe(dashboardQuery)) query: DashboardQuery,
  ) {
    return this.reports.dashboard(householdId, query);
  }

  @Get("monthly-evolution")
  monthly(
    @CurrentHousehold() householdId: string,
    @Query("months") months?: string,
  ) {
    const n = Math.min(Math.max(Number(months) || 6, 1), 24);
    return this.reports.monthlyEvolution(householdId, n);
  }

  @Get("cash-flow")
  cashFlow(@CurrentHousehold() householdId: string, @Query("months") months?: string) {
    return this.reports.cashFlow(householdId, Math.min(Math.max(Number(months) || 6, 1), 12));
  }

  @Get("category-trend")
  categoryTrend(@CurrentHousehold() householdId: string, @Query("months") months?: string) {
    return this.reports.categoryTrend(householdId, Math.min(Math.max(Number(months) || 6, 3), 12));
  }

  @Get("by-member")
  byMember(
    @CurrentHousehold() householdId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reports.byMember(householdId, { from, to });
  }

  @Get("pace")
  pace(@CurrentHousehold() householdId: string) {
    return this.reports.pace(householdId);
  }

  @Get("insights")
  insights(@CurrentHousehold() householdId: string) {
    return this.reports.insights(householdId);
  }

  @Get("transactions.csv")
  @Header("content-type", "text/csv; charset=utf-8")
  @Header("content-disposition", 'attachment; filename="rt-finance-transacoes.csv"')
  async csv(
    @CurrentHousehold() householdId: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Res({ passthrough: true }) _res: FastifyReply,
  ): Promise<string> {
    return this.reports.exportTransactionsCsv(householdId, { from, to });
  }

  @Get("export.xlsx")
  async xlsx(
    @CurrentHousehold() householdId: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("ids") ids: string | undefined,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<Buffer> {
    const buf = await this.exporter.xlsx(householdId, { from, to, ids: parseIds(ids) });
    void res.header(
      "content-type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    void res.header("content-disposition", 'attachment; filename="rt-finance-relatorio.xlsx"');
    return buf;
  }

  @Get("export.pdf")
  async pdf(
    @CurrentHousehold() householdId: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("ids") ids: string | undefined,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<Buffer> {
    const buf = await this.exporter.pdf(householdId, { from, to, ids: parseIds(ids) });
    void res.header("content-type", "application/pdf");
    void res.header("content-disposition", 'attachment; filename="rt-finance-relatorio.pdf"');
    return buf;
  }
}
