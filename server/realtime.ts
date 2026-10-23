import type { Server } from "socket.io";
import type { BoardEventMap, BoardEventName } from "../shared/types";

let io: Server | null = null;

export function setIo(server: Server): void {
  io = server;
}

export function emitBoard<K extends BoardEventName>(boardId: string, event: K, payload: BoardEventMap[K]): void {
  io?.to(`board:${boardId}`).emit(event, payload);
}

export function emitUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToUsers(userIds: string[], event: string, payload: unknown, includeAdmins = false): void {
  if (!io) return;
  const rooms = [...new Set(userIds.filter(Boolean).map((id) => `user:${id}`))];
  if (includeAdmins) rooms.push("admins");
  if (rooms.length === 0) return;
  let target = io.to(rooms[0]);
  for (const room of rooms.slice(1)) target = target.to(room);
  target.emit(event, payload);
}
