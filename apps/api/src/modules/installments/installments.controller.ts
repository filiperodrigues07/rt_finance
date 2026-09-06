import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import {
  createInstallmentPlanBody,
  listInstallmentPlansQuery,
  idParam,
  type CreateInstallmentPlanBody,
  type AuthUser,
} from "@rt-finance/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentHousehold, CurrentUser } from "../../common/decorators/current-user.decorator";
import { InstallmentsService } from "./installments.service";

@Controller("installments")
export class InstallmentsController {
  constructor(private readonly installments: InstallmentsService) {}

  @Get("plans")
  list(
    @CurrentHousehold() householdId: string,
    @Query(new ZodValidationPipe(listInstallmentPlansQuery))
    query: { creditCardId?: string; activeOnly: boolean },
  ) {
    return this.installments.list(householdId, query);
  }

  @Get("plans/:id")
  get(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.installments.get(householdId, params.id);
  }

  @Post("plans")
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createInstallmentPlanBody)) body: CreateInstallmentPlanBody,
  ) {
    return this.installments.create(user.householdId, user.memberId, body);
  }

  @Delete("plans/:id")
  cancel(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.installments.cancel(householdId, params.id);
  }

  @Get("future-commitment")
  futureCommitment(
    @CurrentHousehold() householdId: string,
    @Query("months") months?: string,
  ) {
    const n = Math.min(Math.max(Number(months) || 6, 1), 24);
    return this.installments.futureCommitment(householdId, n);
  }
}
