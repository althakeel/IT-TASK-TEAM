"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { BOARD_BACKGROUNDS, type Card } from "@shared/types";
import { Board } from "@/components/Board";
import { CardDialog } from "@/components/CardDialog";
import { NotificationBell } from "@/components/Notifications";
import { Avatar, Button, FullScreenSpinner, Logo, Modal, TextInput, Toast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { upsertCard } from "@/lib/board-state";
import { errorMessage } from "@/lib/format";
import { useLiveBoard } from "@/lib/use-live-board";

export function BoardScreen() {
  const params = useParams<{ boardId: string }>();
  const boardId = params.boardId;
  const auth = useAuth();
  const router = useRouter();
  const live = useLiveBoard(boardId, Boolean(auth.user), auth.user?.id || "", Boolean(auth.user?.isAdmin));
  const cardQuery = useSearchParams().get("card");
  const openedQuery = useRef("");
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState("");

  useEffect(() => {
    if (!auth.loading && !auth.user) router.replace(`/login?next=/b/${boardId}`);
  }, [auth.loading, auth.user, boardId, router]);

  useEffect(() => {
    if (!cardQuery || live.loading || openedQuery.current === cardQuery) return;
    const visible = live.lists.some((list) => list.cards.some((card) => card.id === cardQuery));
    if (!visible) return;
    openedQuery.current = cardQuery;
    live.setOpenCardId(cardQuery);
  }, [cardQuery, live]);

  if (auth.loading || live.loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: live.detail?.board.background || "#0079bf" }}>
        <FullScreenSpinner light />
      </div>
    );
  }

  if (live.error || !live.detail || !auth.user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f4f5f7] p-6 text-center">
        <p className="text-sm text-[#ae2e24]">{live.error || "Board not found."}</p>
        <Link href="/home" className="text-sm font-medium text-[#0c66e4]">
          Back to workspaces
        </Link>
      </div>
    );
  }

  const { board, role, members } = live.detail;
  const openCard = live.lists.flatMap((list) => list.cards).find((card) => card.id === live.openCardId);
  const isAdmin = auth.user.isAdmin;
  const locked = Boolean(board.closed);
  const taskCount = live.lists.reduce((sum, list) => sum + list.cards.length, 0);

  const title = titleDraft ?? board.title;

  async function saveTitle() {
    const next = title.trim();
    setTitleDraft(null);
    if (!isAdmin || locked || !next || next === board.title) return;
    try {
      const saved = await api.updateBoard(board.id, { title: next });
      live.updateBoard(saved);
    } catch (error) {
      setToast(errorMessage(error));
    }
  }

  return (
    <div className="relative flex h-screen flex-col" style={{ backgroundColor: board.background }}>
      <header className="flex h-14 shrink-0 items-center gap-2 bg-black/25 px-3 text-white">
        <Link href={`/w/${board.workspaceId}`} className="rounded-md px-2 py-1 hover:bg-white/15">
          <Logo light />
        </Link>
        <input
          value={title}
          onChange={(event) => setTitleDraft(event.target.value)}
          onBlur={() => void saveTitle()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          aria-label="Board title"
          readOnly={!isAdmin || locked}
          className="w-56 rounded-md bg-white/15 px-2 py-1 text-lg font-semibold outline-none hover:bg-white/25 focus:bg-white focus:text-[#172b4d] read-only:hover:bg-white/15"
        />
        {locked ? <span className="rounded-md bg-white/20 px-2 py-1 text-xs font-semibold">Closed</span> : null}
        <span className="ml-1 inline-flex items-center gap-1 text-xs text-white/80">
          <span className={`h-2 w-2 rounded-full ${live.connected ? "bg-[#61bd4f]" : "bg-white/50"}`} />
          {live.connected ? "Live" : "Connecting"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex -space-x-1">
            {members
              .filter((member) => member.status === "active")
              .slice(0, 6)
              .map((member) => (
                <Avatar key={member.id} name={member.name || member.email} photo={member.photo} size={28} />
              ))}
          </div>
          {isAdmin ? (
            <button type="button" className="rounded-md bg-white/15 px-2 py-1 text-sm hover:bg-white/25" onClick={() => setSettingsOpen(true)}>
              Settings
            </button>
          ) : null}
          <NotificationBell light />
          <button type="button" className="rounded-md px-2 py-1 text-sm hover:bg-white/15" onClick={() => void auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>
      {locked ? (
        <p className="mx-3 mt-3 rounded-lg bg-white/95 px-3 py-2 text-sm text-[#172b4d]">
          This board is closed. Tasks stay visible, and changes are paused until it is reopened.
        </p>
      ) : null}
      {!isAdmin ? (
        <p className="px-4 pt-3 text-sm text-white/90">You only see tasks you are tagged on.</p>
      ) : null}
      {!isAdmin && taskCount === 0 ? (
        <div className="mx-3 mt-3 rounded-xl bg-white/95 px-4 py-6 text-sm text-[#44546f]">
          No tasks are tagged for you on this board yet. They show up here, with a notification, when the admin tags you.
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <Board
          boardId={board.id}
          lists={live.lists}
          members={members}
          setLists={live.setLists}
          getLists={live.getLists}
          trackMutation={live.trackMutation}
          forgetMutation={live.forgetMutation}
          setDragging={live.setDragging}
          onOpenCard={live.setOpenCardId}
          onError={setToast}
          canDelete={isAdmin}
          locked={locked}
        />
      </div>
      {settingsOpen ? (
        <Modal
          title="Board settings"
          onClose={() => {
            setSettingsOpen(false);
            setDeleteName("");
          }}
        >
          <div className="flex flex-col gap-5">
            <section>
              <h3 className="text-sm font-semibold">Background</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {BOARD_BACKGROUNDS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={item.name}
                    className="h-8 w-10 rounded"
                    style={{ backgroundColor: item.color, outline: item.color === board.background ? "2px solid #172b4d" : undefined, outlineOffset: 2 }}
                    onClick={() => {
                      api
                        .updateBoard(board.id, { background: item.color })
                        .then((saved) => live.updateBoard(saved))
                        .catch((error: unknown) => setToast(errorMessage(error)));
                    }}
                  />
                ))}
              </div>
            </section>
            <section className="rounded-lg bg-[#f4f5f7] p-3">
              <h3 className="text-sm font-semibold">{locked ? "Reopen board" : "Close board"}</h3>
              <p className="mt-1 text-sm text-[#5e6c84]">
                Closing pauses every change. People can still open the board and see their tasks. Deleting is only available after the board is closed.
              </p>
              <Button
                type="button"
                className="mt-3"
                variant={locked ? "primary" : "quiet"}
                onClick={() => {
                  api
                    .updateBoard(board.id, { closed: !locked })
                    .then((saved) => {
                      live.updateBoard(saved);
                      setDeleteName("");
                    })
                    .catch((error: unknown) => setToast(errorMessage(error)));
                }}
              >
                {locked ? "Reopen board" : "Close board"}
              </Button>
            </section>
            <section className="border-t border-[#dfe1e6] pt-4">
              <h3 className="text-sm font-semibold text-[#ae2e24]">Delete board</h3>
              {locked ? (
                <form
                  className="mt-2 flex flex-col gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (deleteName.trim() !== board.title) return;
                    api
                      .deleteBoard(board.id)
                      .then(() => router.push(`/w/${board.workspaceId}`))
                      .catch((error: unknown) => setToast(errorMessage(error)));
                  }}
                >
                  <p className="text-sm text-[#5e6c84]">This cannot be undone. Type “{board.title}” to confirm.</p>
                  <TextInput value={deleteName} onChange={(event) => setDeleteName(event.target.value)} placeholder={board.title} />
                  <Button type="submit" variant="danger" disabled={deleteName.trim() !== board.title}>
                    Delete board
                  </Button>
                </form>
              ) : (
                <p className="mt-1 text-sm text-[#5e6c84]">Close the board first. The delete button appears here after that.</p>
              )}
            </section>
          </div>
        </Modal>
      ) : null}
      {openCard ? (
        <CardDialog
          card={openCard}
          lists={live.lists}
          members={members}
          comments={live.comments}
          role={role}
          currentUserId={auth.user.id}
          trackMutation={live.trackMutation}
          forgetMutation={live.forgetMutation}
          onCard={(card: Card) => live.setLists((current) => upsertCard(current, card))}
          onComments={live.setComments}
          canDelete={isAdmin}
          locked={locked}
          onClose={() => live.setOpenCardId(null)}
          onDelete={(cardId) => {
            const clientMutationId = live.trackMutation();
            const snapshot = live.getLists();
            live.setLists((current) => current.map((list) => ({ ...list, cards: list.cards.filter((card) => card.id !== cardId) })));
            live.setOpenCardId(null);
            api.deleteCard(cardId, clientMutationId).catch((error: unknown) => {
              live.forgetMutation(clientMutationId);
              live.setLists(snapshot);
              setToast(errorMessage(error));
            });
          }}
        />
      ) : null}
      {toast || live.channelError ? <Toast message={toast || live.channelError || ""} onClose={() => setToast(null)} /> : null}
    </div>
  );
}
