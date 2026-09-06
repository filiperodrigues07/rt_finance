import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  createAccountBody,
  updateAccountBody,
  idParam,
  type CreateAccountBody,
  type UpdateAccountBody,
} from "@rt-finance/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentHousehold } from "../../common/decorators/current-user.decorator";
import { AccountsService } from "./accounts.service";

@Controller("accounts")
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(@CurrentHousehold() householdId: string, @Query("includeArchived") includeArchived?: string) {
    return this.accounts.list(householdId, includeArchived === "true");
  }

  @Get(":id")
  get(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.accounts.get(householdId, params.id);
  }

  @Post()
  create(
    @CurrentHousehold() householdId: string,
    @Body(new ZodValidationPipe(createAccountBody)) body: CreateAccountBody,
  ) {
    return this.accounts.create(householdId, body);
  }

  @Patch(":id")
  update(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Body(new ZodValidationPipe(updateAccountBody)) body: UpdateAccountBody,
  ) {
    return this.accounts.update(householdId, params.id, body);
  }

  @Delete(":id")
  remove(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.accounts.remove(householdId, params.id);
  }
}
