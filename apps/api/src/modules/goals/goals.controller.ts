import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  createGoalBody,
  updateGoalBody,
  addContributionBody,
  idParam,
  type CreateGoalBody,
  type UpdateGoalBody,
  type AddContributionBody,
  type AuthUser,
} from "@rt-finance/shared";
import { z } from "zod";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentHousehold, CurrentUser } from "../../common/decorators/current-user.decorator";
import { GoalsService } from "./goals.service";

const goalContribParam = z.object({ id: z.string().min(1), cid: z.string().min(1) });

@Controller("goals")
export class GoalsController {
  constructor(private readonly service: GoalsService) {}

  @Get()
  list(@CurrentHousehold() householdId: string) {
    return this.service.list(householdId);
  }

  @Get(":id")
  get(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.service.get(householdId, params.id);
  }

  @Post()
  create(
    @CurrentHousehold() householdId: string,
    @Body(new ZodValidationPipe(createGoalBody)) body: CreateGoalBody,
  ) {
    return this.service.create(householdId, body);
  }

  @Patch(":id")
  update(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Body(new ZodValidationPipe(updateGoalBody)) body: UpdateGoalBody,
  ) {
    return this.service.update(householdId, params.id, body);
  }

  @Delete(":id")
  remove(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.service.remove(householdId, params.id);
  }

  @Post(":id/contributions")
  addContribution(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Body(new ZodValidationPipe(addContributionBody)) body: AddContributionBody,
  ) {
    return this.service.addContribution(user.householdId, params.id, user.memberId, body);
  }

  @Delete(":id/contributions/:cid")
  removeContribution(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(goalContribParam)) params: { id: string; cid: string },
  ) {
    return this.service.removeContribution(householdId, params.id, params.cid);
  }
}
