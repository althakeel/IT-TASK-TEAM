import type { AppNotification } from "../shared/types";
import { sendNotificationEmail } from "./mail";
import { emitUser } from "./realtime";
import { NotificationModel, UserModel } from "./models";

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
