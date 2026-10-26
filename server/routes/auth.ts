import { Router } from "express";
import mongoose from "mongoose";
import { ensureAdminWorkspace } from "../admin";
import { requireUser } from "../access";
import { mongoReady } from "../db";
import { verifyFirebaseToken } from "../firebase";
import { asyncHandler, bodyOf, HttpError } from "../http";
import { BoardModel, CardModel, ListModel, MembershipModel, UserModel, WorkspaceModel } from "../models";
import { userJson } from "../serialize";
import { deletedDate } from "../trash";
import { assertImageKitUrl } from "../imagekit";

export const authRouter = Router();

authRouter.post(
  "/auth/session",
  asyncHandler(async (req, res) => {
    if (!mongoReady()) {
      throw new HttpError(503, "Database is not connected. Set MONGODB_URI in .env.local and restart the API.");
    }
    const header = req.header("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
    if (!token) throw new HttpError(401, "Sign in required.");
    const decoded = await verifyFirebaseToken(token);
    const email = decoded.email?.toLowerCase();
    if (!email) throw new HttpError(400, "Your account needs an email address.");

    const body = bodyOf(req);
    const requestedName = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    const tokenName = typeof decoded.name === "string" ? decoded.name.trim().slice(0, 80) : "";
    const requestedPhoto = typeof body.photo === "string" ? body.photo.trim().slice(0, 2000) : "";
    const tokenPhoto = typeof decoded.picture === "string" ? decoded.picture.slice(0, 2000) : "";
    const name = requestedName || tokenName || email.split("@")[0] || "Member";
    const photo = requestedPhoto || tokenPhoto;

    let user = await UserModel.findOne({ firebaseUid: decoded.uid });
    if (!user) {
      user = await UserModel.create({ firebaseUid: decoded.uid, email, name, photo });
    } else {
      user.email = email;
      if (requestedName) user.name = requestedName;
      const endpoint = process.env.IMAGEKIT_URL_ENDPOINT || "";
      const keepsUploadedPhoto = Boolean(endpoint && user.photo?.startsWith(endpoint));
      if (!keepsUploadedPhoto && photo) user.photo = photo;
      await user.save();
    }

    const accepted = await acceptPendingInvites(user._id, user.email);
    await ensureAdminWorkspace(user);
    res.json({ user: userJson(user), accepted });
  }),
);

authRouter.patch(
  "/me",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const body = bodyOf(req);
    if (typeof body.name !== "string" || !body.name.trim()) throw new HttpError(400, "Enter your name.");
    user.name = body.name.trim().slice(0, 80);
    await user.save();
    res.json(userJson(user));
  }),
);

authRouter.post(
  "/me/photo",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const body = bodyOf(req);
    const photo = typeof body.photo === "string" ? body.photo.trim() : "";
    if (!photo) throw new HttpError(400, "Choose a photo.");
    assertImageKitUrl(photo);
    user.photo = photo.slice(0, 2000);
    await user.save();
    res.json(userJson(user));
  }),
);

authRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    if (!mongoReady()) {
      throw new HttpError(503, "Database is not connected. Set MONGODB_URI in .env.local and restart the API.");
    }
    const header = req.header("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
    if (!token) throw new HttpError(401, "Sign in required.");
    const decoded = await verifyFirebaseToken(token);
    const user = await UserModel.findOne({ firebaseUid: decoded.uid });
    if (!user) throw new HttpError(401, "Account is not ready yet.");
    res.json(userJson(user));
  }),
);

authRouter.get(
  "/me/tasks",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const [cards, memberships] = await Promise.all([
      CardModel.find({ assigneeIds: user._id, deletedAt: null }).sort({ updatedAt: -1 }).limit(50),
      MembershipModel.find({ userId: user._id, status: "active" }).select("workspaceId"),
    ]);
    const membershipIds = memberships.map((row) => row.workspaceId);
    const [boards, lists, workspaces] = await Promise.all([
      BoardModel.find({ _id: { $in: cards.map((card) => card.boardId) }, deletedAt: null }),
      ListModel.find({ _id: { $in: cards.map((card) => card.listId) }, deletedAt: null }).select("title"),
      WorkspaceModel.find({ _id: { $in: membershipIds }, deletedAt: null }).select("_id"),
    ]);
    const allowed = new Set(workspaces.map((workspace) => String(workspace._id)));
    const boardById = new Map(boards.map((board) => [String(board._id), board]));
    const listById = new Map(lists.map((list) => [String(list._id), list.title]));
    res.json(
      cards.flatMap((card) => {
        const board = boardById.get(String(card.boardId));
        if (!board || !allowed.has(String(board.workspaceId)) || !listById.has(String(card.listId))) return [];
        const updated = card.get("updatedAt");
        return [
          {
            id: String(card._id),
            title: card.title,
            boardId: String(card.boardId),
            boardTitle: board.title,
            listTitle: listById.get(String(card.listId)) || "List",
            dueDate: card.dueDate || null,
            updatedAt: updated instanceof Date ? updated.toISOString() : new Date().toISOString(),
          },
        ];
      }),
    );
  }),
);

async function acceptPendingInvites(userId: mongoose.Types.ObjectId, email: string) {
  const pending = await MembershipModel.find({ email, status: "pending" });
  const accepted: { workspaceId: string; workspaceName: string }[] = [];
  for (const row of pending) {
    row.userId = userId;
    row.status = "active";
    await row.save();
    const workspace = await WorkspaceModel.findById(row.workspaceId);
    if (workspace) {
      accepted.push({ workspaceId: String(workspace._id), workspaceName: workspace.name });
    }
  }
  return accepted;
}
