import { Inject, Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { PrismaService } from "../../lib/prisma.service";
import { ENV, type Env } from "../../config/env.schema";
import { decryptSecret } from "../../common/secret-box";

export const EMAIL_SETTING_KEY = "email";

/** Formato do Setting `email` (por household). `smtpPassEnc` é cifrado (secret-box). */
export interface StoredEmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassEnc: string;
  fromName: string;
  weeklyEnabled: boolean;
  weeklyLastRunIso?: string;
}

interface ResolvedTransport {
  transporter: Transporter;
  from: string;
  /** de onde veio: config do household ou .env do servidor */
  source: "household" | "env";
}

/**
 * Envio de e-mail transacional via SMTP.
 * Prioridade: config do household (tela Configurações) → SMTP_* do .env → nada
 * (nesse caso só registra o link/conteúdo no log, mantendo dev/CI funcionando).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async householdConfig(householdId: string): Promise<StoredEmailConfig | null> {
    const row = await this.prisma.setting.findUnique({
      where: { householdId_key: { householdId, key: EMAIL_SETTING_KEY } },
    });
    return (row?.value as StoredEmailConfig | undefined) ?? null;
  }

  /** Descreve o estado da config de e-mail para a tela. */
  async describe(householdId: string): Promise<{
    cfg: StoredEmailConfig | null;
    smtpConfigured: boolean;
    usingEnvFallback: boolean;
  }> {
    const cfg = await this.householdConfig(householdId);
    const smtpConfigured = !!(cfg?.smtpUser && cfg?.smtpPassEnc);
    const envConfigured = !!(this.env.SMTP_USER && this.env.SMTP_PASS);
    return { cfg, smtpConfigured, usingEnvFallback: !smtpConfigured && envConfigured };
  }

  private buildTransport(
    host: string,
    port: number,
    user: string,
    pass: string,
  ): Transporter {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  /** Resolve o transporte para um household (com fallback pro .env). null = sem SMTP. */
  private async resolve(householdId?: string): Promise<ResolvedTransport | null> {
    if (householdId) {
      const cfg = await this.householdConfig(householdId);
      if (cfg?.smtpUser && cfg?.smtpPassEnc) {
        const pass = decryptSecret(cfg.smtpPassEnc, this.env.JWT_ACCESS_SECRET);
        return {
          transporter: this.buildTransport(cfg.smtpHost, cfg.smtpPort, cfg.smtpUser, pass),
          from: `${cfg.fromName} <${cfg.smtpUser}>`,
          source: "household",
        };
      }
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

  private async send(
    householdId: string | undefined,
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    const t = await this.resolve(householdId);
    if (!t) {
      this.logger.debug(`[mail:noop] para=${to} assunto="${subject}"\n${text}`);
      return;
    }
    await t.transporter.sendMail({ from: t.from, to, subject, text, html });
    this.logger.log(`E-mail enviado para ${to} ("${subject}") via ${t.source}`);
  }

  /** Testa a conexão SMTP e manda um e-mail de teste. Não lança — devolve ok/erro. */
  async sendTest(householdId: string, to: string): Promise<{ ok: boolean; error?: string }> {
    const t = await this.resolve(householdId);
    if (!t) return { ok: false, error: "Nenhum SMTP configurado (nem no household nem no servidor)." };
    try {
      await t.transporter.verify();
      await t.transporter.sendMail({
        from: t.from,
        to,
        subject: "Teste de e-mail · RT Finance",
        text: "Deu certo! O envio de e-mail do RT Finance está funcionando.",
        html: `<div style="font-family:system-ui,sans-serif">
          <p>Deu certo! ✅</p>
          <p>O envio de e-mail do RT Finance está funcionando (via <strong>${t.source === "household" ? "config do household" : "SMTP do servidor"}</strong>).</p>
        </div>`,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /** Link de redefinição de senha (resolve o household do usuário, senão .env). */
  async sendPasswordReset(
    to: string,
    name: string,
    link: string,
    ttlMinutes: number,
    householdId?: string,
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
    await this.send(householdId, to, "Redefinição de senha · RT Finance", text, html);
  }

  /** Resumo semanal (chamado pelo scheduler). `to` = e-mail de um membro. */
  async sendWeeklyDigest(
    householdId: string,
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    await this.send(householdId, to, subject, text, html);
  }
}
