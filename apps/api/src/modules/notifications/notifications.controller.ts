import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  listNotificationsQuery,
  updateNotificationPrefsBody,
  idParam,
  type UpdateNotificationPrefsBody,
  type AuthUser,
} from "@rt-finance/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentHousehold, CurrentUser } from "../../common/decorators/current-user.decorator";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listNotificationsQuery))
    query: { status: string; limit: number },
  ) {
    return this.service.list(user.householdId, query, user.id);
  }

  @Get("unread-count")
  unread(@CurrentUser() user: AuthUser) {
    return this.service.unreadCount(user.householdId, user.id);
  }

  @Get("preferences")
  prefs(@CurrentHousehold() householdId: string) {
    return this.service.getPrefs(householdId);
  }

  @Patch("preferences")
  updatePrefs(
    @CurrentHousehold() householdId: string,
    @Body(new ZodValidationPipe(updateNotificationPrefsBody)) body: UpdateNotificationPrefsBody,
  ) {
    return this.service.updatePrefs(householdId, body);
  }

  @Post("read-all")
  readAll(@CurrentUser() user: AuthUser) {
    return this.service.markAllRead(user.householdId, user.id);
  }

  @Patch(":id/read")
  read(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.service.markRead(householdId, params.id);
  }

  @Patch(":id/dismiss")
  dismiss(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.service.dismiss(householdId, params.id);
  }
}
