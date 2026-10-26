"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { FullScreenSpinner } from "@/components/ui";

export default function Page() {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (auth.loading) return;
    router.replace(auth.signedIn ? "/home" : "/login");
  }, [auth.loading, auth.signedIn, router]);
  return <FullScreenSpinner />;
}
