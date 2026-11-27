import { Router } from "express";
import mongoose from "mongoose";
import { adminEmail, isAdminEmail } from "../admin";
import { requireBoard, requireUser } from "../access";
import { assertAdmin, assertCanViewCard } from "../guards";
import { randomUUID } from "crypto";
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
  parseLinks,
} from "../validate";
import { nextCardPosition, nextListPosition, rebalanceCards, rebalanceLists } from "../order";
import { emitBoard } from "../realtime";
import { maybeAlertDayMax } from "../time-alerts";

export const contentRouter = Router();

async function adminUserId(): Promise<string | null> {
  const admin = await UserModel.findOne({ email: adminEmail() }).select("_id");
  return admin ? String(admin._id) : null;
}

/** Only the giver (or admin) can change who a given task is assigned to. Recipients just approve/work on it. */
function canChangeGivenAssignees(user: { email: string; _id: unknown }, card: { handoff?: { fromUserId?: unknown } | null }): boolean {
  if (!card.handoff) return true;
  return isAdminEmail(user.email) || String(card.handoff.fromUserId || "") === String(user._id);
}

function pushHistory(
  card: { history: { id: string; action: string; actorId: unknown; actorName: string; detail: string; createdAt: string }[] },
  user: { _id: unknown; name?: string; email: string },
  action: string,
  detail = "",
) {
  card.history.push({
    id: randomUUID(),
    action,
    actorId: user._id,
    actorName: user.name || user.email,
    detail,
    createdAt: new Date().toISOString(),
  });
}

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
      approval: isAdminEmail(user.email) ? null : "pending",
      history: [
        {
          id: randomUUID(),
          action: "Task created",
          actorId: user._id,
          actorName: user.name || user.email,
          detail: isAdminEmail(user.email) ? "" : "Requested for admin approval",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const dto = cardJson(card);
    emitBoard(String(list.boardId), "card:created", { clientMutationId: clientMutationId(body), card: dto });
    if (dto.approval === "pending") {
      const admin = await UserModel.findOne({ email: adminEmail() }).select("_id");
      if (admin) {
        await notifyUsers({
          recipientIds: [String(admin._id)],
          actorId: String(user._id),
          title: "Task needs approval",
          body: `${user.name} added “${dto.title}”. Approve it before other members can see it.`,
          boardId: dto.boardId,
          cardId: dto.id,
        });
      }
    }
    res.status(201).json(dto);
  }),
);

contentRouter.post(
  "/lists/:listId/give-task",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const list = await ListModel.findById(param(req.params.listId));
    if (!list || deletedDate(list)) throw new HttpError(404, "List not found.");
    const { board } = await requireBoard(String(user._id), String(list.boardId));
    if (board.closed) throw new HttpError(403, "This board is closed.");
    const body = bodyOf(req);
    const title = cleanName(body.title, "Task title", 200);
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 10000) : "";
    const suggestions = typeof body.reference === "string" ? body.reference.trim().slice(0, 10000) : "";
    const referenceUrl = typeof body.referenceUrl === "string" ? body.referenceUrl.trim().slice(0, 1000) : "";
    const links = referenceUrl
      ? [{ id: randomUUID(), title: "Reference", url: referenceUrl.startsWith("http") ? referenceUrl : `https://${referenceUrl}` }]
      : [];
    const rawAssignees = Array.isArray(body.assigneeIds) ? body.assigneeIds.map(String).filter(Boolean) : [];
    const assigneeIds = [...new Set(rawAssignees)].filter((id) => id !== String(user._id));
    const rawChecklist = Array.isArray(body.checklist)
      ? body.checklist
          .map((item) => (typeof item === "string" ? item.trim().slice(0, 300) : ""))
          .filter(Boolean)
          .slice(0, 50)
      : [];
    const checklist = rawChecklist.map((text) => ({ id: randomUUID(), text, done: false }));
    const dueDate = parseDueDate(body.dueDate);
    const card = await CardModel.create({
      listId: list._id,
      boardId: list.boardId,
      title,
      description,
      suggestions,
      position: await nextCardPosition(list._id),
      dueDate,
      labels: [],
      assigneeIds,
      checklist,
      attachments: [],
      links,
      createdBy: user._id,
      approval: null,
      handoff: {
        fromUserId: user._id,
        fromUserName: user.name || user.email,
        status: "pending_accept",
        acceptedAt: null,
        submittedAt: null,
        approvedAt: null,
        appeal: null,
      },
      history: [
        {
          id: randomUUID(),
          action: "Task given",
          actorId: user._id,
          actorName: user.name || user.email,
          detail: assigneeIds.length > 0 ? `Assigned to ${assigneeIds.length} member(s)` : "No member selected yet",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const dto = cardJson(card);
    emitBoard(String(list.boardId), "card:created", { card: dto });
    const adminId = await adminUserId();
    const recipients = [...dto.assigneeIds, ...(adminId ? [adminId] : [])];
    if (recipients.length > 0) {
      await notifyUsers({
        recipientIds: recipients,
        actorId: String(user._id),
        title: `New task from ${user.name || user.email}`,
        body: `${user.name || user.email} gave “${dto.title}”. Open the task to approve it and choose your timeline.`,
        boardId: dto.boardId,
        cardId: dto.id,
      });
    }
    res.status(201).json(dto);
  }),
);

contentRouter.post(
  "/cards/:cardId/handoff",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const card = await CardModel.findById(param(req.params.cardId));
    if (!card || deletedDate(card)) throw new HttpError(404, "Card not found.");
    const { board } = await requireBoard(String(user._id), String(card.boardId));
    assertCanViewCard(user, card);
    if (board.closed) throw new HttpError(403, "This board is closed.");
    const body = bodyOf(req);
    const action = typeof body.action === "string" ? body.action : "";
    const userId = String(user._id);
    const isAdmin = isAdminEmail(user.email);
    const isGiver = card.handoff ? String(card.handoff.fromUserId) === userId : String(card.createdBy) === userId;
    const isRecipient = (card.assigneeIds || []).some((id) => String(id) === userId);
    const adminId = await adminUserId();
    const creatorId = String(card.createdBy);
    const withAdminAndCreator = (ids: string[]) => [...ids, creatorId, ...(adminId ? [adminId] : [])];
    const now = new Date().toISOString();

    if (action === "give") {
      const nextAssignees = (
        Array.isArray(body.assigneeIds)
          ? [...new Set(body.assigneeIds.map(String).filter(Boolean))]
          : card.assigneeIds.map(String)
      ).filter((id) => id !== userId);
      if (nextAssignees.length === 0) throw new HttpError(400, "Choose another member. You cannot give a task to yourself.");
      card.set("assigneeIds", nextAssignees);
      card.set("handoff", {
        fromUserId: user._id,
        fromUserName: user.name || user.email,
        status: "pending_accept",
        acceptedAt: null,
        submittedAt: null,
        approvedAt: null,
        appeal: null,
      });
      pushHistory(card, user, "Task given", `Assigned to ${nextAssignees.length} member(s)`);
      await card.save();
      const dto = cardJson(card);
      emitBoard(dto.boardId, "card:updated", { card: dto });
      await notifyUsers({
        recipientIds: withAdminAndCreator(dto.assigneeIds),
        actorId: userId,
        title: `Task given by ${user.name || user.email}`,
        body: `${user.name || user.email} gave “${dto.title}”. Open the task to approve it and choose your timeline.`,
        boardId: dto.boardId,
        cardId: dto.id,
      });
      res.json(dto);
      return;
    }

    if (!card.handoff) throw new HttpError(400, "This card is not a given task.");

    if (action === "cancel") {
      if (!isGiver && !isAdmin) throw new HttpError(403, "Only the person who gave this task can cancel it.");
      const previousAssignees = card.assigneeIds.map(String);
      card.set("handoff", null);
      card.set("assigneeIds", []);
      pushHistory(card, user, "Given task cancelled");
      await card.save();
      const dto = cardJson(card);
      emitBoard(dto.boardId, "card:updated", { card: dto });
      await notifyUsers({
        recipientIds: withAdminAndCreator(previousAssignees),
        actorId: userId,
        title: "Given task cancelled",
        body: `${user.name || user.email} cancelled the task “${dto.title}” that was given to you.`,
        boardId: dto.boardId,
        cardId: dto.id,
      });
      res.json(dto);
      return;
    }

    if (action === "accept") {
      if (!isRecipient && !isAdmin) throw new HttpError(403, "Only the assigned member can approve and set the timeline.");
      const dueDate = parseDueDate(body.dueDate);
      if (!dueDate) throw new HttpError(400, "Choose a timeline date and time before approving.");
      card.dueDate = dueDate;
      card.handoff.status = "accepted";
      card.handoff.acceptedAt = now;
      card.markModified("handoff");
      pushHistory(card, user, "Approved & set timeline", `Timeline: ${dueDate}`);
      await card.save();
      const dto = cardJson(card);
      emitBoard(dto.boardId, "card:updated", { card: dto });
      await notifyUsers({
        recipientIds: withAdminAndCreator([String(card.handoff.fromUserId)]),
        actorId: userId,
        title: "Task accepted",
        body: `${user.name || user.email} approved “${dto.title}” with timeline ${dueDate}.`,
        boardId: dto.boardId,
        cardId: dto.id,
      });
      res.json(dto);
      return;
    }

    if (action === "submit") {
      if (!isRecipient && !isAdmin) throw new HttpError(403, "Only the assigned member can submit this task.");
      card.handoff.status = "submitted";
      card.handoff.submittedAt = now;
      card.markModified("handoff");
      pushHistory(card, user, "Submitted work for approval");
      await card.save();
      const dto = cardJson(card);
      emitBoard(dto.boardId, "card:updated", { card: dto });
      await notifyUsers({
        recipientIds: withAdminAndCreator([String(card.handoff.fromUserId)]),
        actorId: userId,
        title: "Task submitted for your approval",
        body: `${user.name || user.email} uploaded work and submitted “${dto.title}” for your approval.`,
        boardId: dto.boardId,
        cardId: dto.id,
      });
      res.json(dto);
      return;
    }

    if (action === "approve" || action === "request_changes") {
      if (!isGiver && !isAdmin) throw new HttpError(403, "Only the person who gave this task can approve it.");
      card.handoff.status = action === "approve" ? "approved" : "accepted";
      let movedToApproved = false;
      if (action === "approve") {
        card.handoff.approvedAt = now;
        const approvedList = (await ListModel.find({ boardId: card.boardId })).find(
          (list) => !deletedDate(list) && /^approved$/i.test(list.title.trim()),
        );
        if (approvedList && String(card.listId) !== String(approvedList._id)) {
          card.listId = approvedList._id;
          card.position = await nextCardPosition(approvedList._id);
          movedToApproved = true;
        }
        if (!card.approval) card.approval = "approved";
      }
      card.markModified("handoff");
      pushHistory(card, user, action === "approve" ? "Giver approved task" : "Giver requested changes");
      await card.save();
      const dto = cardJson(card);
      emitBoard(dto.boardId, movedToApproved ? "card:moved" : "card:updated", { card: dto });
      await notifyUsers({
        recipientIds: withAdminAndCreator(dto.assigneeIds),
        actorId: userId,
        title: action === "approve" ? "Given task approved" : "Changes requested on task",
        body:
          action === "approve"
            ? `${user.name || user.email} approved your work on “${dto.title}”.`
            : `${user.name || user.email} requested changes on “${dto.title}”.`,
        boardId: dto.boardId,
        cardId: dto.id,
      });
      res.json(dto);
      return;
    }

    if (action === "appeal") {
      if (!isRecipient && !isAdmin) throw new HttpError(403, "Only the assigned member can appeal for more time.");
      const requestedDueDate = parseDueDate(body.requestedDueDate);
      if (!requestedDueDate) throw new HttpError(400, "Choose the new timeline date and time you are requesting.");
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
      card.set("handoff.appeal", {
        requestedDueDate,
        reason,
        status: "pending",
        requestedBy: user._id,
        requestedAt: now,
      });
      pushHistory(card, user, "Timeline appeal requested", `Requested ${requestedDueDate}${reason ? ` · ${reason}` : ""}`);
      await card.save();
      const dto = cardJson(card);
      emitBoard(dto.boardId, "card:updated", { card: dto });
      await notifyUsers({
        recipientIds: withAdminAndCreator([String(card.handoff.fromUserId)]),
        actorId: userId,
        title: "Timeline extension appeal",
        body: `${user.name || user.email} appealed to move “${dto.title}” timeline to ${requestedDueDate}${reason ? `: ${reason}` : "."}`,
        boardId: dto.boardId,
        cardId: dto.id,
      });
      res.json(dto);
      return;
    }

    if (action === "approve_appeal" || action === "reject_appeal") {
      if (!isGiver && !isAdmin) throw new HttpError(403, "Only the person who gave this task can review timeline appeals.");
      if (!card.handoff.appeal || card.handoff.appeal.status !== "pending") {
        throw new HttpError(400, "No pending timeline appeal.");
      }
      if (action === "approve_appeal") {
        card.dueDate = card.handoff.appeal.requestedDueDate;
        card.handoff.appeal.status = "approved";
      } else {
        card.handoff.appeal.status = "rejected";
      }
      card.markModified("handoff");
      pushHistory(
        card,
        user,
        action === "approve_appeal" ? "Timeline appeal approved" : "Timeline appeal rejected",
        action === "approve_appeal" ? `New timeline: ${card.dueDate}` : "",
      );
      await card.save();
      const dto = cardJson(card);
      emitBoard(dto.boardId, "card:updated", { card: dto });
      await notifyUsers({
        recipientIds: withAdminAndCreator(dto.assigneeIds),
        actorId: userId,
        title: action === "approve_appeal" ? "Timeline appeal approved" : "Timeline appeal rejected",
        body:
          action === "approve_appeal"
            ? `${user.name || user.email} approved your new timeline (${dto.dueDate}) for “${dto.title}”.`
            : `${user.name || user.email} rejected your timeline extension appeal for “${dto.title}”.`,
        boardId: dto.boardId,
        cardId: dto.id,
      });
      res.json(dto);
      return;
    }

    throw new HttpError(400, "Unknown handoff action.");
  }),
);

contentRouter.patch(
  "/cards/:cardId",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const card = await CardModel.findById(param(req.params.cardId));
    if (!card || deletedDate(card)) throw new HttpError(404, "Card not found.");
    const { board } = await requireBoard(String(user._id), String(card.boardId));
    assertCanViewCard(user, card);
    if (board.closed) throw new HttpError(403, "This board is closed.");
    const body = bodyOf(req);
    const beforeAssignees = card.assigneeIds.map((id) => String(id));
    const beforeTitle = card.title;
    const beforeDue = card.dueDate || null;
    const beforeListId = String(card.listId);
    let moved = false;
    let listChanged = false;
    let autoSubmitted = false;

    if (body.title !== undefined) card.title = cleanName(body.title, "Card title", 200);
    if (body.description !== undefined) card.description = optionalText(body.description, 20000) ?? "";
    if (body.suggestions !== undefined) card.suggestions = optionalText(body.suggestions, 20000) ?? "";
    if (body.dueDate !== undefined) card.set("dueDate", parseDueDate(body.dueDate));
    if (body.location !== undefined) card.location = optionalText(body.location, 200) ?? "";
    if (body.labels !== undefined) card.set("labels", parseLabels(body.labels));
    if (body.checklist !== undefined) card.set("checklist", parseChecklist(body.checklist));
    if (body.links !== undefined) card.set("links", parseLinks(body.links));
    if (body.assigneeIds !== undefined) {
      if (!canChangeGivenAssignees(user, card)) {
        throw new HttpError(403, "Only the person who gave this task can change who it is given to.");
      }
      card.set("assigneeIds", await parseAssignees(body.assigneeIds, String(board.workspaceId)));
    }
    if (Array.isArray(body.mentionIds) && canChangeGivenAssignees(user, card)) {
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
        const isCompletionList = /\b(done|complete|completed|deploy|deployed|finish|finished|shipped)\b/i.test(list.title);
        if (isCompletionList && card.handoff && card.handoff.status !== "approved" && !canChangeGivenAssignees(user, card)) {
          throw new HttpError(
            403,
            "Submit this task for review and wait for approval before moving it to Completed or Deployed.",
          );
        }
        moved = true;
        listChanged = true;
        const isReviewList = /approv|review|testing|\bqa\b/i.test(list.title);
        if (isReviewList && card.handoff && card.handoff.status === "accepted" && !canChangeGivenAssignees(user, card)) {
          card.handoff.status = "submitted";
          card.handoff.submittedAt = new Date().toISOString();
          card.markModified("handoff");
          pushHistory(card, user, "Submitted work for approval", `Moved to “${list.title}”`);
          autoSubmitted = true;
        }
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
      body.suggestions === undefined &&
      body.dueDate === undefined &&
      body.location === undefined &&
      body.labels === undefined &&
      body.checklist === undefined &&
      body.assigneeIds === undefined &&
      body.attachments === undefined &&
      body.links === undefined &&
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
    const added = afterAssignees.filter((id) => !beforeAssignees.includes(id));
    emitBoard(String(fresh.boardId), moved ? "card:moved" : "card:updated", { clientMutationId: clientMutationId(body), card: dto });
    if (reordered) emitBoard(String(fresh.boardId), "cards:reordered", { cards: reordered });
    const boardId = String(fresh.boardId);
    if (autoSubmitted && fresh.handoff) {
      const adminId = await adminUserId();
      await notifyUsers({
        recipientIds: [String(fresh.handoff.fromUserId), ...(adminId ? [adminId] : [])],
        actorId: String(user._id),
        title: "Task submitted for your approval",
        body: `${user.name || user.email} moved “${fresh.title}” to review. Review and approve it.`,
        boardId,
        cardId: dto.id,
      });
    }
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

contentRouter.post(
  "/cards/:cardId/approval",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const card = await CardModel.findById(param(req.params.cardId));
    if (!card || deletedDate(card)) throw new HttpError(404, "Card not found.");
    const { board } = await requireBoard(String(user._id), String(card.boardId));
    if (board.closed) throw new HttpError(403, "This board is closed.");
    const decision = bodyOf(req).decision;
    const givenTask = Boolean(card.handoff);
    if (decision === "finalized") {
      // Given tasks are finalised only by the person who gave them. Other tasks are finalised by the admin.
      if (givenTask) {
        if (String(card.handoff?.fromUserId || "") !== String(user._id)) {
          throw new HttpError(403, "Only the person who gave this task can finalise it.");
        }
      } else {
        assertAdmin(user);
      }
      if (card.approval !== "approved") throw new HttpError(400, "Only approved tasks can be finalised.");
      card.approval = "finalized";
      pushHistory(card, user, givenTask ? "Giver finalised task" : "Admin finalised task");
    } else if (decision === "approved" || decision === "rejected") {
      assertAdmin(user);
      if (card.approval !== "pending" && card.approval !== "rejected") {
        throw new HttpError(400, "Only the admin can move a request for approval to Approved.");
      }
      card.approval = decision;
      pushHistory(card, user, decision === "approved" ? "Admin approved task" : "Admin rejected task");
    } else {
      throw new HttpError(400, "Choose approve, reject, or finalise.");
    }
    await card.save();
    const dto = cardJson(card);
    const creatorId = String(card.createdBy);
    emitBoard(String(board._id), "card:updated", { card: dto });
    const title =
      decision === "finalized" ? "Task finalised" : decision === "approved" ? "Task approved" : "Task rejected";
    const body =
      decision === "finalized"
        ? givenTask
          ? `${user.name || user.email} checked and finalised “${dto.title}”.`
          : `“${dto.title}” was checked and finalised by the admin.`
        : decision === "approved"
          ? `“${dto.title}” is approved.`
          : `“${dto.title}” was rejected. Other members cannot see it.`;
    const adminId = givenTask ? await adminUserId() : null;
    await notifyUsers({
      recipientIds: [creatorId, ...dto.assigneeIds, ...(adminId ? [adminId] : [])],
      actorId: String(user._id),
      title,
      body,
      boardId: dto.boardId,
      cardId: dto.id,
    });
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
    card.set("deletedAt", new Date());
    await card.save();
    emitBoard(String(board._id), "card:deleted", payload);
    res.json({ ok: true });
  }),
);

contentRouter.post(
  "/cards/:cardId/time",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const card = await CardModel.findById(param(req.params.cardId));
    if (!card || deletedDate(card)) throw new HttpError(404, "Card not found.");
    const { board } = await requireBoard(String(user._id), String(card.boardId));
    assertCanViewCard(user, card);
    if (board.closed) throw new HttpError(403, "This board is closed.");
    const body = bodyOf(req);
    const minutes = Number(body.minutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 24 * 60) {
      throw new HttpError(400, "Enter time between 1 minute and 24 hours.");
    }
    if ((card.timeLogs || []).length >= 200) throw new HttpError(400, "Too many time entries on this card.");
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : "";
    card.timeLogs.push({
      id: randomUUID(),
      minutes: Math.round(minutes),
      note,
      userId: user._id,
      userName: user.name || user.email,
      createdAt: new Date().toISOString(),
    });
    await card.save();
    const dto = cardJson(card);
    emitBoard(dto.boardId, "card:updated", { clientMutationId: clientMutationId(body), card: dto });
    void maybeAlertDayMax(String(user._id)).catch((error) => console.error("Time alert failed.", error));
    res.status(201).json(dto);
  }),
);

contentRouter.delete(
  "/cards/:cardId/time/:logId",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const card = await CardModel.findById(param(req.params.cardId));
    if (!card || deletedDate(card)) throw new HttpError(404, "Card not found.");
    const { board } = await requireBoard(String(user._id), String(card.boardId));
    assertCanViewCard(user, card);
    if (board.closed) throw new HttpError(403, "This board is closed.");
    const logId = param(req.params.logId);
    const entry = (card.timeLogs || []).find((item) => item.id === logId);
    if (!entry) throw new HttpError(404, "Time entry not found.");
    const isOwner = String(entry.userId) === String(user._id);
    if (!isOwner && !isAdminEmail(user.email)) throw new HttpError(403, "You can only remove your own time.");
    card.set(
      "timeLogs",
      (card.timeLogs || []).filter((item) => item.id !== logId),
    );
    await card.save();
    const dto = cardJson(card);
    emitBoard(dto.boardId, "card:updated", { clientMutationId: clientMutationId(bodyOf(req)), card: dto });
    res.json(dto);
  }),
);

contentRouter.post(
  "/cards/:cardId/attachments",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const card = await CardModel.findById(param(req.params.cardId));
    if (!card || deletedDate(card)) throw new HttpError(404, "Card not found.");
    const { board } = await requireBoard(String(user._id), String(card.boardId));
    assertCanViewCard(user, card);
    if (board.closed) throw new HttpError(403, "This board is closed.");
    if (card.attachments.length >= 20) throw new HttpError(400, "A card can have up to 20 attachments.");
    const body = bodyOf(req);
    card.attachments.push(parseAttachment(body));
    await card.save();
    const dto = cardJson(card);
    emitBoard(dto.boardId, "card:updated", { clientMutationId: clientMutationId(body), card: dto });
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
    emitBoard(dto.boardId, "card:updated", { clientMutationId: clientMutationId(bodyOf(req)), card: dto });
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
    assertCanViewCard(user, card);
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
    assertCanViewCard(user, card);
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
    if (mentioned.length > 0 && canChangeGivenAssignees(user, card)) {
      const merged = [...new Set([...card.assigneeIds.map((id) => String(id)), ...mentioned])];
      card.set(
        "assigneeIds",
        merged.map((id) => new mongoose.Types.ObjectId(id)),
      );
      await card.save();
      const cardDto = cardJson(card);
      emitBoard(cardDto.boardId, "card:updated", { card: cardDto });
    }
    const dto = commentJson(comment, user);
    const recipients = card.assigneeIds.map((id) => String(id));
    emitBoard(String(card.boardId), "comment:created", { clientMutationId: clientMutationId(body), comment: dto });
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
    emitBoard(String(comment.boardId), "comment:deleted", payload);
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
