import type mongoose from "mongoose";
import { CardModel, ListModel } from "./models";

export async function nextCardPosition(listId: mongoose.Types.ObjectId): Promise<number> {
  const last = await CardModel.findOne({ listId, deletedAt: null }).sort({ position: -1 }).select("position");
  return (last?.position ?? 0) + 1024;
}

export async function nextListPosition(boardId: mongoose.Types.ObjectId): Promise<number> {
  const last = await ListModel.findOne({ boardId, deletedAt: null }).sort({ position: -1 }).select("position");
  return (last?.position ?? 0) + 1024;
}

export async function rebalanceCards(listId: mongoose.Types.ObjectId) {
  const cards = await CardModel.find({ listId, deletedAt: null }).sort({ position: 1, _id: 1 });
  const crowded = cards.some((card, index) => {
    const previous = cards[index - 1];
    return previous != null && Math.abs(card.position - previous.position) < 0.05;
  });
  if (!crowded) return null;
  const ordered = cards.map((card, index) => ({
    id: String(card._id),
    listId: String(listId),
    position: (index + 1) * 1024,
  }));
  if (ordered.length) {
    await CardModel.bulkWrite(
      ordered.map((item) => ({
        updateOne: {
          filter: { _id: item.id },
          update: { position: item.position },
        },
      })),
    );
  }
  return ordered;
}

export async function rebalanceLists(boardId: mongoose.Types.ObjectId) {
  const lists = await ListModel.find({ boardId, deletedAt: null }).sort({ position: 1, _id: 1 });
  const crowded = lists.some((list, index) => {
    const previous = lists[index - 1];
    return previous != null && Math.abs(list.position - previous.position) < 0.05;
  });
  if (!crowded) return null;
  const ordered = lists.map((list, index) => ({
    id: String(list._id),
    position: (index + 1) * 1024,
  }));
  if (ordered.length) {
    await ListModel.bulkWrite(
      ordered.map((item) => ({
        updateOne: {
          filter: { _id: item.id },
          update: { position: item.position },
        },
      })),
    );
  }
  return ordered;
}
