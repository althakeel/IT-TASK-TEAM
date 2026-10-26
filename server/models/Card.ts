import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";

const labelSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    color: { type: String, required: true },
  },
  { _id: false },
);

const checklistSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    done: { type: Boolean, required: true },
  },
  { _id: false },
);

const attachmentSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    fileId: { type: String, required: true },
    type: { type: String, enum: ["image", "video"], required: true },
    thumbnailUrl: { type: String, required: true },
  },
  { _id: false },
);

const cardSchema = new Schema(
  {
    listId: { type: Schema.Types.ObjectId, ref: "List", required: true, index: true },
    boardId: { type: Schema.Types.ObjectId, ref: "Board", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    position: { type: Number, required: true },
    dueDate: { type: String, default: null },
    labels: { type: [labelSchema], default: [] },
    assigneeIds: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
    checklist: { type: [checklistSchema], default: [] },
    attachments: { type: [attachmentSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

export type CardDoc = HydratedDocument<InferSchemaType<typeof cardSchema>>;
export const CardModel =
  (mongoose.models.Card as mongoose.Model<InferSchemaType<typeof cardSchema>>) ||
  mongoose.model("Card", cardSchema);
