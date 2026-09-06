import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthUser } from "@rt-finance/shared";

export interface RequestWithUser {
  user?: AuthUser;
}

/** Injeta o usuário autenticado (AuthUser). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    if (!req.user) throw new Error("CurrentUser usado em rota sem autenticação");
    return req.user;
  },
);

/** Injeta apenas o householdId do usuário autenticado (escopo de tenant). */
export const CurrentHousehold = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    if (!req.user) throw new Error("CurrentHousehold usado em rota sem autenticação");
    return req.user.householdId;
  },
);
