import { isAdminEmail } from "./admin";
import type { BoardSummary, Card, Comment, List, Membership, Role, User } from "../shared/types";
import type { BoardDoc, CardDoc, CommentDoc, ListDoc, MembershipDoc, UserDoc } from "./models";
import { MembershipModel, UserModel } from "./models";

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) return new Date(value).toISOString();
  return new Date().toISOString();
}

export function userJson(user: UserDoc): User {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    photo: user.photo || "",
    isAdmin: isAdminEmail(user.email),
  };
}

export function boardJson(board: BoardDoc): BoardSummary {
  return {
    id: String(board._id),
    workspaceId: String(board.workspaceId),
    title: board.title,
    background: board.background,
    backgroundImage: board.backgroundImage || "",
    description: board.description || "",
    closed: Boolean(board.closed),
    createdAt: iso(board.get("createdAt")),
  };
}

export function listJson(list: ListDoc, cards: Card[] = []): List {
  return {
    id: String(list._id),
    boardId: String(list.boardId),
    title: list.title,
    position: list.position,
    cards,
  };
}

export function cardJson(card: CardDoc): Card {
  return {
    id: String(card._id),
    listId: String(card.listId),
    boardId: String(card.boardId),
    title: card.title,
    description: card.description || "",
    position: card.position,
    dueDate: card.dueDate || null,
    labels: (card.labels || []).map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color,
    })),
    assigneeIds: (card.assigneeIds || []).map((id) => String(id)),
    checklist: (card.checklist || []).map((item) => ({
      id: item.id,
      text: item.text,
      done: Boolean(item.done),
    })),
    attachments: (card.attachments || []).map((file) => ({
      id: file.id,
      name: file.name,
      url: file.url,
      fileId: file.fileId,
      type: file.type === "video" ? "video" : "image",
      thumbnailUrl: file.thumbnailUrl,
    })),
    createdBy: String(card.createdBy),
    createdAt: iso(card.get("createdAt")),
    approval: card.approval === "pending" || card.approval === "approved" || card.approval === "rejected" ? card.approval : null,
  };
}

export function commentJson(
  comment: CommentDoc,
  author?: { name?: string; photo?: string } | null,
): Comment {
  return {
    id: String(comment._id),
    cardId: String(comment.cardId),
    boardId: String(comment.boardId),
    authorId: String(comment.authorId),
    authorName: author?.name || "Former member",
    authorPhoto: author?.photo || "",
    text: comment.text || "",
    channel: comment.channel === "chat" ? "chat" : "comment",
    imageUrl: comment.imageUrl || "",
    imageName: comment.imageName || "",
    createdAt: iso(comment.get("createdAt")),
  };
}

export async function membershipsForWorkspace(
  workspaceId: string,
  includeInviteTokens: boolean,
): Promise<Membership[]> {
  const rows = await MembershipModel.find({ workspaceId }).sort({ createdAt: 1 });
  const userIds = rows.map((row) => row.userId).filter((id) => id != null);
  const users = await UserModel.find({ _id: { $in: userIds } });
  const byId = new Map(users.map((user) => [String(user._id), user]));
  return rows.map((row) => membershipJson(row, byId.get(String(row.userId)), includeInviteTokens));
}

export function membershipJson(
  row: MembershipDoc,
  user: UserDoc | undefined,
  includeInviteTokens: boolean,
): Membership {
  return {
    id: String(row._id),
    workspaceId: String(row.workspaceId),
    userId: row.userId ? String(row.userId) : null,
    email: row.email,
    name: user?.name || "",
    photo: user?.photo || "",
    role: row.role as Role,
    status: row.status as Membership["status"],
    inviteToken: includeInviteTokens && row.status === "pending" ? row.inviteToken || null : null,
  };
}
