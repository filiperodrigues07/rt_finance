import { Body, Controller, Get, Post } from "@nestjs/common";
import {
  pushSubscribeBody,
  pushUnsubscribeBody,
  type AuthUser,
  type PushSubscribeBody,
  type PushUnsubscribeBody,
} from "@rt-finance/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { PushService } from "./push.service";

@Controller("push")
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get("vapid-key")
  vapidKey() {
    return { publicKey: this.push.vapidPublicKey() };
  }

  @Post("subscribe")
  subscribe(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(pushSubscribeBody)) body: PushSubscribeBody,
  ) {
    return this.push.subscribe(user.householdId, user.id, body);
  }

  @Post("unsubscribe")
  unsubscribe(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(pushUnsubscribeBody)) body: PushUnsubscribeBody,
  ) {
    return this.push.unsubscribe(user.id, body.endpoint);
  }
}
