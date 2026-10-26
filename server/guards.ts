import { isAdminEmail } from "./admin";
import { HttpError } from "./http";
import { BoardModel, type BoardDoc, type UserDoc } from "./models";

export function assertAdmin(user: { email: string }): void {
  if (!isAdminEmail(user.email)) throw new HttpError(403, "Only the admin can do that.");
}

export function canSeeEveryCard(user: { email: string }): boolean {
  return isAdminEmail(user.email);
}

export function isAssigned(assigneeIds: Iterable<unknown>, userId: string): boolean {
  for (const id of assigneeIds) {
    if (String(id) === userId) return true;
  }
  return false;
}

export function canViewCard(
  user: { _id: unknown; email: string },
  card: { assigneeIds?: Iterable<unknown> | null; createdBy?: unknown; approval?: string | null },
): boolean {
  if (canSeeEveryCard(user)) return true;
  const approval = card.approval || null;
  if (approval === "pending" || approval === "rejected") return String(card.createdBy || "") === String(user._id);
  if (approval === "approved") return true;
  return isAssigned(card.assigneeIds || [], String(user._id));
}

export function assertCanViewCard(
  user: UserDoc,
  card: { assigneeIds?: Iterable<unknown> | null; createdBy?: unknown; approval?: string | null },
): void {
  if (!canViewCard(user, card)) throw new HttpError(404, "Card not found.");
}

export async function assertBoardOpen(boardId: string): Promise<BoardDoc> {
  const board = await BoardModel.findById(boardId);
  if (!board) throw new HttpError(404, "Board not found.");
  if (board.closed) throw new HttpError(403, "This board is closed.");
  return board;
}
