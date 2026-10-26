"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cx } from "@/components/ui";

export function BottomNav() {
  const pathname = usePathname();
  const auth = useAuth();
  const [count, setCount] = useState(0);
  const hidden = !auth.signedIn || pathname === "/login" || pathname.startsWith("/invite/");

  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    api
      .myTasks()
      .then((rows) => {
        if (!cancelled) setCount(rows.length);
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [hidden, pathname]);

  if (hidden) return null;

  const items = [
    { href: "/home", label: "Boards", active: pathname === "/home" || pathname.startsWith("/w/") || pathname.startsWith("/b/") },
    { href: "/tasks", label: "New tasks", active: pathname === "/tasks", count },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#dfe1e6] bg-white">
      <ul className="mx-auto flex max-w-3xl">
        {items.map((item) => (
          <li key={item.href} className="flex-1">
            <Link
              href={item.href}
              className={cx(
                "flex h-14 items-center justify-center gap-2 text-sm font-medium",
                item.active ? "text-[#0c66e4]" : "text-[#5e6c84]",
              )}
            >
              {item.label}
              {item.count ? (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#0c66e4] px-1 text-[11px] font-semibold text-white">
                  {item.count > 9 ? "9+" : item.count}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
