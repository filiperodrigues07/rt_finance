import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  createCreditCardBody,
  updateCreditCardBody,
  idParam,
  type CreateCreditCardBody,
  type UpdateCreditCardBody,
} from "@rt-finance/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentHousehold } from "../../common/decorators/current-user.decorator";
import { CreditCardsService } from "./credit-cards.service";
import { InvoicesService } from "../invoices/invoices.service";

@Controller("credit-cards")
export class CreditCardsController {
  constructor(
    private readonly cards: CreditCardsService,
    private readonly invoices: InvoicesService,
  ) {}

  @Get()
  list(@CurrentHousehold() householdId: string) {
    return this.cards.list(householdId);
  }

  @Get(":id")
  get(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.cards.get(householdId, params.id);
  }

  @Get(":id/invoices")
  invoicesForCard(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.invoices.listForCard(householdId, params.id);
  }

  @Post()
  create(
    @CurrentHousehold() householdId: string,
    @Body(new ZodValidationPipe(createCreditCardBody)) body: CreateCreditCardBody,
  ) {
    return this.cards.create(householdId, body);
  }

  @Patch(":id")
  update(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Body(new ZodValidationPipe(updateCreditCardBody)) body: UpdateCreditCardBody,
  ) {
    return this.cards.update(householdId, params.id, body);
  }

  @Delete(":id")
  remove(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.cards.remove(householdId, params.id);
  }
}
