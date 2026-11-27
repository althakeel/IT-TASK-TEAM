import mongoose from "mongoose";
import type { AppNotification } from "../shared/types";
import { sendNotificationEmail, type EmailDetail } from "./mail";
import { emitUser } from "./realtime";
import { BoardModel, CardModel, ListModel, NotificationModel, UserModel } from "./models";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" -> "27 Nov 2026, 3:44 PM" (no timezone shift; values are stored as the user entered them). */
function formatTimeline(due: string): string {
  const [year, month, day] = due.slice(0, 10).split("-").map(Number);
  const base = `${day} ${MONTHS[month - 1] || ""} ${year}`;
  if (due.length <= 10) return base;
  const hour = Number(due.slice(11, 13));
  const minute = due.slice(14, 16);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${base}, ${hour % 12 || 12}:${minute} ${suffix}`;
}

function formatMinutesLong(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

const HANDOFF_STATUS: Record<string, string> = {
  pending_accept: "Waiting for the member to approve and set a timeline",
  accepted: "In progress",
  submitted: "Submitted — waiting for review and approval",
  approved: "Approved",
};

/** Full card context for notification emails: board, list, giver, recipients, timeline, progress. */
async function cardEmailContext(cardId: string): Promise<{ boardTitle: string; details: EmailDetail[] } | null> {
  try {
    if (!mongoose.isValidObjectId(cardId)) return null;
    const card = await CardModel.findById(cardId).select("title listId boardId dueDate assigneeIds checklist links timeLogs handoff");
    if (!card) return null;
    const [board, list, people] = await Promise.all([
      BoardModel.findById(card.boardId).select("title"),
      ListModel.findById(card.listId).select("title"),
      UserModel.find({ _id: { $in: card.assigneeIds } }).select("name email"),
    ]);
    const assignees = people.map((person) => person.name || person.email).join(", ");
    const details: EmailDetail[] = [
      { label: "Task", value: card.title },
      { label: "List", value: list?.title || "—" },
    ];
    if (card.handoff) {
      details.push({ label: "Given by", value: card.handoff.fromUserName || "Member" });
      details.push({ label: "Given to", value: assignees || "Not assigned" });
      details.push({ label: "Status", value: HANDOFF_STATUS[card.handoff.status] || card.handoff.status });
    } else {
      details.push({ label: "Assigned to", value: assignees || "Nobody yet" });
    }
    details.push({ label: "Timeline", value: card.dueDate ? formatTimeline(card.dueDate) : "Not set" });
    const appeal = card.handoff?.appeal;
    if (appeal && appeal.status === "pending") {
      details.push({
        label: "Timeline appeal",
        value: `Requested ${formatTimeline(appeal.requestedDueDate)}${appeal.reason ? ` — ${appeal.reason}` : ""}`,
      });
    }
    const checklist = card.checklist || [];
    if (checklist.length > 0) {
      details.push({ label: "Checklist", value: `${checklist.filter((item) => item.done).length} of ${checklist.length} done` });
    }
    const minutes = (card.timeLogs || []).reduce((sum, entry) => sum + (Number(entry.minutes) || 0), 0);
    if (minutes > 0) details.push({ label: "Time logged", value: formatMinutesLong(minutes) });
    const links = card.links || [];
    if (links.length > 0) {
      details.push({ label: "Reference", value: links.map((link) => `${link.title}: ${link.url}`).join(" · ") });
    }
    return { boardTitle: board?.title || "", details };
  } catch (error) {
    console.error("Could not build notification details.", error instanceof Error ? error.message : error);
    return null;
  }
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date().toISOString();
}

export async function notifyUsers(input: {
  recipientIds: string[];
  actorId: string;
  title: string;
  body: string;
  boardId?: string | null;
  cardId?: string | null;
}): Promise<void> {
  const recipientIds = [...new Set(input.recipientIds.map(String))].filter((id) => id && id !== String(input.actorId));
  if (recipientIds.length === 0) return;
  const docs = await NotificationModel.insertMany(
    recipientIds.map((userId) => ({
      userId,
      title: input.title,
      body: input.body,
      boardId: input.boardId || null,
      cardId: input.cardId || null,
      read: false,
    })),
  );
  const context = input.cardId ? await cardEmailContext(input.cardId) : null;
  const users = await UserModel.find({ _id: { $in: recipientIds } }).select("email name");
  const byId = new Map(users.map((user) => [String(user._id), user]));
  await Promise.all(
    docs.map(async (doc) => {
      const notification: AppNotification = {
        id: String(doc._id),
        title: doc.title,
        body: doc.body,
        boardId: doc.boardId ? String(doc.boardId) : null,
        cardId: doc.cardId ? String(doc.cardId) : null,
        read: false,
        createdAt: iso(doc.get("createdAt")),
      };
      emitUser(String(doc.userId), "notification", notification);
      const person = byId.get(String(doc.userId));
      if (person?.email) {
        await sendNotificationEmail({
          to: person.email,
          title: notification.title,
          body: notification.body,
          boardId: notification.boardId,
          cardId: notification.cardId,
          boardTitle: context?.boardTitle,
          details: context?.details,
        });
      }
      await postWebhook({
        event: "notification.created",
        notification,
        user: person ? { id: String(person._id), email: person.email, name: person.name } : { id: String(doc.userId) },
      });
    }),
  );
}

async function postWebhook(payload: unknown): Promise<void> {
  const url = process.env.NOTIFICATION_WEBHOOK_URL?.trim();
  if (!url) return;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = process.env.NOTIFICATION_WEBHOOK_SECRET?.trim();
  if (secret) headers["X-Webhook-Secret"] = secret;
  try {
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
    if (!response.ok) console.error(`Notification webhook returned ${response.status}.`);
  } catch (error) {
    console.error("Notification webhook failed.", error instanceof Error ? error.message : error);
  }
}
