"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BOARD_BACKGROUNDS, type WorkspaceDetail } from "@shared/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/format";
import { AppHeader, Avatar, Button, ErrorText, FullScreenSpinner, TextInput, Toast } from "@/components/ui";

export function WorkspaceScreen() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const auth = useAuth();
  const router = useRouter();
  const [detail, setDetail] = useState<WorkspaceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [boardTitle, setBoardTitle] = useState("");
  const [background, setBackground] = useState<string>(BOARD_BACKGROUNDS[0].color);
  const isAdmin = Boolean(auth.user?.isAdmin);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!auth.loading && !auth.user) router.replace("/login");
  }, [auth.loading, auth.user, router]);

  useEffect(() => {
    if (!auth.user) return;
    let cancelled = false;
    api
      .workspace(workspaceId)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setName(data.name);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [auth.user, workspaceId]);

  if (auth.loading || (auth.user && !detail && !error)) return <FullScreenSpinner />;

  const canAdmin = detail?.role === "owner" || detail?.role === "admin";
  const isOwner = detail?.role === "owner";

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          <Link href="/home" className="text-sm font-medium text-[#0c66e4]">
            All workspaces
          </Link>
          {detail ? (
            <form
              className="mt-3 flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!canAdmin || name.trim() === detail.name) return;
                setBusy(true);
                api
                  .renameWorkspace(detail.id, name.trim())
                  .then((updated) => setDetail({ ...detail, name: updated.name }))
                  .catch((err: unknown) => setToast(errorMessage(err)))
                  .finally(() => setBusy(false));
              }}
            >
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!canAdmin}
                className="min-w-0 flex-1 bg-transparent text-2xl font-semibold outline-none disabled:opacity-100"
              />
              {canAdmin && name.trim() && name.trim() !== detail.name ? (
                <Button type="submit" disabled={busy}>
                  Save
                </Button>
              ) : null}
            </form>
          ) : null}
          <ErrorText>{error}</ErrorText>
          <h2 className="mt-8 mb-3 text-sm font-semibold tracking-wide text-[#5e6c84] uppercase">Boards</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {detail?.boards.map((board) => (
              <div key={board.id} className="group relative">
                <Link
                  href={`/b/${board.id}`}
                  className="flex h-24 items-end rounded-lg p-3 text-sm font-semibold text-white shadow-sm"
                  style={{ backgroundColor: board.background }}
                >
                  {board.title}
                </Link>
                {canAdmin ? (
                  <button
                    type="button"
                    className="absolute top-2 right-2 hidden rounded bg-black/30 px-2 py-0.5 text-xs text-white group-hover:block"
                    onClick={() => {
                      if (!window.confirm(`Delete the board “${board.title}”?`)) return;
                      api
                        .deleteBoard(board.id)
                        .then(() => setDetail(detail ? { ...detail, boards: detail.boards.filter((item) => item.id !== board.id) } : detail))
                        .catch((err: unknown) => setToast(errorMessage(err)));
                    }}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <form
            className="mt-4 rounded-xl bg-white p-4 shadow-sm"
            onSubmit={(event) => {
              event.preventDefault();
              const title = boardTitle.trim();
              if (!title || !detail) return;
              setBusy(true);
              api
                .createBoard(detail.id, title, background)
                .then((board) => {
                  setDetail({ ...detail, boards: [board, ...detail.boards] });
                  setBoardTitle("");
                })
                .catch((err: unknown) => setToast(errorMessage(err)))
                .finally(() => setBusy(false));
            }}
          >
            <h3 className="mb-2 text-sm font-semibold">Create a board</h3>
            <TextInput value={boardTitle} onChange={(event) => setBoardTitle(event.target.value)} placeholder="Board title" required />
            <div className="mt-3 flex flex-wrap gap-2">
              {BOARD_BACKGROUNDS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={item.name}
                  onClick={() => setBackground(item.color)}
                  className="h-8 w-12 rounded-md"
                  style={{ backgroundColor: item.color, outline: background === item.color ? "2px solid #172b4d" : undefined, outlineOffset: 2 }}
                />
              ))}
            </div>
            <Button type="submit" className="mt-3" disabled={busy}>
              Create board
            </Button>
          </form>
        </section>
        <aside className="h-fit rounded-xl bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold tracking-wide text-[#5e6c84] uppercase">Members</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {detail?.members.map((member) => (
              <li key={member.id} className="flex items-start gap-2">
                <Avatar name={member.name || member.email} photo={member.photo} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{member.name || member.email}</p>
                  <p className="truncate text-xs text-[#5e6c84]">{member.email}</p>
                  {member.status === "pending" && member.inviteToken ? (
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-[#0c66e4]"
                      onClick={() => {
                        const url = `${window.location.origin}/invite/${member.inviteToken}`;
                        void navigator.clipboard.writeText(url).then(
                          () => setToast("Invite link copied."),
                          () => setToast(url),
                        );
                      }}
                    >
                      Copy invite link
                    </button>
                  ) : null}
                </div>
                {isOwner && member.role !== "owner" && member.status === "active" ? (
                  <select
                    value={member.role}
                    onChange={(event) => {
                      const nextRole = event.target.value === "admin" ? "admin" : "member";
                      api
                        .setRole(workspaceId, member.id, nextRole)
                        .then((updated) =>
                          setDetail(detail ? { ...detail, members: detail.members.map((item) => (item.id === updated.id ? updated : item)) } : detail),
                        )
                        .catch((err: unknown) => setToast(errorMessage(err)));
                    }}
                    className="rounded-md border border-[#dfe1e6] px-1 py-1 text-xs"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                ) : (
                  <span className="text-xs text-[#5e6c84] capitalize">{member.status === "pending" ? "Invited" : member.role}</span>
                )}
                {member.role !== "owner" && (canAdmin || member.userId === auth.user?.id) ? (
                  <button
                    type="button"
                    className="text-xs text-[#ae2e24]"
                    onClick={() => {
                      api
                        .removeMember(workspaceId, member.id)
                        .then(() => {
                          if (member.userId === auth.user?.id) router.push("/home");
                          else setDetail(detail ? { ...detail, members: detail.members.filter((item) => item.id !== member.id) } : detail);
                        })
                        .catch((err: unknown) => setToast(errorMessage(err)));
                    }}
                  >
                    {member.userId === auth.user?.id ? "Leave" : "Remove"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {isAdmin ? (
            <form
              className="mt-4 flex flex-col gap-2 border-t border-[#dfe1e6] pt-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!detail) return;
                setBusy(true);
                api
                  .invite(detail.id, email, "member")
                  .then((member) => {
                    setEmail("");
                    setDetail({
                      ...detail,
                      members: detail.members.some((item) => item.id === member.id)
                        ? detail.members.map((item) => (item.id === member.id ? member : item))
                        : [...detail.members, member],
                    });
                    if (member.inviteToken) {
                      const url = `${window.location.origin}/invite/${member.inviteToken}`;
                      setToast(member.emailSent ? `Invite emailed to ${member.email}.` : `The invite is saved. Email could not be sent, so share ${url}`);
                    }
                  })
                  .catch((err: unknown) => setToast(errorMessage(err)))
                  .finally(() => setBusy(false));
              }}
            >
              <h3 className="text-sm font-semibold">Invite a user</h3>
              <TextInput type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@company.com" required />
              <Button type="submit" disabled={busy}>
                Send invite
              </Button>
              <p className="text-xs text-[#5e6c84]">An email is sent with the invite link. They join as a user when they sign in with that email.</p>
            </form>
          ) : null}
          {isOwner ? (
            <div className="mt-4 border-t border-[#dfe1e6] pt-4">
              {confirmDelete ? (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    api
                      .deleteWorkspace(workspaceId)
                      .then(() => router.push("/home"))
                      .catch((err: unknown) => setToast(errorMessage(err)));
                  }}
                >
                  Confirm delete workspace
                </Button>
              ) : (
                <button type="button" className="text-sm text-[#ae2e24]" onClick={() => setConfirmDelete(true)}>
                  Delete workspace
                </button>
              )}
            </div>
          ) : null}
        </aside>
      </main>
      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
    </div>
  );
}
