"use client";

import { useEffect, useRef, useState } from "react";
import type { Membership } from "@shared/types";
import { Avatar } from "@/components/ui";

export type MentionPerson = {
  userId: string;
  name: string;
  email: string;
  photo?: string;
};

export function mentionPeople(members: Membership[]): MentionPerson[] {
  return members
    .filter((member) => member.status === "active" && member.role === "member" && member.userId)
    .map((member) => ({
      userId: member.userId as string,
      name: member.name || member.email,
      email: member.email,
      photo: member.photo,
    }));
}

export function mentionIdsIn(text: string, people: MentionPerson[]): string[] {
  const lower = text.toLowerCase();
  return people.filter((person) => lower.includes(`@${person.name.toLowerCase()}`)).map((person) => person.userId);
}

export function MentionText({ text, people }: { text: string; people: MentionPerson[] }) {
  const names = [...people.map((person) => person.name)].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!text || names.length === 0) return <>{text}</>;
  const pattern = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const parts = text.split(new RegExp(`(@(?:${pattern}))`, "gi"));
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("@") && names.some((name) => name.toLowerCase() === part.slice(1).toLowerCase()) ? (
          <span key={index} className="rounded bg-[#e9f2ff] px-0.5 font-medium text-[#0c66e4]">
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

export function MentionField({
  value,
  onChange,
  people,
  menuRef,
  placeholder,
  rows = 3,
  onBlur,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  people: MentionPerson[];
  menuRef?: { current: boolean };
  placeholder?: string;
  rows?: number;
  onBlur?: () => void;
  className?: string;
}) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const matches =
    query === null
      ? []
      : people.filter((person) => person.name.toLowerCase().includes(query.toLowerCase()) || person.email.toLowerCase().includes(query.toLowerCase())).slice(0, 8);

  useEffect(() => {
    if (menuRef) menuRef.current = query !== null;
  }, [menuRef, query]);

  function readQuery(next: string, cursor: number) {
    const before = next.slice(0, cursor);
    const match = before.match(/(^|\s)@([^\n@]*)$/);
    setQuery(match ? match[2] : null);
    setActive(0);
  }

  function insert(person: MentionPerson) {
    const cursor = fieldRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const match = before.match(/(^|\s)@([^\n@]*)$/);
    if (!match) return;
    const start = before.length - match[2].length - 1;
    const next = `${value.slice(0, start)}@${person.name} ${value.slice(cursor)}`;
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      const el = fieldRef.current;
      if (!el) return;
      const caret = start + person.name.length + 2;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={fieldRef}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          readQuery(event.target.value, event.target.selectionStart);
        }}
        onClick={(event) => readQuery(value, event.currentTarget.selectionStart)}
        onKeyUp={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === "Tab") return;
          readQuery(value, event.currentTarget.selectionStart);
        }}
        onKeyDown={(event) => {
          if (query === null || matches.length === 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((current) => (current + 1) % matches.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((current) => (current - 1 + matches.length) % matches.length);
          } else if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            insert(matches[active] || matches[0]);
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setQuery(null);
          }
        }}
        onBlur={() => {
          window.setTimeout(() => setQuery(null), 150);
          onBlur?.();
        }}
        className={className}
      />
      {query !== null ? (
        <ul className="absolute bottom-full z-10 mb-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[#dfe1e6] bg-white py-1 shadow-lg">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[#5e6c84]">No members match.</li>
          ) : (
            matches.map((person, index) => (
              <li key={person.userId}>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insert(person);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${index === active ? "bg-[#e9f2ff]" : "hover:bg-[#f1f2f4]"}`}
                >
                  <Avatar name={person.name} photo={person.photo} size={22} />
                  <span className="truncate font-medium">{person.name}</span>
                  <span className="truncate text-xs text-[#5e6c84]">{person.email}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
