/** Due values are "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" (local time). */
export function dueDay(due: string): string {
  return due.slice(0, 10);
}

export function hasDueTime(due: string): boolean {
  return due.length > 10;
}

/** Value for a datetime-local input. Date-only values default to 09:00. */
export function dueToInput(due: string): string {
  return hasDueTime(due) ? due.slice(0, 16) : `${dueDay(due)}T09:00`;
}

/** Local timestamp (ms) for a due date or due date+time. Date-only values end at 23:59:59. */
export function dueTimestamp(due: string): number {
  const [year, month, day] = dueDay(due).split("-").map(Number);
  if (hasDueTime(due)) {
    const [hh, mm] = due.slice(11, 16).split(":").map(Number);
    return new Date(year, month - 1, day, hh || 0, mm || 0, 0, 0).getTime();
  }
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

export function formatCountdown(ms: number): string {
  const abs = Math.abs(ms);
  const totalSec = Math.floor(abs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  let label = "";
  if (days > 0) label = `${days}d ${hours}h`;
  else if (hours > 0) label = `${hours}h ${mins}m`;
  else if (mins > 0) label = `${mins}m ${secs}s`;
  else label = `${secs}s`;
  return ms < 0 ? `${label} overdue` : `${label} left`;
}

export function formatDue(due: string): string {
  const [year, month, day] = dueDay(due).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (!hasDueTime(due)) {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
  }
  const [hh, mm] = due.slice(11, 16).split(":").map(Number);
  date.setHours(hh || 0, mm || 0, 0, 0);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export function isOverdue(due: string): boolean {
  if (hasDueTime(due)) {
    const [year, month, day] = dueDay(due).split("-").map(Number);
    const [hh, mm] = due.slice(11, 16).split(":").map(Number);
    return new Date(year, month - 1, day, hh || 0, mm || 0) < new Date();
  }
  const [year, month, day] = dueDay(due).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

export function dueWithinDays(due: string, days: number): boolean {
  const [year, month, day] = dueDay(due).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + days);
  return date >= today && date <= end;
}

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatMinutes(total: number): string {
  const minutes = Math.max(0, Math.round(total));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
