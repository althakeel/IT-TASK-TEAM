"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRef, useState } from "react";
import type { Card, List, Membership } from "@shared/types";
import { positionBetween } from "@shared/position";
import { api } from "@/lib/api";
import { upsertCard } from "@/lib/board-state";
import { errorMessage, formatDue, formatWhen, isOverdue } from "@/lib/format";
import { Avatar, Button, cx, Modal, TextInput } from "@/components/ui";

type BoardProps = {
  boardId: string;
  lists: List[];
  members: Membership[];
  setLists: (updater: List[] | ((current: List[]) => List[])) => void;
  getLists: () => List[];
  trackMutation: () => string;
  forgetMutation: (id: string) => void;
  setDragging: (value: boolean) => void;
  onOpenCard: (cardId: string) => void;
  onError: (message: string) => void;
  onAdded?: (card: Card) => void;
  canDelete: boolean;
  locked: boolean;
  arrangeLocked?: boolean;
};

export function Board({
  boardId,
  lists,
  members,
  setLists,
  getLists,
  trackMutation,
  forgetMutation,
  setDragging,
  onOpenCard,
  onError,
  onAdded,
  canDelete,
  locked,
  arrangeLocked = false,
}: BoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<"card" | "list" | null>(null);
  const [addingList, setAddingList] = useState(false);
  const snapshotRef = useRef<List[] | null>(null);
  const suppressClick = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const people = new Map(members.filter((member) => member.userId).map((member) => [member.userId as string, member]));

  function onDragStart(event: DragStartEvent) {
    if (locked || arrangeLocked) return;
    snapshotRef.current = structuredClone(getLists());
    suppressClick.current = true;
    setDragging(true);
    setActiveId(String(event.active.id));
    setActiveType(event.active.data.current?.type === "list" ? "list" : "card");
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const type = active.data.current?.type;
    if (type === "list") {
      if (over.data.current?.type !== "list") return;
      const items = getLists();
      const oldIndex = items.findIndex((list) => list.id === active.id);
      const newIndex = items.findIndex((list) => list.id === over.id);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      setLists((current) => arrayMove(current, oldIndex, newIndex));
      return;
    }
    if (type !== "card") return;
    const listsNow = getLists();
    const fromId = listsNow.find((list) => list.cards.some((card) => card.id === active.id))?.id;
    const toId = overListId(over, listsNow);
    if (!fromId || !toId) return;
    if (fromId === toId) {
      const list = listsNow.find((item) => item.id === fromId);
      if (!list) return;
      const oldIndex = list.cards.findIndex((card) => card.id === active.id);
      const newIndex = list.cards.findIndex((card) => card.id === over.id);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      setLists((current) =>
        current.map((item) => (item.id === fromId ? { ...item, cards: arrayMove(item.cards, oldIndex, newIndex) } : item)),
      );
      return;
    }
    setLists((current) => {
      const source = current.find((list) => list.id === fromId);
      const dest = current.find((list) => list.id === toId);
      if (!source || !dest) return current;
      const card = source.cards.find((item) => item.id === active.id);
      if (!card) return current;
      const overIndex = dest.cards.findIndex((item) => item.id === over.id);
      const insertAt = overIndex >= 0 ? overIndex : dest.cards.length;
      return current.map((list) => {
        if (list.id === source.id) return { ...list, cards: list.cards.filter((item) => item.id !== card.id) };
        if (list.id === dest.id) {
          const cards = [...list.cards];
          cards.splice(insertAt, 0, { ...card, listId: dest.id });
          return { ...list, cards };
        }
        return list;
      });
    });
  }

  async function onDragEnd(event: DragEndEvent) {
    if (locked) return;
    const snapshot = snapshotRef.current;
    const type = activeType;
    setActiveId(null);
    setActiveType(null);
    try {
      if (!event.over || !snapshot || !type) {
        if (snapshot) setLists(snapshot);
        return;
      }
      if (type === "list") await persistListMove(String(event.active.id), snapshot);
      if (type === "card") await persistCardMove(String(event.active.id), snapshot);
    } finally {
      setDragging(false);
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }
  }

  async function persistListMove(listId: string, snapshot: List[]) {
    const current = getLists();
    const index = current.findIndex((list) => list.id === listId);
    const startIndex = snapshot.findIndex((list) => list.id === listId);
    if (index < 0 || startIndex === index) return;
    const position = positionBetween(current[index - 1]?.position ?? null, current[index + 1]?.position ?? null);
    const mutationId = trackMutation();
    setLists((prev) =>
      prev.map((list) => (list.id === listId ? { ...list, position } : list)).sort((a, b) => a.position - b.position),
    );
    try {
      const saved = await api.updateList(listId, { position, clientMutationId: mutationId });
      setLists((prev) =>
        prev
          .map((list) => (list.id === saved.id ? { ...list, title: saved.title, position: saved.position } : list))
          .sort((a, b) => a.position - b.position),
      );
    } catch (error) {
      forgetMutation(mutationId);
      setLists(snapshot);
      onError(errorMessage(error));
    }
  }

  async function persistCardMove(cardId: string, snapshot: List[]) {
    const current = getLists();
    const list = current.find((item) => item.cards.some((card) => card.id === cardId));
    const beforeList = snapshot.find((item) => item.cards.some((card) => card.id === cardId));
    if (!list || !beforeList) return;
    const index = list.cards.findIndex((card) => card.id === cardId);
    const startIndex = beforeList.cards.findIndex((card) => card.id === cardId);
    if (beforeList.id === list.id && startIndex === index) return;
    const position = positionBetween(list.cards[index - 1]?.position ?? null, list.cards[index + 1]?.position ?? null);
    const mutationId = trackMutation();
    const optimistic = { ...list.cards[index], listId: list.id, position };
    setLists((prev) => upsertCard(prev, optimistic));
    try {
      const saved = await api.updateCard(cardId, { listId: list.id, position, clientMutationId: mutationId });
      setLists((prev) => upsertCard(prev, saved));
    } catch (error) {
      forgetMutation(mutationId);
      setLists(snapshot);
      onError(errorMessage(error));
    }
  }

  function onDragCancel() {
    if (snapshotRef.current) setLists(snapshotRef.current);
    setActiveId(null);
    setActiveType(null);
    setDragging(false);
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  }

  async function addList(title: string) {
    const mutationId = trackMutation();
    const tempId = `tmp-${mutationId}`;
    const position = positionBetween(getLists().at(-1)?.position ?? null, null);
    setLists((prev) => [...prev, { id: tempId, boardId, title, position, cards: [] }]);
    try {
      const saved = await api.createList(boardId, title, mutationId);
      setLists((prev) => prev.map((list) => (list.id === tempId ? saved : list)).sort((a, b) => a.position - b.position));
    } catch (error) {
      forgetMutation(mutationId);
      setLists((prev) => prev.filter((list) => list.id !== tempId));
      onError(errorMessage(error));
    }
  }

  async function renameList(listId: string, title: string) {
    const mutationId = trackMutation();
    const previous = getLists().find((list) => list.id === listId)?.title;
    setLists((prev) => prev.map((list) => (list.id === listId ? { ...list, title } : list)));
    try {
      const saved = await api.updateList(listId, { title, clientMutationId: mutationId });
      setLists((prev) => prev.map((list) => (list.id === saved.id ? { ...list, title: saved.title } : list)));
    } catch (error) {
      forgetMutation(mutationId);
      if (previous) setLists((prev) => prev.map((list) => (list.id === listId ? { ...list, title: previous } : list)));
      onError(errorMessage(error));
    }
  }

  async function removeList(listId: string) {
    const mutationId = trackMutation();
    const snapshot = getLists();
    setLists((prev) => prev.filter((list) => list.id !== listId));
    try {
      await api.deleteList(listId, mutationId);
      onError("List deleted. The admin can restore it for 7 days from Recently deleted.");
    } catch (error) {
      forgetMutation(mutationId);
      setLists(snapshot);
      onError(errorMessage(error));
    }
  }

  async function addCard(listId: string, title: string) {
    const mutationId = trackMutation();
    const tempId = `tmp-${mutationId}`;
    const list = getLists().find((item) => item.id === listId);
    const position = positionBetween(list?.cards.at(-1)?.position ?? null, null);
    const optimistic: Card = {
      id: tempId,
      listId,
      boardId,
      title,
      description: "",
      position,
      dueDate: null,
      labels: [],
      assigneeIds: [],
      checklist: [],
      attachments: [],
      createdBy: "",
      createdAt: new Date().toISOString(),
      approval: null,
      location: "",
    };
    setLists((prev) => prev.map((item) => (item.id === listId ? { ...item, cards: [...item.cards, optimistic] } : item)));
    try {
      const saved = await api.createCard(listId, title, mutationId);
      setLists((prev) => prev.map((item) => (item.id === listId ? { ...item, cards: item.cards.map((card) => (card.id === tempId ? saved : card)) } : item)));
      onAdded?.(saved);
    } catch (error) {
      forgetMutation(mutationId);
      setLists((prev) => prev.map((item) => ({ ...item, cards: item.cards.filter((card) => card.id !== tempId) })));
      onError(errorMessage(error));
    }
  }

  const activeCard = activeId ? lists.flatMap((list) => list.cards).find((card) => card.id === activeId) : undefined;
  const activeList = activeId ? lists.find((list) => list.id === activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={(event) => void onDragEnd(event)}
      onDragCancel={onDragCancel}
    >
      <div className="board-scroll flex h-full items-start gap-3 overflow-x-auto px-3 pt-3 pb-4">
        <SortableContext items={lists.map((list) => list.id)} strategy={horizontalListSortingStrategy}>
          {lists.map((list) => (
            <ListColumn
              key={list.id}
              list={list}
              people={people}
              listDragDisabled={activeType === "card"}
              onOpenCard={(cardId) => {
                if (suppressClick.current) return;
                onOpenCard(cardId);
              }}
              onRename={(title) => void renameList(list.id, title)}
              onDelete={canDelete ? () => void removeList(list.id) : null}
              onAddCard={(title) => addCard(list.id, title)}
              locked={locked}
              arrangeLocked={arrangeLocked}
            />
          ))}
        </SortableContext>
        {locked ? null : (
        <div className="w-[272px] shrink-0">
          {addingList ? (
            <form
              className="rounded-xl bg-[#f1f2f4] p-2"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const title = String(data.get("title") || "").trim();
                if (!title) return;
                void addList(title);
                setAddingList(false);
              }}
            >
              <input
                name="title"
                autoFocus
                placeholder="List name"
                onPointerDown={(event) => event.stopPropagation()}
                className="w-full rounded-md border border-[#dfe1e6] px-2 py-1.5 text-sm outline-none focus:border-[#0c66e4]"
                onKeyDown={(event) => {
                  if (event.key === "Escape") setAddingList(false);
                }}
              />
              <div className="mt-2 flex gap-2">
                <button type="submit" className="rounded-md bg-[#0c66e4] px-3 py-1.5 text-sm font-medium text-white">
                  Add list
                </button>
                <button type="button" onClick={() => setAddingList(false)} className="rounded-md px-2 text-sm text-[#44546f]">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAddingList(true)}
              className="w-full rounded-xl bg-white/25 px-3 py-2 text-left text-sm font-medium text-white hover:bg-white/35"
            >
              + Add a list
            </button>
          )}
        </div>
        )}
      </div>
      <DragOverlay>
        {activeCard ? <CardFace card={activeCard} people={people} overlay /> : null}
        {activeList ? (
          <div className="w-[272px] rounded-xl bg-[#f1f2f4] px-3 py-2 text-sm font-semibold shadow-xl">{activeList.title}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function overListId(over: DragOverEvent["over"], lists: List[]): string | null {
  if (!over) return null;
  const data = over.data.current;
  if (data?.type === "card-container" || data?.type === "list") return String(data.listId || over.id);
  return lists.find((list) => list.cards.some((card) => card.id === String(over.id)))?.id ?? null;
}

function ListColumn({
  list,
  people,
  listDragDisabled,
  onOpenCard,
  onRename,
  onDelete,
  onAddCard,
  locked,
  arrangeLocked,
}: {
  list: List;
  people: Map<string, Membership>;
  listDragDisabled: boolean;
  onOpenCard: (cardId: string) => void;
  onRename: (title: string) => void;
  onDelete: (() => void) | null;
  onAddCard: (title: string) => Promise<void>;
  locked: boolean;
  arrangeLocked: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id,
    data: { type: "list", listId: list.id },
    disabled: listDragDisabled || locked || arrangeLocked,
  });
  const { setNodeRef: setListDropRef } = useDroppable({
    id: `container-${list.id}`,
    data: { type: "card-container", listId: list.id },
  });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(list.title);
  const [adding, setAdding] = useState(false);
  const [cardTitle, setCardTitle] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteName, setDeleteName] = useState("");

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx("flex max-h-full w-[272px] shrink-0 flex-col rounded-xl bg-[#f1f2f4]", isDragging && "opacity-60")}
    >
      <div className="flex items-start gap-1 px-2 pt-2" {...attributes} {...(editing ? {} : listeners)}>
        {editing ? (
          <input
            value={title}
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              const next = title.trim();
              setEditing(false);
              if (next && next !== list.title) onRename(next);
              else setTitle(list.title);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setTitle(list.title);
                setEditing(false);
              }
            }}
            className="w-full rounded-md border border-[#0c66e4] px-2 py-1 text-sm font-semibold outline-none"
          />
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="flex-1 rounded-md px-2 py-1 text-left text-sm font-semibold hover:bg-[#091e420f]">
            {list.title}
          </button>
        )}
        {onDelete && !locked ? (
          <button
            type="button"
            aria-label={`List options for ${list.title}`}
            onClick={() => {
              setDeleteName("");
              setDeleteOpen(true);
            }}
            className="rounded-md px-2 py-1 text-[#5e6c84] hover:bg-[#091e420f]"
          >
            ···
          </button>
        ) : null}
      </div>
      <div ref={setListDropRef} className="list-scroll min-h-2 flex-1 overflow-y-auto px-2 py-1">
        <SortableContext items={list.cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {list.cards.map((card) => (
              <SortableCard key={card.id} card={card} people={people} locked={locked || arrangeLocked} onOpen={() => onOpenCard(card.id)} />
            ))}
          </div>
        </SortableContext>
      </div>
      {locked ? null : (
      <div className="p-2">
        {adding ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const next = cardTitle.trim();
              if (!next) return;
              void onAddCard(next).then(() => {
                setCardTitle("");
              });
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <textarea
              value={cardTitle}
              autoFocus
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => setCardTitle(event.target.value)}
              placeholder="Card title"
              rows={2}
              className="w-full resize-none rounded-lg border border-[#dfe1e6] px-2 py-1.5 text-sm outline-none focus:border-[#0c66e4]"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
                if (event.key === "Escape") setAdding(false);
              }}
            />
            <div className="mt-2 flex gap-2">
              <button type="submit" className="rounded-md bg-[#0c66e4] px-3 py-1.5 text-sm font-medium text-white">
                Add card
              </button>
              <button type="button" onClick={() => setAdding(false)} className="rounded-md px-2 text-sm text-[#44546f]">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-[#44546f] hover:bg-[#091e420f]">
            + Add a card
          </button>
        )}
      </div>
      )}
      {deleteOpen && onDelete ? (
        <Modal
          title="Delete list"
          onClose={() => {
            setDeleteOpen(false);
            setDeleteName("");
          }}
        >
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (deleteName.trim() !== list.title) return;
              onDelete();
              setDeleteOpen(false);
              setDeleteName("");
            }}
          >
            <p className="text-sm text-[#5e6c84]">
              Type “{list.title}” to delete this list. It leaves the board, and the admin can restore it for 7 days from Recently deleted.
            </p>
            <TextInput value={deleteName} onChange={(event) => setDeleteName(event.target.value)} placeholder={list.title} autoFocus />
            <Button type="submit" variant="danger" disabled={deleteName.trim() !== list.title}>
              Delete list
            </Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function SortableCard({ card, people, locked, onOpen }: { card: Card; people: Map<string, Membership>; locked: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", listId: card.listId },
    disabled: locked,
  });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx(isDragging && "opacity-40")}>
      <button type="button" className="block w-full text-left" onClick={onOpen} {...attributes} {...listeners}>
        <CardFace card={card} people={people} />
      </button>
    </div>
  );
}

function CardFace({ card, people, overlay = false }: { card: Card; people: Map<string, Membership>; overlay?: boolean }) {
  const cover = card.attachments[0];
  const done = card.checklist.filter((item) => item.done).length;
  return (
    <article className={cx("overflow-hidden rounded-lg bg-white shadow-sm", overlay && "w-[256px] rotate-1 shadow-xl")}>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover.thumbnailUrl || cover.url} alt="" className="h-32 w-full object-cover" />
      ) : null}
      <div className="px-2.5 py-2">
        {card.labels.length > 0 ? (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {card.labels.map((label) => (
              <span key={label.id} title={label.name} className="h-2 w-10 rounded-full" style={{ backgroundColor: label.color }} />
            ))}
          </div>
        ) : null}
        <h3 className="text-sm leading-5 text-[#172b4d]">{card.title}</h3>
        {card.approval === "pending" ? <p className="mt-1 text-xs font-medium text-[#7f5f01]">Request for approval</p> : null}
        {card.approval === "rejected" ? <p className="mt-1 text-xs font-medium text-[#ae2e24]">Rejected</p> : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-[#5e6c84]">
          {card.createdAt ? <time dateTime={card.createdAt}>{formatWhen(card.createdAt)}</time> : null}
          {card.dueDate ? (
            <span className={cx("rounded px-1.5 py-0.5", isOverdue(card.dueDate) ? "bg-[#ffeceb] text-[#ae2e24]" : "bg-[#f1f2f4]")}>
              {formatDue(card.dueDate)}
            </span>
          ) : null}
          {card.description ? <span aria-label="Has a description">☰</span> : null}
          {card.checklist.length > 0 ? (
            <span className={cx("rounded px-1.5 py-0.5", done === card.checklist.length && "bg-[#dcfff1] text-[#216e4e]")}>
              {done}/{card.checklist.length}
            </span>
          ) : null}
          {card.attachments.length > 0 ? <span>{card.attachments.length} file{card.attachments.length === 1 ? "" : "s"}</span> : null}
          <span className="ml-auto flex -space-x-1">
            {card.assigneeIds.map((id) => {
              const person = people.get(id);
              return <Avatar key={id} name={person?.name || person?.email || "?"} photo={person?.photo} size={22} />;
            })}
          </span>
        </div>
      </div>
    </article>
  );
}
