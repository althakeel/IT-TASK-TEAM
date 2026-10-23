import { Suspense } from "react";
import { LoginScreen } from "@/components/LoginScreen";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-[#5e6c84]">Loading...</div>}>
      <LoginScreen />
    </Suspense>
  );
}
