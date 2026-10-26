export const TRASH_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function trashCutoff(): Date {
  return new Date(Date.now() - TRASH_DAYS * DAY_MS);
}

export function daysLeft(deletedAt: Date): number {
  const remaining = deletedAt.getTime() + TRASH_DAYS * DAY_MS - Date.now();
  return Math.max(1, Math.ceil(remaining / DAY_MS));
}

export function deletedDate(doc: { get(path: string): unknown }): Date | null {
  const value = doc.get("deletedAt");
  return value instanceof Date ? value : null;
}
