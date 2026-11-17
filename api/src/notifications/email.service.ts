import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Trimmed copy of the backend EmailService: only what the mobile app flows need
 * (activity notification mails). SMTP or Microsoft Graph, same env settings as the backend.
 */
@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT'),
      secure: this.configService.get<number>('SMTP_PORT') === 465,
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  async send(
    to: string,
    subject: string,
    htmlBody: string,
    cc?: string | string[],
    thread?: { messageId?: string; inReplyTo?: string; references?: string | string[] },
    attachments?: { filename: string; content: Buffer; contentType?: string }[],
  ) {
    try {
      // Microsoft Graph (MS_* settings) is the default channel when configured.
      // Threaded replies need SMTP (RFC threading headers).
      if (this.graphConfig() && !thread?.inReplyTo && !thread?.references) {
        const info = await this.sendViaGraph(to, subject, htmlBody, cc, attachments, thread?.messageId);
        this.logger.log(`Email sent via Microsoft Graph: ${info.messageId}`);
        return info;
      }

      const info = await this.transporter.sendMail({
        from: this.configService.get<string>('SMTP_FROM'),
        to,
        ...(cc && (Array.isArray(cc) ? cc.length : cc) ? { cc } : {}),
        subject,
        html: htmlBody,
        ...(thread?.messageId ? { messageId: thread.messageId } : {}),
        ...(thread?.inReplyTo ? { inReplyTo: thread.inReplyTo } : {}),
        ...(thread?.references ? { references: thread.references } : {}),
        ...(attachments?.length ? { attachments } : {}),
      });
      this.logger.log(`Email sent: ${info.messageId}`);
      return info;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}:`, error);
      throw error;
    }
  }

  private graphToken?: { value: string; expiresAt: number };

  /** Graph settings, or null unless all four MS_* values are present. */
  private graphConfig(): { tenantId: string; clientId: string; clientSecret: string; mailbox: string } | null {
    const read = (key: string) => String(this.configService.get<string>(key) ?? '').trim();
    const tenantId = read('MS_TENANT_ID');
    const clientId = read('MS_CLIENT_ID');
    const clientSecret = read('MS_CLIENT_SECRET');
    const mailbox = read('MS_SHARED_MAILBOX');
    return tenantId && clientId && clientSecret && mailbox ? { tenantId, clientId, clientSecret, mailbox } : null;
  }

  private graphError(message: string, extra: { responseCode?: number; code?: string }): Error {
    return Object.assign(new Error(message), extra);
  }

  /** App-only (client credentials) token, cached until shortly before it expires. */
  private async getGraphToken(cfg: NonNullable<ReturnType<EmailService['graphConfig']>>): Promise<string> {
    if (this.graphToken && this.graphToken.expiresAt > Date.now() + 60_000) return this.graphToken.value;
    let res: Response;
    try {
      res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }),
      });
    } catch (error) {
      throw this.graphError(`Microsoft token request failed: ${(error as Error).message}`, { code: 'ECONNECTION' });
    }
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!res.ok || !body.access_token) {
      // Never log the secret; Microsoft's description names the problem (bad secret, wrong tenant...).
      throw this.graphError(`Microsoft token request rejected (${res.status}): ${body.error_description ?? 'no detail'}`.split('\r')[0], {
        code: 'EAUTH',
        responseCode: res.status,
      });
    }
    this.graphToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return body.access_token;
  }

  private async sendViaGraph(
    to: string,
    subject: string,
    htmlBody: string,
    cc: string | string[] | undefined,
    attachments: { filename: string; content: Buffer; contentType?: string }[] | undefined,
    messageId?: string,
  ): Promise<{ messageId: string }> {
    const cfg = this.graphConfig()!;
    const recipients = (value: string | string[] | undefined) =>
      (Array.isArray(value) ? value : value ? [value] : [])
        .flatMap((entry) => entry.split(','))
        .map((address) => address.trim())
        .filter(Boolean)
        .map((address) => ({ emailAddress: { address } }));
    const payload = {
      message: {
        subject,
        body: { contentType: 'HTML', content: htmlBody },
        toRecipients: recipients(to),
        ccRecipients: recipients(cc),
        ...(attachments?.length
          ? {
              attachments: attachments.map((file) => ({
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: file.filename,
                contentType: file.contentType ?? 'application/octet-stream',
                contentBytes: file.content.toString('base64'),
              })),
            }
          : {}),
      },
      saveToSentItems: true,
    };

    for (let attempt = 0; ; attempt++) {
      const token = await this.getGraphToken(cfg);
      let res: Response;
      try {
        res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.mailbox)}/sendMail`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (error) {
        throw this.graphError(`Microsoft Graph request failed: ${(error as Error).message}`, { code: 'ECONNECTION' });
      }
      if (res.status === 202) {
        // Graph does not return a message id; use ours (or a generated reference) for tracking.
        return { messageId: messageId ?? `graph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}` };
      }
      if (res.status === 401 && attempt === 0) {
        this.graphToken = undefined; // expired/revoked token: fetch a fresh one once
        continue;
      }
      const detail = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
      throw this.graphError(
        `Microsoft Graph sendMail failed (${res.status} ${detail.error?.code ?? ''}): ${detail.error?.message ?? 'no detail'}`,
        { responseCode: res.status, ...(res.status === 401 || res.status === 403 ? { code: 'EAUTH' } : {}) },
      );
    }
  }

  private renderTemplate(templateName: string, data: Record<string, any>): string {
    const templatePath = path.join(__dirname, 'templates', `${templateName}.html`);
    let content = fs.readFileSync(templatePath, 'utf8');
    
    // Simple template engine: replace {{key}} with data[key]
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      content = content.replace(regex, () => String(data[key] ?? ''));
    });
    
    return content;
  }

  /**
   * Builds (but does not send) the Todo List activity email. Returned rather
   * than sent so NotificationsService stays the single place that decides
   * whether a user wants email at all.
   */
  buildActivityEmail(data: {
    recipientName: string;
    headline: string;
    intro: string;
    activityName: string;
    window: string;
    creatorName: string;
    remarks?: string | null;
  }): { subject: string; html: string } {
    const html = this.renderTemplate('activity-notification', {
      name: data.recipientName,
      headline: data.headline,
      intro: data.intro,
      activityName: data.activityName,
      window: data.window,
      creatorName: data.creatorName,
      remarksBlock: data.remarks
        ? `<p><span class="label">Note:</span> ${data.remarks}</p>`
        : '',
      // FRONTEND_URL is configured with a trailing slash, so strip it rather
      // than emit a "//todo" link.
      link: `${String(this.configService.get('FRONTEND_URL') ?? '').replace(/\/+$/, '')}/todo`,
    });

    return { subject: `${data.headline}: ${data.activityName}`, html };
  }
}
