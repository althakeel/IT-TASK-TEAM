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
    router.replace(auth.user ? "/home" : "/login");
  }, [auth.loading, auth.user, router]);
  return <FullScreenSpinner />;
}
