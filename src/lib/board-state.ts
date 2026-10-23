import type { AttachmentType, Card, Comment, List, LiveEvent } from "@shared/types";

export function upsertCard(lists: List[], card: Card): List[] {
  const stripped = lists.map((list) => ({
    ...list,
    cards: list.cards.filter((item) => item.id !== card.id),
  }));
  return stripped.map((list) => {
    if (list.id !== card.listId) return list;
    return {
      ...list,
      cards: [...list.cards, card].sort((a, b) => a.position - b.position),
    };
  });
}

export function applyListEvent(lists: List[], event: LiveEvent): List[] {
  switch (event.type) {
    case "list:created":
      if (lists.some((list) => list.id === event.list.id)) {
        return lists.map((list) => (list.id === event.list.id ? { ...list, ...event.list, cards: list.cards } : list));
      }
      return [...lists, { ...event.list, cards: event.list.cards || [] }].sort((a, b) => a.position - b.position);
    case "list:updated":
    case "list:moved":
      return lists
        .map((list) =>
          list.id === event.list.id ? { ...list, title: event.list.title, position: event.list.position } : list,
        )
        .sort((a, b) => a.position - b.position);
    case "list:deleted":
      return lists.filter((list) => list.id !== event.listId);
    case "lists:reordered":
      return lists
        .map((list) => {
          const next = event.lists.find((item) => item.id === list.id);
          return next ? { ...list, position: next.position } : list;
        })
        .sort((a, b) => a.position - b.position);
    case "card:created":
    case "card:updated":
    case "card:moved":
      return upsertCard(lists, event.card);
    case "card:deleted":
      return lists.map((list) => ({ ...list, cards: list.cards.filter((card) => card.id !== event.cardId) }));
    case "cards:reordered":
      return lists.map((list) => ({
        ...list,
        cards: list.cards
          .map((card) => {
            const next = event.cards.find((item) => item.id === card.id);
            return next ? { ...card, listId: next.listId, position: next.position } : card;
          })
          .sort((a, b) => a.position - b.position),
      }));
    default:
      return lists;
  }
}

export function applyCommentEvent(comments: Comment[], event: LiveEvent, openCardId: string | null): Comment[] {
  if (event.type === "comment:created") {
    if (!openCardId || event.comment.cardId !== openCardId) return comments;
    if (comments.some((comment) => comment.id === event.comment.id)) return comments;
    return [...comments, event.comment].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  if (event.type === "comment:deleted") {
    return comments.filter((comment) => comment.id !== event.commentId);
  }
  return comments;
}

export function fileKind(file: File): AttachmentType | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension && ["png", "jpg", "jpeg", "gif", "webp", "avif", "heic"].includes(extension)) return "image";
  if (extension && ["mp4", "webm", "mov", "ogg", "m4v"].includes(extension)) return "video";
  return null;
}
