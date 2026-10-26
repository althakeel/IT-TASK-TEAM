import { Router } from "express";
import mongoose from "mongoose";
import type { TrashItem, TrashKind } from "../../shared/types";
import { requireUser } from "../access";
import { assertAdmin } from "../guards";
import { asyncHandler, HttpError, param } from "../http";
import { BoardModel, CardModel, ListModel, MembershipModel, WorkspaceModel } from "../models";
import { daysLeft, deletedDate, trashCutoff } from "../trash";

export const trashRouter = Router();

trashRouter.get(
  "/trash",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    assertAdmin(user);
    res.json(await listTrash(String(user._id)));
  }),
);

trashRouter.post(
  "/trash/:kind/:id/restore",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    assertAdmin(user);
    const kind = param(req.params.kind);
    const id = param(req.params.id);
    if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid item.");
    if (kind !== "workspace" && kind !== "board" && kind !== "list" && kind !== "card") {
      throw new HttpError(400, "Unknown item.");
    }
    await restoreItem(kind, id, String(user._id));
    res.json({ ok: true });
  }),
);

async function listTrash(userId: string): Promise<TrashItem[]> {
  const since = trashCutoff();
  const memberships = await MembershipModel.find({ userId, status: "active" }).select("workspaceId");
  const workspaceIds = memberships.map((row) => row.workspaceId);
  const workspaces = await WorkspaceModel.find({ _id: { $in: workspaceIds } });
  const liveWorkspaceIds = workspaces.filter((workspace) => !deletedDate(workspace)).map((workspace) => workspace._id);
  const workspaceName = new Map(workspaces.map((workspace) => [String(workspace._id), workspace.name]));
  const boards = await BoardModel.find({ workspaceId: { $in: liveWorkspaceIds } });
  const liveBoardIds = boards.filter((board) => !deletedDate(board)).map((board) => board._id);
  const boardTitle = new Map(boards.map((board) => [String(board._id), board.title]));
  const [deletedLists, liveLists, deletedCards] = await Promise.all([
    ListModel.find({ boardId: { $in: liveBoardIds }, deletedAt: { $gte: since } }),
    ListModel.find({ boardId: { $in: liveBoardIds }, deletedAt: null }).select("title"),
    CardModel.find({ boardId: { $in: liveBoardIds }, deletedAt: { $gte: since } }),
  ]);
  const liveListIds = new Set(liveLists.map((list) => String(list._id)));
  const listTitle = new Map(liveLists.map((list) => [String(list._id), list.title]));
  const items: TrashItem[] = [];

  for (const workspace of workspaces) {
    const deletedAt = deletedDate(workspace);
    if (!deletedAt || deletedAt < since) continue;
    items.push({
      id: String(workspace._id),
      kind: "workspace",
      title: workspace.name,
      detail: "Workspace",
      deletedAt: deletedAt.toISOString(),
      daysLeft: daysLeft(deletedAt),
    });
  }
  for (const board of boards) {
    const deletedAt = deletedDate(board);
    if (!deletedAt || deletedAt < since) continue;
    items.push({
      id: String(board._id),
      kind: "board",
      title: board.title,
      detail: workspaceName.get(String(board.workspaceId)) || "Workspace",
      deletedAt: deletedAt.toISOString(),
      daysLeft: daysLeft(deletedAt),
    });
  }
  for (const list of deletedLists) {
    const deletedAt = deletedDate(list);
    if (!deletedAt) continue;
    items.push({
      id: String(list._id),
      kind: "list",
      title: list.title,
      detail: boardTitle.get(String(list.boardId)) || "Board",
      deletedAt: deletedAt.toISOString(),
      daysLeft: daysLeft(deletedAt),
    });
  }
  for (const card of deletedCards) {
    const deletedAt = deletedDate(card);
    if (!deletedAt || !liveListIds.has(String(card.listId))) continue;
    const board = boardTitle.get(String(card.boardId)) || "Board";
    const list = listTitle.get(String(card.listId)) || "List";
    items.push({
      id: String(card._id),
      kind: "card",
      title: card.title,
      detail: `${board} · ${list}`,
      deletedAt: deletedAt.toISOString(),
      daysLeft: daysLeft(deletedAt),
    });
  }
  return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

async function restoreItem(kind: TrashKind, id: string, userId: string): Promise<void> {
  const since = trashCutoff();
  if (kind === "workspace") {
    const workspace = await WorkspaceModel.findById(id);
    const deletedAt = workspace ? deletedDate(workspace) : null;
    if (!workspace || !deletedAt || deletedAt < since) throw new HttpError(404, "That item can no longer be restored.");
    const membership = await MembershipModel.findOne({ workspaceId: workspace._id, userId, status: "active" });
    if (!membership) throw new HttpError(403, "You are not a member of this workspace.");
    workspace.set("deletedAt", null);
    await workspace.save();
    return;
  }
  if (kind === "board") {
    const board = await BoardModel.findById(id);
    const deletedAt = board ? deletedDate(board) : null;
    if (!board || !deletedAt || deletedAt < since) throw new HttpError(404, "That item can no longer be restored.");
    const workspace = await WorkspaceModel.findById(board.workspaceId);
    if (!workspace || deletedDate(workspace)) throw new HttpError(400, "Restore the workspace first.");
    const membership = await MembershipModel.findOne({ workspaceId: workspace._id, userId, status: "active" });
    if (!membership) throw new HttpError(403, "You are not a member of this workspace.");
    board.set("deletedAt", null);
    await board.save();
    return;
  }
  if (kind === "list") {
    const list = await ListModel.findById(id);
    const deletedAt = list ? deletedDate(list) : null;
    if (!list || !deletedAt || deletedAt < since) throw new HttpError(404, "That item can no longer be restored.");
    const board = await BoardModel.findById(list.boardId);
    if (!board || deletedDate(board)) throw new HttpError(400, "Restore the board first.");
    const workspace = await WorkspaceModel.findById(board.workspaceId);
    if (!workspace || deletedDate(workspace)) throw new HttpError(400, "Restore the workspace first.");
    const membership = await MembershipModel.findOne({ workspaceId: workspace._id, userId, status: "active" });
    if (!membership) throw new HttpError(403, "You are not a member of this workspace.");
    list.set("deletedAt", null);
    await list.save();
    return;
  }
  const card = await CardModel.findById(id);
  const deletedAt = card ? deletedDate(card) : null;
  if (!card || !deletedAt || deletedAt < since) throw new HttpError(404, "That item can no longer be restored.");
  const list = await ListModel.findById(card.listId);
  if (!list || deletedDate(list)) throw new HttpError(400, "Restore the list first.");
  const board = await BoardModel.findById(card.boardId);
  if (!board || deletedDate(board)) throw new HttpError(400, "Restore the board first.");
  const workspace = await WorkspaceModel.findById(board.workspaceId);
  if (!workspace || deletedDate(workspace)) throw new HttpError(400, "Restore the workspace first.");
  const membership = await MembershipModel.findOne({ workspaceId: workspace._id, userId, status: "active" });
  if (!membership) throw new HttpError(403, "You are not a member of this workspace.");
  card.set("deletedAt", null);
  await card.save();
}
