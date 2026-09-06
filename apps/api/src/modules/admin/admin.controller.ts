import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  createHouseholdBody,
  updateAdminHouseholdBody,
  deleteHouseholdBody,
  idParam,
  type CreateHouseholdBody,
  type UpdateAdminHouseholdBody,
  type DeleteHouseholdBody,
  type AuthUser,
} from "@rt-finance/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SuperAdminGuard } from "../../common/guards/super-admin.guard";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(SuperAdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("households")
  list(@CurrentUser() user: AuthUser) {
    return this.admin.list(user);
  }

  @Post("households")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@Body(new ZodValidationPipe(createHouseholdBody)) body: CreateHouseholdBody) {
    return this.admin.create(body);
  }

  @Patch("households/:id")
  update(
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Body(new ZodValidationPipe(updateAdminHouseholdBody)) body: UpdateAdminHouseholdBody,
  ) {
    return this.admin.update(params.id, body);
  }

  @Delete("households/:id")
  remove(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Body(new ZodValidationPipe(deleteHouseholdBody)) body: DeleteHouseholdBody,
  ) {
    return this.admin.remove(user, params.id, body.confirmName);
  }
}
