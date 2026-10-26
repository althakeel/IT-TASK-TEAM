"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BOARD_BACKGROUNDS, type WorkspaceDetail } from "@shared/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/format";
import { AppHeader, Avatar, Button, ErrorText, FullScreenSpinner, Modal, TextInput, Toast } from "@/components/ui";
import { boardSurface } from "@/lib/board-style";

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
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteName, setDeleteName] = useState("");

  useEffect(() => {
    if (!auth.loading && !auth.signedIn) router.replace("/login");
  }, [auth.loading, auth.signedIn, router]);

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

  if (!auth.loading && auth.signedIn && !auth.user) {
    return <div className="flex min-h-screen items-center justify-center p-6 text-center text-sm text-[#ae2e24]">{auth.error || "You are still signed in. Refresh the page."}</div>;
  }

  if (auth.loading || (auth.user && !detail && !error)) return <FullScreenSpinner />;

  const canAdmin = detail?.role === "owner" || detail?.role === "admin";
  const isOwner = detail?.role === "owner";
  const people = detail?.members ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f8fa] pb-16">
      <AppHeader />
      <div className="bg-[#0b3a66] text-white">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <Link href="/home" className="text-sm text-white/75 hover:text-white">
              All workspaces
            </Link>
            {detail ? (
              <form
                className="mt-2 flex flex-wrap items-center gap-2"
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
                  className="min-w-0 bg-transparent text-3xl font-semibold outline-none"
                />
                {canAdmin && name.trim() && name.trim() !== detail.name ? (
                  <Button type="submit" disabled={busy}>
                    Save
                  </Button>
                ) : null}
              </form>
            ) : null}
            <p className="mt-1 text-sm text-white/75">
              {detail?.boards.length ?? 0} boards · {people.length} people
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {people.slice(0, 5).map((member) => (
                <Avatar key={member.id} name={member.name || member.email} photo={member.photo} size={36} />
              ))}
            </div>
            {isAdmin ? (
              <a href="#people" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#0b3a66]">
                Invite
              </a>
            ) : null}
          </div>
        </div>
      </div>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-8">
        <ErrorText>{error}</ErrorText>
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Boards</h2>
            {isAdmin ? (
              <button type="button" className="text-sm font-medium text-[#0c66e4]" onClick={() => setCreating(true)}>
                New board
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {detail?.boards.map((board) => (
              <Link
                key={board.id}
                href={`/b/${board.id}`}
                className="flex h-36 flex-col justify-end rounded-2xl bg-cover bg-center p-4 text-lg font-semibold text-white shadow-md"
                style={boardSurface(board)}
              >
                {board.title}
                {board.closed ? <span className="mt-1 text-xs font-medium text-white/80">Closed</span> : null}
              </Link>
            ))}
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex h-36 flex-col items-start justify-between rounded-2xl border border-dashed border-[#c3c9d4] bg-white p-4 text-left text-[#44546f] hover:border-[#0c66e4] hover:text-[#0c66e4]"
              >
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#e9f2ff] text-xl text-[#0c66e4]">+</span>
                <span className="font-semibold">Create a board</span>
              </button>
            ) : null}
          </div>
        </section>
        <section id="people">
          <h2 className="mb-4 text-lg font-semibold">People</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {people.map((member) => (
              <article key={member.id} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
                <Avatar name={member.name || member.email} photo={member.photo} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{member.name || member.email}</p>
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
                    className="rounded-full border border-[#dfe1e6] px-2 py-1 text-xs"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                ) : (
                  <span className="rounded-full bg-[#f1f2f4] px-2 py-1 text-xs text-[#44546f] capitalize">
                    {member.status === "pending" ? "Invited" : member.role}
                  </span>
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
              </article>
            ))}
          </div>
          {isAdmin ? (
            <form
              className="mt-4 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm sm:flex-row sm:items-end"
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
              <label className="min-w-0 flex-1 text-sm font-medium">
                Invite by email
                <TextInput className="mt-1" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@althakeel.com" required />
              </label>
              <Button type="submit" disabled={busy}>
                Send invite
              </Button>
            </form>
          ) : null}
          {isOwner ? (
            <div className="mt-8">
              <button
                type="button"
                className="text-sm text-[#5e6c84] underline"
                onClick={() => {
                  setDeleteName("");
                  setConfirmDelete(true);
                }}
              >
                Delete workspace
              </button>
            </div>
          ) : null}
        </section>
      </main>
      {creating ? (
        <Modal title="New board" onClose={() => setCreating(false)}>
          <form
            className="flex flex-col gap-3"
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
                  setCreating(false);
                })
                .catch((err: unknown) => setToast(errorMessage(err)))
                .finally(() => setBusy(false));
            }}
          >
            <TextInput value={boardTitle} onChange={(event) => setBoardTitle(event.target.value)} placeholder="Board title" autoFocus required />
            <div className="flex flex-wrap gap-2">
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
            <Button type="submit" disabled={busy}>
              Create board
            </Button>
          </form>
        </Modal>
      ) : null}
      {confirmDelete && detail ? (
        <Modal
          title="Delete workspace"
          onClose={() => {
            setConfirmDelete(false);
            setDeleteName("");
          }}
        >
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (deleteName.trim() !== detail.name) return;
              setBusy(true);
              api
                .deleteWorkspace(workspaceId)
                .then(() => router.push("/home"))
                .catch((err: unknown) => {
                  setToast(errorMessage(err));
                  setBusy(false);
                });
            }}
          >
            <p className="text-sm text-[#5e6c84]">
              Type “{detail.name}” to delete this workspace. Close every board first. The admin can restore it for 7 days from Recently deleted.
            </p>
            <TextInput value={deleteName} onChange={(event) => setDeleteName(event.target.value)} placeholder={detail.name} autoFocus />
            <Button type="submit" variant="danger" disabled={busy || deleteName.trim() !== detail.name}>
              Delete workspace
            </Button>
          </form>
        </Modal>
      ) : null}
      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
    </div>
  );
}
