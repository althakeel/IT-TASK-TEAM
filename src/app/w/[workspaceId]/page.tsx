import { Suspense } from "react";
import { WorkspaceScreen } from "@/components/WorkspaceScreen";

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-[#5e6c84]">Loading...</div>}>
      <WorkspaceScreen />
    </Suspense>
  );
}
