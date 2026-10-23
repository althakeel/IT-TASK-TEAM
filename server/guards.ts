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

export function assertCanViewCard(user: UserDoc, assigneeIds: Iterable<unknown>): void {
  if (canSeeEveryCard(user)) return;
  if (!isAssigned(assigneeIds, String(user._id))) throw new HttpError(404, "Card not found.");
}

export async function assertBoardOpen(boardId: string): Promise<BoardDoc> {
  const board = await BoardModel.findById(boardId);
  if (!board) throw new HttpError(404, "Board not found.");
  if (board.closed) throw new HttpError(403, "This board is closed.");
  return board;
}
