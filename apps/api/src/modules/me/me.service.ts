import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  userPreferences,
  type UpdateUserPreferences,
  type UserPreferences,
} from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";

const key = (memberId: string) => `member:${memberId}:prefs`;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
/** Merge raso-recursivo: objeto entra por chave; array/escalar substitui. */
function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObj(base) || !isObj(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async getPreferences(householdId: string, memberId: string): Promise<UserPreferences> {
    const row = await this.prisma.setting.findUnique({
      where: { householdId_key: { householdId, key: key(memberId) } },
    });
    return userPreferences.parse(row?.value ?? {});
  }

  async updatePreferences(
    householdId: string,
    memberId: string,
    patch: UpdateUserPreferences,
  ): Promise<UserPreferences> {
    const current = await this.getPreferences(householdId, memberId);
    const merged = userPreferences.parse(deepMerge(current, patch));
    await this.prisma.setting.upsert({
      where: { householdId_key: { householdId, key: key(memberId) } },
      update: { value: merged as unknown as Prisma.InputJsonObject },
      create: { householdId, key: key(memberId), value: merged as unknown as Prisma.InputJsonObject },
    });
    return merged;
  }
}
