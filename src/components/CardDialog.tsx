"use client";

import { useEffect, useRef, useState } from "react";
import ImageKit from "imagekit-javascript";
import { LABEL_PRESETS, type Card, type Comment, type List, type Membership, type Role } from "@shared/types";
import { positionBetween } from "@shared/position";
import { api } from "@/lib/api";
import { fileKind } from "@/lib/board-state";
import { errorMessage, formatDue, formatWhen, isOverdue } from "@/lib/format";
import { Avatar, cx } from "@/components/ui";
import { MentionField, MentionText, mentionIdsIn, mentionPeople } from "@/components/MentionField";

type CardDialogProps = {
  card: Card;
  lists: List[];
  members: Membership[];
  comments: Comment[];
  role: Role;
  currentUserId: string;
  trackMutation: () => string;
  forgetMutation: (id: string) => void;
  onCard: (card: Card) => void;
  onComments: (comments: Comment[]) => void;
  onClose: () => void;
  onCopied: (card: Card) => void;
  onDelete: (cardId: string) => void;
  canDelete: boolean;
  canReview: boolean;
  locked: boolean;
};

export function CardDialog({
  card,
  lists,
  members,
  comments,
  currentUserId,
  trackMutation,
  forgetMutation,
  onCard,
  onComments,
  onClose,
  onCopied,
  onDelete,
  canDelete,
  canReview,
  locked,
}: CardDialogProps) {
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState<string | null>(null);
  const title = titleDraft ?? card.title;
  const description = descriptionDraft ?? card.description;
  const [checkText, setCheckText] = useState("");
  const [copyListId, setCopyListId] = useState(card.listId);
  const [copying, setCopying] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [chatText, setChatText] = useState("");
  const [chatImage, setChatImage] = useState<{ url: string; fileId: string; name: string } | null>(null);
  const [pane, setPane] = useState<"comments" | "chat">("chat");
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const chatFileRef = useRef<HTMLInputElement>(null);
  const mentionOpen = useRef(false);
  const people = members.filter((member) => member.status === "active" && member.userId);
  const tagPeople = mentionPeople(members);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !mentionOpen.current) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setCopyListId(card.listId);
  }, [card.id, card.listId]);

  async function save(patch: Record<string, unknown>) {
    if (locked) return null;
    const clientMutationId = trackMutation();
    try {
      const saved = await api.updateCard(card.id, { ...patch, clientMutationId });
      onCard(saved);
      setError(null);
      return saved;
    } catch (err) {
      forgetMutation(clientMutationId);
      setError(errorMessage(err));
      return null;
    }
  }

  const cover = card.attachments[0];

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-black/60 p-4 sm:p-10" onMouseDown={onClose}>
      <div
        className="mx-auto w-full max-w-4xl rounded-xl bg-[#f1f2f4] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={card.title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.thumbnailUrl || cover.url} alt="" className="h-44 w-full rounded-t-xl object-cover" />
        ) : null}
        <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_220px]">
          <div>
            <input
              value={title}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => {
                const next = title.trim();
                setTitleDraft(null);
                if (next && next !== card.title) void save({ title: next });
              }}
              className="w-full bg-transparent text-xl font-semibold text-[#172b4d] outline-none"
            />
            <p className="mt-1 text-sm text-[#5e6c84]">
              in list <span className="font-medium text-[#172b4d]">{lists.find((list) => list.id === card.listId)?.title}</span>
              {card.createdAt ? <time dateTime={card.createdAt}> · {formatWhen(card.createdAt)}</time> : null}
            </p>

            <section className="mt-5">
              <h3 className="mb-2 text-sm font-semibold">Description</h3>
              <MentionField
                value={description}
                people={tagPeople}
                menuRef={mentionOpen}
                rows={4}
                placeholder="Add a more detailed description... Type @ to tag a member"
                onChange={(next) => setDescriptionDraft(next)}
                onBlur={() => {
                  const next = descriptionDraft ?? card.description;
                  setDescriptionDraft(null);
                  if (next !== card.description) void save({ description: next, mentionIds: mentionIdsIn(next, tagPeople) });
                }}
                className="w-full resize-y rounded-lg border border-transparent bg-white px-3 py-2 text-sm outline-none focus:border-[#0c66e4]"
              />
            </section>

            {card.attachments.length > 0 ? (
              <section className="mt-5">
                <h3 className="mb-2 text-sm font-semibold">Attachments</h3>
                <div className="flex flex-col gap-2">
                  {card.attachments.map((file) => (
                    <div key={file.id} className="flex gap-3 rounded-lg bg-white p-2">
                      {file.type === "video" ? (
                        <video src={file.url} controls className="h-20 w-32 rounded bg-black object-cover" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={file.thumbnailUrl || file.url} alt="" className="h-20 w-32 rounded object-cover" />
                      )}
                      <div className="min-w-0 flex-1">
                        <a href={file.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-[#0c66e4]">
                          {file.name}
                        </a>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs">
                          {card.attachments[0]?.id !== file.id ? (
                            <button
                              type="button"
                              className="text-[#44546f] hover:underline"
                              onClick={() =>
                                void save({
                                  attachments: [file, ...card.attachments.filter((item) => item.id !== file.id)],
                                })
                              }
                            >
                              Use as cover
                            </button>
                          ) : null}
                          {canDelete && !locked ? (
                          <button
                            type="button"
                            className="text-[#ae2e24] hover:underline"
                            onClick={() => {
                              const clientMutationId = trackMutation();
                              api
                                .deleteAttachment(card.id, file.id, clientMutationId)
                                .then(onCard)
                                .catch((err: unknown) => {
                                  forgetMutation(clientMutationId);
                                  setError(errorMessage(err));
                                });
                            }}
                          >
                            Delete
                          </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="mt-5">
              <h3 className="mb-2 text-sm font-semibold">Checklist</h3>
              {card.checklist.length > 0 ? (
                <ul className="mb-2 flex flex-col gap-1">
                  {card.checklist.map((item) => (
                    <li key={item.id} className="flex items-start gap-2 rounded-md bg-white px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() =>
                          void save({
                            checklist: card.checklist.map((entry) => (entry.id === item.id ? { ...entry, done: !entry.done } : entry)),
                          })
                        }
                        className="mt-1"
                      />
                      <span className={cx("flex-1 text-sm", item.done && "text-[#5e6c84] line-through")}>{item.text}</span>
                      <button
                        type="button"
                        aria-label="Remove checklist item"
                        className="text-[#5e6c84]"
                        onClick={() => void save({ checklist: card.checklist.filter((entry) => entry.id !== item.id) })}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = checkText.trim();
                  if (!text) return;
                  void save({ checklist: [...card.checklist, { id: crypto.randomUUID(), text, done: false }] });
                  setCheckText("");
                }}
              >
                <input
                  value={checkText}
                  onChange={(event) => setCheckText(event.target.value)}
                  placeholder="Add an item"
                  className="flex-1 rounded-md border border-[#dfe1e6] bg-white px-3 py-2 text-sm outline-none focus:border-[#0c66e4]"
                />
                <button type="submit" className="rounded-md bg-[#091e420f] px-3 text-sm font-medium">
                  Add
                </button>
              </form>
            </section>

            {card.approval ? (
              <section className="mt-5 rounded-lg border border-[#dfe1e6] bg-white p-3">
                <p className="text-sm font-semibold">
                  {card.approval === "pending" ? "Waiting for approval" : card.approval === "approved" ? "Approved" : "Rejected"}
                </p>
                <p className="mt-1 text-sm text-[#5e6c84]">
                  {card.approval === "approved"
                    ? "Other members can see this task."
                    : "Only the member who added it and the admin can see it until it is approved."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {canReview && !locked ? (
                    <>
                      <button
                        type="button"
                        disabled={reviewing || card.approval === "approved"}
                        onClick={() => void review("approved")}
                        className="rounded-md bg-[#1f845a] px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={reviewing || card.approval === "rejected"}
                        onClick={() => void review("rejected")}
                        className="rounded-md bg-[#c9372c] px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                  <button type="button" onClick={() => setPane("chat")} className="rounded-md bg-[#091e420f] px-3 py-2 text-sm font-medium">
                    Chat
                  </button>
                </div>
              </section>
            ) : null}
            <section className="mt-5">
              <div className="mb-3 flex gap-1 rounded-lg bg-[#091e420f] p-1">
                <button
                  type="button"
                  onClick={() => setPane("chat")}
                  className={cx("flex-1 rounded-md px-3 py-1.5 text-sm font-semibold", pane === "chat" ? "bg-white text-[#172b4d] shadow-sm" : "text-[#44546f]")}
                >
                  Chat
                </button>
                <button
                  type="button"
                  onClick={() => setPane("comments")}
                  className={cx("flex-1 rounded-md px-3 py-1.5 text-sm font-semibold", pane === "comments" ? "bg-white text-[#172b4d] shadow-sm" : "text-[#44546f]")}
                >
                  Comments
                </button>
              </div>
              {pane === "chat" ? (
                <>
                  <ul className="mb-3 flex max-h-72 flex-col gap-3 overflow-y-auto">
                    {comments.filter((comment) => (comment.channel || "comment") === "chat").length === 0 ? (
                      <li className="text-sm text-[#5e6c84]">No messages yet. Type @ to tag a member, or attach an image.</li>
                    ) : null}
                    {comments
                      .filter((comment) => (comment.channel || "comment") === "chat")
                      .map((comment) => (
                        <Message key={comment.id} comment={comment} people={tagPeople} canDelete={canDelete && !locked} onDelete={() => removeComment(comment.id)} />
                      ))}
                  </ul>
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void sendMessage("chat", chatText, chatImage);
                    }}
                  >
                    {chatImage ? (
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={chatImage.url} alt="" className="h-16 w-16 rounded object-cover" />
                        <button type="button" className="text-xs text-[#ae2e24]" onClick={() => setChatImage(null)}>
                          Remove image
                        </button>
                      </div>
                    ) : null}
                    <div className="flex items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <MentionField
                          value={chatText}
                          people={tagPeople}
                          menuRef={mentionOpen}
                          rows={2}
                          placeholder="Message the team... Type @ to tag"
                          onChange={setChatText}
                          className="w-full resize-none rounded-lg border border-[#dfe1e6] bg-white px-3 py-2 text-sm outline-none focus:border-[#0c66e4]"
                        />
                      </div>
                      {locked ? null : (
                        <button
                          type="button"
                          aria-label="Attach image"
                          disabled={uploading}
                          onClick={() => chatFileRef.current?.click()}
                          className="rounded-md bg-[#091e420f] px-3 py-2 text-sm font-medium hover:bg-[#091e4224] disabled:opacity-60"
                        >
                          {uploading ? "..." : "Image"}
                        </button>
                      )}
                      <button type="submit" className="rounded-md bg-[#0c66e4] px-3 py-2 text-sm font-medium text-white">
                        Send
                      </button>
                    </div>
                  </form>
                  <input
                    ref={chatFileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      void uploadChatImage(file);
                    }}
                  />
                </>
              ) : (
                <>
                  <form
                    className="mb-3 flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void sendMessage("comment", commentText, null);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <MentionField
                        value={commentText}
                        people={tagPeople}
                        menuRef={mentionOpen}
                        rows={2}
                        placeholder="Write a comment... Type @ to tag"
                        onChange={setCommentText}
                        className="w-full resize-none rounded-lg border border-[#dfe1e6] bg-white px-3 py-2 text-sm outline-none focus:border-[#0c66e4]"
                      />
                    </div>
                    <button type="submit" className="h-fit rounded-md bg-[#0c66e4] px-3 py-2 text-sm font-medium text-white">
                      Send
                    </button>
                  </form>
                  <ul className="flex flex-col gap-3">
                    {comments
                      .filter((comment) => (comment.channel || "comment") !== "chat")
                      .map((comment) => (
                        <Message key={comment.id} comment={comment} people={tagPeople} canDelete={canDelete && !locked} onDelete={() => removeComment(comment.id)} />
                      ))}
                  </ul>
                </>
              )}
            </section>
            {error ? <p className="mt-4 text-sm text-[#ae2e24]">{error}</p> : null}
          </div>

          <aside className="flex flex-col gap-4">
            <button type="button" onClick={onClose} className="self-end rounded-md px-2 py-1 text-sm text-[#5e6c84] hover:bg-[#091e420f] md:hidden">
              Close
            </button>
            <SideBlock title="People">
              {people.length === 0 ? (
                <p className="text-xs text-[#5e6c84]">Invite someone and wait until they sign in. Then you can tag them here.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {people.map((member) => {
                    const canTag = member.role === "member";
                    const selected = card.assigneeIds.includes(member.userId || "");
                    const label = member.name || member.email;
                    return (
                      <button
                        key={member.id}
                        type="button"
                        disabled={locked || !canTag}
                        title={label}
                        onClick={() => {
                          if (!canTag) return;
                          const assigneeIds = selected
                            ? card.assigneeIds.filter((id) => id !== member.userId)
                            : [...card.assigneeIds, member.userId as string];
                          void save({ assigneeIds });
                        }}
                        className={cx(
                          "flex items-center gap-3 rounded-2xl border px-2 py-2 text-left",
                          selected ? "border-[#0c66e4] bg-[#e9f2ff]" : "border-[#dfe1e6] bg-white",
                          canTag && !locked ? "hover:border-[#0c66e4]" : "cursor-default",
                        )}
                      >
                        <span className={cx("rounded-full", selected && "ring-2 ring-[#0c66e4] ring-offset-2")}>
                          <Avatar name={label} photo={member.photo} size={36} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{label}</span>
                          <span className="block truncate text-xs text-[#5e6c84]">
                            {selected ? "Tagged on this card" : canTag ? "Click to tag" : member.role}
                          </span>
                        </span>
                        {selected ? (
                          <span className="grid h-5 w-5 place-items-center rounded-full bg-[#0c66e4] text-xs text-white">✓</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </SideBlock>
            <SideBlock title="Labels">
              <div className="flex flex-col gap-1">
                {LABEL_PRESETS.map((preset) => {
                  const selected = card.labels.some((label) => label.color === preset.color);
                  return (
                    <button
                      key={preset.color}
                      type="button"
                      onClick={() => {
                        const labels = selected
                          ? card.labels.filter((label) => label.color !== preset.color)
                          : [...card.labels, { id: crypto.randomUUID(), name: preset.name, color: preset.color }];
                        void save({ labels });
                      }}
                      className={cx("rounded px-2 py-1 text-left text-xs font-semibold text-white", selected && "ring-2 ring-[#172b4d]")}
                      style={{ backgroundColor: preset.color }}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </SideBlock>
            <SideBlock title="Due date">
              <input
                type="date"
                value={card.dueDate || ""}
                onChange={(event) => void save({ dueDate: event.target.value || null })}
                className="w-full rounded-md border border-[#dfe1e6] bg-white px-2 py-1.5 text-sm"
              />
              {card.dueDate ? (
                <p className={cx("mt-1 text-xs", isOverdue(card.dueDate) ? "text-[#ae2e24]" : "text-[#5e6c84]")}>
                  {formatDue(card.dueDate)}
                  {isOverdue(card.dueDate) ? " · overdue" : ""}
                </p>
              ) : null}
            </SideBlock>
            <SideBlock title="List">
              <select
                value={card.listId}
                onChange={(event) => {
                  const listId = event.target.value;
                  const dest = lists.find((list) => list.id === listId);
                  const others = dest?.cards.filter((item) => item.id !== card.id) || [];
                  const position = positionBetween(others.at(-1)?.position ?? null, null);
                  void save({ listId, position });
                }}
                className="w-full rounded-md border border-[#dfe1e6] bg-white px-2 py-1.5 text-sm"
              >
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.title}
                  </option>
                ))}
              </select>
            </SideBlock>
            {locked ? null : (
              <SideBlock title="Copy">
                <select
                  value={copyListId}
                  onChange={(event) => setCopyListId(event.target.value)}
                  className="w-full rounded-md border border-[#dfe1e6] bg-white px-2 py-1.5 text-sm"
                >
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={copying}
                  onClick={() => void copyCard()}
                  className="mt-2 w-full rounded-md bg-[#091e420f] px-3 py-2 text-left text-sm font-medium hover:bg-[#091e4224] disabled:opacity-60"
                >
                  {copying ? "Copying..." : "Copy card"}
                </button>
              </SideBlock>
            )}
            {locked ? null : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="rounded-md bg-[#091e420f] px-3 py-2 text-left text-sm font-medium hover:bg-[#091e4224] disabled:opacity-60"
            >
              {uploading ? "Uploading..." : "Attach image or video"}
            </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                void uploadFile(file);
              }}
            />
            {canDelete && !locked ? (
              confirmDelete ? (
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (deleteName.trim() !== card.title) return;
                    onDelete(card.id);
                  }}
                >
                  <p className="text-xs text-[#5e6c84]">Type “{card.title}” to delete. The admin can restore it for 7 days.</p>
                  <input
                    value={deleteName}
                    autoFocus
                    onChange={(event) => setDeleteName(event.target.value)}
                    placeholder={card.title}
                    className="w-full rounded-md border border-[#dfe1e6] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#0c66e4]"
                  />
                  <button
                    type="submit"
                    disabled={deleteName.trim() !== card.title}
                    className="rounded-md bg-[#c9372c] px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                  >
                    Delete card
                  </button>
                </form>
              ) : (
                <button type="button" className="rounded-md px-3 py-2 text-left text-sm text-[#ae2e24] hover:bg-[#ffeceb]" onClick={() => setConfirmDelete(true)}>
                  Delete card
                </button>
              )
            ) : null}
            <button type="button" onClick={onClose} className="hidden rounded-md px-3 py-2 text-left text-sm text-[#44546f] hover:bg-[#091e420f] md:block">
              Close
            </button>
          </aside>
        </div>
      </div>
    </div>
  );

  async function review(decision: "approved" | "rejected") {
    setReviewing(true);
    setError(null);
    try {
      onCard(await api.reviewCard(card.id, decision));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setReviewing(false);
    }
  }

  async function copyCard() {
    if (locked || copying) return;
    setCopying(true);
    setError(null);
    const clientMutationId = trackMutation();
    try {
      const created = await api.createCard(copyListId, card.title, clientMutationId);
      const memberIds = new Set(
        members.filter((member) => member.role === "member" && member.userId).map((member) => member.userId as string),
      );
      const assigneeIds = card.assigneeIds.filter((id) => memberIds.has(id));
      if (memberIds.has(currentUserId) && !assigneeIds.includes(currentUserId)) assigneeIds.push(currentUserId);
      const saved = await api.updateCard(created.id, {
        description: card.description,
        labels: card.labels,
        checklist: card.checklist,
        dueDate: card.dueDate,
        assigneeIds,
        attachments: card.attachments,
        clientMutationId: trackMutation(),
      });
      onCopied(saved);
    } catch (err) {
      forgetMutation(clientMutationId);
      setError(errorMessage(err));
    } finally {
      setCopying(false);
    }
  }

  async function sendMessage(channel: "comment" | "chat", raw: string, image: { url: string; fileId: string; name: string } | null) {
    const text = raw.trim();
    if (!text && !image) return;
    const clientMutationId = trackMutation();
    try {
      const comment = await api.addComment(card.id, {
        text,
        clientMutationId,
        channel,
        mentionIds: mentionIdsIn(text, tagPeople),
        imageUrl: image?.url,
        imageFileId: image?.fileId,
        imageName: image?.name,
      });
      onComments(comments.some((item) => item.id === comment.id) ? comments : [...comments, comment]);
      if (channel === "chat") {
        setChatText("");
        setChatImage(null);
      } else {
        setCommentText("");
      }
      setError(null);
    } catch (err) {
      forgetMutation(clientMutationId);
      setError(errorMessage(err));
    }
  }

  function removeComment(commentId: string) {
    const clientMutationId = trackMutation();
    api
      .deleteComment(commentId, clientMutationId)
      .then(() => onComments(comments.filter((item) => item.id !== commentId)))
      .catch((err: unknown) => {
        forgetMutation(clientMutationId);
        setError(errorMessage(err));
      });
  }

  async function uploadChatImage(file: File) {
    if (!file.type.startsWith("image/") && !["png", "jpg", "jpeg", "gif", "webp", "avif", "heic"].includes(file.name.split(".").pop()?.toLowerCase() || "")) {
      setError("Choose an image.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("Images need to be under 15 MB.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const authParams = await api.imageKitAuth();
      const imagekit = new ImageKit({ publicKey: authParams.publicKey, urlEndpoint: authParams.urlEndpoint });
      const uploaded = await imagekit.upload({
        file,
        fileName: file.name || "image",
        signature: authParams.signature,
        token: authParams.token,
        expire: authParams.expire,
        folder: `/boards/${card.boardId}/chat`,
        useUniqueFileName: true,
      });
      setChatImage({ url: uploaded.url, fileId: uploaded.fileId, name: uploaded.name || file.name });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function uploadFile(file: File) {
    const kind = fileKind(file);
    if (!kind) {
      setError("Choose an image or a video.");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("Files need to be under 100 MB.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const authParams = await api.imageKitAuth();
      const imagekit = new ImageKit({ publicKey: authParams.publicKey, urlEndpoint: authParams.urlEndpoint });
      const uploaded = await imagekit.upload({
        file,
        fileName: file.name || "upload",
        signature: authParams.signature,
        token: authParams.token,
        expire: authParams.expire,
        folder: `/boards/${card.boardId}`,
        useUniqueFileName: true,
      });
      const clientMutationId = trackMutation();
      try {
        const saved = await api.addAttachment(card.id, {
          name: uploaded.name || file.name,
          url: uploaded.url,
          fileId: uploaded.fileId,
          type: kind,
          thumbnailUrl: kind === "video" ? `${uploaded.url}/ik-thumbnail.jpg` : uploaded.thumbnailUrl || uploaded.url,
          clientMutationId,
        });
        onCard(saved);
      } catch (err) {
        forgetMutation(clientMutationId);
        throw err;
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }
}

function Message({
  comment,
  people,
  canDelete,
  onDelete,
}: {
  comment: Comment;
  people: ReturnType<typeof mentionPeople>;
  canDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <li className="flex gap-2">
      <Avatar name={comment.authorName} photo={comment.authorPhoto} />
      <div className="min-w-0 flex-1 rounded-lg bg-white px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">{comment.authorName}</span>
          <span className="text-xs text-[#5e6c84]">{formatWhen(comment.createdAt)}</span>
          {canDelete ? (
            <button type="button" className="ml-auto text-xs text-[#5e6c84] hover:text-[#ae2e24]" onClick={onDelete}>
              Delete
            </button>
          ) : null}
        </div>
        {comment.text ? (
          <p className="mt-1 whitespace-pre-wrap text-sm">
            <MentionText text={comment.text} people={people} />
          </p>
        ) : null}
        {comment.imageUrl ? (
          <a href={comment.imageUrl} target="_blank" rel="noreferrer" className="mt-2 block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={comment.imageUrl} alt={comment.imageName || "Image"} className="max-h-48 rounded-md object-cover" />
          </a>
        ) : null}
      </div>
    </li>
  );
}

function SideBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold tracking-wide text-[#5e6c84] uppercase">{title}</h3>
      {children}
    </section>
  );
}
