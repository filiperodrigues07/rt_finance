import { Controller, Get, Param } from "@nestjs/common";
import { idParam } from "@rt-finance/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentHousehold } from "../../common/decorators/current-user.decorator";
import { InvoicesService } from "./invoices.service";

@Controller("invoices")
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get(":id")
  get(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.invoices.get(householdId, params.id);
  }
}
