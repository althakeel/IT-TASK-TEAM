"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TrashItem } from "@shared/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { errorMessage, formatWhen } from "@/lib/format";
import { AppHeader, Button, ErrorText, FullScreenSpinner } from "@/components/ui";

const KIND_LABEL: Record<TrashItem["kind"], string> = {
  workspace: "Workspace",
  board: "Board",
  list: "List",
  card: "Card",
};

export function TrashScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.loading && !auth.signedIn) router.replace("/login?next=/trash");
  }, [auth.loading, auth.signedIn, router]);

  useEffect(() => {
    if (!auth.user) return;
    if (!auth.user.isAdmin) {
      router.replace("/home");
      return;
    }
    let cancelled = false;
    api
      .trash()
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [auth.user, router]);

  if (auth.loading || (auth.user?.isAdmin && !items && !error)) return <FullScreenSpinner />;

  return (
    <div className="flex min-h-screen flex-col pb-16">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Link href="/home" className="text-sm font-medium text-[#0c66e4]">
          All workspaces
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Recently deleted</h1>
        <p className="mt-1 text-sm text-[#5e6c84]">Restore a workspace, board, list, or card within 7 days. After that it stays deleted.</p>
        <ErrorText>{error}</ErrorText>
        {notice ? <p className="mt-3 text-sm text-[#216e4e]">{notice}</p> : null}
        {items && items.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-[#dfe1e6] bg-white p-8 text-center text-sm text-[#5e6c84]">
            Nothing is waiting to be restored.
          </div>
        ) : null}
        <ul className="mt-6 flex flex-col gap-2">
          {items?.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{item.title}</p>
                <p className="mt-1 text-sm text-[#5e6c84]">
                  {KIND_LABEL[item.kind]} · {item.detail}
                </p>
                <p className="mt-1 text-xs text-[#5e6c84]">
                  Deleted {formatWhen(item.deletedAt)} · {item.daysLeft} {item.daysLeft === 1 ? "day" : "days"} left
                </p>
              </div>
              <Button
                type="button"
                disabled={busyId === item.id}
                onClick={() => {
                  setBusyId(item.id);
                  setNotice(null);
                  setError(null);
                  api
                    .restoreTrash(item.kind, item.id)
                    .then(() => {
                      setItems((current) => current?.filter((row) => !(row.kind === item.kind && row.id === item.id)) || []);
                      setNotice(`Restored ${item.title}.`);
                    })
                    .catch((err: unknown) => setError(errorMessage(err)))
                    .finally(() => setBusyId(null));
                }}
              >
                {busyId === item.id ? "Restoring..." : "Restore"}
              </Button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
