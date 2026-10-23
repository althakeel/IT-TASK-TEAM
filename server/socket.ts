import type { Server } from "socket.io";
import { isAdminEmail } from "./admin";
import { requireBoard } from "./access";
import { mongoReady } from "./db";
import { verifyFirebaseToken } from "./firebase";
import { HttpError } from "./http";
import { UserModel } from "./models";

export function attachSocket(io: Server): void {
  io.use(async (socket, next) => {
    try {
      if (!mongoReady()) throw new HttpError(503, "Database is not connected.");
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string" || !token) throw new HttpError(401, "Sign in required.");
      const decoded = await verifyFirebaseToken(token);
      const user = await UserModel.findOne({ firebaseUid: decoded.uid });
      if (!user) throw new HttpError(401, "Account is not ready yet.");
      socket.data.userId = String(user._id);
      socket.data.email = user.email;
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(`user:${socket.data.userId}`);
    if (isAdminEmail(socket.data.email || "")) socket.join("admins");

    socket.on("board:join", async (boardId: unknown, ack?: unknown) => {
      const reply = typeof ack === "function" ? (ack as (message?: string) => void) : undefined;
      if (typeof boardId !== "string") {
        reply?.("Invalid board.");
        return;
      }
      try {
        await requireBoard(socket.data.userId, boardId);
        await socket.join(`board:${boardId}`);
        reply?.();
      } catch (error) {
        reply?.(error instanceof Error ? error.message : "Cannot join this board.");
      }
    });

    socket.on("board:leave", (boardId: unknown) => {
      if (typeof boardId === "string") socket.leave(`board:${boardId}`);
    });
  });
}

declare module "socket.io" {
  interface SocketData {
    userId: string;
    email: string;
  }
}
