import sgMail from "@sendgrid/mail";
import sgClient from "@sendgrid/client";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
  sgClient.setApiKey(SENDGRID_API_KEY);
}

export interface SenderIdentity {
  nickname: string;
  from_email: string;
  from_name: string;
  reply_to: string;
  reply_to_name: string;
  address: string;
  city: string;
  country: string;
}

export async function createSenderVerification(sender: SenderIdentity): Promise<{ id: number; verified: boolean }> {
  const [response, body] = await sgClient.request({
    url: "/v3/verified_senders",
    method: "POST",
    body: {
      nickname: sender.nickname,
      from_email: sender.from_email.toLowerCase(),
      from_name: sender.from_name,
      reply_to: sender.reply_to.toLowerCase(),
      reply_to_name: sender.reply_to_name,
      address: sender.address,
      city: sender.city,
      country: sender.country,
    },
  });
  const result = body as any;
  const status = await checkSenderVerificationStatus(sender.from_email);
  return { id: result.id, verified: status.verified };
}

export async function checkSenderVerificationStatus(email: string): Promise<{ verified: boolean; id?: number; from_email?: string }> {
  const normalizedEmail = email.toLowerCase().trim();
  const [response, body] = await sgClient.request({
    url: "/v3/verified_senders",
    method: "GET",
  });
  const results = (body as any).results || [];
  const sender = results.find((s: any) => s.from_email?.toLowerCase().trim() === normalizedEmail);
  if (!sender) {
    return { verified: false };
  }
  return { verified: sender.verified, id: sender.id, from_email: sender.from_email };
}

export async function checkSenderVerificationById(senderId: number): Promise<{ verified: boolean; id?: number; from_email?: string }> {
  const [response, body] = await sgClient.request({
    url: "/v3/verified_senders",
    method: "GET",
  });
  const results = (body as any).results || [];
  const sender = results.find((s: any) => s.id === senderId);
  if (!sender) {
    return { verified: false };
  }
  return { verified: sender.verified, id: sender.id, from_email: sender.from_email };
}

export async function getAllVerifiedSenders(): Promise<Array<{ id: number; from_email: string; verified: boolean; nickname: string }>> {
  const [, body] = await sgClient.request({
    url: "/v3/verified_senders",
    method: "GET",
  });
  const results = (body as any).results || [];
  return results.map((s: any) => ({
    id: s.id,
    from_email: s.from_email,
    verified: !!s.verified,
    nickname: s.nickname || "",
  }));
}

export async function updateSenderVerification(senderId: number, sender: SenderIdentity): Promise<{ id: number; verified: boolean }> {
  const [response, body] = await sgClient.request({
    url: `/v3/verified_senders/${senderId}`,
    method: "PATCH",
    body: {
      nickname: sender.nickname,
      from_email: sender.from_email.toLowerCase(),
      from_name: sender.from_name,
      reply_to: sender.reply_to.toLowerCase(),
      reply_to_name: sender.reply_to_name,
      address: sender.address,
      city: sender.city,
      country: sender.country,
    },
  });
  const result = body as any;
  const status = await checkSenderVerificationStatus(sender.from_email);
  return { id: result.id || senderId, verified: status.verified };
}

export async function deleteSender(senderId: number): Promise<void> {
  await sgClient.request({
    url: `/v3/verified_senders/${senderId}`,
    method: "DELETE",
  });
}

export async function resendVerificationEmail(senderId: number): Promise<void> {
  await sgClient.request({
    url: `/v3/verified_senders/resend/${senderId}`,
    method: "POST",
  });
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<h[1-6][^>]*>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function sendEmailViaSendGrid(options: {
  to: string;
  from: string;
  fromName?: string;
  replyTo?: string;
  subject: string;
  html: string;
  bcc?: string;
}): Promise<void> {
  const plainText = htmlToPlainText(options.html);
  const replyToEmail = options.replyTo || options.from;

  const msg: any = {
    to: options.to,
    from: {
      email: options.from,
      name: options.fromName || "FASTSIGNS Installation Team",
    },
    subject: options.subject,
    html: options.html,
    text: plainText,
    categories: ["transactional", "installation-notification"],
    headers: {
      "List-Unsubscribe": `<mailto:${replyToEmail}?subject=Unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "X-Entity-Ref-ID": `installiq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      "Precedence": "bulk",
    },
    mailSettings: {
      bypassListManagement: {
        enable: false,
      },
    },
    trackingSettings: {
      clickTracking: {
        enable: false,
        enableText: false,
      },
      openTracking: {
        enable: false,
      },
      subscriptionTracking: {
        enable: false,
      },
    },
  };
  if (options.replyTo) {
    msg.replyTo = { email: options.replyTo, name: options.fromName || options.replyTo };
  }
  if (options.bcc) {
    msg.bcc = options.bcc;
  }
  await sgMail.send(msg);
}

export function isSendGridConfigured(): boolean {
  return !!SENDGRID_API_KEY;
}
