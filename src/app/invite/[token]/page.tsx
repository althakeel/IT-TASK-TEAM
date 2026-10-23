import { Suspense } from "react";
import { InviteScreen } from "@/components/InviteScreen";

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-[#5e6c84]">Loading...</div>}>
      <InviteScreen />
    </Suspense>
  );
}
