import mongoose from "mongoose";

export async function connectDb(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("MONGODB_URI is not set. The API will stay up and report the database as offline.");
    return;
  }
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(uri);
  console.log("MongoDB connected");
}

export function mongoReady(): boolean {
  return mongoose.connection.readyState === 1;
}
