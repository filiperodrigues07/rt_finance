import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { idParam, payInvoiceBody, type AuthUser, type PayInvoiceBody } from "@rt-finance/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentHousehold, CurrentUser } from "../../common/decorators/current-user.decorator";
import { InvoicesService } from "./invoices.service";

@Controller("invoices")
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get("payable")
  payable(@CurrentHousehold() householdId: string) {
    return this.invoices.listPayable(householdId);
  }

  @Get(":id")
  get(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.invoices.get(householdId, params.id);
  }

  @Post(":id/pay")
  pay(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Body(new ZodValidationPipe(payInvoiceBody)) body: PayInvoiceBody,
  ) {
    return this.invoices.pay(user.householdId, params.id, user.memberId, body);
  }
}
