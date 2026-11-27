import type { Card } from "@shared/types";

export type CardCompletion = {
  /** 0–100, shown as "x/100%". */
  percent: number;
  /** Short status text, e.g. "2 of 3 done" or "In progress". */
  label: string;
};

/**
 * Completion for one task, out of 100%.
 * - With a checklist: share of checklist items ticked.
 * - Without one: approved/finalised or in a done list = 100%, submitted = 80%, accepted/in progress = 40%, otherwise 0%.
 */
export function cardCompletion(card: Card, listTitle = ""): CardCompletion {
  if (card.checklist.length > 0) {
    const done = card.checklist.filter((item) => item.done).length;
    const total = card.checklist.length;
    return { percent: Math.round((done / total) * 100), label: `${done} of ${total} done` };
  }
  if (card.approval === "finalized" || card.handoff?.status === "approved" || /^(done|complete|completed|deployed)$/i.test(listTitle.trim())) {
    return { percent: 100, label: "Completed" };
  }
  if (card.handoff?.status === "submitted") return { percent: 80, label: "Submitted for review" };
  if (card.handoff?.status === "accepted" || card.approval === "approved") return { percent: 40, label: "In progress" };
  return { percent: 0, label: "Not started" };
}
