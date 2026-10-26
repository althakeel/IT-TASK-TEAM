import type { Request } from "express";
import mongoose from "mongoose";
import type { Role } from "../shared/types";
import { HttpError } from "./http";
import { mongoReady } from "./db";
import { verifyFirebaseToken } from "./firebase";
import { BoardModel, type BoardDoc, MembershipModel, type MembershipDoc, UserModel, type UserDoc, WorkspaceModel, type WorkspaceDoc } from "./models";
import { deletedDate } from "./trash";

const rank: Record<Role, number> = { member: 1, admin: 2, owner: 3 };

export function roleAtLeast(role: Role, min: Role): boolean {
  return rank[role] >= rank[min];
}

export async function requireUser(req: Request): Promise<UserDoc> {
  if (!mongoReady()) {
    throw new HttpError(503, "Database is not connected. Set MONGODB_URI in .env.local and restart the API.");
  }
  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) throw new HttpError(401, "Sign in required.");
  const decoded = await verifyFirebaseToken(token);
  const user = await UserModel.findOne({ firebaseUid: decoded.uid });
  if (!user) throw new HttpError(401, "Account is not ready yet. Refresh the page and try again.");
  return user;
}

export async function requireWorkspace(userId: string, workspaceId: string, min: Role = "member") {
  if (!mongoose.isValidObjectId(workspaceId)) throw new HttpError(400, "Invalid workspace.");
  const workspace = await WorkspaceModel.findById(workspaceId);
  if (!workspace || deletedDate(workspace)) throw new HttpError(404, "Workspace not found.");
  const membership = await MembershipModel.findOne({ workspaceId, userId, status: "active" });
  if (!membership) throw new HttpError(403, "You are not a member of this workspace.");
  if (!roleAtLeast(membership.role as Role, min)) {
    throw new HttpError(403, "You do not have permission to do that.");
  }
  return { workspace: workspace as WorkspaceDoc, membership: membership as MembershipDoc };
}

export async function requireBoard(userId: string, boardId: string, min: Role = "member") {
  if (!mongoose.isValidObjectId(boardId)) throw new HttpError(400, "Invalid board.");
  const board = await BoardModel.findById(boardId);
  if (!board || deletedDate(board)) throw new HttpError(404, "Board not found.");
  const access = await requireWorkspace(userId, String(board.workspaceId), min);
  return { board: board as BoardDoc, ...access };
}
