"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkspaceSummary } from "@shared/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/format";
import { AppHeader, Button, ErrorText, FullScreenSpinner, Modal, TextInput } from "@/components/ui";

export function HomeScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth.loading && !auth.user) router.replace("/login");
  }, [auth.loading, auth.user, router]);

  useEffect(() => {
    if (!auth.user) return;
    let cancelled = false;
    api
      .workspaces()
      .then((rows) => {
        if (!cancelled) setWorkspaces(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [auth.user]);

  if (auth.loading || (auth.user && !workspaces && !error)) return <FullScreenSpinner />;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {auth.accepted.length > 0 ? (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-lg bg-[#dcfff1] px-4 py-3 text-sm text-[#216e4e]">
            <span>You joined {auth.accepted.map((item) => item.workspaceName).join(", ")}.</span>
            <button type="button" onClick={auth.dismissAccepted} className="font-semibold">
              Dismiss
            </button>
          </div>
        ) : null}
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Your workspaces</h1>
          {auth.user?.isAdmin ? (
            <Button type="button" onClick={() => setCreating(true)}>
              New workspace
            </Button>
          ) : null}
        </div>
        <ErrorText>{error}</ErrorText>
        {workspaces && workspaces.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#dfe1e6] bg-white p-10 text-center">
            {auth.user?.isAdmin ? (
              <>
                <h2 className="text-lg font-semibold">Your Team workspace is created when you sign in</h2>
                <p className="mt-1 text-sm text-[#5e6c84]">From that workspace you can invite people as users.</p>
                <Button type="button" className="mt-4" onClick={() => setCreating(true)}>
                  Create workspace
                </Button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">You are not on a team yet</h2>
                <p className="mt-1 text-sm text-[#5e6c84]">Ask the admin to invite this email. You will join as a user.</p>
              </>
            )}
          </div>
        ) : null}
        <div className="flex flex-col gap-8">
          {workspaces?.map((workspace) => (
            <section key={workspace.id}>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">{workspace.name}</h2>
                <Link href={`/w/${workspace.id}`} className="text-sm font-medium text-[#0c66e4]">
                  Members and settings
                </Link>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                {workspace.boards.map((board) => (
                  <Link
                    key={board.id}
                    href={`/b/${board.id}`}
                    className="flex h-24 items-end rounded-lg p-3 text-sm font-semibold text-white shadow-sm"
                    style={{ backgroundColor: board.background }}
                  >
                    {board.title}
                  </Link>
                ))}
                <Link
                  href={`/w/${workspace.id}`}
                  className="flex h-24 items-center justify-center rounded-lg bg-[#091e420f] text-sm font-medium text-[#172b4d] hover:bg-[#091e4224]"
                >
                  + Create a board
                </Link>
              </div>
            </section>
          ))}
        </div>
      </main>
      {creating ? (
        <Modal title="New workspace" onClose={() => setCreating(false)}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const next = name.trim();
              if (!next) return;
              setBusy(true);
              api
                .createWorkspace(next)
                .then((workspace) => router.push(`/w/${workspace.id}`))
                .catch((err: unknown) => setError(errorMessage(err)))
                .finally(() => setBusy(false));
            }}
          >
            <label className="text-sm font-medium">
              Name
              <TextInput className="mt-1" value={name} onChange={(event) => setName(event.target.value)} autoFocus required />
            </label>
            <Button type="submit" disabled={busy}>
              Create
            </Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
