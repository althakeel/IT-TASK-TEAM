import { randomBytes } from "crypto";
import { Router } from "express";
import type { Role } from "../../shared/types";
import { isAdminEmail } from "../admin";
import { assertAdmin } from "../guards";
import { requireUser, requireWorkspace, roleAtLeast } from "../access";
import { asyncHandler, bodyOf, HttpError, isDuplicateKey, param } from "../http";
import { BoardModel, MembershipModel, WorkspaceModel } from "../models";
import { boardJson, membershipJson, membershipsForWorkspace } from "../serialize";
import { sendInviteEmail } from "../mail";
import { deletedDate } from "../trash";
import { assertEmail, assertRole, cleanName } from "../validate";

export const workspaceRouter = Router();

workspaceRouter.get(
  "/workspaces",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const memberships = await MembershipModel.find({ userId: user._id, status: "active" });
    const workspaceIds = memberships.map((membership) => membership.workspaceId);
    const [workspaces, boards, memberCounts] = await Promise.all([
      WorkspaceModel.find({ _id: { $in: workspaceIds }, deletedAt: null }).sort({ name: 1 }),
      BoardModel.find({ workspaceId: { $in: workspaceIds }, deletedAt: null }).sort({ createdAt: -1 }),
      MembershipModel.aggregate<{ _id: unknown; count: number }>([
        { $match: { workspaceId: { $in: workspaceIds }, status: "active" } },
        { $group: { _id: "$workspaceId", count: { $sum: 1 } } },
      ]),
    ]);
    const roleByWorkspace = new Map(memberships.map((membership) => [String(membership.workspaceId), membership.role as Role]));
    const countByWorkspace = new Map(memberCounts.map((row) => [String(row._id), row.count]));
    const boardsByWorkspace = new Map<string, ReturnType<typeof boardJson>[]>();
    for (const board of boards) {
      const key = String(board.workspaceId);
      const list = boardsByWorkspace.get(key) || [];
      list.push(boardJson(board));
      boardsByWorkspace.set(key, list);
    }
    res.json(
      workspaces.map((workspace) => ({
        id: String(workspace._id),
        name: workspace.name,
        role: roleByWorkspace.get(String(workspace._id)) || "member",
        memberCount: countByWorkspace.get(String(workspace._id)) || 0,
        boards: boardsByWorkspace.get(String(workspace._id)) || [],
      })),
    );
  }),
);

workspaceRouter.post(
  "/workspaces",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    if (!isAdminEmail(user.email)) throw new HttpError(403, "Only the admin can create a workspace.");
    const name = cleanName(bodyOf(req).name, "Workspace name", 80);
    const workspace = await WorkspaceModel.create({ name, ownerId: user._id });
    await MembershipModel.create({
      workspaceId: workspace._id,
      userId: user._id,
      email: user.email,
      role: "owner",
      status: "active",
    });
    res.status(201).json({
      id: String(workspace._id),
      name: workspace.name,
      role: "owner",
      memberCount: 1,
      boards: [],
    });
  }),
);

workspaceRouter.get(
  "/workspaces/:workspaceId",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const workspaceId = param(req.params.workspaceId);
    const { workspace, membership } = await requireWorkspace(String(user._id), workspaceId);
    const includeTokens = roleAtLeast(membership.role as Role, "admin");
    const [members, boards] = await Promise.all([
      membershipsForWorkspace(workspaceId, includeTokens),
      BoardModel.find({ workspaceId, deletedAt: null }).sort({ createdAt: -1 }),
    ]);
    res.json({
      id: String(workspace._id),
      name: workspace.name,
      role: membership.role,
      members,
      boards: boards.map((board) => boardJson(board)),
    });
  }),
);

workspaceRouter.patch(
  "/workspaces/:workspaceId",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const workspaceId = param(req.params.workspaceId);
    const { workspace, membership } = await requireWorkspace(String(user._id), workspaceId, "admin");
    workspace.name = cleanName(bodyOf(req).name, "Workspace name", 80);
    await workspace.save();
    res.json({ id: String(workspace._id), name: workspace.name, role: membership.role });
  }),
);

workspaceRouter.delete(
  "/workspaces/:workspaceId",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    assertAdmin(user);
    const workspaceId = param(req.params.workspaceId);
    const { workspace } = await requireWorkspace(String(user._id), workspaceId, "owner");
    const openBoard = await BoardModel.findOne({ workspaceId, deletedAt: null, closed: { $ne: true } });
    if (openBoard) throw new HttpError(400, "Close every board in settings before deleting this workspace.");
    if (deletedDate(workspace)) throw new HttpError(404, "Workspace not found.");
    workspace.set("deletedAt", new Date());
    await workspace.save();
    res.json({ ok: true });
  }),
);

workspaceRouter.post(
  "/workspaces/:workspaceId/invites",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const workspaceId = param(req.params.workspaceId);
    const { workspace } = await requireWorkspace(String(user._id), workspaceId, "admin");
    if (!isAdminEmail(user.email)) throw new HttpError(403, "Only the admin can invite people.");
    const body = bodyOf(req);
    const email = assertEmail(body.email);
    if (isAdminEmail(email)) throw new HttpError(400, "That email is already the admin.");
    const role = "member" as const;
    const existing = await MembershipModel.findOne({ workspaceId, email });
    if (existing?.status === "active") throw new HttpError(409, "That person is already in the workspace.");
    const membership = existing
      ? existing
      : await MembershipModel.create({
          workspaceId,
          email,
          role,
          status: "pending",
          inviteToken: randomBytes(24).toString("hex"),
        }).catch((error: unknown) => {
          if (isDuplicateKey(error)) throw new HttpError(409, "That person is already invited.");
          throw error;
        });
    if (!membership.inviteToken) {
      membership.inviteToken = randomBytes(24).toString("hex");
      await membership.save();
    }
    const emailSent = await sendInviteEmail({
      to: email,
      workspaceName: workspace.name,
      inviterName: user.name,
      token: membership.inviteToken,
    });
    res.status(existing ? 200 : 201).json({ ...membershipJson(membership, undefined, true), emailSent });
  }),
);

workspaceRouter.patch(
  "/workspaces/:workspaceId/members/:membershipId",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const workspaceId = param(req.params.workspaceId);
    await requireWorkspace(String(user._id), workspaceId, "owner");
    const target = await MembershipModel.findOne({ _id: param(req.params.membershipId), workspaceId });
    if (!target) throw new HttpError(404, "Member not found.");
    if (target.role === "owner") throw new HttpError(400, "The owner role cannot be changed.");
    target.role = assertRole(bodyOf(req).role, ["admin", "member"]);
    await target.save();
    const members = await membershipsForWorkspace(workspaceId, true);
    const updated = members.find((member) => member.id === String(target._id));
    if (!updated) throw new HttpError(404, "Member not found.");
    res.json(updated);
  }),
);

workspaceRouter.delete(
  "/workspaces/:workspaceId/members/:membershipId",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const workspaceId = param(req.params.workspaceId);
    const { membership } = await requireWorkspace(String(user._id), workspaceId);
    const target = await MembershipModel.findOne({ _id: param(req.params.membershipId), workspaceId });
    if (!target) throw new HttpError(404, "Member not found.");
    if (target.role === "owner") throw new HttpError(400, "The owner cannot leave or be removed.");
    const isSelf = target.userId != null && String(target.userId) === String(user._id);
    if (!isSelf && !roleAtLeast(membership.role as Role, "admin")) {
      throw new HttpError(403, "You do not have permission to do that.");
    }
    if (!isSelf && membership.role === "admin" && target.role === "admin") {
      throw new HttpError(403, "Only the owner can remove an admin.");
    }
    await target.deleteOne();
    res.json({ ok: true });
  }),
);

workspaceRouter.get(
  "/invites/:token",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const row = await MembershipModel.findOne({ inviteToken: param(req.params.token) });
    if (!row) throw new HttpError(404, "Invite not found.");
    const workspace = await WorkspaceModel.findById(row.workspaceId);
    if (!workspace) throw new HttpError(404, "Workspace not found.");
    res.json({
      workspaceId: String(workspace._id),
      workspaceName: workspace.name,
      email: row.email,
      role: row.role,
      status: row.status,
      matchesAccount: row.email === user.email,
    });
  }),
);

workspaceRouter.post(
  "/invites/:token/accept",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const row = await MembershipModel.findOne({ inviteToken: param(req.params.token) });
    if (!row) throw new HttpError(404, "Invite not found.");
    const workspace = await WorkspaceModel.findById(row.workspaceId);
    if (!workspace) throw new HttpError(404, "Workspace not found.");
    if (row.status === "active") {
      if (row.userId && String(row.userId) === String(user._id)) {
        res.json({ workspaceId: String(workspace._id), workspaceName: workspace.name });
        return;
      }
      throw new HttpError(403, "This invite has already been used.");
    }
    if (row.email !== user.email) {
      throw new HttpError(403, `This invite was sent to ${row.email}. Sign in with that email.`);
    }
    row.userId = user._id;
    row.status = "active";
    await row.save();
    res.json({ workspaceId: String(workspace._id), workspaceName: workspace.name });
  }),
);
