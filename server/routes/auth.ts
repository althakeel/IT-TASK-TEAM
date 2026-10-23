import { Router } from "express";
import mongoose from "mongoose";
import { ensureAdminWorkspace } from "../admin";
import { mongoReady } from "../db";
import { verifyFirebaseToken } from "../firebase";
import { asyncHandler, bodyOf, HttpError } from "../http";
import { MembershipModel, UserModel, WorkspaceModel } from "../models";
import { userJson } from "../serialize";

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
      if (requestedName || tokenName) user.name = requestedName || tokenName;
      if (photo) user.photo = photo;
      await user.save();
    }

    const accepted = await acceptPendingInvites(user._id, user.email);
    await ensureAdminWorkspace(user);
    res.json({ user: userJson(user), accepted });
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
