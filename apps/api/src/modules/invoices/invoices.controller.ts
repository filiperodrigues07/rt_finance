import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  adjustInvoiceBody,
  idParam,
  payInvoiceBody,
  updateInvoiceBody,
  type AdjustInvoiceBody,
  type AuthUser,
  type PayInvoiceBody,
  type UpdateInvoiceBody,
} from "@rt-finance/shared";
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

  @Delete("adjustments/:txId")
  removeAdjustment(
    @CurrentHousehold() householdId: string,
    @Param("txId") txId: string,
  ) {
    return this.invoices.unadjust(householdId, txId);
  }

  @Get(":id")
  get(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.invoices.get(householdId, params.id);
  }

  @Get(":id/detail")
  detail(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.invoices.detail(householdId, params.id);
  }

  @Patch(":id")
  patch(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Body(new ZodValidationPipe(updateInvoiceBody)) body: UpdateInvoiceBody,
  ) {
    return this.invoices.patch(householdId, params.id, body);
  }

  @Post(":id/adjust")
  adjust(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Body(new ZodValidationPipe(adjustInvoiceBody)) body: AdjustInvoiceBody,
  ) {
    return this.invoices.adjust(user.householdId, params.id, user.memberId, body);
  }

  @Post(":id/reconcile")
  reconcile(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.invoices.markReconciled(householdId, params.id);
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
