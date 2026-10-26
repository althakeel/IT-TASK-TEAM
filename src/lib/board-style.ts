import type { CSSProperties } from "react";

export function boardSurface(board: { background: string; backgroundImage?: string }): CSSProperties {
  const image = board.backgroundImage || "";
  if (!image) return { backgroundColor: board.background };
  if (image.startsWith("linear-gradient(")) {
    return { backgroundImage: image, backgroundColor: board.background };
  }
  return {
    backgroundColor: board.background,
    backgroundImage: `linear-gradient(rgba(0,0,0,0.28), rgba(0,0,0,0.28)), url("${image.replaceAll('"', "")}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}
