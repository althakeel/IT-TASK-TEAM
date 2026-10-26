"use client";

import type { Card, List, Membership } from "@shared/types";
import { Avatar, cx } from "@/components/ui";
import { formatDue, isOverdue } from "@/lib/format";

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
  const people = members.filter((member) => member.status === "active" && member.userId);
  const rows = lists.flatMap((list) => list.cards.map((card) => ({ card, list })));
  const scoped = selectedId === "all" ? rows : rows.filter((row) => row.card.assigneeIds.includes(selectedId));
  const counts = tally(scoped);
  const personBars = people
    .map((member) => ({ member, counts: tally(rows.filter((row) => row.card.assigneeIds.includes(member.userId || ""))) }))
    .sort((a, b) => b.counts.total - a.counts.total);
  const listBars = lists.map((list) => ({
    list,
    counts: tally(scoped.filter((row) => row.list.id === list.id)),
  }));
  const maxPerson = Math.max(1, ...personBars.map((item) => item.counts.total));
  const maxList = Math.max(1, ...listBars.map((item) => item.counts.total));

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
                  <span className="w-24 text-right text-xs text-[#5e6c84]">
                    {item.counts.onTime} on time · {item.counts.total}
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
