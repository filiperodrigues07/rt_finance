import { randomBytes, createHash, randomUUID } from "node:crypto";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../lib/prisma.service";
import { ENV, type Env } from "../../config/env.schema";
import { durationToSeconds } from "./duration";
import type { AccessTokenPayload } from "../../common/guards/jwt-auth.guard";

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
  refreshExpiresAt: Date;
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private buildAccessPayload(input: AccessTokenPayload): AccessTokenPayload {
    return input;
  }

  async issue(
    payload: AccessTokenPayload,
    ctx: { userAgent?: string; ip?: string; familyId?: string },
  ): Promise<IssuedTokens> {
    const accessExpiresIn = durationToSeconds(this.env.JWT_ACCESS_TTL);
    const accessToken = await this.jwt.signAsync(this.buildAccessPayload(payload), {
      expiresIn: accessExpiresIn,
    });

    const refreshToken = randomBytes(48).toString("base64url");
    const refreshTtl = durationToSeconds(this.env.JWT_REFRESH_TTL);
    const refreshExpiresAt = new Date(Date.now() + refreshTtl * 1000);

    await this.prisma.session.create({
      data: {
        userId: payload.sub,
        tokenHash: hashToken(refreshToken),
        familyId: ctx.familyId ?? randomUUID(),
        userAgent: ctx.userAgent?.slice(0, 300),
        ip: ctx.ip,
        expiresAt: refreshExpiresAt,
      },
    });

    return { accessToken, refreshToken, accessExpiresIn, refreshExpiresAt };
  }

  /** Rotaciona o refresh token. Detecta reuso: se o token já foi revogado, revoga a família toda. */
  async rotate(
    rawRefresh: string,
    payloadFactory: (userId: string) => Promise<AccessTokenPayload>,
    ctx: { userAgent?: string; ip?: string },
  ): Promise<IssuedTokens> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(rawRefresh) },
    });

    if (!session) throw new UnauthorizedException("Sessão inválida");

    if (session.revokedAt) {
      // Reuso de token já rotacionado → comprometido. Invalida toda a família.
      await this.prisma.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException("Sessão revogada (reuso detectado)");
    }

    if (session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Sessão expirada");
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const payload = await payloadFactory(session.userId);
    return this.issue(payload, { ...ctx, familyId: session.familyId });
  }

  async revoke(rawRefresh: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash: hashToken(rawRefresh), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
