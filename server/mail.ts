import { Resend } from "resend";

export function mailReady(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function appOrigin(): string {
  return (process.env.CLIENT_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function sendEmail(input: { to: string; subject: string; text: string; html: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    console.error("Resend is not configured. Add RESEND_API_KEY to .env.local.");
    return false;
  }
  const from = process.env.RESEND_FROM?.trim() || "Boards <onboarding@resend.dev>";
  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  if (error) {
    console.error("Resend email failed.", error.message);
    return false;
  }
  return true;
}

export type EmailDetail = { label: string; value: string };

function detailsTable(rows: EmailDetail[]): string {
  if (rows.length === 0) return "";
  const body = rows
    .map(
      (row) =>
        `<tr><td style="padding:10px 12px;font-size:11px;font-weight:700;color:#626f86;text-transform:uppercase;letter-spacing:0.5px;width:120px;vertical-align:top;border-bottom:1px solid #ebecf0;">${escapeHtml(row.label)}</td><td style="padding:10px 12px;font-size:14px;line-height:1.5;color:#172b4d;vertical-align:top;border-bottom:1px solid #ebecf0;">${escapeHtml(row.value)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;border:1px solid #dfe1e6;border-radius:8px;border-collapse:separate;overflow:hidden;">${body}</table>`;
}

function renderEmailLayout(input: {
  eyebrow: string;
  heading: string;
  bodyHtml: string;
  detailsHtml?: string;
  footer?: string;
  ctaLabel: string;
  ctaUrl: string;
}): string {
  const href = escapeHtml(input.ctaUrl);
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#172b4d;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #dfe1e6;box-shadow:0 4px 16px rgba(9,30,66,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg,#0c66e4 0%,#172b4d 100%);padding:20px 28px;">
                <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#cce0ff;">${escapeHtml(input.eyebrow)}</p>
                <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#ffffff;">Althakeel Boards</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 12px;font-size:19px;line-height:1.35;font-weight:700;color:#172b4d;">${escapeHtml(input.heading)}</h1>
                <div style="font-size:15px;line-height:1.6;color:#44546f;">${input.bodyHtml}</div>
                ${input.detailsHtml ?? ""}
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:24px;">
                  <tr>
                    <td style="border-radius:8px;background-color:#0c66e4;">
                      <a href="${href}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(input.ctaLabel)}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background-color:#f7f8f9;border-top:1px solid #ebecf0;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#626f86;">${input.footer ? `${escapeHtml(input.footer)}<br /><br />` : ""}
                  If the button doesn’t work, open this link:<br />
                  <a href="${href}" style="color:#0c66e4;word-break:break-all;">${href}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendInviteEmail(input: {
  to: string;
  workspaceName: string;
  inviterName: string;
  token: string;
}): Promise<boolean> {
  const url = `${appOrigin()}/invite/${input.token}`;
  const workspace = escapeHtml(input.workspaceName);
  const inviter = escapeHtml(input.inviterName);
  return sendEmail({
    to: input.to,
    subject: `Join ${input.workspaceName} on Boards`,
    text: `${input.inviterName} invited you to ${input.workspaceName} on Boards. Sign in with this email and open ${url}`,
    html: renderEmailLayout({
      eyebrow: "Workspace Invitation",
      heading: `You’re invited to ${input.workspaceName}`,
      bodyHtml: `<p style="margin:0 0 10px;"><strong>${inviter}</strong> invited you to collaborate in <strong>${workspace}</strong> on Althakeel Boards.</p><p style="margin:0;">Sign in with this email address and accept your invite to get started.</p>`,
      ctaLabel: "Accept Invite",
      ctaUrl: url,
    }),
  });
}

export async function sendNotificationEmail(input: {
  to: string;
  title: string;
  body: string;
  boardId?: string | null;
  cardId?: string | null;
  boardTitle?: string;
  details?: EmailDetail[];
}): Promise<boolean> {
  const path = input.boardId ? (input.cardId ? `/b/${input.boardId}?card=${input.cardId}` : `/b/${input.boardId}`) : "/home";
  const url = `${appOrigin()}${path}`;
  const rows: EmailDetail[] = [
    ...(input.boardTitle ? [{ label: "Board", value: input.boardTitle }] : []),
    ...(input.details ?? []),
  ];
  const detailLines = rows.map((row) => `${row.label}: ${row.value}`).join("\n");
  return sendEmail({
    to: input.to,
    subject: input.title,
    text: `${input.body}${detailLines ? `\n\n${detailLines}` : ""}\n\nOpen the task: ${url}`,
    html: renderEmailLayout({
      eyebrow: "Task Notification",
      heading: input.title,
      bodyHtml: `<p style="margin:0;">${escapeHtml(input.body)}</p>`,
      detailsHtml: detailsTable(rows),
      footer: "You are receiving this because you are assigned to, created, or manage this task on Althakeel Boards.",
      ctaLabel: "Open task in Boards",
      ctaUrl: url,
    }),
  });
}
