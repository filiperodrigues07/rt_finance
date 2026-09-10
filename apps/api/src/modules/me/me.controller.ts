import { Body, Controller, Get, Put } from "@nestjs/common";
import {
  updateUserPreferences,
  type AuthUser,
  type UpdateUserPreferences,
} from "@rt-finance/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { MeService } from "./me.service";

@Controller("me")
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get("preferences")
  get(@CurrentUser() user: AuthUser) {
    return this.me.getPreferences(user.householdId, user.memberId);
  }

  @Put("preferences")
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateUserPreferences)) body: UpdateUserPreferences,
  ) {
    return this.me.updatePreferences(user.householdId, user.memberId, body);
  }
}
