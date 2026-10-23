import { randomUUID } from "crypto";
import mongoose from "mongoose";
import { BOARD_BACKGROUNDS, LABEL_PRESETS, type Attachment, type ChecklistItem, type Label, type Role } from "../shared/types";
import { HttpError } from "./http";
import { assertImageKitUrl } from "./imagekit";
import { MembershipModel } from "./models";

const backgrounds = new Set<string>(BOARD_BACKGROUNDS.map((item) => item.color));
const labelColors = new Map<string, string>(LABEL_PRESETS.map((item) => [item.color, item.name]));

export function cleanName(value: unknown, label: string, max: number): string {
  if (typeof value !== "string") throw new HttpError(400, `${label} is required.`);
  const text = value.trim();
  if (!text) throw new HttpError(400, `${label} is required.`);
  return text.slice(0, max);
}

export function optionalText(value: unknown, max: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new HttpError(400, "Invalid text.");
  return value.trim().slice(0, max);
}

export function assertPosition(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e12) {
    throw new HttpError(400, "Invalid position.");
  }
  return value;
}

export function assertEmail(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "Enter an email address.");
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    throw new HttpError(400, "Enter a valid email address.");
  }
  return email;
}

export function assertRole(value: unknown, allowed: Role[]): Role {
  if (typeof value !== "string" || !allowed.includes(value as Role)) {
    throw new HttpError(400, "Choose a valid role.");
  }
  return value as Role;
}

export function assertBackground(value: unknown): string {
  if (typeof value !== "string" || !backgrounds.has(value)) {
    throw new HttpError(400, "Choose a board color.");
  }
  return value;
}

function keepId(value: unknown): string {
  if (typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value)) return value;
  return randomUUID();
}

export function parseLabels(value: unknown): Label[] {
  if (!Array.isArray(value)) throw new HttpError(400, "Labels are invalid.");
  if (value.length > 12) throw new HttpError(400, "A card can have up to 12 labels.");
  const seen = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new HttpError(400, "Labels are invalid.");
    const record = item as Record<string, unknown>;
    const color = typeof record.color === "string" ? record.color : "";
    const preset = labelColors.get(color);
    if (!preset) throw new HttpError(400, "Unknown label color.");
    if (seen.has(color)) throw new HttpError(400, "Each label color can be used once.");
    seen.add(color);
    const name = typeof record.name === "string" && record.name.trim() ? record.name.trim().slice(0, 40) : preset;
    return { id: keepId(record.id), name, color };
  });
}

export function parseChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) throw new HttpError(400, "Checklist is invalid.");
  if (value.length > 100) throw new HttpError(400, "A checklist can have up to 100 items.");
  const items: ChecklistItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") throw new HttpError(400, "Checklist is invalid.");
    const record = item as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text.trim().slice(0, 300) : "";
    if (!text) continue;
    items.push({ id: keepId(record.id), text, done: Boolean(record.done) });
  }
  return items;
}

export function parseDueDate(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, "Use a valid due date.");
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new HttpError(400, "Use a valid due date.");
  }
  return value;
}

export function parseAttachment(value: unknown): Attachment {
  if (!value || typeof value !== "object") throw new HttpError(400, "Attachment is invalid.");
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" && record.name.trim() ? record.name.trim().slice(0, 140) : "file";
  const url = typeof record.url === "string" ? record.url : "";
  const fileId = typeof record.fileId === "string" ? record.fileId : "";
  const type = record.type === "video" ? "video" : record.type === "image" ? "image" : null;
  if (!type || !url || !fileId) throw new HttpError(400, "Attachment is missing a file.");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(fileId)) throw new HttpError(400, "Invalid file id.");
  assertImageKitUrl(url);
  const fallbackThumb = type === "video" ? `${url}/ik-thumbnail.jpg` : url;
  const thumbnailUrl = typeof record.thumbnailUrl === "string" && record.thumbnailUrl ? record.thumbnailUrl : fallbackThumb;
  assertImageKitUrl(thumbnailUrl);
  return { id: keepId(record.id), name, url, fileId, type, thumbnailUrl };
}

export function parseAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) throw new HttpError(400, "Attachments are invalid.");
  if (value.length > 20) throw new HttpError(400, "A card can have up to 20 attachments.");
  return value.map((item) => parseAttachment(item));
}

export async function parseAssignees(value: unknown, workspaceId: string): Promise<mongoose.Types.ObjectId[]> {
  if (!Array.isArray(value)) throw new HttpError(400, "Assignees are invalid.");
  const ids = [...new Set(value.map((item) => String(item)))];
  if (ids.length > 50) throw new HttpError(400, "Too many assignees.");
  if (ids.some((id) => !mongoose.isValidObjectId(id))) throw new HttpError(400, "Assignee is invalid.");
  if (!ids.length) return [];
  const members = await MembershipModel.find({
    workspaceId,
    status: "active",
    userId: { $in: ids },
  }).select("userId");
  if (members.length !== ids.length) throw new HttpError(400, "Assignee is not in this workspace.");
  return ids.map((id) => new mongoose.Types.ObjectId(id));
}
