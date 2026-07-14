
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly mailTransport: 'smtp' | 'log';

  constructor(private readonly configService: ConfigService) {
    this.mailTransport = this.configService.get<'smtp' | 'log'>('MAIL_TRANSPORT', 'smtp');

    if (this.mailTransport === 'log') {
      this.transporter = nodemailer.createTransport({ jsonTransport: true });
      console.log('[MailService] Local log mail transport enabled');
    } else {
      this.transporter = nodemailer.createTransport({
        host: this.configService.get<string>('SMTP_HOST', 'smtp.zoho.in'),
        port: this.configService.get<number>('SMTP_PORT', 587),
        secure: this.configService.get<boolean>('SMTP_SECURE', false),
        auth: {
          user: this.configService.get<string>('SMTP_USER'),
          pass: this.configService.get<string>('SMTP_PASS'),
        },
      });

      this.transporter.verify((error: Error | null, success: unknown) => {
        if (error) {
          console.error('❌ SMTP Connection Error:', error);
        } else {
          console.log('✅ SMTP Server is ready to take our messages');
        }
      });
    }
  }

  async sendMail(to: string, subject: string, html: string) {
    const from = this.configService.get<string>('FROM_EMAIL');
    await this.transporter.sendMail({
      from: `"CockpitOS" <${from}>`,
      to,
      subject,
      html,
    });

    if (this.mailTransport === 'log') {
      console.log(`[MailService] Local mail accepted: ${subject} -> ${to}`);
    }
  }

  async sendOtpEmail(to: string, otp: string) {
    const subject = 'Verify your email for CockpitOS';
    if (this.mailTransport === 'log') {
      console.log('');
      console.log('========================================');
      console.log(`[MailService] Local signup OTP for ${to}: ${otp}`);
      console.log('========================================');
      console.log('');
    }

    const html = `
<div style="margin:0; padding:0; background-color:#ffffff;">
  <div style="max-width:520px; margin:40px auto; padding:0 16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#1a1a1a;">
    
    <div style="background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; padding:28px;">
      
      <h2 style="margin:0 0 12px 0; font-size:18px; font-weight:600;">
        Verify your email
      </h2>

      <p style="margin:0 0 16px 0; font-size:14px; line-height:1.6; color:#4b5563;">
        Use the verification code below to complete your sign in to <strong>CockpitOS</strong>.
      </p>

      <div style="
        margin:18px 0;
        padding:14px 16px;
        border:1px solid #e5e7eb;
        border-radius:10px;
        background:#ffffff;
        display:inline-block;
      ">
        <span style="
          font-size:22px;
          font-weight:600;
          letter-spacing:6px;
          color:#111827;
        ">
          ${otp}
        </span>
      </div>

      <p style="margin:18px 0 6px 0; font-size:12px; color:#6b7280;">
        This code expires in 10 minutes.
      </p>

      <p style="margin:0; font-size:12px; color:#9ca3af;">
        If you didn't request this email, you can safely ignore it.
      </p>

    </div>

    <p style="margin:16px 4px 0 4px; font-size:11px; color:#9ca3af;">
      © ${new Date().getFullYear()} CockpitOS. By Ripun Basumatary. All rights reserved.
    </p>

  </div>
</div>
`;

    await this.sendMail(to, subject, html);
  }

  async sendPasswordResetEmail(to: string, token: string) {
    const subject = 'Reset your password for CockpitOS';
    const frontendUrl = process.env.FRONTEND_URL || 'https://cockpit.run';
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;
    if (this.mailTransport === 'log') {
      console.log('');
      console.log('========================================');
      console.log(`[MailService] Local password reset for ${to}:`);
      console.log(resetLink);
      console.log('========================================');
      console.log('');
    }

    const html = `
<div style="margin:0; padding:0; background-color:#ffffff;">
  <div style="max-width:520px; margin:40px auto; padding:0 16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#1a1a1a;">
    
    <div style="background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; padding:28px;">
      
      <h2 style="margin:0 0 12px 0; font-size:18px; font-weight:600;">
        Reset your password
      </h2>

      <p style="margin:0 0 16px 0; font-size:14px; line-height:1.6; color:#4b5563;">
        We received a request to reset your password for your <strong>CockpitOS</strong> account.
      </p>

      <div style="margin:24px 0;">
        <a href="${resetLink}" style="
          display:inline-block;
          padding:12px 24px;
          background-color:#111827;
          color:#ffffff;
          text-decoration:none;
          border-radius:8px;
          font-weight:500;
          font-size:14px;
        ">
          Reset Password
        </a>
      </div>

      <p style="margin:0 0 16px 0; font-size:12px; line-height:1.6; color:#6b7280;">
        Or copy and paste this link into your browser:<br>
        <a href="${resetLink}" style="color:#2563eb; text-decoration:underline; word-break:break-all;">${resetLink}</a>
      </p>

      <div style="margin-top:24px; padding-top:24px; border-top:1px solid #e5e7eb;">
        <p style="margin:0 0 8px 0; font-size:12px; font-weight:600; color:#4b5563;">
          Security Notice:
        </p>
        <ul style="margin:0; padding-left:16px; font-size:12px; color:#6b7280; line-height:1.5;">
          <li>This link will expire in 1 hour.</li>
          <li>If you didn't request this, you can safely ignore this email.</li>
          <li>Never share this link with anyone.</li>
        </ul>
      </div>

    </div>

    <p style="margin:16px 4px 0 4px; font-size:11px; color:#9ca3af;">
      © ${new Date().getFullYear()} CockpitOS. By Ripun Basumatary. All rights reserved.
    </p>

  </div>
</div>
`;

    await this.sendMail(to, subject, html);
  }
}
