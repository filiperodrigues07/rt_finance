import { Inject, Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { PrismaService } from "../../lib/prisma.service";
import { ENV, type Env } from "../../config/env.schema";
import { decryptSecret } from "../../common/secret-box";

/** Chave da config global de e-mail (tabela AppSetting). */
export const APP_EMAIL_KEY = "email";
/** Chave da preferência de e-mail por household (tabela Setting). */
export const HOUSEHOLD_EMAIL_KEY = "email";

/** AppSetting `email` — SMTP global do sistema. `smtpPassEnc` cifrado (secret-box). */
export interface GlobalEmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassEnc: string;
  fromName: string;
}

/** Setting `email` de um household. */
export interface HouseholdEmailPrefs {
  weeklyEnabled: boolean;
  weeklyLastRunIso?: string;
}

interface ResolvedTransport {
  transporter: Transporter;
  from: string;
  source: "global" | "env";
}

/**
 * Envio de e-mail transacional via SMTP.
 * Um único remetente para todo o sistema: config global (tela do super-admin) →
 * SMTP_* do .env (fallback) → nada (só registra no log, mantendo dev/CI vivos).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async globalConfig(): Promise<GlobalEmailConfig | null> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: APP_EMAIL_KEY } });
    return (row?.value as GlobalEmailConfig | undefined) ?? null;
  }

  /** Estado da config global (para a tela do super-admin). */
  async describe(): Promise<{
    cfg: GlobalEmailConfig | null;
    configured: boolean;
    usingEnvFallback: boolean;
  }> {
    const cfg = await this.globalConfig();
    const configured = !!(cfg?.smtpUser && cfg?.smtpPassEnc);
    const envConfigured = !!(this.env.SMTP_USER && this.env.SMTP_PASS);
    return { cfg, configured, usingEnvFallback: !configured && envConfigured };
  }

  /** Há algum SMTP utilizável (global ou .env)? */
  async isReady(): Promise<boolean> {
    const { configured, usingEnvFallback } = await this.describe();
    return configured || usingEnvFallback;
  }

  private buildTransport(host: string, port: number, user: string, pass: string): Transporter {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  private async resolve(): Promise<ResolvedTransport | null> {
    const cfg = await this.globalConfig();
    if (cfg?.smtpUser && cfg?.smtpPassEnc) {
      const pass = decryptSecret(cfg.smtpPassEnc, this.env.JWT_ACCESS_SECRET);
      return {
        transporter: this.buildTransport(cfg.smtpHost, cfg.smtpPort, cfg.smtpUser, pass),
        from: `${cfg.fromName} <${cfg.smtpUser}>`,
        source: "global",
      };
    }
    if (this.env.SMTP_USER && this.env.SMTP_PASS) {
      return {
        transporter: this.buildTransport(
          this.env.SMTP_HOST,
          this.env.SMTP_PORT,
          this.env.SMTP_USER,
          this.env.SMTP_PASS,
        ),
        from: this.env.MAIL_FROM ?? this.env.SMTP_USER,
        source: "env",
      };
    }
    return null;
  }

  private async send(to: string, subject: string, text: string, html: string): Promise<void> {
    const t = await this.resolve();
    if (!t) {
      this.logger.debug(`[mail:noop] para=${to} assunto="${subject}"\n${text}`);
      return;
    }
    await t.transporter.sendMail({ from: t.from, to, subject, text, html });
    this.logger.log(`E-mail enviado para ${to} ("${subject}") via ${t.source}`);
  }

  /** Testa a conexão SMTP e manda um e-mail de teste. Não lança — devolve ok/erro. */
  async sendTest(to: string): Promise<{ ok: boolean; error?: string }> {
    const t = await this.resolve();
    if (!t) return { ok: false, error: "Nenhum SMTP configurado (nem global nem no servidor)." };
    try {
      await t.transporter.verify();
      await t.transporter.sendMail({
        from: t.from,
        to,
        subject: "Teste de e-mail · RT Finance",
        text: "Deu certo! O envio de e-mail do RT Finance está funcionando.",
        html: `<div style="font-family:system-ui,sans-serif">
          <p>Deu certo! ✅</p>
          <p>O envio de e-mail do RT Finance está funcionando (via <strong>${t.source === "global" ? "config global" : "SMTP do servidor"}</strong>).</p>
        </div>`,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /** Link de redefinição de senha. */
  async sendPasswordReset(
    to: string,
    name: string,
    link: string,
    ttlMinutes: number,
  ): Promise<void> {
    const hello = name ? `Olá, ${name}!` : "Olá!";
    const text = [
      hello,
      "",
      "Recebemos um pedido para redefinir a senha da sua conta no RT Finance.",
      `Abra o link abaixo (válido por ${ttlMinutes} minutos):`,
      link,
      "",
      "Se não foi você, ignore este e-mail — sua senha continua a mesma.",
      "",
      "RT Finance",
    ].join("\n");
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
        <p>${hello}</p>
        <p>Recebemos um pedido para redefinir a senha da sua conta no <strong>RT Finance</strong>.</p>
        <p style="margin:24px 0">
          <a href="${link}" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">
            Redefinir minha senha
          </a>
        </p>
        <p style="font-size:13px;color:#475569">O link vale por ${ttlMinutes} minutos. Se o botão não funcionar, copie e cole:<br>
          <span style="word-break:break-all">${link}</span>
        </p>
        <p style="font-size:13px;color:#475569">Se não foi você, ignore este e-mail — sua senha continua a mesma.</p>
        <p style="font-size:12px;color:#94a3b8;margin-top:32px">RT Finance · assistente do casal</p>
      </div>`;
    await this.send(to, "Redefinição de senha · RT Finance", text, html);
  }

  /** Resumo semanal (chamado pelo scheduler). */
  async sendWeeklyDigest(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    await this.send(to, subject, text, html);
  }
}
