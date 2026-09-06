import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import {
  upsertBudgetBody,
  listBudgetsQuery,
  idParam,
  type UpsertBudgetBody,
} from "@rt-finance/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentHousehold } from "../../common/decorators/current-user.decorator";
import { BudgetsService } from "./budgets.service";

@Controller("budgets")
export class BudgetsController {
  constructor(private readonly service: BudgetsService) {}

  @Get()
  list(
    @CurrentHousehold() householdId: string,
    @Query(new ZodValidationPipe(listBudgetsQuery)) query: { month?: string },
  ) {
    return this.service.list(householdId, query.month);
  }

  @Post()
  upsert(
    @CurrentHousehold() householdId: string,
    @Body(new ZodValidationPipe(upsertBudgetBody)) body: UpsertBudgetBody,
  ) {
    return this.service.upsert(householdId, body);
  }

  @Post("check")
  check(@CurrentHousehold() householdId: string) {
    return this.service.checkAndNotify(householdId);
  }

  @Delete(":id")
  remove(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.service.remove(householdId, params.id);
  }
}
