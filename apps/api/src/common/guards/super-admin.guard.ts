import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { AuthUser } from "@rt-finance/shared";

/** Libera só o super-admin global. Usar depois do JwtAuthGuard (que popula req.user). */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<FastifyRequest & { user?: AuthUser }>();
    if (!req.user?.isSuperAdmin) {
      throw new ForbiddenException("Acesso restrito ao administrador");
    }
    return true;
  }
}
