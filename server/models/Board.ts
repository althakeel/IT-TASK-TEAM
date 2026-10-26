import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";

const boardSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    title: { type: String, required: true, trim: true },
    background: { type: String, required: true },
    backgroundImage: { type: String, default: "" },
    description: { type: String, default: "" },
    closed: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

export type BoardDoc = HydratedDocument<InferSchemaType<typeof boardSchema>>;
export const BoardModel =
  (mongoose.models.Board as mongoose.Model<InferSchemaType<typeof boardSchema>>) ||
  mongoose.model("Board", boardSchema);
