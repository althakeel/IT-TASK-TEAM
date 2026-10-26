import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";

const commentSchema = new Schema(
  {
    cardId: { type: Schema.Types.ObjectId, ref: "Card", required: true, index: true },
    boardId: { type: Schema.Types.ObjectId, ref: "Board", required: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, default: "" },
    channel: { type: String, enum: ["comment", "chat"], default: "comment" },
    imageUrl: { type: String, default: "" },
    imageFileId: { type: String, default: "" },
    imageName: { type: String, default: "" },
  },
  { timestamps: true, versionKey: false },
);

export type CommentDoc = HydratedDocument<InferSchemaType<typeof commentSchema>>;
export const CommentModel =
  (mongoose.models.Comment as mongoose.Model<InferSchemaType<typeof commentSchema>>) ||
  mongoose.model("Comment", commentSchema);
