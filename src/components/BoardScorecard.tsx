"use client";

import { useMemo, useState } from "react";
import type { Card, List, Membership, TimeLog } from "@shared/types";
import { Avatar, cx } from "@/components/ui";
import { formatDue, formatMinutes, formatWhen, isOverdue } from "@/lib/format";
import { cardCompletion } from "@/lib/completion";

/** Employee rating out of 10: half average task completion %, half on-time %. */
function rateEmployee(rows: { card: Card; list: List }[], counts: Counts): { score: number | null; completion: number; onTimePct: number } {
  if (rows.length === 0) return { score: null, completion: 0, onTimePct: 0 };
  const completion = Math.round(rows.reduce((sum, row) => sum + cardCompletion(row.card, row.list.title).percent, 0) / rows.length);
  const onTimePct = Math.round((counts.onTime / rows.length) * 100);
  return { score: Math.round(((completion + onTimePct) / 20) * 10) / 10, completion, onTimePct };
}

type Status = "on-time" | "late" | "overdue" | "open";

const STATUS_LABEL: Record<Status, string> = {
  "on-time": "Completed on time",
  late: "Completed late",
  overdue: "Overdue",
  open: "Still open",
};

const STATUS_CLASS: Record<Status, string> = {
  "on-time": "bg-[#dcfff1] text-[#216e4e]",
  late: "bg-[#fff7d6] text-[#7f5f01]",
  overdue: "bg-[#ffeceb] text-[#ae2e24]",
  open: "bg-[#f1f2f4] text-[#44546f]",
};

const BAR_COLOR: Record<Status, string> = {
  "on-time": "#1f845a",
  late: "#b38600",
  overdue: "#c9372c",
  open: "#8590a2",
};

type Counts = { total: number; onTime: number; late: number; overdue: number; open: number };

function listIsDone(title: string): boolean {
  return /^(done|complete|completed)$/i.test(title.trim());
}

function taskComplete(card: Card, listTitle: string): boolean {
  const checksDone = card.checklist.length > 0 && card.checklist.every((item) => item.done);
  return checksDone || listIsDone(listTitle);
}

function tally(rows: { card: Card; list: List }[]): Counts {
  const counts = { total: rows.length, onTime: 0, late: 0, overdue: 0, open: 0 };
  for (const row of rows) {
    const status = taskStatus(row.card, row.list.title);
    if (status === "on-time") counts.onTime += 1;
    else if (status === "late") counts.late += 1;
    else if (status === "overdue") counts.overdue += 1;
    else counts.open += 1;
  }
  return counts;
}

function taskStatus(card: Card, listTitle: string): Status {
  const complete = taskComplete(card, listTitle);
  const late = Boolean(card.dueDate && isOverdue(card.dueDate));
  if (complete && late) return "late";
  if (complete) return "on-time";
  if (late) return "overdue";
  return "open";
}

function todayKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function logDayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function hoursToMinutes(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return Math.round(9.5 * 60);
  return Math.round(parsed * 60);
}

export function BoardScorecard({
  lists,
  members,
  selectedId,
  onSelect,
  onOpen,
  onClose,
}: {
  lists: List[];
  members: Membership[];
  selectedId: string;
  onSelect: (id: string) => void;
  onOpen: (cardId: string) => void;
  onClose: () => void;
}) {
  const [day, setDay] = useState(todayKey);
  const [dayHours, setDayHours] = useState("9.5");
  const expectedMinutes = hoursToMinutes(dayHours);
  const people = members.filter((member) => member.status === "active" && member.userId && member.role === "member");
  const rows = lists.flatMap((list) =>
    list.cards.filter((card) => card.approval !== "pending" && card.approval !== "rejected").map((card) => ({ card, list })),
  );
  const scoped = selectedId === "all" ? rows : rows.filter((row) => row.card.assigneeIds.includes(selectedId));
  const dailySubmitted = scoped.filter(({ card }) => Boolean(card.handoff?.submittedAt && logDayKey(card.handoff.submittedAt) === day));
  const dailySubmittedApproved = dailySubmitted.filter(({ card }) => card.handoff?.status === "approved").length;
  const dailySubmittedPending = dailySubmitted.filter(({ card }) => card.handoff?.status === "submitted").length;
  const counts = tally(scoped);
  const personBars = people
    .map((member) => {
      const memberRows = rows.filter((row) => row.card.assigneeIds.includes(member.userId || ""));
      const memberCounts = tally(memberRows);
      return { member, counts: memberCounts, rating: rateEmployee(memberRows, memberCounts) };
    })
    .sort((a, b) => b.counts.total - a.counts.total);
  const listBars = lists.map((list) => ({
    list,
    counts: tally(scoped.filter((row) => row.list.id === list.id)),
  }));
  const maxPerson = Math.max(1, ...personBars.map((item) => item.counts.total));
  const maxList = Math.max(1, ...listBars.map((item) => item.counts.total));
  const dayLogs = useMemo(() => {
    const logs: (TimeLog & { cardId: string; cardTitle: string })[] = [];
    for (const list of lists) {
      for (const card of list.cards) {
        for (const entry of card.timeLogs || []) {
          if (logDayKey(entry.createdAt) !== day) continue;
          logs.push({ ...entry, cardId: card.id, cardTitle: card.title });
        }
      }
    }
    return logs;
  }, [lists, day]);
  const timeByPerson = people
    .map((member) => {
      const logs = dayLogs.filter((entry) => entry.userId === member.userId);
      const minutes = logs.reduce((sum, entry) => sum + entry.minutes, 0);
      return { member, minutes, logs };
    })
    .sort((a, b) => b.minutes - a.minutes || (a.member.name || "").localeCompare(b.member.name || ""));
  const teamMinutes = timeByPerson.reduce((sum, row) => sum + row.minutes, 0);
  const selectedTime =
    selectedId === "all" ? null : timeByPerson.find((row) => row.member.userId === selectedId) || null;

  return (
    <div className="absolute inset-x-0 bottom-14 top-14 z-20 overflow-y-auto bg-[#f7f8fa]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Scorecard</h2>
            <p className="mt-1 text-sm text-[#5e6c84]">
              Only you see this. A task is complete when every checklist item is checked, or it is in a Done list. It is on time when that happens before the due date.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-[#44546f] hover:bg-[#091e420f]">
            Close
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Kpi label="Tasks" value={counts.total} />
          <Kpi label="On time" value={counts.onTime} tone="good" />
          <Kpi label="Completed late" value={counts.late} tone="warn" />
          <Kpi label="Overdue" value={counts.overdue} tone="bad" />
          <Kpi label="Still open" value={counts.open} />
        </div>
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Daily time</h3>
              <p className="mt-1 text-xs text-[#5e6c84]">
                Choose a date and the workday length. Compare how much each person logged against that day.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-[#5e6c84]">
                Date
                <input
                  type="date"
                  value={day}
                  onChange={(event) => setDay(event.target.value)}
                  className="mt-1 block rounded-md border border-[#dfe1e6] px-2 py-1.5 text-sm text-[#172b4d]"
                />
              </label>
              <label className="text-xs text-[#5e6c84]">
                Day hours
                <input
                  type="number"
                  min="1"
                  max="24"
                  step="0.5"
                  value={dayHours}
                  onChange={(event) => setDayHours(event.target.value)}
                  className="mt-1 block w-24 rounded-md border border-[#dfe1e6] px-2 py-1.5 text-sm text-[#172b4d]"
                />
              </label>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-[#f7f8f9] px-3 py-2">
              <p className="text-xs text-[#5e6c84]">Team logged</p>
              <p className="text-lg font-semibold">{formatMinutes(teamMinutes)}</p>
            </div>
            <div className="rounded-xl bg-[#f7f8f9] px-3 py-2">
              <p className="text-xs text-[#5e6c84]">Expected day</p>
              <p className="text-lg font-semibold">{formatMinutes(expectedMinutes)}</p>
            </div>
            <div className="rounded-xl bg-[#f7f8f9] px-3 py-2">
              <p className="text-xs text-[#5e6c84]">People with time</p>
              <p className="text-lg font-semibold">{timeByPerson.filter((row) => row.minutes > 0).length}</p>
            </div>
            <div className="rounded-xl bg-[#f7f8f9] px-3 py-2">
              <p className="text-xs text-[#5e6c84]">Entries</p>
              <p className="text-lg font-semibold">{dayLogs.length}</p>
            </div>
          </div>
          <ul className="mt-4 flex flex-col gap-3">
            {timeByPerson.map((row) => {
              const pct = Math.min(100, Math.round((row.minutes / expectedMinutes) * 100));
              const remaining = expectedMinutes - row.minutes;
              return (
                <li key={row.member.id} className="rounded-xl border border-[#f1f2f4] px-3 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onSelect(row.member.userId || "all")}>
                      <Avatar name={row.member.name || row.member.email} photo={row.member.photo} size={28} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{row.member.name || row.member.email}</span>
                        <span className="text-xs text-[#5e6c84]">
                          {formatMinutes(row.minutes)} of {formatMinutes(expectedMinutes)}
                          {remaining > 0
                            ? ` · ${formatMinutes(remaining)} left`
                            : remaining < 0
                              ? ` · ${formatMinutes(-remaining)} over`
                              : " · full day"}
                        </span>
                      </span>
                    </button>
                    <span className={cx("text-sm font-semibold", row.minutes >= expectedMinutes ? "text-[#216e4e]" : "text-[#172b4d]")}>
                      {pct}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f1f2f4]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: row.minutes >= expectedMinutes ? "#1f845a" : "#0c66e4" }}
                    />
                  </div>
                  {selectedId === row.member.userId && row.logs.length > 0 ? (
                    <ul className="mt-3 flex flex-col gap-1 border-t border-[#f1f2f4] pt-2">
                      {row.logs.map((entry) => (
                        <li key={entry.id}>
                          <button type="button" onClick={() => onOpen(entry.cardId)} className="w-full rounded-md px-1 py-1 text-left text-xs hover:bg-[#f7f8f9]">
                            <span className="font-medium text-[#172b4d]">{formatMinutes(entry.minutes)}</span>
                            <span className="text-[#5e6c84]"> on {entry.cardTitle}</span>
                            {entry.note ? <span className="text-[#5e6c84]"> · {entry.note}</span> : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {selectedTime && selectedTime.minutes === 0 ? (
            <p className="mt-3 text-sm text-[#5e6c84]">No time logged for this person on this date.</p>
          ) : null}
        </section>
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Daily submitted ({day})</h3>
              <p className="mt-1 text-xs text-[#5e6c84]">
                Given tasks submitted for approval on the selected date. Click any task to open details and history.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-full bg-[#f1f2f4] px-2.5 py-1 text-[#172b4d]">Total: {dailySubmitted.length}</span>
              <span className="rounded-full bg-[#dcfff1] px-2.5 py-1 text-[#216e4e]">Approved: {dailySubmittedApproved}</span>
              <span className="rounded-full bg-[#fff7d6] px-2.5 py-1 text-[#7f5f01]">Waiting: {dailySubmittedPending}</span>
            </div>
          </div>
          {dailySubmitted.length === 0 ? (
            <p className="mt-3 text-sm text-[#5e6c84]">No tasks were submitted on {day}.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {dailySubmitted.map(({ card, list }) => {
                const assignees = card.assigneeIds
                  .map((id) => people.find((m) => m.userId === id)?.name || people.find((m) => m.userId === id)?.email || "Member")
                  .join(", ");
                const appeals = (card.history || []).filter((e) => e.action === "Timeline appeal requested").length;
                return (
                  <li key={card.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(card.id)}
                      className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-[#f1f2f4] px-3 py-2.5 text-left hover:border-[#0c66e4]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#172b4d]">{card.title}</p>
                        <p className="mt-0.5 text-xs text-[#5e6c84]">
                          {list.title} · From {card.handoff?.fromUserName || "Member"}
                          {assignees ? ` → To ${assignees}` : ""}
                          {card.handoff?.submittedAt ? ` · Submitted ${formatWhen(card.handoff.submittedAt)}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        {appeals > 0 ? (
                          <span className="rounded-full bg-[#fff7d6] px-2 py-0.5 font-medium text-[#7f5f01]">{appeals} appeal(s)</span>
                        ) : null}
                        <span
                          className={cx(
                            "rounded-full px-2.5 py-0.5 font-medium",
                            card.handoff?.status === "approved" ? "bg-[#dcfff1] text-[#216e4e]" : "bg-[#f3f0ff] text-[#5e4db2]",
                          )}
                        >
                          {card.handoff?.status === "approved" ? "Approved" : "Waiting approval"}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold">By person</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <PersonChip label="Everyone" count={rows.length} active={selectedId === "all"} onClick={() => onSelect("all")} />
            {people.map((member) => {
              const count = rows.filter((row) => row.card.assigneeIds.includes(member.userId || "")).length;
              return (
                <PersonChip
                  key={member.id}
                  label={member.name || member.email}
                  photo={member.photo}
                  count={count}
                  active={selectedId === member.userId}
                  onClick={() => onSelect(member.userId || "all")}
                />
              );
            })}
          </div>
          <ChartLegend />
          <ul className="mt-4 flex flex-col gap-3">
            {personBars.map((item) => (
              <li key={item.member.id}>
                <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => onSelect(item.member.userId || "all")}>
                  <span className="flex w-36 items-center gap-2">
                    <Avatar name={item.member.name || item.member.email} photo={item.member.photo} size={22} />
                    <span className="truncate text-sm">{item.member.name || item.member.email}</span>
                  </span>
                  <StackedBar counts={item.counts} max={maxPerson} />
                  <span className="w-44 text-right text-xs text-[#5e6c84]" title="Rating = (average completion % + on-time %) ÷ 20, out of 10">
                    <span className="block font-semibold text-[#0c66e4]">
                      {item.rating.score === null ? "No tasks" : `${item.rating.score}/10`}
                    </span>
                    <span className="block">
                      Completion {item.rating.completion}% · On time {item.rating.onTimePct}% · {item.counts.total} tasks
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold">Board structure</h3>
          <p className="mt-1 text-xs text-[#5e6c84]">Each list on this board, with how the tasks in it are doing.</p>
          <ChartLegend />
          <ul className="mt-4 flex flex-col gap-3">
            {listBars.map((item) => (
              <li key={item.list.id} className="flex items-center gap-3">
                <span className="w-36 truncate text-sm font-medium">{item.list.title}</span>
                <StackedBar counts={item.counts} max={maxList} />
                <span className="w-16 text-right text-xs text-[#5e6c84]">{item.counts.total}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="flex flex-col gap-4">
          {lists.map((list) => {
            const cards =
              selectedId === "all" ? list.cards : list.cards.filter((card) => card.assigneeIds.includes(selectedId));
            if (cards.length === 0) return null;
            return (
              <div key={list.id}>
                <h3 className="mb-2 text-sm font-semibold text-[#44546f]">{list.title}</h3>
                <ul className="flex flex-col gap-2">
                  {cards.map((card) => {
                    const status = taskStatus(card, list.title);
                    const done = card.checklist.filter((item) => item.done).length;
                    const tagged = people.filter((member) => card.assigneeIds.includes(member.userId || ""));
                    return (
                      <li key={card.id}>
                        <button
                          type="button"
                          onClick={() => onOpen(card.id)}
                          className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-3 text-left shadow-sm hover:ring-2 hover:ring-[#0c66e4]"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{card.title}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#5e6c84]">
                              {card.dueDate ? <span>Due {formatDue(card.dueDate)}</span> : <span>No due date</span>}
                              {card.checklist.length > 0 ? (
                                <span>
                                  Checklist {done}/{card.checklist.length}
                                </span>
                              ) : null}
                              {card.handoff ? (
                                <span className="rounded bg-[#f3f0ff] px-1.5 py-0.5 font-medium text-[#5e4db2]">
                                  Given · {card.handoff.status.replace("_", " ")}
                                </span>
                              ) : null}
                              {(card.history || []).filter((e) => e.action === "Timeline appeal requested").length > 0 ? (
                                <span className="rounded bg-[#fff7d6] px-1.5 py-0.5 font-medium text-[#7f5f01]">
                                  {(card.history || []).filter((e) => e.action === "Timeline appeal requested").length} appeal(s)
                                </span>
                              ) : null}
                            </span>
                          </span>
                          <span className="flex -space-x-1">
                            {tagged.map((member) => (
                              <Avatar key={member.id} name={member.name || member.email} photo={member.photo} size={24} />
                            ))}
                          </span>
                          <span className={cx("shrink-0 rounded-full px-2 py-1 text-xs font-medium", STATUS_CLASS[status])}>{STATUS_LABEL[status]}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {scoped.length === 0 ? <p className="text-sm text-[#5e6c84]">No tasks for this person on this board.</p> : null}
        </section>
      </div>
    </div>
  );
}

function StackedBar({ counts, max }: { counts: Counts; max: number }) {
  const width = counts.total === 0 ? 0 : Math.max(8, (counts.total / max) * 100);
  const parts: { key: Status; n: number }[] = [
    { key: "on-time", n: counts.onTime },
    { key: "late", n: counts.late },
    { key: "overdue", n: counts.overdue },
    { key: "open", n: counts.open },
  ];
  return (
    <span className="h-7 flex-1 overflow-hidden rounded-md bg-[#f1f2f4]">
      <span className="flex h-full" style={{ width: `${width}%` }}>
        {parts.map((part) =>
          part.n > 0 ? (
            <span key={part.key} title={`${STATUS_LABEL[part.key]}: ${part.n}`} className="h-full" style={{ width: `${(part.n / counts.total) * 100}%`, backgroundColor: BAR_COLOR[part.key] }} />
          ) : null,
        )}
      </span>
    </span>
  );
}

function ChartLegend() {
  const items: Status[] = ["on-time", "late", "overdue", "open"];
  return (
    <ul className="mt-3 flex flex-wrap gap-3">
      {items.map((item) => (
        <li key={item} className="flex items-center gap-1.5 text-xs text-[#5e6c84]">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: BAR_COLOR[item] }} />
          {STATUS_LABEL[item]}
        </li>
      ))}
    </ul>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" | "bad" }) {
  const toneClass = tone === "good" ? "text-[#216e4e]" : tone === "warn" ? "text-[#7f5f01]" : tone === "bad" ? "text-[#ae2e24]" : "text-[#172b4d]";
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
      <p className={cx("text-2xl font-semibold", toneClass)}>{value}</p>
      <p className="text-xs text-[#5e6c84]">{label}</p>
    </div>
  );
}

function PersonChip({
  label,
  photo,
  count,
  active,
  onClick,
}: {
  label: string;
  photo?: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-2 rounded-full border px-2 py-1 text-sm",
        active ? "border-[#0c66e4] bg-[#e9f2ff]" : "border-[#dfe1e6] bg-white",
      )}
    >
      {photo !== undefined || label !== "Everyone" ? <Avatar name={label} photo={photo} size={22} /> : null}
      <span className="max-w-40 truncate">{label}</span>
      <span className="text-xs text-[#5e6c84]">{count}</span>
    </button>
  );
}
