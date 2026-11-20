import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";

const timeAlertSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    day: { type: String, required: true },
    lastSentAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);

timeAlertSchema.index({ userId: 1, day: 1 }, { unique: true });

export type TimeAlertDoc = HydratedDocument<InferSchemaType<typeof timeAlertSchema>>;
export const TimeAlertModel =
  (mongoose.models.TimeAlert as mongoose.Model<InferSchemaType<typeof timeAlertSchema>>) ||
  mongoose.model("TimeAlert", timeAlertSchema);
