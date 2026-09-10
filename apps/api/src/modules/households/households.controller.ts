import { Body, Controller, Get, Param, Patch, Post, Put } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  updateHouseholdBody,
  updateMemberBody,
  createMemberBody,
  updateProfileBody,
  changePasswordBody,
  resetDataBody,
  householdEmailPrefsBody,
  householdFeaturesBody,
  type HouseholdFeatures,
  idParam,
  type UpdateHouseholdBody,
  type UpdateMemberBody,
  type CreateMemberBody,
  type UpdateProfileBody,
  type ChangePasswordBody,
  type ResetDataBody,
  type HouseholdEmailPrefsBody,
  type AuthUser,
} from "@rt-finance/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentHousehold, CurrentUser } from "../../common/decorators/current-user.decorator";
import { HouseholdsService } from "./households.service";

@Controller()
export class HouseholdsController {
  constructor(private readonly households: HouseholdsService) {}

  @Get("household")
  getHousehold(@CurrentHousehold() householdId: string) {
    return this.households.getHousehold(householdId);
  }

  @Patch("household")
  updateHousehold(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateHouseholdBody)) body: UpdateHouseholdBody,
  ) {
    return this.households.updateHousehold(user, body);
  }

  @Get("household/members")
  members(@CurrentHousehold() householdId: string) {
    return this.households.listMembers(householdId);
  }

  @Post("household/members")
  createMember(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createMemberBody)) body: CreateMemberBody,
  ) {
    return this.households.createMember(user, body);
  }

  @Patch("household/members/:id")
  updateMember(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Body(new ZodValidationPipe(updateMemberBody)) body: UpdateMemberBody,
  ) {
    return this.households.updateMember(user, params.id, body);
  }

  @Post("household/members/:id/reset-password")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resetMemberPassword(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.households.resetMemberPassword(user, params.id);
  }

  @Get("me/profile")
  getProfile(@CurrentUser() user: AuthUser) {
    return this.households.getProfile(user.id);
  }

  @Patch("me/profile")
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateProfileBody)) body: UpdateProfileBody,
  ) {
    return this.households.updateProfile(user.id, body);
  }

  @Post("me/change-password")
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordBody)) body: ChangePasswordBody,
  ) {
    return this.households.changePassword(user.id, body);
  }

  @Get("household/email-settings")
  getEmailPrefs(@CurrentHousehold() householdId: string) {
    return this.households.getEmailPrefs(householdId);
  }

  @Put("household/email-settings")
  updateEmailPrefs(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(householdEmailPrefsBody)) body: HouseholdEmailPrefsBody,
  ) {
    return this.households.updateEmailPrefs(user, body);
  }

  @Get("household/features")
  getFeatures(@CurrentHousehold() householdId: string) {
    return this.households.getFeatures(householdId);
  }

  @Put("household/features")
  updateFeatures(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(householdFeaturesBody)) body: HouseholdFeatures,
  ) {
    return this.households.updateFeatures(user, body);
  }

  @Post("household/reset-data")
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  resetData(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(resetDataBody)) body: ResetDataBody,
  ) {
    return this.households.resetData(user, body);
  }
}
