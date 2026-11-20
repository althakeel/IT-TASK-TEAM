import { adminEmail } from "./admin";
import { mongoReady } from "./db";
import { formatMinutes } from "./format-minutes";
import { CardModel, TimeAlertModel, UserModel } from "./models";
import { notifyUsers } from "./notify";

const HOUR_MS = 60 * 60 * 1000;

export function workdayMinutes(): number {
  const hours = Number(process.env.WORKDAY_HOURS || "9.5");
  if (!Number.isFinite(hours) || hours <= 0) return Math.round(9.5 * 60);
  return Math.round(hours * 60);
}

function dayKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function logDayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return dayKey(date);
}

export async function minutesWorkedToday(userId: string, day = dayKey()): Promise<number> {
  const cards = await CardModel.find({ deletedAt: null, "timeLogs.userId": userId }).select("timeLogs");
  let total = 0;
  for (const card of cards) {
    for (const entry of card.timeLogs || []) {
      if (String(entry.userId) !== userId) continue;
      if (logDayKey(entry.createdAt) !== day) continue;
      total += Number(entry.minutes) || 0;
    }
  }
  return total;
}

async function alertDayMax(input: {
  userId: string;
  userName: string;
  minutes: number;
}): Promise<void> {
  const max = workdayMinutes();
  const admin = await UserModel.findOne({ email: adminEmail() }).select("_id");
  const recipientIds = [input.userId];
  if (admin) recipientIds.push(String(admin._id));
  await notifyUsers({
    recipientIds,
    actorId: "000000000000000000000000",
    title: `Day time complete: ${input.userName}`,
    body: `${input.userName} logged ${formatMinutes(input.minutes)} today. Workday target is ${formatMinutes(max)}.`,
  });
}

export async function maybeAlertDayMax(userId: string): Promise<void> {
  if (!mongoReady()) return;
  const day = dayKey();
  const max = workdayMinutes();
  const minutes = await minutesWorkedToday(userId, day);
  if (minutes < max) return;
  const user = await UserModel.findById(userId).select("name email");
  if (!user?.email) return;
  const existing = await TimeAlertModel.findOne({ userId, day });
  const now = new Date();
  if (existing && now.getTime() - existing.lastSentAt.getTime() < HOUR_MS) return;
  await alertDayMax({
    userId: String(user._id),
    userName: user.name || user.email,
    minutes,
  });
  if (existing) {
    existing.lastSentAt = now;
    await existing.save();
  } else {
    await TimeAlertModel.create({ userId, day, lastSentAt: now });
  }
}

export async function runDayMaxAlerts(): Promise<void> {
  if (!mongoReady()) return;
  const day = dayKey();
  const max = workdayMinutes();
  const cards = await CardModel.find({ deletedAt: null, "timeLogs.0": { $exists: true } }).select("timeLogs");
  const totals = new Map<string, number>();
  for (const card of cards) {
    for (const entry of card.timeLogs || []) {
      if (logDayKey(entry.createdAt) !== day) continue;
      const id = String(entry.userId);
      totals.set(id, (totals.get(id) || 0) + (Number(entry.minutes) || 0));
    }
  }
  for (const [userId, minutes] of totals) {
    if (minutes < max) continue;
    await maybeAlertDayMax(userId);
  }
}

export function startTimeAlertJob(): void {
  const delay = HOUR_MS;
  setTimeout(() => {
    void runDayMaxAlerts().catch((error) => console.error("Time alert job failed.", error));
    setInterval(() => {
      void runDayMaxAlerts().catch((error) => console.error("Time alert job failed.", error));
    }, delay);
  }, 15_000);
}
