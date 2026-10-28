"use client";

import { useMemo, useState } from "react";
import type { Card, List, Membership } from "@shared/types";
import { Avatar } from "@/components/ui";
import { dueWithinDays, formatDue, isOverdue } from "@/lib/format";

export type BoardLayout = "board" | "table" | "calendar" | "timeline" | "dashboard" | "map";

const LAYOUTS: { id: BoardLayout; label: string }[] = [
  { id: "board", label: "Board" },
  { id: "table", label: "Table" },
  { id: "calendar", label: "Calendar" },
  { id: "timeline", label: "Timeline" },
  { id: "dashboard", label: "Dashboard" },
  { id: "map", label: "Map" },
];

type Row = { card: Card; listTitle: string };

function rowsOf(lists: List[]): Row[] {
  return lists.flatMap((list) => list.cards.map((card) => ({ card, listTitle: list.title })));
}

function peopleMap(members: Membership[]): Map<string, Membership> {
  return new Map(members.filter((member) => member.userId).map((member) => [member.userId as string, member]));
}

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseDay(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function addDays(date: Date, count: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

export function ViewMenu({
  layout,
  onChange,
}: {
  layout: BoardLayout;
  onChange: (layout: BoardLayout) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = LAYOUTS.find((item) => item.id === layout) || LAYOUTS[0];
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-1 text-sm font-medium text-[#172b4d]"
      >
        <LayoutIcon id={current.id} />
        {current.label}
      </button>
      {open ? (
        <>
          <button type="button" aria-label="Close views" className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute left-0 top-full z-30 mt-1 w-56 rounded-lg bg-[#1d2125] py-2 text-sm text-white shadow-xl">
            {LAYOUTS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/10 ${layout === item.id ? "bg-white/15 font-semibold" : ""}`}
              >
                <LayoutIcon id={item.id} />
                {item.label}
              </button>
            ))}
            <p className="px-3 pt-2 text-xs text-white/60">See your work in new ways</p>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function BoardViews({
  layout,
  lists,
  members,
  onOpen,
}: {
  layout: Exclude<BoardLayout, "board">;
  lists: List[];
  members: Membership[];
  onOpen: (cardId: string) => void;
}) {
  const rows = rowsOf(lists);
  return (
    <div className="h-full overflow-auto p-3">
      <div className="min-h-full rounded-xl bg-white/95 p-3 text-[#172b4d]">
        {layout === "table" ? <TableView rows={rows} members={members} onOpen={onOpen} /> : null}
        {layout === "calendar" ? <CalendarView rows={rows} onOpen={onOpen} /> : null}
        {layout === "timeline" ? <TimelineView lists={lists} onOpen={onOpen} /> : null}
        {layout === "dashboard" ? <DashboardView lists={lists} members={members} onOpen={onOpen} /> : null}
        {layout === "map" ? <MapView rows={rows} onOpen={onOpen} /> : null}
      </div>
    </div>
  );
}

function TableView({ rows, members, onOpen }: { rows: Row[]; members: Membership[]; onOpen: (cardId: string) => void }) {
  const people = peopleMap(members);
  if (rows.length === 0) return <Empty label="No tasks in this view." />;
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[#dfe1e6] text-xs uppercase tracking-wide text-[#5e6c84]">
            <th className="px-2 py-2 font-semibold">Task</th>
            <th className="px-2 py-2 font-semibold">List</th>
            <th className="px-2 py-2 font-semibold">Members</th>
            <th className="px-2 py-2 font-semibold">Due</th>
            <th className="px-2 py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.card.id} className="border-b border-[#f1f2f4] hover:bg-[#f7f8f9]">
              <td className="px-2 py-2">
                <button type="button" onClick={() => onOpen(row.card.id)} className="text-left font-medium hover:underline">
                  {row.card.title}
                </button>
              </td>
              <td className="px-2 py-2 text-[#44546f]">{row.listTitle}</td>
              <td className="px-2 py-2">
                <span className="flex -space-x-1">
                  {row.card.assigneeIds.map((id) => {
                    const person = people.get(id);
                    return <Avatar key={id} name={person?.name || person?.email || "?"} photo={person?.photo} size={22} />;
                  })}
                </span>
              </td>
              <td className={`px-2 py-2 ${row.card.dueDate && isOverdue(row.card.dueDate) ? "text-[#ae2e24]" : "text-[#44546f]"}`}>
                {row.card.dueDate ? formatDue(row.card.dueDate) : "—"}
              </td>
              <td className="px-2 py-2 text-[#44546f]">{statusLabel(row.card)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CalendarView({ rows, onOpen }: { rows: Row[]; onOpen: (cardId: string) => void }) {
  const [cursor, setCursor] = useState(() => new Date());
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const start = addDays(first, -first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index));
  const byDay = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of rows) {
      if (!row.card.dueDate) continue;
      const list = map.get(row.card.dueDate) || [];
      list.push(row);
      map.set(row.card.dueDate, list);
    }
    return map;
  }, [rows]);
  const undated = rows.filter((row) => !row.card.dueDate);
  const title = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(first);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))} className="rounded-md px-2 py-1 text-sm hover:bg-[#091e420f]">
          Previous
        </button>
        <h2 className="text-base font-semibold">{title}</h2>
        <button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))} className="rounded-md px-2 py-1 text-sm hover:bg-[#091e420f]">
          Next
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-[#5e6c84]">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((name) => (
          <div key={name} className="py-1">
            {name}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = dayKey(day);
          const items = byDay.get(key) || [];
          const inMonth = day.getMonth() === month;
          return (
            <div key={key} className={`min-h-24 rounded-md border border-[#f1f2f4] p-1 ${inMonth ? "bg-white" : "bg-[#f7f8f9] text-[#97a0af]"}`}>
              <p className="text-xs">{day.getDate()}</p>
              <div className="mt-1 flex flex-col gap-1">
                {items.map((row) => (
                  <button
                    key={row.card.id}
                    type="button"
                    onClick={() => onOpen(row.card.id)}
                    className="truncate rounded bg-[#e9f2ff] px-1 py-0.5 text-left text-xs text-[#0c66e4]"
                  >
                    {row.card.title}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {undated.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">No due date</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {undated.map((row) => (
              <button key={row.card.id} type="button" onClick={() => onOpen(row.card.id)} className="rounded-md bg-[#f1f2f4] px-2 py-1 text-sm">
                {row.card.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function laneHeight(cards: Card[]): number {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const key = card.dueDate || dayKey(new Date(card.createdAt || Date.now()));
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return 8 + Math.max(1, ...counts.values(), 1) * 30;
}

function TimelineView({ lists, onOpen }: { lists: List[]; onOpen: (cardId: string) => void }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cards = lists.flatMap((list) => list.cards);
  const keys = cards.map((card) => card.dueDate || dayKey(new Date(card.createdAt || Date.now())));
  const sorted = keys.slice().sort();
  const start = parseDay(sorted[0] || dayKey(today));
  const end = parseDay(sorted[sorted.length - 1] || dayKey(addDays(today, 13)));
  if (addDays(start, 13) > end) end.setTime(addDays(start, 13).getTime());
  const days: Date[] = [];
  for (let cursor = new Date(start); cursor <= end && days.length < 60; cursor = addDays(cursor, 1)) days.push(new Date(cursor));
  const index = new Map(days.map((day, position) => [dayKey(day), position]));
  return (
    <div className="overflow-auto">
      <div className="flex border-b border-[#dfe1e6] pl-36" style={{ width: 144 + days.length * 72 }}>
        {days.map((day) => (
          <div key={dayKey(day)} className={`w-[72px] shrink-0 px-1 py-1 text-xs ${dayKey(day) === dayKey(today) ? "font-semibold text-[#0c66e4]" : "text-[#5e6c84]"}`}>
            {day.getDate()} {day.toLocaleString(undefined, { month: "short" })}
          </div>
        ))}
      </div>
      {lists.map((list) => (
        <div key={list.id} className="flex border-b border-[#f1f2f4]" style={{ width: 144 + days.length * 72 }}>
          <div className="sticky left-0 w-36 shrink-0 bg-white px-2 py-3 text-sm font-semibold">{list.title}</div>
          <div className="relative flex-1" style={{ height: laneHeight(list.cards) }}>
            {list.cards.map((card) => {
              const key = card.dueDate || dayKey(new Date(card.createdAt || Date.now()));
              const position = index.get(key);
              if (position === undefined) return null;
              const slot = list.cards.filter((item) => (item.dueDate || dayKey(new Date(item.createdAt || Date.now()))) === key).findIndex((item) => item.id === card.id);
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => onOpen(card.id)}
                  title={card.title}
                  className="absolute h-7 truncate rounded-md bg-[#0c66e4] px-2 text-left text-xs font-medium text-white"
                  style={{ left: position * 72, top: 4 + slot * 30, width: 132 }}
                >
                  {card.title}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {cards.length === 0 ? <Empty label="No tasks in this view." /> : null}
    </div>
  );
}

function DashboardView({ lists, members, onOpen }: { lists: List[]; members: Membership[]; onOpen: (cardId: string) => void }) {
  const cards = lists.flatMap((list) => list.cards);
  const overdue = cards.filter((card) => card.dueDate && isOverdue(card.dueDate)).length;
  const week = cards.filter((card) => card.dueDate && dueWithinDays(card.dueDate, 7)).length;
  const waiting = cards.filter((card) => card.approval === "pending").length;
  const max = Math.max(1, ...lists.map((list) => list.cards.length));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tasks" value={cards.length} />
        <Stat label="Overdue" value={overdue} />
        <Stat label="Due this week" value={week} />
        <Stat label="Waiting approval" value={waiting} />
      </div>
      <div>
        <h3 className="text-sm font-semibold">Lists</h3>
        <div className="mt-2 flex flex-col gap-2">
          {lists.map((list) => (
            <div key={list.id}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{list.title}</span>
                <span className="text-[#5e6c84]">{list.cards.length}</span>
              </div>
              <div className="h-2 rounded-full bg-[#f1f2f4]">
                <div className="h-2 rounded-full bg-[#0c66e4]" style={{ width: `${(list.cards.length / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold">People</h3>
        <ul className="mt-2 flex flex-col gap-2">
          {members
            .filter((member) => member.status === "active" && member.userId && member.role === "member")
            .map((member) => {
              const count = cards.filter((card) => card.assigneeIds.includes(member.userId || "")).length;
              return (
                <li key={member.id} className="flex items-center gap-2 text-sm">
                  <Avatar name={member.name || member.email} photo={member.photo} size={24} />
                  <span className="flex-1">{member.name || member.email}</span>
                  <span className="text-[#5e6c84]">{count}</span>
                </li>
              );
            })}
        </ul>
      </div>
      <div>
        <h3 className="text-sm font-semibold">Overdue</h3>
        <div className="mt-2 flex flex-col gap-1">
          {cards
            .filter((card) => card.dueDate && isOverdue(card.dueDate))
            .map((card) => (
              <button key={card.id} type="button" onClick={() => onOpen(card.id)} className="rounded-md px-2 py-1 text-left text-sm hover:bg-[#ffeceb]">
                {card.title}
                <span className="ml-2 text-xs text-[#ae2e24]">{formatDue(card.dueDate || "")}</span>
              </button>
            ))}
          {overdue === 0 ? <p className="text-sm text-[#5e6c84]">Nothing is overdue.</p> : null}
        </div>
      </div>
    </div>
  );
}

function MapView({ rows, onOpen }: { rows: Row[]; onOpen: (cardId: string) => void }) {
  const placed = rows.filter((row) => row.card.location.trim());
  const [selectedId, setSelectedId] = useState(placed[0]?.card.id || "");
  const selected = placed.find((row) => row.card.id === selectedId) || placed[0];
  const missing = rows.filter((row) => !row.card.location.trim());
  return (
    <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
      <div>
        <h3 className="text-sm font-semibold">Places</h3>
        {placed.length === 0 ? <p className="mt-2 text-sm text-[#5e6c84]">Open a task and add a place to see it on the map.</p> : null}
        <ul className="mt-2 flex flex-col gap-1">
          {placed.map((row) => (
            <li key={row.card.id}>
              <button
                type="button"
                onClick={() => setSelectedId(row.card.id)}
                className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${selected?.card.id === row.card.id ? "bg-[#e9f2ff]" : "hover:bg-[#f1f2f4]"}`}
              >
                <span className="block font-medium">{row.card.title}</span>
                <span className="text-xs text-[#5e6c84]">{row.card.location}</span>
              </button>
            </li>
          ))}
        </ul>
        {missing.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-sm font-semibold">No place yet</h3>
            <ul className="mt-2 flex flex-col gap-1">
              {missing.map((row) => (
                <li key={row.card.id}>
                  <button type="button" onClick={() => onOpen(row.card.id)} className="w-full rounded-md px-2 py-1 text-left text-sm hover:bg-[#f1f2f4]">
                    {row.card.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="min-h-80 overflow-hidden rounded-lg bg-[#f1f2f4]">
        {selected ? (
          <iframe
            title={`Map of ${selected.card.location}`}
            src={`https://maps.google.com/maps?q=${encodeURIComponent(selected.card.location)}&z=12&output=embed`}
            className="h-[480px] w-full border-0"
          />
        ) : (
          <div className="flex h-80 items-center justify-center text-sm text-[#5e6c84]">Add a place on a task to open the map.</div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-[#f7f8f9] px-3 py-2">
      <p className="text-xs text-[#5e6c84]">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="py-8 text-center text-sm text-[#5e6c84]">{label}</p>;
}

function statusLabel(card: Card): string {
  if (card.approval === "pending") return "Waiting approval";
  if (card.approval === "rejected") return "Rejected";
  if (card.approval === "approved") return "Approved";
  if (card.dueDate && isOverdue(card.dueDate)) return "Overdue";
  return "Open";
}

function LayoutIcon({ id }: { id: BoardLayout }) {
  const common = "h-4 w-4 shrink-0";
  if (id === "table") {
    return (
      <svg viewBox="0 0 16 16" className={common} aria-hidden="true">
        <path fill="currentColor" d="M2 3h12v2H2V3zm0 4h12v2H2V7zm0 4h12v2H2v-2z" />
      </svg>
    );
  }
  if (id === "calendar") {
    return (
      <svg viewBox="0 0 16 16" className={common} aria-hidden="true">
        <path fill="currentColor" d="M4 2h1v2h6V2h1v2h2v10H2V4h2V2zm8 5H4v6h8V7z" />
      </svg>
    );
  }
  if (id === "timeline") {
    return (
      <svg viewBox="0 0 16 16" className={common} aria-hidden="true">
        <path fill="currentColor" d="M2 4h8v2H2V4zm3 3h9v2H5V7zm-3 3h6v2H2v-2z" />
      </svg>
    );
  }
  if (id === "dashboard") {
    return (
      <svg viewBox="0 0 16 16" className={common} aria-hidden="true">
        <path fill="currentColor" d="M2 9h5v5H2V9zm7-6h5v5H9V3zM9 9h5v5H9V9zM2 3h5v5H2V3z" />
      </svg>
    );
  }
  if (id === "map") {
    return (
      <svg viewBox="0 0 16 16" className={common} aria-hidden="true">
        <path fill="currentColor" d="M8 1a4 4 0 0 0-4 4c0 3 4 9 4 9s4-6 4-9a4 4 0 0 0-4-4zm0 5.5A1.5 1.5 0 1 1 8 4a1.5 1.5 0 0 1 0 2.5z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className={common} aria-hidden="true">
      <path fill="currentColor" d="M2 2h5v5H2V2zm7 0h5v5H9V2zM2 9h5v5H2V9zm7 0h5v5H9V9z" />
    </svg>
  );
}
