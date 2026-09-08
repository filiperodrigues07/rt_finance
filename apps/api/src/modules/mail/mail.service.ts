import { Inject, Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { ENV, type Env } from "../../config/env.schema";

/**
 * Envio de e-mail transacional via SMTP (Gmail com senha de app, por padrão).
 * Sem SMTP_USER/SMTP_PASS o serviço não envia nada — só registra o link no log
 * (mantém dev e CI funcionando sem credenciais).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.from = env.MAIL_FROM ?? env.SMTP_USER ?? "no-reply@localhost";
    if (env.SMTP_USER && env.SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      });
    } else {
      this.transporter = null;
      this.logger.warn("SMTP não configurado — e-mails serão apenas registrados no log.");
    }
  }

  get enabled(): boolean {
    return this.transporter !== null;
  }

  private async send(to: string, subject: string, text: string, html: string): Promise<void> {
    if (!this.transporter) {
      this.logger.debug(`[mail:noop] para=${to} assunto="${subject}"\n${text}`);
      return;
    }
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text, html });
      this.logger.log(`E-mail enviado para ${to} ("${subject}")`);
    } catch (err) {
      this.logger.error(`Falha ao enviar e-mail para ${to}: ${(err as Error).message}`);
      throw err;
    }
  }

  /** Link de redefinição de senha. */
  async sendPasswordReset(to: string, name: string, link: string, ttlMinutes: number): Promise<void> {
    const subject = "Redefinição de senha · RT Finance";
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
    await this.send(to, subject, text, html);
  }
}
