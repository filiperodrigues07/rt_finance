import { Injectable, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import type { AuthUser, LoginBody } from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { TokenService, type IssuedTokens } from "./token.service";
import type { AccessTokenPayload } from "../../common/guards/jwt-auth.guard";

export interface AuthResult {
  user: AuthUser;
  tokens: IssuedTokens;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  /** Payload do JWT (sem avatar — data URI não vai no token). */
  private async loadPayload(userId: string): Promise<AccessTokenPayload> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { include: { household: true }, take: 1 } },
    });
    const membership = user?.memberships[0];
    if (!user || !membership) {
      throw new UnauthorizedException("Usuário sem household associado");
    }
    return {
      sub: user.id,
      hid: membership.householdId,
      mid: membership.id,
      role: membership.role,
      sa: user.isSuperAdmin,
      name: user.name,
      email: user.email,
      displayName: membership.displayName,
    };
  }

  /** AuthUser completo (inclui avatarUrl, lido do banco). */
  private async buildAuthUser(userId: string): Promise<{ payload: AccessTokenPayload; user: AuthUser }> {
    const payload = await this.loadPayload(userId);
    const rec = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true, avatarColor: true },
    });
    return {
      payload,
      user: {
        id: payload.sub,
        name: payload.name,
        email: payload.email,
        householdId: payload.hid,
        memberId: payload.mid,
        role: payload.role,
        displayName: payload.displayName,
        avatarUrl: rec?.avatarUrl ?? null,
        avatarColor: rec?.avatarColor ?? null,
        isSuperAdmin: payload.sa === true,
      },
    };
  }

  async login(
    body: LoginBody,
    ctx: { userAgent?: string; ip?: string },
  ): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    const ok = user ? await argon2.verify(user.passwordHash, body.password).catch(() => false) : false;
    if (!user || !ok) {
      throw new UnauthorizedException("E-mail ou senha inválidos");
    }
    const { payload, user: authUser } = await this.buildAuthUser(user.id);
    const tokens = await this.tokens.issue(payload, ctx);
    return { user: authUser, tokens };
  }

  async refresh(
    rawRefresh: string,
    ctx: { userAgent?: string; ip?: string },
  ): Promise<AuthResult> {
    let authUser!: AuthUser;
    const tokens = await this.tokens.rotate(
      rawRefresh,
      async (userId) => {
        const built = await this.buildAuthUser(userId);
        authUser = built.user;
        return built.payload;
      },
      ctx,
    );
    return { user: authUser, tokens };
  }

  async logout(rawRefresh: string | undefined): Promise<void> {
    if (rawRefresh) await this.tokens.revoke(rawRefresh);
  }

  async me(userId: string): Promise<AuthUser> {
    return (await this.buildAuthUser(userId)).user;
  }
}
