import { Injectable } from "@nestjs/common";
import type { CreateCategoryBody, UpdateCategoryBody } from "@rt-finance/shared";
import type { Category, CategoryKind } from "@prisma/client";
import { PrismaService } from "../../lib/prisma.service";
import { DomainError, NotFoundError } from "../../common/errors/domain-error";

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    householdId: string,
    opts: { kind?: CategoryKind; includeArchived?: boolean },
  ): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: {
        householdId,
        kind: opts.kind,
        archivedAt: opts.includeArchived ? undefined : null,
      },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    });
  }

  async get(householdId: string, id: string): Promise<Category> {
    const category = await this.prisma.category.findFirst({ where: { id, householdId } });
    if (!category) throw new NotFoundError("Categoria");
    return category;
  }

  async create(householdId: string, body: CreateCategoryBody): Promise<Category> {
    if (body.parentId) await this.get(householdId, body.parentId);
    return this.prisma.category.create({
      data: {
        householdId,
        name: body.name,
        icon: body.icon,
        color: body.color,
        kind: body.kind,
        parentId: body.parentId ?? null,
      },
    });
  }

  async update(householdId: string, id: string, body: UpdateCategoryBody): Promise<Category> {
    const current = await this.get(householdId, id);
    if (body.parentId && body.parentId === id) {
      throw new DomainError("Uma categoria não pode ser pai de si mesma");
    }
    if (body.parentId) await this.get(householdId, body.parentId);
    return this.prisma.category.update({
      where: { id: current.id },
      data: {
        name: body.name,
        icon: body.icon,
        color: body.color,
        kind: body.kind,
        parentId: body.parentId ?? undefined,
      },
    });
  }

  /** Categoria de sistema não é excluída: se tiver uso, arquiva; senão, remove. */
  async remove(householdId: string, id: string): Promise<{ archived: boolean }> {
    const category = await this.get(householdId, id);
    const inUse = await this.prisma.transaction.count({ where: { categoryId: id } });

    if (category.isSystem || inUse > 0) {
      await this.prisma.category.update({
        where: { id: category.id },
        data: { archivedAt: new Date() },
      });
      return { archived: true };
    }
    await this.prisma.category.delete({ where: { id: category.id } });
    return { archived: false };
  }

  /** Resolve um nome livre (vindo da IA) para uma categoria do household. Match exato, case-insensitive. */
  async resolveByName(householdId: string, name: string): Promise<Category | null> {
    return this.prisma.category.findFirst({
      where: { householdId, archivedAt: null, name: { equals: name, mode: "insensitive" } },
    });
  }
}
