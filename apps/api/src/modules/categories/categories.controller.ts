import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  createCategoryBody,
  updateCategoryBody,
  listCategoriesQuery,
  idParam,
  type CreateCategoryBody,
  type UpdateCategoryBody,
} from "@rt-finance/shared";
import type { CategoryKind } from "@prisma/client";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentHousehold } from "../../common/decorators/current-user.decorator";
import { CategoriesService } from "./categories.service";

@Controller("categories")
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(
    @CurrentHousehold() householdId: string,
    @Query(new ZodValidationPipe(listCategoriesQuery))
    query: { kind?: CategoryKind; includeArchived: boolean },
  ) {
    return this.categories.list(householdId, query);
  }

  @Get(":id")
  get(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.categories.get(householdId, params.id);
  }

  @Post()
  create(
    @CurrentHousehold() householdId: string,
    @Body(new ZodValidationPipe(createCategoryBody)) body: CreateCategoryBody,
  ) {
    return this.categories.create(householdId, body);
  }

  @Patch(":id")
  update(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Body(new ZodValidationPipe(updateCategoryBody)) body: UpdateCategoryBody,
  ) {
    return this.categories.update(householdId, params.id, body);
  }

  @Delete(":id")
  remove(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.categories.remove(householdId, params.id);
  }
}
