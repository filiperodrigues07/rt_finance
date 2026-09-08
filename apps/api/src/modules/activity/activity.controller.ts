import { Controller, Get, Query } from "@nestjs/common";
import { activityQuery, type ActivityQuery } from "@rt-finance/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentHousehold } from "../../common/decorators/current-user.decorator";
import { ActivityService } from "./activity.service";

@Controller("activity")
export class ActivityController {
  constructor(private readonly service: ActivityService) {}

  @Get()
  list(
    @CurrentHousehold() householdId: string,
    @Query(new ZodValidationPipe(activityQuery)) query: ActivityQuery,
  ) {
    return this.service.list(householdId, query);
  }
}
