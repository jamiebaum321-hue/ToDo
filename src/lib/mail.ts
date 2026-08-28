import { createTransport } from "nodemailer";

/**
 * Sending email.
 *
 * Three transports, picked from whatever is configured — Resend if there is an
 * API key, SMTP if there are host credentials, and otherwise the console. The
 * console transport is not a stub to be replaced later: it means a developer
 * can run the whole sign-up flow with no mail account by copying the link out
 * of their terminal, and it means a missing key in production is loud rather
 * than a silent no-op.
 */

export type MailTransport = "resend" | "smtp" | "console";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export function mailTransport(): MailTransport {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST) return "smtp";
  return "console";
}

export function mailFrom(): string {
  return process.env.MAIL_FROM || "ToDo <onboarding@resend.dev>";
}

export function appUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** True when mail can actually leave the building. */
export function mailConfigured(): boolean {
  return mailTransport() !== "console";
}

async function sendViaResend(message: MailMessage) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: mailFrom(),
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend rejected the message (${res.status}): ${detail.slice(0, 300)}`);
  }
}

async function sendViaSmtp(message: MailMessage) {
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transporter = createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; 587 upgrades with STARTTLS.
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  await transporter.sendMail({ from: mailFrom(), ...message });
}

export async function sendMail(message: MailMessage): Promise<{ transport: MailTransport }> {
  const transport = mailTransport();

  switch (transport) {
    case "resend":
      await sendViaResend(message);
      break;
    case "smtp":
      await sendViaSmtp(message);
      break;
    case "console":
      // Printed rather than swallowed: without this the flow appears to work
      // while nothing is ever delivered, which is the worst failure mode.
      console.warn(
        [
          "",
          "─".repeat(72),
          "  No mail transport configured — printing instead of sending.",
          "  Set RESEND_API_KEY, or SMTP_HOST and friends.",
          "─".repeat(72),
          `  To:      ${message.to}`,
          `  Subject: ${message.subject}`,
          "",
          message.text,
          "─".repeat(72),
          "",
        ].join("\n"),
      );
      break;
  }

  return { transport };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const CREAM = "#F5EFE3";
const PAPER = "#FFFCF6";
const INK = "#14140F";
const MUTED = "#7A7468";

/** One shell for every message, so they all look like they came from the app. */
function layout(opts: { heading: string; body: string; cta?: { label: string; url: string }; footer?: string }) {
  const logo = `${appUrl()}/brand/mark-256.png`;
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:${CREAM};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${PAPER};border-radius:18px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <tr><td align="center" style="padding-bottom:20px;">
          <img src="${logo}" width="72" height="72" alt="ToDo" style="display:block;border-radius:50%;" />
        </td></tr>
        <tr><td style="font-size:21px;font-weight:800;color:${INK};letter-spacing:-0.3px;padding-bottom:12px;">
          ${opts.heading}
        </td></tr>
        <tr><td style="font-size:15px;line-height:1.6;color:${INK};padding-bottom:24px;">
          ${opts.body}
        </td></tr>
        ${
          opts.cta
            ? `<tr><td style="padding-bottom:22px;">
                 <a href="${opts.cta.url}" style="display:block;background:${INK};color:${CREAM};text-decoration:none;text-align:center;padding:14px 20px;border-radius:14px;font-size:15px;font-weight:800;">${opts.cta.label}</a>
               </td></tr>
               <tr><td style="font-size:12px;line-height:1.6;color:${MUTED};padding-bottom:20px;word-break:break-all;">
                 Or paste this into your browser:<br/>${opts.cta.url}
               </td></tr>`
            : ""
        }
        <tr><td style="border-top:1px solid rgba(20,20,15,.1);padding-top:18px;font-size:12px;line-height:1.6;color:${MUTED};">
          ${opts.footer ?? "You are receiving this because someone used this address to sign in to ToDo."}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function verificationEmail(url: string, name?: string | null): MailMessage & { to: string } {
  const hello = name ? `Hi ${name},` : "Hi,";
  return {
    to: "",
    subject: "Confirm your email for ToDo",
    html: layout({
      heading: "Confirm your email",
      body: `${hello}<br/><br/>Confirm this address and your ToDo is ready. The link works once and expires in 24 hours.`,
      cta: { label: "Confirm my email", url },
      footer: "If you did not create a ToDo account, ignore this — nothing was set up.",
    }),
    text: `${hello}\n\nConfirm your email for ToDo:\n${url}\n\nThe link works once and expires in 24 hours.\nIf you did not create an account, ignore this.`,
  };
}

export function passwordResetEmail(url: string, name?: string | null): MailMessage & { to: string } {
  const hello = name ? `Hi ${name},` : "Hi,";
  return {
    to: "",
    subject: "Reset your ToDo password",
    html: layout({
      heading: "Reset your password",
      body: `${hello}<br/><br/>Use the link below to choose a new password. It works once and expires in one hour. Signing in again everywhere else will be required afterwards.`,
      cta: { label: "Choose a new password", url },
      footer: "If you did not ask for this, ignore it — your password has not changed.",
    }),
    text: `${hello}\n\nReset your ToDo password:\n${url}\n\nThe link works once and expires in one hour.\nIf you did not ask for this, ignore it — your password has not changed.`,
  };
}

export function changeEmailEmail(url: string, newAddress: string): MailMessage & { to: string } {
  return {
    to: "",
    subject: "Confirm your new email for ToDo",
    html: layout({
      heading: "Confirm your new address",
      body: `Confirm that <strong>${newAddress}</strong> should become the address you sign in with. The link works once and expires in 24 hours.`,
      cta: { label: "Confirm the change", url },
      footer: "If you did not ask to change your email, ignore this — nothing has changed.",
    }),
    text: `Confirm ${newAddress} as your new ToDo sign-in address:\n${url}\n\nThe link works once and expires in 24 hours.`,
  };
}

export function welcomeEmail(name?: string | null): MailMessage & { to: string } {
  const hello = name ? `Welcome, ${name}.` : "Welcome.";
  return {
    to: "",
    subject: "Your ToDo is ready",
    html: layout({
      heading: hello,
      body: `Your list is empty, which is the point — you never fill it in yourself.<br/><br/>Connect Claude or ChatGPT and it will sweep your mail, calendar and chat each morning, sort what needs you into four buckets, and put each one a tap from done.`,
      cta: { label: "Connect your assistant", url: `${appUrl()}/connect` },
    }),
    text: `${hello}\n\nConnect Claude or ChatGPT to start filling your list:\n${appUrl()}/connect`,
  };
}
