"use client";

import { Suspense, type ReactNode } from "react";
import { AuthProvider } from "@/lib/auth-context";
import { BottomNav } from "@/components/BottomNav";
import { InstallApp } from "@/components/InstallApp";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
      <InstallApp />
    </AuthProvider>
  );
}
