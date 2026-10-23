"use client";

import { useEffect, useRef, useState } from "react";
import ImageKit from "imagekit-javascript";
import { LABEL_PRESETS, type Card, type Comment, type List, type Membership, type Role } from "@shared/types";
import { positionBetween } from "@shared/position";
import { api } from "@/lib/api";
import { fileKind } from "@/lib/board-state";
import { errorMessage, formatDue, formatWhen, isOverdue } from "@/lib/format";
import { Avatar, cx } from "@/components/ui";

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
  onDelete: (cardId: string) => void;
  canDelete: boolean;
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
  onDelete,
  canDelete,
  locked,
}: CardDialogProps) {
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState<string | null>(null);
  const title = titleDraft ?? card.title;
  const description = descriptionDraft ?? card.description;
  const [checkText, setCheckText] = useState("");
  const [commentText, setCommentText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const people = members.filter((member) => member.status === "active" && member.userId);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
            </p>

            <section className="mt-5">
              <h3 className="mb-2 text-sm font-semibold">Description</h3>
              <textarea
                value={description}
                rows={4}
                placeholder="Add a more detailed description..."
                onChange={(event) => setDescriptionDraft(event.target.value)}
                onBlur={() => {
                  const next = description;
                  setDescriptionDraft(null);
                  if (next !== card.description) void save({ description: next });
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

            <section className="mt-5">
              <h3 className="mb-2 text-sm font-semibold">Comments</h3>
              <form
                className="mb-3 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = commentText.trim();
                  if (!text) return;
                  const clientMutationId = trackMutation();
                  api
                    .addComment(card.id, text, clientMutationId)
                    .then((comment) => {
                      onComments(comments.some((item) => item.id === comment.id) ? comments : [...comments, comment]);
                      setCommentText("");
                      setError(null);
                    })
                    .catch((err: unknown) => {
                      forgetMutation(clientMutationId);
                      setError(errorMessage(err));
                    });
                }}
              >
                <textarea
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  rows={2}
                  placeholder="Write a comment..."
                  className="flex-1 resize-none rounded-lg border border-[#dfe1e6] bg-white px-3 py-2 text-sm outline-none focus:border-[#0c66e4]"
                />
                <button type="submit" className="h-fit rounded-md bg-[#0c66e4] px-3 py-2 text-sm font-medium text-white">
                  Send
                </button>
              </form>
              <ul className="flex flex-col gap-3">
                {comments.map((comment) => (
                  <li key={comment.id} className="flex gap-2">
                    <Avatar name={comment.authorName} photo={comment.authorPhoto} />
                    <div className="min-w-0 flex-1 rounded-lg bg-white px-3 py-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold">{comment.authorName}</span>
                        <span className="text-xs text-[#5e6c84]">{formatWhen(comment.createdAt)}</span>
                        {canDelete && !locked ? (
                          <button
                            type="button"
                            className="ml-auto text-xs text-[#5e6c84] hover:text-[#ae2e24]"
                            onClick={() => {
                              const clientMutationId = trackMutation();
                              api
                                .deleteComment(comment.id, clientMutationId)
                                .then(() => onComments(comments.filter((item) => item.id !== comment.id)))
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
                      <p className="mt-1 whitespace-pre-wrap text-sm">{comment.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            {error ? <p className="mt-4 text-sm text-[#ae2e24]">{error}</p> : null}
          </div>

          <aside className="flex flex-col gap-4">
            <button type="button" onClick={onClose} className="self-end rounded-md px-2 py-1 text-sm text-[#5e6c84] hover:bg-[#091e420f] md:hidden">
              Close
            </button>
            <SideBlock title="Members">
              {people.length === 0 ? <p className="text-xs text-[#5e6c84]">Invite teammates from the workspace page.</p> : null}
              {people.map((member) => {
                const selected = card.assigneeIds.includes(member.userId || "");
                return (
                  <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-[#091e420f]">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {
                        const assigneeIds = selected
                          ? card.assigneeIds.filter((id) => id !== member.userId)
                          : [...card.assigneeIds, member.userId as string];
                        void save({ assigneeIds });
                      }}
                    />
                    <Avatar name={member.name || member.email} photo={member.photo} size={22} />
                    <span className="truncate">{member.name || member.email}</span>
                  </label>
                );
              })}
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
                <button
                  type="button"
                  className="rounded-md bg-[#c9372c] px-3 py-2 text-sm font-medium text-white"
                  onClick={() => onDelete(card.id)}
                >
                  Confirm delete
                </button>
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

function SideBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold tracking-wide text-[#5e6c84] uppercase">{title}</h3>
      {children}
    </section>
  );
}
