import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import * as argon2 from "argon2";
import { PrismaService } from "../../lib/prisma.service";
import { ENV, type Env } from "../../config/env.schema";
import { DomainError } from "../../common/errors/domain-error";
import { MailService } from "../mail/mail.service";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Cria um token e envia o link por e-mail. Nunca revela se o e-mail existe —
   * o controller responde sempre `{ ok: true }`.
   */
  async requestReset(email: string, ip?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      this.logger.debug(`forgot-password para e-mail sem conta: ${email}`);
      return;
    }

    // invalida pedidos anteriores ainda pendentes
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const rawToken = randomBytes(32).toString("base64url");
    const ttlMin = this.env.PASSWORD_RESET_TTL_MINUTES;
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + ttlMin * 60_000),
        requestedIp: ip?.slice(0, 64),
      },
    });

    const base = this.env.WEB_ORIGIN.replace(/\/+$/, "");
    const link = `${base}/redefinir-senha?token=${rawToken}`;
    try {
      await this.mail.sendPasswordReset(user.email, user.name, link, ttlMin);
    } catch {
      // erro de SMTP não deve vazar para a resposta; o usuário pode tentar de novo
      this.logger.error(`Não foi possível enviar o e-mail de redefinição para ${user.email}`);
    }
  }

  /** Verifica se um token cru ainda serve (para a tela mostrar "link expirado"). */
  async isTokenValid(rawToken: string): Promise<boolean> {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      select: { usedAt: true, expiresAt: true },
    });
    return !!row && row.usedAt === null && row.expiresAt.getTime() > Date.now();
  }

  /** Aplica a nova senha, consome o token e derruba todas as sessões do usuário. */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!row || row.usedAt !== null || row.expiresAt.getTime() <= Date.now()) {
      throw new DomainError("Link inválido ou expirado. Peça um novo.", "InvalidResetToken");
    }

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      this.prisma.passwordResetToken.updateMany({
        where: { userId: row.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    this.logger.log(`Senha redefinida (userId=${row.userId}); sessões revogadas.`);
  }
}
