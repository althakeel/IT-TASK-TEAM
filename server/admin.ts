import type { UserDoc } from "./models";
import { MembershipModel, WorkspaceModel } from "./models";

const DEFAULT_ADMIN = "althakeel.com@gmail.com";

export function adminEmail(): string {
  return (process.env.ADMIN_EMAIL || DEFAULT_ADMIN).trim().toLowerCase();
}

export function isAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === adminEmail();
}

export async function ensureAdminWorkspace(user: UserDoc): Promise<void> {
  if (!isAdminEmail(user.email)) return;
  const owned = await MembershipModel.findOne({ userId: user._id, role: "owner", status: "active" });
  if (owned) return;
  const workspace = await WorkspaceModel.create({ name: "Team", ownerId: user._id });
  await MembershipModel.create({
    workspaceId: workspace._id,
    userId: user._id,
    email: user.email,
    role: "owner",
    status: "active",
  });
}
