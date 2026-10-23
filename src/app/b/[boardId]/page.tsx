import { Suspense } from "react";
import { BoardScreen } from "@/components/BoardScreen";

export default function BoardPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-[#5e6c84]">Loading...</div>}>
      <BoardScreen />
    </Suspense>
  );
}
