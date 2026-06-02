import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as dns from 'dns';
import * as nodemailer from 'nodemailer';

// Force IPv4 resolution globally. Many VPS / local dev machines advertise an
// AAAA (IPv6) record for smtp.gmail.com but have no working IPv6 route, which
// surfaces as: `connect ENETUNREACH 2a00:1450:...:587`.
dns.setDefaultResultOrder('ipv4first');

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendEmailOptions {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  attachments: EmailAttachment[];
  /** If provided, used as the HTML body instead of wrapping body in a <pre>. */
  html?: string;
}

export interface SendHtmlEmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  forceIpv4: boolean;
  user: string;
  pass: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private readonly smtp: SmtpConfig;
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.smtp = this.buildSmtpConfig();
    this.transporter = this.createTransporter(this.smtp);
  }

  // ─── Configuration ───────────────────────────────────────────────────────────

  /** Reads SMTP settings from env, normalizes, and validates the TLS/port combo. */
  private buildSmtpConfig(): SmtpConfig {
    const host = this.config.get<string>('SMTP_HOST', 'smtp.gmail.com');
    const port = parseInt(this.config.get<string>('SMTP_PORT', '587'), 10);
    const secure = this.config.get<string>('SMTP_SECURE', 'false') === 'true';
    // Default ON: STARTTLS is required for the standard submission port 587.
    const requireTLS =
      this.config.get<string>('SMTP_REQUIRE_TLS', 'true') === 'true';
    // Default ON: avoids ENETUNREACH on hosts without working IPv6.
    const forceIpv4 =
      this.config.get<string>('SMTP_FORCE_IPV4', 'true') === 'true';
    const user = this.config.get<string>('SMTP_USER', '');
    const pass = this.config.get<string>('SMTP_PASS', '');

    this.validateSmtpConfig(port, secure);

    return { host, port, secure, requireTLS, forceIpv4, user, pass };
  }

  /**
   * Guards against the two misconfigurations that produce the
   * `wrong version number` TLS error in production.
   *  - Port 587 (submission/STARTTLS) MUST use secure=false.
   *  - Port 465 (implicit TLS) MUST use secure=true.
   */
  private validateSmtpConfig(port: number, secure: boolean): void {
    if (port === 587 && secure === true) {
      throw new Error(
        'Invalid SMTP config: port 587 requires SMTP_SECURE=false (STARTTLS). ' +
          'Use SMTP_REQUIRE_TLS=true instead, or switch to port 465 with SMTP_SECURE=true.',
      );
    }
    if (port === 465 && secure === false) {
      throw new Error(
        'Invalid SMTP config: port 465 requires SMTP_SECURE=true (implicit TLS).',
      );
    }
  }

  private createTransporter(smtp: SmtpConfig): nodemailer.Transporter {
    return nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTLS: smtp.requireTLS,
      // family:4 forces IPv4 at the socket level (belt-and-braces with the
      // dns.setDefaultResultOrder call above).
      ...(smtp.forceIpv4 ? { family: 4 } : {}),
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
      tls: {
        // SNI must match the host so the cert validates correctly.
        servername: smtp.host,
      },
    });
  }

  // ─── Diagnostics ─────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    this.logSmtpConfig();
    // Verify connectivity at startup but never crash the app on transient
    // network/auth failures — just surface a clear warning.
    try {
      await this.verifySmtpConnection();
    } catch (err) {
      this.logger.warn(
        `SMTP verify failed at startup: ${this.mapSmtpError(err as Error)}`,
      );
    }
  }

  /** Logs the active SMTP configuration WITHOUT exposing the password. */
  private logSmtpConfig(): void {
    this.logger.log(
      `SMTP config — SMTP_HOST=${this.smtp.host} SMTP_PORT=${this.smtp.port} ` +
        `SMTP_SECURE=${this.smtp.secure} SMTP_REQUIRE_TLS=${this.smtp.requireTLS} ` +
        `SMTP_FORCE_IPV4=${this.smtp.forceIpv4} SMTP_USER=${this.smtp.user || '(empty)'}`,
    );
  }

  /** Runs transporter.verify() and logs the result without leaking secrets. */
  async verifySmtpConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      this.logger.log('SMTP_VERIFY_OK=true');
      return true;
    } catch (err) {
      this.logger.error(
        `SMTP_VERIFY_OK=false — ${this.mapSmtpError(err as Error)}`,
      );
      throw err;
    }
  }

  // ─── Error mapping ───────────────────────────────────────────────────────────

  /** Maps technical SMTP/socket errors to clear, French, user-facing messages. */
  mapSmtpError(err: Error): string {
    const code = (err as NodeJS.ErrnoException).code ?? '';
    const message = err.message ?? '';

    if (code === 'ENETUNREACH' || /ENETUNREACH/.test(message)) {
      return "Le serveur a tenté d'utiliser IPv6 mais le réseau ne le supporte pas. IPv4 doit être forcé (SMTP_FORCE_IPV4=true).";
    }
    if (code === 'ETIMEDOUT' || /ETIMEDOUT|timed? ?out/i.test(message)) {
      return 'Délai de connexion au serveur SMTP dépassé. Vérifiez le pare-feu et le port.';
    }
    if (code === 'EAUTH' || /Invalid login|535|EAUTH/i.test(message)) {
      return "Identifiants SMTP invalides. Pour Gmail, utilisez un mot de passe d'application.";
    }
    if (code === 'ECONNECTION' || code === 'ECONNREFUSED') {
      return 'Connexion au serveur SMTP refusée. Vérifiez SMTP_HOST et SMTP_PORT.';
    }
    if (/wrong version number/i.test(message)) {
      return 'Configuration TLS/SSL incompatible avec le port SMTP. Le port 587 requiert SMTP_SECURE=false (STARTTLS), le port 465 requiert SMTP_SECURE=true.';
    }
    if (code === 'EDNS' || code === 'ENOTFOUND') {
      return "Le serveur SMTP est introuvable (DNS). Vérifiez SMTP_HOST.";
    }
    return message || "Erreur inconnue lors de l'envoi de l'email.";
  }

  // ─── Sending ─────────────────────────────────────────────────────────────────

  private resolveFrom(): string {
    return this.config.get<string>(
      'SMTP_FROM',
      this.config.get<string>('SMTP_USER', 'noreply@stockini.com'),
    );
  }

  /** Logs attachment metadata (no content) for diagnosing PDF send issues. */
  private logAttachments(attachments: EmailAttachment[]): void {
    if (!attachments.length) {
      this.logger.warn('Email has no attachments.');
      return;
    }
    attachments.forEach((a) => {
      if (!a.content || a.content.length === 0) {
        this.logger.warn(
          `Attachment "${a.filename}" is empty (0 bytes) — PDF generation/MinIO retrieval may have failed.`,
        );
      }
      this.logger.log(
        `Attachment — filename=${a.filename} contentType=${a.contentType} size=${a.content?.length ?? 0}B`,
      );
    });
  }

  async send(options: SendEmailOptions): Promise<void> {
    this.logAttachments(options.attachments);
    try {
      await this.transporter.sendMail({
        from: this.resolveFrom(),
        to: options.to,
        cc: options.cc,
        bcc: options.bcc,
        subject: options.subject,
        text: options.body,
        html:
          options.html ??
          `<pre style="font-family:sans-serif;white-space:pre-wrap">${options.body}</pre>`,
        attachments: options.attachments.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });
      this.logger.log(`Email sent to ${options.to} — ${options.subject}`);
    } catch (err) {
      const friendly = this.mapSmtpError(err as Error);
      this.logger.error(`Email send failed to ${options.to}: ${friendly}`);
      throw new Error(friendly);
    }
  }

  async sendHtml(options: SendHtmlEmailOptions): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.resolveFrom(),
        to: options.to,
        subject: options.subject,
        html: options.htmlBody,
      });
      this.logger.log(`HTML email sent to ${options.to} — ${options.subject}`);
    } catch (err) {
      const friendly = this.mapSmtpError(err as Error);
      this.logger.error(`HTML email send failed to ${options.to}: ${friendly}`);
      throw new Error(friendly);
    }
  }
}
