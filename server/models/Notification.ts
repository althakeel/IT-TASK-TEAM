import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    boardId: { type: Schema.Types.ObjectId, ref: "Board", default: null },
    cardId: { type: Schema.Types.ObjectId, ref: "Card", default: null },
    read: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

notificationSchema.index({ userId: 1, createdAt: -1 });

export type NotificationDoc = HydratedDocument<InferSchemaType<typeof notificationSchema>>;
export const NotificationModel =
  (mongoose.models.Notification as mongoose.Model<InferSchemaType<typeof notificationSchema>>) ||
  mongoose.model("Notification", notificationSchema);
