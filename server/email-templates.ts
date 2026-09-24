import nodemailer from "nodemailer";
import type { EmailSignature } from "@shared/schema";

export const EMAIL_TYPE_LABELS: Record<string, string> = {
  schedule_confirmation: "Schedule Confirmation",
  reschedule_notification: "Reschedule Notification",
  on_my_way: "On My Way",
  booking_assignment: "Booking Assignment",
  issue_reported: "Issue Reported",
  welcome_email: "Welcome Email",
  password_reset: "Password Reset by Admin",
};

export const EMAIL_TYPE_DESCRIPTIONS: Record<string, string> = {
  schedule_confirmation: "Sent to customers when their installation is scheduled. Variables: {{customerName}}, {{date}}, {{time}}, {{address}}",
  reschedule_notification: "Sent to customers when their installation is rescheduled. Variables: {{customerName}}, {{previousDate}}, {{previousTime}}, {{newDate}}, {{newTime}}, {{address}}",
  on_my_way: "Sent to customers when the installer is on their way. Variables: {{customerName}}, {{installerName}}, {{jobTitle}}, {{date}}, {{time}}, {{address}}",
  booking_assignment: "Sent to team members when assigned to a job. Variables: {{userName}}, {{jobTitle}}, {{date}}, {{time}}, {{address}}",
  issue_reported: "Sent to the team when an issue is flagged on an installation. Variables: {{eventTitle}}, {{date}}, {{customerName}}, {{address}}",
  welcome_email: "Sent to new users when their account is created. Variables: {{name}}, {{username}}, {{email}}, {{tempPassword}}, {{loginUrl}}",
  password_reset: "Sent to users when an admin resets their password. Variables: {{name}}, {{username}}, {{tempPassword}}, {{loginUrl}}",
};

export const DEFAULT_EMAIL_SUBJECTS: Record<string, string> = {
  schedule_confirmation: "Installation Scheduled",
  reschedule_notification: "Installation Rescheduled",
  on_my_way: "Installer On The Way!",
  booking_assignment: "Booking Assignment",
  issue_reported: "Installation Issue Reported",
  welcome_email: "Welcome to InstalliQ.ai",
  password_reset: "Password Reset",
};

export const DEFAULT_EMAIL_BODIES: Record<string, string> = {
  schedule_confirmation: `<p>Dear {{customerName}},</p>
<p>Your signage installation has been scheduled. Here are the details:</p>
<ul>
<li><strong>Date:</strong> {{date}}</li>
<li><strong>Time:</strong> {{time}}</li>
<li><strong>Location:</strong> {{address}}</li>
</ul>
<p>Our professional installation team will arrive at the scheduled time. Please ensure access to the installation area is available.</p>
<p>If you need to make any changes, please don't hesitate to contact us.</p>`,

  reschedule_notification: `<p>Dear {{customerName}},</p>
<p>Your signage installation has been rescheduled. Please see the updated details below:</p>
<p><strong>Previous Schedule:</strong></p>
<ul>
<li>Date: {{previousDate}}</li>
<li>Time: {{previousTime}}</li>
</ul>
<p><strong>New Schedule:</strong></p>
<ul>
<li>Date: {{newDate}}</li>
<li>Time: {{newTime}}</li>
<li>Location: {{address}}</li>
</ul>
<p>We apologize for any inconvenience. Please contact us if the new time doesn't work for you.</p>`,

  on_my_way: `<p>Hello {{customerName}},</p>
<p>Great news! Your installer <strong>{{installerName}}</strong> is now on their way for your scheduled installation.</p>
<ul>
<li><strong>Job:</strong> {{jobTitle}}</li>
<li><strong>Date:</strong> {{date}}</li>
<li><strong>Time:</strong> {{time}}</li>
<li><strong>Location:</strong> {{address}}</li>
</ul>
<p>Please ensure the installation area is accessible. The installer will arrive shortly.</p>`,

  booking_assignment: `<p>Hello {{userName}},</p>
<p>You have been assigned to the following installation booking:</p>
<ul>
<li><strong>Job:</strong> {{jobTitle}}</li>
<li><strong>Date:</strong> {{date}}</li>
<li><strong>Time:</strong> {{time}}</li>
<li><strong>Location:</strong> {{address}}</li>
</ul>
<p>Please log in to InstalliQ.ai to view the full booking details, upload photos, and report any issues.</p>`,

  issue_reported: `<p>An issue has been reported for the following installation:</p>
<ul>
<li><strong>Event:</strong> {{eventTitle}}</li>
<li><strong>Date:</strong> {{date}}</li>
<li><strong>Customer:</strong> {{customerName}}</li>
<li><strong>Address:</strong> {{address}}</li>
</ul>
<p>Please review this installation as soon as possible.</p>`,

  welcome_email: `<p>Hello {{name}},</p>
<p>Your account has been created for the InstalliQ.ai project management system. Here are your login credentials:</p>
<ul>
<li><strong>Username:</strong> {{username}}</li>
<li><strong>Temporary Password:</strong> {{tempPassword}}</li>
</ul>
<p>You can log in at: <a href="{{loginUrl}}">{{loginUrl}}</a></p>
<p><strong>Important:</strong> Please change your password after your first login.</p>`,

  password_reset: `<p>Hello {{name}},</p>
<p>Your password has been reset by an administrator. Here are your updated login credentials:</p>
<ul>
<li><strong>Username:</strong> {{username}}</li>
<li><strong>New Temporary Password:</strong> {{tempPassword}}</li>
</ul>
<p>You can log in at: <a href="{{loginUrl}}">{{loginUrl}}</a></p>
<p><strong>Important:</strong> Please change your password immediately after logging in.</p>`,
};

function signatureBlock(signature?: EmailSignature | null): string {
  if (!signature || (!signature.companyName && !signature.address && !signature.phone && !signature.email)) {
    return "";
  }
  const parts: string[] = [];
  if (signature.companyName) parts.push(`<p style="margin: 0 0 2px; font-size: 13px; font-weight: 600; color: #44403c;">${signature.companyName}</p>`);
  if (signature.address) parts.push(`<p style="margin: 0 0 2px; font-size: 12px; color: #78716c;">${signature.address}</p>`);
  if (signature.phone) parts.push(`<p style="margin: 0 0 2px; font-size: 12px; color: #78716c;">${signature.phone}</p>`);
  if (signature.email) parts.push(`<p style="margin: 0 0 2px; font-size: 12px; color: #78716c;"><a href="mailto:${signature.email}" style="color: #ea580c; text-decoration: none;">${signature.email}</a></p>`);
  if (signature.website) parts.push(`<p style="margin: 0; font-size: 12px; color: #78716c;"><a href="${signature.website}" style="color: #ea580c; text-decoration: none;">${signature.website}</a></p>`);
  return `
    <div style="border-top: 1px solid #e7e5e4; margin-top: 24px; padding-top: 16px;">
      ${parts.join("\n")}
    </div>`;
}

export function replaceVariables(html: string, variables: Record<string, string>): string {
  let result = html;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || "");
  }
  return result;
}

export function buildCustomEmail(options: {
  subject: string;
  bodyHtml: string;
  signature?: EmailSignature | null;
}): string {
  const content = `
    <div style="font-size: 15px; color: #44403c; line-height: 1.6;">
      ${options.bodyHtml}
    </div>
    ${signatureBlock(options.signature)}
  `;
  return brandedWrapper(options.subject, content);
}

export interface ResolvedTemplate {
  subject: string;
  html: string;
  enabled: boolean;
}

export async function resolveAdminId(storage: any, userId: number): Promise<number> {
  const user = await storage.getUser(userId);
  if (!user) return userId;
  if (user.role === "admin" || user.role === "super_admin") return userId;
  return user.createdBy || userId;
}

export async function resolveEmailTemplate(
  storage: any,
  adminId: number,
  emailType: string,
  variables: Record<string, string>,
): Promise<ResolvedTemplate> {
  const customTemplate = await storage.getEmailTemplate(adminId, emailType);
  const signature = await storage.getEmailSignatureByAdminId(adminId);

  const enabled = customTemplate?.enabled ?? true;
  const subject = replaceVariables(
    customTemplate?.subject || DEFAULT_EMAIL_SUBJECTS[emailType] || "",
    variables,
  );
  const bodyHtml = replaceVariables(
    customTemplate?.bodyHtml || DEFAULT_EMAIL_BODIES[emailType] || "",
    variables,
  );

  const html = buildCustomEmail({ subject, bodyHtml, signature });
  return { subject, html, enabled };
}

export function createTransporter() {
  const host = process.env.SMTP_HOST || "smtp0001.neo.space";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const secure = port === 465;
  console.log(`Creating SMTP transporter: host=${host}, port=${port}, secure=${secure}, user=${process.env.SMTP_USER ? '***set***' : '***NOT SET***'}`);
  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    tls: {
      minVersion: "TLSv1.2",
    },
  });
}

export function getFromAddress() {
  return process.env.SMTP_FROM || process.env.SMTP_USER || "info@installiq.ai";
}

export function getAdminFromAddress(admin: { email?: string | null; name?: string | null; senderFromEmail?: string | null; senderVerified?: boolean | null; senderFirstName?: string | null; senderReplyTo?: string | null; pdfCompanyName?: string | null }) {
  const centralEmail = getFromAddress();
  // Use custom sender name → company name from branding → "InstalliQ" (never the admin account name)
  let displayName = admin.senderFirstName || admin.pdfCompanyName || "InstalliQ";
  if (displayName.includes("@")) {
    displayName = "InstalliQ";
  }
  return {
    email: centralEmail,
    name: displayName,
    replyTo: admin.senderReplyTo || admin.senderFromEmail || admin.email || centralEmail,
    useSendGrid: false,
  };
}

function brandedWrapper(title: string, content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f4; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f4; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #ea580c 0%, #f97316 100%); padding: 28px 32px; text-align: center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <div style="width: 44px; height: 44px; background-color: rgba(255,255,255,0.2); border-radius: 10px; display: inline-block; line-height: 44px; margin-bottom: 12px;">
                      <span style="font-size: 22px; color: #ffffff;">iQ</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">${title}</h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #f0f0ef; background-color: #fafaf9;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #78716c;">InstalliQ.ai</p>
                    <p style="margin: 0 0 4px; font-size: 12px; color: #a8a29e;">AI-Powered Installation Management</p>
                    <p style="margin: 0; font-size: 12px; color: #a8a29e;">
                      <a href="mailto:info@installiq.ai" style="color: #ea580c; text-decoration: none;">info@installiq.ai</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">
          <tr>
            <td align="center" style="padding: 20px;">
              <p style="margin: 0 0 6px; font-size: 11px; color: #a8a29e;">You are receiving this email because you are associated with a scheduled installation managed through InstalliQ.ai.</p>
              <p style="margin: 0 0 6px; font-size: 11px; color: #a8a29e;">To stop receiving these emails, reply with "Unsubscribe" in the subject line.</p>
              <p style="margin: 0; font-size: 11px; color: #a8a29e;">Powered by <span style="color: #ea580c; font-weight: 600;">InstalliQ.ai</span></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(text: string, url: string): string {
  return `
    <div style="text-align: center; margin: 28px 0;">
      <a href="${url}" style="display: inline-block; background: linear-gradient(135deg, #ea580c 0%, #f97316 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.2px;">
        ${text}
      </a>
    </div>`;
}

function credentialsCard(fields: { label: string; value: string; isCode?: boolean }[]): string {
  const rows = fields.map(f => {
    const val = f.isCode
      ? `<code style="background-color: #fff7ed; color: #ea580c; padding: 4px 10px; border-radius: 6px; font-size: 14px; font-family: 'Courier New', monospace; border: 1px solid #fed7aa;">${f.value}</code>`
      : `<span style="color: #1c1917;">${f.value}</span>`;
    return `<tr><td style="padding: 10px 0; border-bottom: 1px solid #f5f5f4;"><span style="color: #78716c; font-size: 13px;">${f.label}</span><br/>${val}</td></tr>`;
  }).join("");

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #fafaf9; border: 1px solid #f0f0ef; border-radius: 10px; margin: 20px 0;">
      <tr><td style="padding: 20px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      </td></tr>
    </table>`;
}

function infoRow(label: string, value: string): string {
  return `<p style="margin: 6px 0; font-size: 14px; color: #44403c;"><strong style="color: #78716c;">${label}:</strong> ${value}</p>`;
}

function alertBox(type: "warning" | "info", text: string): string {
  const colors = type === "warning"
    ? { bg: "#fff7ed", border: "#fed7aa", icon: "&#9888;", iconColor: "#ea580c" }
    : { bg: "#f0f9ff", border: "#bae6fd", icon: "&#8505;", iconColor: "#0284c7" };
  return `
    <div style="background-color: ${colors.bg}; border: 1px solid ${colors.border}; border-radius: 8px; padding: 14px 18px; margin: 16px 0;">
      <p style="margin: 0; font-size: 13px; color: #44403c;">
        <span style="color: ${colors.iconColor}; margin-right: 6px;">${colors.icon}</span>${text}
      </p>
    </div>`;
}

export const emailTemplates = {
  welcome(data: { name: string; username: string; email: string; phone?: string; tempPassword: string; loginUrl: string }) {
    const loginCredentials: { label: string; value: string; isCode?: boolean }[] = [
      { label: "Username", value: data.username },
      { label: "Email", value: data.email },
    ];
    if (data.phone) {
      loginCredentials.push({ label: "Phone", value: data.phone });
    }
    loginCredentials.push({ label: "Temporary Password", value: data.tempPassword, isCode: true });

    const content = `
      <p style="font-size: 16px; color: #1c1917; margin: 0 0 8px;">Hello ${data.name},</p>
      <p style="font-size: 15px; color: #44403c; line-height: 1.6;">
        Your account has been created for the <strong>InstalliQ.ai</strong> project management system. You can log in using your <strong>username</strong>, <strong>email</strong>${data.phone ? ', or <strong>phone number</strong>' : ''} along with the temporary password below.
      </p>
      ${credentialsCard(loginCredentials)}
      ${alertBox("warning", "<strong>Important:</strong> Please change your password after your first login.")}
      ${ctaButton("Log In to InstalliQ.ai", data.loginUrl)}
    `;
    return brandedWrapper("Welcome to InstalliQ.ai", content);
  },

  passwordResetByAdmin(data: { name: string; username: string; tempPassword: string; loginUrl: string }) {
    const content = `
      <p style="font-size: 16px; color: #1c1917; margin: 0 0 8px;">Hello ${data.name},</p>
      <p style="font-size: 15px; color: #44403c; line-height: 1.6;">
        Your password has been reset by an administrator. Please use the new credentials below to log in.
      </p>
      ${credentialsCard([
        { label: "Username", value: data.username },
        { label: "New Temporary Password", value: data.tempPassword, isCode: true },
      ])}
      ${alertBox("warning", "<strong>Important:</strong> Please change your password immediately after logging in.")}
      ${ctaButton("Log In to InstalliQ.ai", data.loginUrl)}
    `;
    return brandedWrapper("Password Reset", content);
  },

  passwordResetRequest(data: { name: string; resetUrl: string }) {
    const content = `
      <p style="font-size: 16px; color: #1c1917; margin: 0 0 8px;">Hello ${data.name},</p>
      <p style="font-size: 15px; color: #44403c; line-height: 1.6;">
        You requested to reset your password for your InstalliQ.ai account. Click the button below to set a new password.
      </p>
      ${ctaButton("Reset Your Password", data.resetUrl)}
      ${alertBox("info", "This link will expire in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email.")}
    `;
    return brandedWrapper("Password Reset Request", content);
  },

  passwordResetSuccess(data: { name: string }) {
    const content = `
      <p style="font-size: 16px; color: #1c1917; margin: 0 0 8px;">Hello ${data.name},</p>
      <p style="font-size: 15px; color: #44403c; line-height: 1.6;">
        Your password has been successfully reset. You can now log in with your new password.
      </p>
      ${alertBox("warning", "If you did not make this change, please contact us immediately at <strong>info@installiq.ai</strong>.")}
    `;
    return brandedWrapper("Password Updated", content);
  },

  projectReport(data: {
    projectLabel: string;
    createdAt?: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    address?: string;
    description?: string;
    tags?: string[];
    hasIssue?: boolean;
    issueDescription?: string;
    photoCount?: number;
  }) {
    const detailFields: { label: string; value: string }[] = [];
    if (data.createdAt) detailFields.push({ label: "Date Created", value: data.createdAt });
    if (data.customerName) detailFields.push({ label: "Customer", value: data.customerName });
    if (data.customerPhone) detailFields.push({ label: "Phone", value: data.customerPhone });
    if (data.customerEmail) detailFields.push({ label: "Email", value: data.customerEmail });
    if (data.address) detailFields.push({ label: "Address", value: data.address });
    if (data.tags && data.tags.length > 0) detailFields.push({ label: "Tags", value: data.tags.join(", ") });
    if (data.photoCount && data.photoCount > 0) detailFields.push({ label: "Photos", value: `${data.photoCount} photo${data.photoCount !== 1 ? "s" : ""}` });

    const content = `
      <p style="font-size: 15px; color: #44403c; line-height: 1.6;">
        Please find the attached project report for <strong>${data.projectLabel}</strong>.
      </p>
      ${detailFields.length > 0 ? credentialsCard(detailFields) : ""}
      ${data.description ? `
        <div style="background:#f9f6f3;border:1px solid #e7e5e4;border-radius:8px;padding:16px 20px;margin:16px 0;">
          <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#78716c;text-transform:uppercase;letter-spacing:0.05em;">Description</p>
          <p style="margin:0;font-size:14px;color:#44403c;line-height:1.6;white-space:pre-wrap;">${data.description}</p>
        </div>` : ""}
      ${data.hasIssue ? `
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin:16px 0;">
          <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#991b1b;text-transform:uppercase;letter-spacing:0.05em;">&#9888; Issue Reported</p>
          <p style="margin:0;font-size:14px;color:#44403c;line-height:1.6;">${data.issueDescription || "No description provided."}</p>
        </div>` : ""}
      ${alertBox("info", "A full PDF report with photos is attached to this email.")}
    `;
    return brandedWrapper("Project Report", content);
  },

  projectIssue(data: { reporterName: string; projectId: number; jobLabel: string; description: string; createdAt: string }) {
    const content = `
      <p style="font-size: 15px; color: #44403c; line-height: 1.6;">
        An issue has been reported by <strong>${data.reporterName}</strong> for the following project:
      </p>
      ${credentialsCard([
        { label: "Project ID", value: `#${data.projectId}` },
        { label: "Job Label", value: data.jobLabel || "Not specified" },
        { label: "Description", value: data.description || "No description" },
        { label: "Created", value: data.createdAt },
      ])}
      ${alertBox("warning", "Please review this project as soon as possible.")}
    `;
    return brandedWrapper("Issue Reported", content);
  },

  calendarIssue(data: { eventTitle: string; eventDate: string; customerName?: string; address?: string; workOrderNumber?: string; issueDescription: string }) {
    const content = `
      <p style="font-size: 15px; color: #44403c; line-height: 1.6;">
        An issue has been reported for the following installation:
      </p>
      ${credentialsCard([
        { label: "Event", value: data.eventTitle },
        { label: "Scheduled", value: data.eventDate },
        ...(data.customerName ? [{ label: "Customer", value: data.customerName }] : []),
        ...(data.address ? [{ label: "Address", value: data.address }] : []),
        ...(data.workOrderNumber ? [{ label: "Work Order", value: data.workOrderNumber }] : []),
      ])}
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 20px 24px; margin: 20px 0;">
        <p style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #991b1b;">Issue Description</p>
        <p style="margin: 0; font-size: 14px; color: #44403c; line-height: 1.6;">${data.issueDescription || "No description provided"}</p>
      </div>
    `;
    return brandedWrapper("Installation Issue Reported", content);
  },

  bookingAssignment(data: { userName: string; eventTitle: string; scheduledDate: string; scheduledTime: string; address?: string; workJobNumber?: string; description?: string; loginUrl: string }) {
    const content = `
      <p style="font-size: 16px; color: #1c1917; margin: 0 0 8px;">Hello ${data.userName},</p>
      <p style="font-size: 15px; color: #44403c; line-height: 1.6;">
        You have been assigned to the following installation booking:
      </p>
      ${credentialsCard([
        { label: "Job", value: data.eventTitle },
        ...(data.workJobNumber ? [{ label: "Work Job #", value: data.workJobNumber }] : []),
        { label: "Date", value: data.scheduledDate },
        { label: "Time", value: data.scheduledTime },
        ...(data.address ? [{ label: "Location", value: data.address }] : []),
        ...(data.description ? [{ label: "Details", value: data.description }] : []),
      ])}
      ${ctaButton("View in Calendar", data.loginUrl)}
      ${alertBox("info", "Log in to InstalliQ.ai to view the full booking details, upload photos, and report any issues.")}
    `;
    return brandedWrapper("Booking Assignment", content);
  },

  scheduleConfirmation(data: { customerName: string; scheduledDate: string; scheduledTime: string; address: string; confirmationUrl?: string; rescheduleUrl?: string }) {
    const content = `
      <p style="font-size: 16px; color: #1c1917; margin: 0 0 8px;">Dear ${data.customerName || "Valued Customer"},</p>
      <p style="font-size: 15px; color: #44403c; line-height: 1.6;">
        Your signage installation has been scheduled. Here are the details:
      </p>
      ${credentialsCard([
        { label: "Date", value: data.scheduledDate },
        { label: "Time", value: data.scheduledTime },
        { label: "Location", value: data.address || "See work order for address" },
      ])}
      ${data.confirmationUrl ? `
      <div style="text-align: center; margin: 28px 0;">
        <p style="font-size: 14px; color: #44403c; margin: 0 0 16px;">Please confirm or reschedule your installation appointment:</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
          <tr>
            <td style="padding: 0 8px;">
              <a href="${data.confirmationUrl}" style="display: inline-block; background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%); color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 700; letter-spacing: 0.3px;">
                Yes, I Confirm
              </a>
            </td>
            ${data.rescheduleUrl ? `
            <td style="padding: 0 8px;">
              <a href="${data.rescheduleUrl}" style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 700; letter-spacing: 0.3px;">
                Reschedule Install
              </a>
            </td>
            ` : ''}
          </tr>
        </table>
      </div>
      ` : ''}
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
        <p style="margin: 0 0 6px; font-size: 13px; font-weight: 600; color: #166534;">What to Expect</p>
        <p style="margin: 0; font-size: 14px; color: #44403c; line-height: 1.6;">
          Our professional installation team will arrive at the scheduled time. Please ensure access to the installation area is available.
        </p>
      </div>
      <p style="font-size: 14px; color: #78716c; line-height: 1.6;">
        Need help? Contact us at
        <a href="mailto:info@installiq.ai" style="color: #ea580c; text-decoration: none;">info@installiq.ai</a>.
      </p>
    `;
    return brandedWrapper("Installation Scheduled", content);
  },

  rescheduleNotification(data: {
    customerName: string;
    eventTitle: string;
    previousDate: string;
    previousTime: string;
    newDate: string;
    newTime: string;
    address: string;
    confirmationUrl?: string;
    rescheduleUrl?: string;
  }) {
    const content = `
      <p style="font-size: 16px; color: #1c1917; margin: 0 0 8px;">Dear ${data.customerName || "Valued Customer"},</p>
      <p style="font-size: 15px; color: #44403c; line-height: 1.6;">
        Your signage installation has been rescheduled. Please see the updated details below:
      </p>
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 16px 20px; margin: 16px 0;">
        <p style="margin: 0 0 6px; font-size: 13px; font-weight: 600; color: #991b1b;">Previous Schedule</p>
        ${infoRow("Date", data.previousDate)}
        ${infoRow("Time", data.previousTime)}
      </div>
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 16px 20px; margin: 16px 0;">
        <p style="margin: 0 0 6px; font-size: 13px; font-weight: 600; color: #166534;">New Schedule</p>
        ${infoRow("Date", data.newDate)}
        ${infoRow("Time", data.newTime)}
        ${data.address ? infoRow("Location", data.address) : ""}
      </div>
      ${data.confirmationUrl ? `
      <div style="text-align: center; margin: 28px 0;">
        <p style="font-size: 14px; color: #44403c; margin: 0 0 16px;">Please confirm or reschedule your updated installation appointment:</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
          <tr>
            <td style="padding: 0 8px;">
              <a href="${data.confirmationUrl}" style="display: inline-block; background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%); color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 700; letter-spacing: 0.3px;">
                Yes, I Confirm
              </a>
            </td>
            ${data.rescheduleUrl ? `
            <td style="padding: 0 8px;">
              <a href="${data.rescheduleUrl}" style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 700; letter-spacing: 0.3px;">
                Reschedule Again
              </a>
            </td>
            ` : ''}
          </tr>
        </table>
      </div>
      ` : ''}
      <p style="font-size: 14px; color: #78716c; line-height: 1.6;">
        Need help? Contact us at
        <a href="mailto:info@installiq.ai" style="color: #ea580c; text-decoration: none;">info@installiq.ai</a>.
      </p>
    `;
    return brandedWrapper("Installation Rescheduled", content);
  },

  onMyWay(data: { customerName: string; installerName: string; eventTitle: string; eventDate: string; eventTime?: string; eventAddress?: string }) {
    const content = `
      <p style="font-size: 16px; color: #1c1917; margin: 0 0 8px;">Hello ${data.customerName || "Valued Customer"},</p>
      <p style="font-size: 15px; color: #44403c; line-height: 1.6;">
        Great news! Your installer <strong>${data.installerName}</strong> is now on their way for your scheduled installation.
      </p>
      ${credentialsCard([
        { label: "Job", value: data.eventTitle },
        { label: "Date", value: data.eventDate },
        ...(data.eventTime ? [{ label: "Time", value: `${data.eventTime} ET` }] : []),
        ...(data.eventAddress ? [{ label: "Location", value: data.eventAddress }] : []),
      ])}
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
        <p style="margin: 0; font-size: 14px; color: #44403c; line-height: 1.6;">
          Please ensure the installation area is accessible. The installer will arrive shortly.
        </p>
      </div>
    `;
    return brandedWrapper("Installer On The Way!", content);
  },

  calendarInviteConfirmation(data: {
    customerName: string;
    eventTitle: string;
    scheduledDate: string;
    scheduledTime: string;
    address: string;
    workJobNumber: string;
  }): string {
    const content = `
      <h2 style="font-size: 20px; font-weight: 700; color: #1c1917; margin: 0 0 12px;">
        Booking Confirmed
      </h2>
      <p style="font-size: 15px; color: #44403c; line-height: 1.7; margin: 0 0 20px;">
        Hi ${data.customerName}, your installation booking has been confirmed and added to your calendar.
      </p>
      <div style="background-color: #fafaf9; border: 1px solid #e7e5e4; border-radius: 10px; padding: 20px; margin: 20px 0;">
        <p style="margin: 0 0 10px; font-size: 16px; font-weight: 700; color: #1c1917;">${data.eventTitle}</p>
        ${data.workJobNumber ? `<p style="margin: 0 0 8px; font-size: 13px; color: #78716c;">Job #${data.workJobNumber}</p>` : ''}
        <p style="margin: 0 0 6px; font-size: 14px; color: #44403c;">
          <strong>Date:</strong> ${data.scheduledDate}
        </p>
        ${data.scheduledTime ? `
        <p style="margin: 0 0 6px; font-size: 14px; color: #44403c;">
          <strong>Time:</strong> ${data.scheduledTime} (Eastern Time)
        </p>
        ` : ''}
        ${data.address ? `
        <p style="margin: 0; font-size: 14px; color: #44403c;">
          <strong>Location:</strong> ${data.address}
        </p>
        ` : ''}
      </div>
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
        <p style="margin: 0 0 6px; font-size: 13px; font-weight: 600; color: #166534;">Added to Your Calendar</p>
        <p style="margin: 0; font-size: 14px; color: #44403c; line-height: 1.6;">
          This event has been automatically added to your calendar. Check your Google Calendar, Outlook, or Apple Calendar to see it.
        </p>
      </div>
      <p style="font-size: 14px; color: #78716c; line-height: 1.6;">
        Need to make changes? Contact us at
        <a href="mailto:info@installiq.ai" style="color: #ea580c; text-decoration: none;">info@installiq.ai</a>.
      </p>
    `;
    return brandedWrapper("Booking Confirmed", content);
  },
};
