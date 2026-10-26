import { Router } from "express";
import type { KpiReport, KpiStatus, MemberKpiTask, MemberKpis } from "../../shared/types";
import { requireUser } from "../access";
import { assertAdmin } from "../guards";
import { asyncHandler } from "../http";
import { BoardModel, CardModel, ListModel, MembershipModel, UserModel, WorkspaceModel } from "../models";
import { deletedDate } from "../trash";

export const kpiRouter = Router();

kpiRouter.get(
  "/kpis",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    assertAdmin(user);
    res.json(await reportFor(String(user._id)));
  }),
);

function todayKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function statusOf(card: { dueDate?: string | null; checklist?: { done: boolean }[] }, listTitle: string): KpiStatus {
  const checks = card.checklist || [];
  const complete = (checks.length > 0 && checks.every((item) => item.done)) || /^(done|complete|completed)$/i.test(listTitle.trim());
  const late = Boolean(card.dueDate && card.dueDate < todayKey());
  if (complete && late) return "late";
  if (complete) return "onTime";
  if (late) return "overdue";
  return "open";
}

async function reportFor(userId: string): Promise<KpiReport> {
  const mine = await MembershipModel.find({ userId, status: "active" }).select("workspaceId");
  const workspaces = await WorkspaceModel.find({ _id: { $in: mine.map((row) => row.workspaceId) }, deletedAt: null }).select("name");
  const workspaceIds = workspaces.map((workspace) => workspace._id);
  const [memberships, boards] = await Promise.all([
    MembershipModel.find({ workspaceId: { $in: workspaceIds }, status: "active", userId: { $ne: null } }),
    BoardModel.find({ workspaceId: { $in: workspaceIds }, deletedAt: null }).select("title"),
  ]);
  const boardIds = boards.map((board) => board._id);
  const [lists, cards, users] = await Promise.all([
    ListModel.find({ boardId: { $in: boardIds }, deletedAt: null }).select("title"),
    CardModel.find({ boardId: { $in: boardIds }, deletedAt: null }).select("title listId boardId assigneeIds dueDate checklist"),
    UserModel.find({ _id: { $in: memberships.map((row) => row.userId) } }).select("name email photo"),
  ]);
  const listTitle = new Map(lists.filter((list) => !deletedDate(list)).map((list) => [String(list._id), list.title]));
  const boardTitle = new Map(boards.map((board) => [String(board._id), board.title]));
  const userById = new Map(users.map((person) => [String(person._id), person]));
  const stats = new Map<string, MemberKpis>();
  for (const membership of memberships) {
    const id = String(membership.userId);
    if (stats.has(id)) continue;
    const person = userById.get(id);
    stats.set(id, {
      userId: id,
      name: person?.name || membership.email,
      email: person?.email || membership.email,
      photo: person?.photo || "",
      tasks: 0,
      onTime: 0,
      late: 0,
      overdue: 0,
      open: 0,
      items: [] as MemberKpiTask[],
    });
  }
  for (const card of cards) {
    if (deletedDate(card) || !listTitle.has(String(card.listId))) continue;
    const listName = listTitle.get(String(card.listId)) || "";
    const status = statusOf(card, listName);
    const task: MemberKpiTask = {
      id: String(card._id),
      title: card.title,
      boardId: String(card.boardId),
      boardTitle: boardTitle.get(String(card.boardId)) || "Board",
      listTitle: listName,
      dueDate: card.dueDate || null,
      status,
    };
    for (const assignee of card.assigneeIds) {
      const row = stats.get(String(assignee));
      if (!row) continue;
      row.tasks += 1;
      row[status] += 1;
      row.items.push(task);
    }
  }
  return {
    workspaces: workspaces.map((workspace) => ({ id: String(workspace._id), name: workspace.name })),
    members: [...stats.values()].sort((a, b) => b.tasks - a.tasks || a.name.localeCompare(b.name)),
  };
}
