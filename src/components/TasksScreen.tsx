"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MentionedTask } from "@shared/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { dueWithinDays, errorMessage, formatDue, formatWhen, isOverdue } from "@/lib/format";
import { AppHeader, ErrorText, FullScreenSpinner, cx } from "@/components/ui";

export function TasksScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<MentionedTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.loading && !auth.signedIn) router.replace("/login?next=/tasks");
  }, [auth.loading, auth.signedIn, router]);

  useEffect(() => {
    if (!auth.user) return;
    let cancelled = false;
    api
      .myTasks()
      .then((rows) => {
        if (!cancelled) setTasks(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [auth.user]);

  if (auth.loading || (auth.user && !tasks && !error)) return <FullScreenSpinner />;

  return (
    <div className="flex min-h-screen flex-col pb-16">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-semibold">New tasks</h1>
        <p className="mt-1 text-sm text-[#5e6c84]">Tasks where someone tagged you.</p>
        <ErrorText>{error}</ErrorText>
        {tasks && tasks.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-[#dfe1e6] bg-white p-8 text-center">
            <h2 className="text-lg font-semibold">Nothing tagged for you yet</h2>
            <p className="mt-1 text-sm text-[#5e6c84]">When someone tags you on a card, it shows up here.</p>
            <Link href="/home" className="mt-4 inline-block text-sm font-medium text-[#0c66e4]">
              Back to boards
            </Link>
          </div>
        ) : null}
        <div className="mt-6 flex flex-col gap-6">
          {groupTasks(tasks || []).map((group) => (
            <section key={group.title}>
              <h2 className="text-sm font-semibold text-[#44546f]">
                {group.title}
                <span className="ml-2 font-medium text-[#5e6c84]">{group.tasks.length}</span>
              </h2>
              <ul className="mt-2 flex flex-col gap-2">
                {group.tasks.map((task) => (
                  <li key={task.id}>
                    <Link href={`/b/${task.boardId}?card=${task.id}`} className="block rounded-xl bg-white p-4 shadow-sm hover:bg-[#f7f8f9]">
                      <p className="font-semibold">{task.title}</p>
                      <p className="mt-1 text-sm text-[#5e6c84]">
                        {task.boardTitle} · {task.listTitle}
                      </p>
                      <p className={cx("mt-2 text-xs", task.dueDate && isOverdue(task.dueDate) ? "text-[#ae2e24]" : "text-[#5e6c84]")}>
                        {task.dueDate ? `Due ${formatDue(task.dueDate)} · ` : "No due date · "}
                        Updated {formatWhen(task.updatedAt)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}

function groupTasks(tasks: MentionedTask[]) {
  const buckets = [
    { title: "Overdue", tasks: tasks.filter((task) => task.dueDate && isOverdue(task.dueDate)) },
    { title: "Due this week", tasks: tasks.filter((task) => task.dueDate && dueWithinDays(task.dueDate, 7)) },
    { title: "Later", tasks: tasks.filter((task) => task.dueDate && !isOverdue(task.dueDate) && !dueWithinDays(task.dueDate, 7)) },
    { title: "No due date", tasks: tasks.filter((task) => !task.dueDate) },
  ];
  return buckets.filter((group) => group.tasks.length > 0);
}
