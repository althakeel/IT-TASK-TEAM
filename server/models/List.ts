import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";

const listSchema = new Schema(
  {
    boardId: { type: Schema.Types.ObjectId, ref: "Board", required: true, index: true },
    title: { type: String, required: true, trim: true },
    position: { type: Number, required: true },
  },
  { timestamps: true, versionKey: false },
);

export type ListDoc = HydratedDocument<InferSchemaType<typeof listSchema>>;
export const ListModel =
  (mongoose.models.List as mongoose.Model<InferSchemaType<typeof listSchema>>) ||
  mongoose.model("List", listSchema);
