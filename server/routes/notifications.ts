import { Router } from "express";
import type { AppNotification } from "../../shared/types";
import { requireUser } from "../access";
import { asyncHandler, param } from "../http";
import { NotificationModel, type NotificationDoc } from "../models";

export const notificationRouter = Router();

function notificationJson(doc: NotificationDoc): AppNotification {
  const created = doc.get("createdAt");
  return {
    id: String(doc._id),
    title: doc.title,
    body: doc.body,
    boardId: doc.boardId ? String(doc.boardId) : null,
    cardId: doc.cardId ? String(doc.cardId) : null,
    read: Boolean(doc.read),
    createdAt: created instanceof Date ? created.toISOString() : new Date().toISOString(),
  };
}

notificationRouter.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const docs = await NotificationModel.find({ userId: user._id }).sort({ createdAt: -1 }).limit(40);
    res.json(docs.map((doc) => notificationJson(doc)));
  }),
);

notificationRouter.post(
  "/notifications/read-all",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    await NotificationModel.updateMany({ userId: user._id, read: false }, { read: true });
    res.json({ ok: true });
  }),
);

notificationRouter.post(
  "/notifications/:notificationId/read",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const doc = await NotificationModel.findOne({ _id: param(req.params.notificationId), userId: user._id });
    if (!doc) {
      res.json({ ok: true });
      return;
    }
    doc.read = true;
    await doc.save();
    res.json(notificationJson(doc));
  }),
);
