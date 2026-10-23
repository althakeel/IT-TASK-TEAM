const GAP = 1024;

export function positionBetween(before: number | null, after: number | null): number {
  if (before == null && after == null) return GAP;
  if (before == null) return (after as number) - GAP;
  if (after == null) return before + GAP;
  if (!Number.isFinite(before) || !Number.isFinite(after) || Math.abs(after - before) < 1e-6) {
    return (before ?? 0) + GAP;
  }
  return (before + after) / 2;
}
