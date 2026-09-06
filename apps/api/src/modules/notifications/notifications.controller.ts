import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  listNotificationsQuery,
  updateNotificationPrefsBody,
  idParam,
  type UpdateNotificationPrefsBody,
} from "@rt-finance/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentHousehold } from "../../common/decorators/current-user.decorator";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(
    @CurrentHousehold() householdId: string,
    @Query(new ZodValidationPipe(listNotificationsQuery))
    query: { status: string; limit: number },
  ) {
    return this.service.list(householdId, query);
  }

  @Get("unread-count")
  unread(@CurrentHousehold() householdId: string) {
    return this.service.unreadCount(householdId);
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
  readAll(@CurrentHousehold() householdId: string) {
    return this.service.markAllRead(householdId);
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
