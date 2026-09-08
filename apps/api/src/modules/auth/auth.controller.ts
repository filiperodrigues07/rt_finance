import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  loginBody,
  forgotPasswordBody,
  resetPasswordBody,
  type AuthTokens,
  type LoginResponse,
  type AuthUser,
  type ForgotPasswordBody,
  type ResetPasswordBody,
  type OkResponse,
} from "@rt-finance/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ENV, type Env } from "../../config/env.schema";
import { AuthService, type AuthResult } from "./auth.service";
import { PasswordResetService } from "./password-reset.service";

function reqCtx(req: FastifyRequest): { userAgent?: string; ip?: string } {
  return { userAgent: req.headers["user-agent"], ip: req.ip };
}

@Controller("auth")
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private setRefreshCookie(res: FastifyReply, token: string, expiresAt: Date): void {
    void res.setCookie(this.env.AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: this.env.AUTH_COOKIE_SECURE,
      // com HTTPS o cookie de refresh vai como strict (defesa extra contra CSRF)
      sameSite: this.env.AUTH_COOKIE_SECURE ? "strict" : "lax",
      domain: this.env.AUTH_COOKIE_DOMAIN,
      path: "/",
      expires: expiresAt,
    });
  }

  private clearRefreshCookie(res: FastifyReply): void {
    void res.clearCookie(this.env.AUTH_COOKIE_NAME, { path: "/" });
  }

  private toResponse(result: AuthResult, res: FastifyReply): LoginResponse {
    this.setRefreshCookie(res, result.tokens.refreshToken, result.tokens.refreshExpiresAt);
    const tokens: AuthTokens = {
      accessToken: result.tokens.accessToken,
      expiresIn: result.tokens.accessExpiresIn,
    };
    return { user: result.user, tokens };
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginBody)) body: { email: string; password: string },
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<LoginResponse> {
    const result = await this.auth.login(body, reqCtx(req));
    return this.toResponse(result, res);
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
    @Body() body: { refreshToken?: string } = {},
  ): Promise<LoginResponse> {
    const raw = req.cookies?.[this.env.AUTH_COOKIE_NAME] ?? body.refreshToken;
    const result = await this.auth.refresh(raw ?? "", reqCtx(req));
    return this.toResponse(result, res);
  }

  /** Pede o link de redefinição. Resposta é sempre genérica (não revela se o e-mail existe). */
  @Public()
  @Post("forgot-password")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordBody)) body: ForgotPasswordBody,
    @Req() req: FastifyRequest,
  ): Promise<OkResponse> {
    await this.passwordReset.requestReset(body.email, req.ip);
    return { ok: true };
  }

  /** Confere se um token de redefinição ainda é válido (para a tela avisar antes). */
  @Public()
  @Get("reset-password/check")
  @Throttle({ default: { limit: 20, ttl: 900_000 } })
  async checkResetToken(@Query("token") token?: string): Promise<{ valid: boolean }> {
    return { valid: token ? await this.passwordReset.isTokenValid(token) : false };
  }

  /** Aplica a nova senha a partir do token do e-mail e derruba as sessões antigas. */
  @Public()
  @Post("reset-password")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordBody)) body: ResetPasswordBody,
  ): Promise<OkResponse> {
    await this.passwordReset.resetPassword(body.token, body.password);
    return { ok: true };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<void> {
    await this.auth.logout(req.cookies?.[this.env.AUTH_COOKIE_NAME]);
    this.clearRefreshCookie(res);
  }

  @Get("me")
  async me(@CurrentUser() user: AuthUser): Promise<AuthUser> {
    return this.auth.me(user.id);
  }
}
