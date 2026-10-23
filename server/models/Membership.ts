import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";

const membershipSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ["owner", "admin", "member"], required: true },
    status: { type: String, enum: ["pending", "active"], required: true },
    inviteToken: { type: String },
  },
  { timestamps: true, versionKey: false },
);

membershipSchema.index({ workspaceId: 1, email: 1 }, { unique: true });
membershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true, sparse: true });
membershipSchema.index({ inviteToken: 1 }, { unique: true, sparse: true });

export type MembershipDoc = HydratedDocument<InferSchemaType<typeof membershipSchema>>;
export const MembershipModel =
  (mongoose.models.Membership as mongoose.Model<InferSchemaType<typeof membershipSchema>>) ||
  mongoose.model("Membership", membershipSchema);
