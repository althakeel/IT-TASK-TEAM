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

const linkSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    url: { type: String, required: true },
  },
  { _id: false },
);

const timeLogSchema = new Schema(
  {
    id: { type: String, required: true },
    minutes: { type: Number, required: true },
    note: { type: String, default: "" },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    userName: { type: String, required: true },
    createdAt: { type: String, required: true },
  },
  { _id: false },
);

const timelineAppealSchema = new Schema(
  {
    requestedDueDate: { type: String, required: true },
    reason: { type: String, default: "" },
    status: { type: String, enum: ["pending", "approved", "rejected"], required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    requestedAt: { type: String, required: true },
  },
  { _id: false },
);

const handoffSchema = new Schema(
  {
    fromUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    fromUserName: { type: String, required: true },
    status: { type: String, enum: ["pending_accept", "accepted", "submitted", "approved"], required: true },
    acceptedAt: { type: String, default: null },
    submittedAt: { type: String, default: null },
    approvedAt: { type: String, default: null },
    appeal: { type: timelineAppealSchema, default: null },
  },
  { _id: false },
);

const historyEventSchema = new Schema(
  {
    id: { type: String, required: true },
    action: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorName: { type: String, required: true },
    detail: { type: String, default: "" },
    createdAt: { type: String, required: true },
  },
  { _id: false },
);

const cardSchema = new Schema(
  {
    listId: { type: Schema.Types.ObjectId, ref: "List", required: true, index: true },
    boardId: { type: Schema.Types.ObjectId, ref: "Board", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    suggestions: { type: String, default: "" },
    position: { type: Number, required: true },
    dueDate: { type: String, default: null },
    labels: { type: [labelSchema], default: [] },
    assigneeIds: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
    checklist: { type: [checklistSchema], default: [] },
    attachments: { type: [attachmentSchema], default: [] },
    links: { type: [linkSchema], default: [] },
    timeLogs: { type: [timeLogSchema], default: [] },
    history: { type: [historyEventSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    approval: { type: String, enum: ["pending", "approved", "rejected", "finalized", null], default: null },
    handoff: { type: handoffSchema, default: null },
    location: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

export type CardDoc = HydratedDocument<InferSchemaType<typeof cardSchema>>;
export const CardModel =
  (mongoose.models.Card as mongoose.Model<InferSchemaType<typeof cardSchema>>) ||
  mongoose.model("Card", cardSchema);
