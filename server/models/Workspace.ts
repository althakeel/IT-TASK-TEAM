import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";

const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, versionKey: false },
);

export type WorkspaceDoc = HydratedDocument<InferSchemaType<typeof workspaceSchema>>;
export const WorkspaceModel =
  (mongoose.models.Workspace as mongoose.Model<InferSchemaType<typeof workspaceSchema>>) ||
  mongoose.model("Workspace", workspaceSchema);
