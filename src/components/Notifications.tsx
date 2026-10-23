"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import type { AppNotification } from "@shared/types";
import { api } from "@/lib/api";
import { apiUrl } from "@/lib/config";
import { useAuth } from "@/lib/auth-context";
import { getFirebaseAuth } from "@/lib/firebase";
import { formatWhen } from "@/lib/format";
import { cx } from "@/components/ui";

export function NotificationBell({ light = false }: { light?: boolean }) {
  const auth = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const unread = items.filter((item) => !item.read).length;

  useEffect(() => {
    if (!auth.user) return;
    let cancelled = false;
    api
      .notifications()
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [auth.user]);

  useEffect(() => {
    if (!auth.user) return;
    const current = getFirebaseAuth()?.currentUser;
    if (!current) return;
    let socket: Socket | null = null;
    let cancelled = false;
    current.getIdToken().then((token) => {
      if (cancelled) return;
      socket = io(apiUrl(), { auth: { token } });
      socket.on("notification", (notification: AppNotification) => {
        setItems((currentItems) => {
          if (currentItems.some((item) => item.id === notification.id)) return currentItems;
          return [notification, ...currentItems].slice(0, 40);
        });
      });
    });
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [auth.user]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [open]);

  if (!auth.user) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
        onClick={() => setOpen((value) => !value)}
        className={cx("relative rounded-md px-2 py-1 text-sm", light ? "hover:bg-white/15" : "text-[#172b4d] hover:bg-[#091e420f]")}
      >
        <BellIcon />
        {unread > 0 ? (
          <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#ae2e24] px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-xl bg-white text-[#172b4d] shadow-xl ring-1 ring-black/10">
          <div className="flex items-center justify-between border-b border-[#dfe1e6] px-3 py-2">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 ? (
              <button
                type="button"
                className="text-xs font-medium text-[#0c66e4]"
                onClick={() => {
                  setItems((currentItems) => currentItems.map((item) => ({ ...item, read: true })));
                  void api.readAllNotifications();
                }}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-sm text-[#5e6c84]">You’re caught up. A notification arrives when you’re tagged or a task you’re on changes.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={cx("flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-[#f4f5f7]", !item.read && "bg-[#e9f2ff]")}
                    onClick={() => {
                      setItems((currentItems) => currentItems.map((row) => (row.id === item.id ? { ...row, read: true } : row)));
                      void api.readNotification(item.id);
                      setOpen(false);
                      if (item.boardId) router.push(item.cardId ? `/b/${item.boardId}?card=${item.cardId}` : `/b/${item.boardId}`);
                    }}
                  >
                    <span className="text-sm font-medium">{item.title}</span>
                    <span className="text-xs text-[#5e6c84]">{item.body}</span>
                    <span className="text-[11px] text-[#5e6c84]">{formatWhen(item.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 9a6 6 0 1 1 12 0c0 7 2 7 2 7H4s2 0 2-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
