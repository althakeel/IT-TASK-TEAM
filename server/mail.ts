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

export async function sendInviteEmail(input: {
  to: string;
  workspaceName: string;
  inviterName: string;
  token: string;
}): Promise<boolean> {
  const url = `${appOrigin()}/invite/${input.token}`;
  const workspace = escapeHtml(input.workspaceName);
  const inviter = escapeHtml(input.inviterName);
  const href = escapeHtml(url);
  return sendEmail({
    to: input.to,
    subject: `Join ${input.workspaceName} on Boards`,
    text: `${input.inviterName} invited you to ${input.workspaceName} on Boards. Sign in with this email and open ${url}`,
    html: `<p>${inviter} invited you to <strong>${workspace}</strong> on Boards.</p>
<p>Sign in with this email address, then open the invite:</p>
<p><a href="${href}">${href}</a></p>`,
  });
}

export async function sendNotificationEmail(input: {
  to: string;
  title: string;
  body: string;
  boardId?: string | null;
  cardId?: string | null;
}): Promise<boolean> {
  const path = input.boardId ? (input.cardId ? `/b/${input.boardId}?card=${input.cardId}` : `/b/${input.boardId}`) : "/home";
  const url = `${appOrigin()}${path}`;
  const href = escapeHtml(url);
  return sendEmail({
    to: input.to,
    subject: input.title,
    text: `${input.body}\n\nOpen it: ${url}`,
    html: `<p>${escapeHtml(input.body)}</p><p><a href="${href}">Open in Boards</a></p>`,
  });
}
