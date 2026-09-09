import { Controller, Get, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentHousehold } from "../../common/decorators/current-user.decorator";
import { ReportsAiService } from "./reports-ai.service";

@Controller("reports")
export class ReportsAiController {
  constructor(private readonly svc: ReportsAiService) {}

  @Get("analysis")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  analysis(@CurrentHousehold() householdId: string, @Query("force") force?: string) {
    return this.svc.analysis(householdId, force === "1" || force === "true");
  }
}
