"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ImageKit from "imagekit-javascript";
import { BOARD_BACKGROUNDS, BOARD_GRADIENTS, LABEL_PRESETS, type Card, type Membership } from "@shared/types";
import { Board } from "@/components/Board";
import { BoardScorecard } from "@/components/BoardScorecard";
import { CardDialog } from "@/components/CardDialog";
import { NotificationBell } from "@/components/Notifications";
import { Avatar, Button, FullScreenSpinner, Logo, Modal, TextArea, TextInput, Toast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { fileKind, upsertCard } from "@/lib/board-state";
import { boardSurface } from "@/lib/board-style";
import { dueWithinDays, errorMessage, isOverdue } from "@/lib/format";
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
  const [descriptionDraft, setDescriptionDraft] = useState<string | null>(null);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const backgroundFile = useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [scoreMember, setScoreMember] = useState("all");
  const [shareOpen, setShareOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [extraMembers, setExtraMembers] = useState<Membership[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState("");
  const [dangerOpen, setDangerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [personId, setPersonId] = useState("all");
  const [labelColor, setLabelColor] = useState("all");
  const [dueFilter, setDueFilter] = useState<"all" | "overdue" | "week" | "none">("all");

  useEffect(() => {
    if (!auth.loading && !auth.signedIn) router.replace(`/login?next=/b/${boardId}`);
  }, [auth.loading, auth.signedIn, boardId, router]);

  useEffect(() => {
    if (!cardQuery || live.loading || openedQuery.current === cardQuery) return;
    const visible = live.lists.some((list) => list.cards.some((card) => card.id === cardQuery));
    if (!visible) return;
    openedQuery.current = cardQuery;
    live.setOpenCardId(cardQuery);
  }, [cardQuery, live]);

  if (!auth.loading && auth.signedIn && !auth.user) {
    return <div className="flex min-h-screen items-center justify-center p-6 text-center text-sm text-[#ae2e24]">{auth.error || "You are still signed in. Refresh the page."}</div>;
  }

  if (auth.loading || live.loading) {
    return (
      <div className="min-h-screen" style={boardSurface(live.detail?.board || { background: "#0079bf" })}>
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
  const needle = query.trim().toLowerCase();
  const filtering = Boolean(needle) || personId !== "all" || labelColor !== "all" || dueFilter !== "all";
  const totalCards = live.lists.reduce((sum, list) => sum + list.cards.length, 0);
  const shownLists = live.lists
    .map((list) => ({
      ...list,
      cards: list.cards.filter((card) => {
        if (needle && !`${card.title} ${card.description}`.toLowerCase().includes(needle)) return false;
        if (personId !== "all" && !card.assigneeIds.includes(personId)) return false;
        if (labelColor !== "all" && !card.labels.some((label) => label.color === labelColor)) return false;
        if (dueFilter === "overdue") return Boolean(card.dueDate && isOverdue(card.dueDate));
        if (dueFilter === "week") return Boolean(card.dueDate && dueWithinDays(card.dueDate, 7));
        if (dueFilter === "none") return !card.dueDate;
        return true;
      }),
    }))
    .filter((list) => !filtering || list.cards.length > 0);
  const shownCount = shownLists.reduce((sum, list) => sum + list.cards.length, 0);
  const tagPeople = members.filter((member) => member.status === "active" && member.userId);

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
    <div className="relative flex h-screen flex-col pb-14" style={boardSurface(board)}>
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
        {board.description ? <span className="hidden max-w-xs truncate text-sm text-white/80 sm:inline">{board.description}</span> : null}
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
            <button type="button" className="rounded-md bg-white px-3 py-1 text-sm font-medium text-[#172b4d]" onClick={() => setScoreOpen(true)}>
              Scorecard
            </button>
          ) : null}
          {isAdmin ? (
            <button type="button" className="rounded-md bg-white px-3 py-1 text-sm font-medium text-[#172b4d]" onClick={() => setShareOpen(true)}>
              Invite
            </button>
          ) : null}
          {isAdmin ? (
            <button type="button" className="rounded-md bg-white/15 px-2 py-1 text-sm hover:bg-white/25" onClick={() => setSettingsOpen(true)}>
              Settings
            </button>
          ) : null}
          <Link href="/profile" className="rounded-md px-2 py-1 text-sm hover:bg-white/15">
            Profile
          </Link>
          <NotificationBell light />
          <button type="button" className="rounded-md px-2 py-1 text-sm hover:bg-white/15" onClick={() => void auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>
      <div className="flex shrink-0 flex-wrap items-center gap-2 bg-black/20 px-3 py-2 text-sm text-white">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search cards"
          aria-label="Search cards"
          className="w-44 rounded-md bg-white px-2 py-1 text-sm text-[#172b4d] outline-none placeholder:text-[#5e6c84]"
        />
        <select
          value={personId}
          onChange={(event) => setPersonId(event.target.value)}
          aria-label="Filter by person"
          className="rounded-md bg-white px-2 py-1 text-sm text-[#172b4d]"
        >
          <option value="all">Everyone</option>
          {tagPeople.map((member) => (
            <option key={member.userId} value={member.userId || ""}>
              {member.name || member.email}
            </option>
          ))}
        </select>
        <select
          value={labelColor}
          onChange={(event) => setLabelColor(event.target.value)}
          aria-label="Filter by label"
          className="rounded-md bg-white px-2 py-1 text-sm text-[#172b4d]"
        >
          <option value="all">All labels</option>
          {LABEL_PRESETS.map((preset) => (
            <option key={preset.color} value={preset.color}>
              {preset.name}
            </option>
          ))}
        </select>
        <select
          value={dueFilter}
          onChange={(event) => setDueFilter(event.target.value as "all" | "overdue" | "week" | "none")}
          aria-label="Filter by due date"
          className="rounded-md bg-white px-2 py-1 text-sm text-[#172b4d]"
        >
          <option value="all">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="week">Due this week</option>
          <option value="none">No due date</option>
        </select>
        {filtering ? (
          <>
            <span className="text-xs text-white/80">
              {shownCount} of {totalCards}
            </span>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs font-medium hover:bg-white/15"
              onClick={() => {
                setQuery("");
                setPersonId("all");
                setLabelColor("all");
                setDueFilter("all");
              }}
            >
              Clear
            </button>
          </>
        ) : null}
      </div>
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
      {isAdmin && scoreOpen ? (
        <BoardScorecard
          lists={live.lists}
          members={members}
          selectedId={scoreMember}
          onSelect={setScoreMember}
          onOpen={(cardId) => live.setOpenCardId(cardId)}
          onClose={() => setScoreOpen(false)}
        />
      ) : null}
      <div className="min-h-0 flex-1">
        {filtering && shownCount === 0 ? (
          <div className="m-3 rounded-xl bg-white/95 px-4 py-6 text-sm text-[#44546f]">No cards match this search.</div>
        ) : (
          <Board
            boardId={board.id}
            lists={filtering ? shownLists : live.lists}
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
            arrangeLocked={filtering}
          />
        )}
      </div>
      {shareOpen ? (
        <Modal title="Share this board" onClose={() => setShareOpen(false)}>
          <p className="text-sm text-[#5e6c84]">
            Send an email invite. They sign in with that address and can open this board. Tag them on a card when you want them to see that task.
          </p>
          <form
            className="mt-4 flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const email = inviteEmail.trim();
              if (!email) return;
              setShareBusy(true);
              api
                .invite(board.workspaceId, email, "member")
                .then((member) => {
                  setInviteEmail("");
                  setExtraMembers((current) => (current.some((item) => item.id === member.id) ? current.map((item) => (item.id === member.id ? member : item)) : [...current, member]));
                  setToast(member.emailSent ? `Invite emailed to ${member.email}.` : `Invite saved for ${member.email}. The email could not be sent.`);
                })
                .catch((error: unknown) => setToast(errorMessage(error)))
                .finally(() => setShareBusy(false));
            }}
          >
            <TextInput type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@althakeel.com" required />
            <Button type="submit" disabled={shareBusy}>
              {shareBusy ? "Sending..." : "Send invite"}
            </Button>
          </form>
          <ul className="mt-4 flex flex-col gap-2 border-t border-[#dfe1e6] pt-3">
            {[...members, ...extraMembers.filter((member) => !members.some((item) => item.id === member.id))].map((member) => (
              <li key={member.id} className="flex items-center gap-2">
                <Avatar name={member.name || member.email} photo={member.photo} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{member.name || member.email}</p>
                  <p className="truncate text-xs text-[#5e6c84]">{member.status === "pending" ? "Invite sent" : member.email}</p>
                </div>
                {member.status === "pending" && member.inviteToken ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-[#0c66e4]"
                    onClick={() => {
                      const url = `${window.location.origin}/invite/${member.inviteToken}`;
                      void navigator.clipboard.writeText(url).then(
                        () => setToast("Invite link copied."),
                        () => setToast(url),
                      );
                    }}
                  >
                    Copy link
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </Modal>
      ) : null}
      {settingsOpen ? (
        <Modal
          title="Board settings"
          onClose={() => {
            setSettingsOpen(false);
            setDeleteName("");
            setDangerOpen(false);
          }}
        >
          <div className="flex flex-col gap-5">
            <section>
              <h3 className="text-sm font-semibold">Invite to this board</h3>
              <p className="mt-1 text-sm text-[#5e6c84]">They get an email, sign in with that address, and can open this board.</p>
              <form
                className="mt-3 flex flex-col gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const email = inviteEmail.trim();
                  if (!email) return;
                  setShareBusy(true);
                  api
                    .invite(board.workspaceId, email, "member")
                    .then((member) => {
                      setInviteEmail("");
                      setExtraMembers((current) =>
                        current.some((item) => item.id === member.id) ? current.map((item) => (item.id === member.id ? member : item)) : [...current, member],
                      );
                      setToast(member.emailSent ? `Invite emailed to ${member.email}.` : `Invite saved for ${member.email}. The email could not be sent.`);
                    })
                    .catch((error: unknown) => setToast(errorMessage(error)))
                    .finally(() => setShareBusy(false));
                }}
              >
                <TextInput type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@althakeel.com" required />
                <Button type="submit" disabled={shareBusy}>
                  {shareBusy ? "Sending..." : "Send invite"}
                </Button>
              </form>
            </section>
            <section>
              <h3 className="text-sm font-semibold">About this board</h3>
              <TextArea
                className="mt-2"
                rows={2}
                value={descriptionDraft ?? board.description}
                placeholder="What is this board for?"
                onChange={(event) => setDescriptionDraft(event.target.value)}
                onBlur={() => {
                  const next = (descriptionDraft ?? board.description).trim();
                  setDescriptionDraft(null);
                  if (next === board.description) return;
                  api
                    .updateBoard(board.id, { description: next })
                    .then((saved) => live.updateBoard(saved))
                    .catch((error: unknown) => setToast(errorMessage(error)));
                }}
              />
            </section>
            <section>
              <h3 className="text-sm font-semibold">Color</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {BOARD_BACKGROUNDS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={item.name}
                    className="h-8 w-10 rounded"
                    style={{ backgroundColor: item.color, outline: !board.backgroundImage && item.color === board.background ? "2px solid #172b4d" : undefined, outlineOffset: 2 }}
                    onClick={() => {
                      api
                        .updateBoard(board.id, { background: item.color, backgroundImage: "" })
                        .then((saved) => live.updateBoard(saved))
                        .catch((error: unknown) => setToast(errorMessage(error)));
                    }}
                  />
                ))}
              </div>
              <h3 className="mt-4 text-sm font-semibold">Gradient</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {BOARD_GRADIENTS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={item.name}
                    className="h-8 w-14 rounded"
                    style={{ backgroundImage: item.value, outline: board.backgroundImage === item.value ? "2px solid #172b4d" : undefined, outlineOffset: 2 }}
                    onClick={() => {
                      api
                        .updateBoard(board.id, { backgroundImage: item.value })
                        .then((saved) => live.updateBoard(saved))
                        .catch((error: unknown) => setToast(errorMessage(error)));
                    }}
                  />
                ))}
              </div>
              <h3 className="mt-4 text-sm font-semibold">Image</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button type="button" variant="quiet" disabled={uploadingBackground} onClick={() => backgroundFile.current?.click()}>
                  {uploadingBackground ? "Uploading..." : "Upload image"}
                </Button>
                {board.backgroundImage && !board.backgroundImage.startsWith("linear-gradient(") ? (
                  <button
                    type="button"
                    className="text-sm text-[#ae2e24]"
                    onClick={() => {
                      api
                        .updateBoard(board.id, { backgroundImage: "" })
                        .then((saved) => live.updateBoard(saved))
                        .catch((error: unknown) => setToast(errorMessage(error)));
                    }}
                  >
                    Remove image
                  </button>
                ) : null}
              </div>
              <input
                ref={backgroundFile}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  if (fileKind(file) !== "image") {
                    setToast("Choose an image.");
                    return;
                  }
                  if (file.size > 15 * 1024 * 1024) {
                    setToast("Images need to be under 15 MB.");
                    return;
                  }
                  setUploadingBackground(true);
                  api
                    .imageKitAuth()
                    .then((authParams) => {
                      const imagekit = new ImageKit({ publicKey: authParams.publicKey, urlEndpoint: authParams.urlEndpoint });
                      return imagekit.upload({
                        file,
                        fileName: file.name || "background",
                        signature: authParams.signature,
                        token: authParams.token,
                        expire: authParams.expire,
                        folder: `/boards/${board.id}/background`,
                        useUniqueFileName: true,
                      });
                    })
                    .then((uploaded) => api.updateBoard(board.id, { backgroundImage: uploaded.url }))
                    .then((saved) => live.updateBoard(saved))
                    .catch((error: unknown) => setToast(errorMessage(error)))
                    .finally(() => setUploadingBackground(false));
                }}
              />
              <p className="mt-2 text-xs text-[#5e6c84]">A photo covers the whole board. Color and gradient stay available if you remove it.</p>
            </section>
            {dangerOpen ? (
              <section className="rounded-lg border border-[#dfe1e6] p-3">
                <h3 className="text-sm font-semibold">{locked ? "Reopen board" : "Close board"}</h3>
                <p className="mt-1 text-sm text-[#5e6c84]">Closing pauses changes. Delete stays unavailable until the board is closed.</p>
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
                {locked ? (
                  <form
                    className="mt-4 flex flex-col gap-2 border-t border-[#dfe1e6] pt-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (deleteName.trim() !== board.title) return;
                      api
                        .deleteBoard(board.id)
                        .then(() => router.push(`/w/${board.workspaceId}`))
                        .catch((error: unknown) => setToast(errorMessage(error)));
                    }}
                  >
                    <p className="text-sm text-[#5e6c84]">Type “{board.title}” to delete this board. The admin can restore it for 7 days from Recently deleted.</p>
                    <TextInput value={deleteName} onChange={(event) => setDeleteName(event.target.value)} placeholder={board.title} />
                    <Button type="submit" variant="danger" disabled={deleteName.trim() !== board.title}>
                      Delete board
                    </Button>
                  </form>
                ) : null}
              </section>
            ) : (
              <button type="button" className="self-start text-xs text-[#5e6c84] underline" onClick={() => setDangerOpen(true)}>
                More options
              </button>
            )}
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
          canReview={isAdmin}
          locked={locked}
          onClose={() => live.setOpenCardId(null)}
          onCopied={(card) => {
            live.setLists((current) => upsertCard(current, card));
            live.setOpenCardId(card.id);
            setToast("Card copied.");
          }}
          onDelete={(cardId) => {
            const clientMutationId = live.trackMutation();
            const snapshot = live.getLists();
            live.setLists((current) => current.map((list) => ({ ...list, cards: list.cards.filter((card) => card.id !== cardId) })));
            live.setOpenCardId(null);
            api.deleteCard(cardId, clientMutationId).then(() => setToast("Card deleted. The admin can restore it for 7 days from Recently deleted.")).catch((error: unknown) => {
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
