import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    firebaseUid: { type: String, required: true, unique: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    photo: { type: String, default: "" },
  },
  { timestamps: true, versionKey: false },
);

userSchema.index({ email: 1 });

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const UserModel =
  (mongoose.models.User as mongoose.Model<InferSchemaType<typeof userSchema>>) ||
  mongoose.model("User", userSchema);
