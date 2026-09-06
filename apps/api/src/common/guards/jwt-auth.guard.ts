import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { FastifyRequest } from "fastify";
import type { AuthUser } from "@rt-finance/shared";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

export interface AccessTokenPayload {
  sub: string; // userId
  hid: string; // householdId
  mid: string; // memberId
  role: "OWNER" | "MEMBER";
  sa?: boolean; // super-admin global
  name: string;
  email: string;
  displayName: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<FastifyRequest & { user?: AuthUser }>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Token de acesso ausente");
    }
    const token = header.slice(7);

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException("Token de acesso inválido ou expirado");
    }

    req.user = {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      householdId: payload.hid,
      memberId: payload.mid,
      role: payload.role,
      displayName: payload.displayName,
      isSuperAdmin: payload.sa === true,
    };
    return true;
  }
}
