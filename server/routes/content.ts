import { Router } from "express";
import mongoose from "mongoose";
import { isAdminEmail } from "../admin";
import { requireBoard, requireUser } from "../access";
import { assertAdmin, assertCanViewCard } from "../guards";
import { asyncHandler, bodyOf, clientMutationId, HttpError, param } from "../http";
import { assertImageKitUrl, imageKitClient } from "../imagekit";
import { CardModel, CommentModel, ListModel, UserModel } from "../models";
import { notifyUsers } from "../notify";
import { deletedDate } from "../trash";
import { cardJson, commentJson, listJson } from "../serialize";
import {
  activeMemberIds,
  assertPosition,
  cleanName,
  optionalText,
  parseAssignees,
  parseAttachment,
  parseAttachments,
  parseChecklist,
  parseDueDate,
  parseLabels,
} from "../validate";
import { nextCardPosition, nextListPosition, rebalanceCards, rebalanceLists } from "../order";
import { emitBoard, emitToUsers } from "../realtime";

export const contentRouter = Router();

contentRouter.post(
  "/boards/:boardId/lists",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const { board } = await requireBoard(String(user._id), param(req.params.boardId));
    if (board.closed) throw new HttpError(403, "This board is closed.");
    const body = bodyOf(req);
    const title = cleanName(body.title, "List title", 120);
    const list = await ListModel.create({
      boardId: board._id,
      title,
      position: await nextListPosition(board._id),
    });
    const dto = listJson(list, []);
    emitBoard(String(board._id), "list:created", { clientMutationId: clientMutationId(body), list: dto });
    res.status(201).json(dto);
  }),
);

contentRouter.patch(
  "/lists/:listId",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const list = await ListModel.findById(param(req.params.listId));
    if (!list || deletedDate(list)) throw new HttpError(404, "List not found.");
    const { board } = await requireBoard(String(user._id), String(list.boardId));
    if (board.closed) throw new HttpError(403, "This board is closed.");
    const body = bodyOf(req);
    let moved = false;
    if (body.title !== undefined) list.title = cleanName(body.title, "List title", 120);
    if (body.position !== undefined) {
      const position = assertPosition(body.position);
      moved = position !== list.position;
      list.position = position;
    }
    if (body.title === undefined && body.position === undefined) throw new HttpError(400, "Nothing to update.");
    await list.save();
    const reordered = moved ? await rebalanceLists(list.boardId) : null;
    const fresh = reordered ? await ListModel.findById(list._id) : list;
    if (!fresh) throw new HttpError(404, "List not found.");
    const summary = {
      id: String(fresh._id),
      boardId: String(fresh.boardId),
      title: fresh.title,
      position: fresh.position,
    };
    emitBoard(String(fresh.boardId), moved ? "list:moved" : "list:updated", {
      clientMutationId: clientMutationId(body),
      list: summary,
    });
    if (reordered) emitBoard(String(fresh.boardId), "lists:reordered", { lists: reordered });
    res.json(summary);
  }),
);

contentRouter.delete(
  "/lists/:listId",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const list = await ListModel.findById(param(req.params.listId));
    if (!list || deletedDate(list)) throw new HttpError(404, "List not found.");
    const { board } = await requireBoard(String(user._id), String(list.boardId));
    assertAdmin(user);
    if (board.closed) throw new HttpError(403, "This board is closed.");
    const boardId = String(list.boardId);
    const listId = String(list._id);
    list.set("deletedAt", new Date());
    await list.save();
    emitBoard(boardId, "list:deleted", { clientMutationId: clientMutationId(bodyOf(req)), listId });
    res.json({ ok: true });
  }),
);

contentRouter.post(
  "/lists/:listId/cards",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const list = await ListModel.findById(param(req.params.listId));
    if (!list || deletedDate(list)) throw new HttpError(404, "List not found.");
    const { board } = await requireBoard(String(user._id), String(list.boardId));
    if (board.closed) throw new HttpError(403, "This board is closed.");
    const body = bodyOf(req);
    const assigneeIds = isAdminEmail(user.email) ? [] : [user._id];
    const card = await CardModel.create({
      listId: list._id,
      boardId: list.boardId,
      title: cleanName(body.title, "Card title", 200),
      description: "",
      position: await nextCardPosition(list._id),
      dueDate: null,
      labels: [],
      assigneeIds,
      checklist: [],
      attachments: [],
      createdBy: user._id,
    });
    const dto = cardJson(card);
    emitToUsers(assigneeIds.map(String), "card:created", { clientMutationId: clientMutationId(body), card: dto }, true);
    res.status(201).json(dto);
  }),
);

contentRouter.patch(
  "/cards/:cardId",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const card = await CardModel.findById(param(req.params.cardId));
    if (!card || deletedDate(card)) throw new HttpError(404, "Card not found.");
    const { board } = await requireBoard(String(user._id), String(card.boardId));
    assertCanViewCard(user, card.assigneeIds);
    if (board.closed) throw new HttpError(403, "This board is closed.");
    const body = bodyOf(req);
    const beforeAssignees = card.assigneeIds.map((id) => String(id));
    const beforeTitle = card.title;
    const beforeDue = card.dueDate || null;
    const beforeListId = String(card.listId);
    let moved = false;
    let listChanged = false;

    if (body.title !== undefined) card.title = cleanName(body.title, "Card title", 200);
    if (body.description !== undefined) card.description = optionalText(body.description, 20000) ?? "";
    if (body.dueDate !== undefined) card.set("dueDate", parseDueDate(body.dueDate));
    if (body.labels !== undefined) card.set("labels", parseLabels(body.labels));
    if (body.checklist !== undefined) card.set("checklist", parseChecklist(body.checklist));
    if (body.assigneeIds !== undefined) {
      card.set("assigneeIds", await parseAssignees(body.assigneeIds, String(board.workspaceId)));
    }
    if (Array.isArray(body.mentionIds)) {
      const extra = await activeMemberIds(String(board.workspaceId), body.mentionIds.map(String));
      const merged = [...new Set([...card.assigneeIds.map((id) => String(id)), ...extra])];
      card.set(
        "assigneeIds",
        merged.map((id) => new mongoose.Types.ObjectId(id)),
      );
    }
    if (body.attachments !== undefined) card.set("attachments", parseAttachments(body.attachments));
    if (body.listId !== undefined) {
      if (typeof body.listId !== "string" || !mongoose.isValidObjectId(body.listId)) {
        throw new HttpError(400, "Invalid list.");
      }
      const list = await ListModel.findById(body.listId);
      if (!list || String(list.boardId) !== String(card.boardId)) {
        throw new HttpError(400, "List is not on this board.");
      }
      if (String(card.listId) !== String(list._id)) {
        moved = true;
        listChanged = true;
      }
      card.listId = list._id;
    }
    if (body.position !== undefined) {
      const position = assertPosition(body.position);
      if (position !== card.position) moved = true;
      card.position = position;
    }
    if (
      body.title === undefined &&
      body.description === undefined &&
      body.dueDate === undefined &&
      body.labels === undefined &&
      body.checklist === undefined &&
      body.assigneeIds === undefined &&
      body.attachments === undefined &&
      body.listId === undefined &&
      body.position === undefined
    ) {
      throw new HttpError(400, "Nothing to update.");
    }

    await card.save();
    const reordered = moved ? await rebalanceCards(card.listId) : null;
    const fresh = reordered ? await CardModel.findById(card._id) : card;
    if (!fresh) throw new HttpError(404, "Card not found.");
    const dto = cardJson(fresh);
    const afterAssignees = fresh.assigneeIds.map((id) => String(id));
    const removed = beforeAssignees.filter((id) => !afterAssignees.includes(id));
    const added = afterAssignees.filter((id) => !beforeAssignees.includes(id));
    if (removed.length > 0) {
      emitToUsers(removed, "card:deleted", {
        clientMutationId: clientMutationId(body),
        cardId: dto.id,
        listId: dto.listId,
      });
    }
    emitToUsers(afterAssignees, moved ? "card:moved" : "card:updated", { clientMutationId: clientMutationId(body), card: dto }, true);
    if (reordered) emitBoard(String(fresh.boardId), "cards:reordered", { cards: reordered });
    const boardId = String(fresh.boardId);
    if (added.length > 0) {
      await notifyUsers({
        recipientIds: added,
        actorId: String(user._id),
        title: "You were tagged",
        body: `${user.name} tagged you on “${fresh.title}”.`,
        boardId,
        cardId: dto.id,
      });
    }
    if (beforeTitle !== fresh.title) {
      await notifyUsers({
        recipientIds: beforeAssignees,
        actorId: String(user._id),
        title: "Task renamed",
        body: `“${beforeTitle}” is now “${fresh.title}”.`,
        boardId,
        cardId: dto.id,
      });
    }
    if (beforeDue !== (fresh.dueDate || null)) {
      await notifyUsers({
        recipientIds: beforeAssignees,
        actorId: String(user._id),
        title: "Due date changed",
        body: fresh.dueDate ? `“${fresh.title}” is due ${fresh.dueDate}.` : `The due date was cleared on “${fresh.title}”.`,
        boardId,
        cardId: dto.id,
      });
    }
    if (listChanged) {
      const list = await ListModel.findById(fresh.listId);
      await notifyUsers({
        recipientIds: beforeAssignees,
        actorId: String(user._id),
        title: "Task moved",
        body: `“${fresh.title}” moved to ${list?.title || "another list"}.`,
        boardId,
        cardId: dto.id,
      });
    }
    res.json(dto);
  }),
);

contentRouter.delete(
  "/cards/:cardId",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const card = await CardModel.findById(param(req.params.cardId));
    if (!card || deletedDate(card)) throw new HttpError(404, "Card not found.");
    const { board } = await requireBoard(String(user._id), String(card.boardId));
    assertAdmin(user);
    if (board.closed) throw new HttpError(403, "This board is closed.");
    const payload = {
      clientMutationId: clientMutationId(bodyOf(req)),
      cardId: String(card._id),
      listId: String(card.listId),
    };
    const recipients = card.assigneeIds.map((id) => String(id));
    card.set("deletedAt", new Date());
    await card.save();
    emitToUsers(recipients, "card:deleted", payload, true);
    res.json({ ok: true });
  }),
);

contentRouter.post(
  "/cards/:cardId/attachments",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const card = await CardModel.findById(param(req.params.cardId));
    if (!card || deletedDate(card)) throw new HttpError(404, "Card not found.");
    const { board } = await requireBoard(String(user._id), String(card.boardId));
    assertCanViewCard(user, card.assigneeIds);
    if (board.closed) throw new HttpError(403, "This board is closed.");
    if (card.attachments.length >= 20) throw new HttpError(400, "A card can have up to 20 attachments.");
    const body = bodyOf(req);
    card.attachments.push(parseAttachment(body));
    await card.save();
    const dto = cardJson(card);
    emitToUsers(dto.assigneeIds, "card:updated", { clientMutationId: clientMutationId(body), card: dto }, true);
    await notifyUsers({
      recipientIds: dto.assigneeIds,
      actorId: String(user._id),
      title: "New attachment",
      body: `${user.name} added “${dto.attachments.at(-1)?.name || "a file"}” to “${card.title}”.`,
      boardId: dto.boardId,
      cardId: dto.id,
    });
    res.status(201).json(dto);
  }),
);

contentRouter.delete(
  "/cards/:cardId/attachments/:attachmentId",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const card = await CardModel.findById(param(req.params.cardId));
    if (!card || deletedDate(card)) throw new HttpError(404, "Card not found.");
    const { board } = await requireBoard(String(user._id), String(card.boardId));
    assertAdmin(user);
    if (board.closed) throw new HttpError(403, "This board is closed.");
    const attachmentId = param(req.params.attachmentId);
    const current = card.attachments.find((file) => file.id === attachmentId);
    if (!current) throw new HttpError(404, "Attachment not found.");
    card.set(
      "attachments",
      card.attachments
        .filter((file) => file.id !== attachmentId)
        .map((file) => ({
          id: file.id,
          name: file.name,
          url: file.url,
          fileId: file.fileId,
          type: file.type,
          thumbnailUrl: file.thumbnailUrl,
        })),
    );
    await card.save();
    try {
      await imageKitClient().deleteFile(current.fileId);
    } catch {
      // The card no longer points at the file even if ImageKit cleanup fails.
    }
    const dto = cardJson(card);
    emitToUsers(dto.assigneeIds, "card:updated", { clientMutationId: clientMutationId(bodyOf(req)), card: dto }, true);
    res.json(dto);
  }),
);

contentRouter.get(
  "/cards/:cardId/comments",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const card = await CardModel.findById(param(req.params.cardId));
    if (!card || deletedDate(card)) throw new HttpError(404, "Card not found.");
    await requireBoard(String(user._id), String(card.boardId));
    assertCanViewCard(user, card.assigneeIds);
    const comments = await CommentModel.find({ cardId: card._id }).sort({ createdAt: 1 });
    const authors = await UserModel.find({ _id: { $in: comments.map((comment) => comment.authorId) } });
    const byId = new Map(authors.map((author) => [String(author._id), author]));
    res.json(comments.map((comment) => commentJson(comment, byId.get(String(comment.authorId)))));
  }),
);

contentRouter.post(
  "/cards/:cardId/comments",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const card = await CardModel.findById(param(req.params.cardId));
    if (!card || deletedDate(card)) throw new HttpError(404, "Card not found.");
    const { board } = await requireBoard(String(user._id), String(card.boardId));
    assertCanViewCard(user, card.assigneeIds);
    if (board.closed) throw new HttpError(403, "This board is closed.");
    const body = bodyOf(req);
    const channel = body.channel === "chat" ? "chat" : "comment";
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 4000) : "";
    const image = parseChatImage(body, channel);
    if (!text && !image.imageUrl) throw new HttpError(400, "Write a message or attach an image.");
    const comment = await CommentModel.create({
      cardId: card._id,
      boardId: card.boardId,
      authorId: user._id,
      text,
      channel,
      imageUrl: image.imageUrl,
      imageFileId: image.imageFileId,
      imageName: image.imageName,
    });
    const mentioned = Array.isArray(body.mentionIds)
      ? await activeMemberIds(String(board.workspaceId), body.mentionIds.map(String))
      : [];
    if (mentioned.length > 0) {
      const merged = [...new Set([...card.assigneeIds.map((id) => String(id)), ...mentioned])];
      card.set(
        "assigneeIds",
        merged.map((id) => new mongoose.Types.ObjectId(id)),
      );
      await card.save();
      const cardDto = cardJson(card);
      emitToUsers(cardDto.assigneeIds, "card:updated", { card: cardDto }, true);
    }
    const dto = commentJson(comment, user);
    const recipients = card.assigneeIds.map((id) => String(id));
    emitToUsers(recipients, "comment:created", { clientMutationId: clientMutationId(body), comment: dto }, true);
    const actorId = String(user._id);
    if (mentioned.length > 0) {
      await notifyUsers({
        recipientIds: mentioned,
        actorId,
        title: "You were tagged",
        body: `${user.name} tagged you on “${card.title}”.`,
        boardId: String(card.boardId),
        cardId: String(card._id),
      });
    }
    await notifyUsers({
      recipientIds: recipients.filter((id) => !mentioned.includes(id)),
      actorId,
      title: channel === "chat" ? "New chat" : "New comment",
      body: channel === "chat" ? `${user.name} sent a message on “${card.title}”.` : `${user.name} commented on “${card.title}”.`,
      boardId: String(card.boardId),
      cardId: String(card._id),
    });
    res.status(201).json(dto);
  }),
);

contentRouter.delete(
  "/comments/:commentId",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const comment = await CommentModel.findById(param(req.params.commentId));
    if (!comment) throw new HttpError(404, "Comment not found.");
    const { board } = await requireBoard(String(user._id), String(comment.boardId));
    assertAdmin(user);
    if (board.closed) throw new HttpError(403, "This board is closed.");
    const card = await CardModel.findById(comment.cardId);
    const payload = {
      clientMutationId: clientMutationId(bodyOf(req)),
      commentId: String(comment._id),
      cardId: String(comment.cardId),
    };
    await comment.deleteOne();
    emitToUsers(card ? card.assigneeIds.map((id) => String(id)) : [], "comment:deleted", payload, true);
    res.json({ ok: true });
  }),
);

function parseChatImage(body: Record<string, unknown>, channel: "comment" | "chat"): { imageUrl: string; imageFileId: string; imageName: string } {
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  if (!imageUrl) return { imageUrl: "", imageFileId: "", imageName: "" };
  if (channel !== "chat") throw new HttpError(400, "Images belong in chat.");
  assertImageKitUrl(imageUrl);
  const imageFileId = typeof body.imageFileId === "string" ? body.imageFileId : "";
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(imageFileId)) throw new HttpError(400, "Invalid file id.");
  const imageName = typeof body.imageName === "string" && body.imageName.trim() ? body.imageName.trim().slice(0, 140) : "image";
  return { imageUrl, imageFileId, imageName };
}
