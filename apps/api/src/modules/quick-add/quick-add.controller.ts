import { Body, Controller, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { quickAddBody, type QuickAddBody, type AuthUser } from "@rt-finance/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { QuickAddService } from "./quick-add.service";

@Controller("transactions")
export class QuickAddController {
  constructor(private readonly quickAdd: QuickAddService) {}

  @Post("quick")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  run(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(quickAddBody)) body: QuickAddBody,
  ) {
    return this.quickAdd.run(user.householdId, user.memberId, body.text);
  }
}
