import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  createRecurringBody,
  updateRecurringBody,
  idParam,
  type CreateRecurringBody,
  type UpdateRecurringBody,
  type AuthUser,
} from "@rt-finance/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentHousehold, CurrentUser } from "../../common/decorators/current-user.decorator";
import { RecurringExpensesService } from "./recurring-expenses.service";

@Controller("recurring-expenses")
export class RecurringExpensesController {
  constructor(private readonly service: RecurringExpensesService) {}

  @Get()
  list(@CurrentHousehold() householdId: string) {
    return this.service.list(householdId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createRecurringBody)) body: CreateRecurringBody,
  ) {
    return this.service.create(user.householdId, user.memberId, body);
  }

  @Patch(":id")
  update(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Body(new ZodValidationPipe(updateRecurringBody)) body: UpdateRecurringBody,
  ) {
    return this.service.update(householdId, params.id, body);
  }

  @Delete(":id")
  remove(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.service.remove(householdId, params.id);
  }

  @Post("generate")
  generate(@CurrentHousehold() householdId: string) {
    return this.service.generateDue(householdId);
  }
}
