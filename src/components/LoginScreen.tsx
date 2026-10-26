"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { HealthResponse } from "@shared/types";
import { useAuth } from "@/lib/auth-context";
import { fetchHealth } from "@/lib/api";
import { authErrorMessage, firebaseConfigured, safeNext } from "@/lib/config";
import { Button, ErrorText, FullScreenSpinner, Logo, TextInput } from "@/components/ui";

export function LoginScreen() {
  const auth = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const next = safeNext(search.get("next"));
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null | undefined>(undefined);
  const configured = firebaseConfigured();

  useEffect(() => {
    if (!auth.loading && auth.signedIn) router.replace(next);
  }, [auth.loading, auth.signedIn, next, router]);

  useEffect(() => {
    void fetchHealth().then(setHealth);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "sign-up") await auth.signUp(name, email, password);
      else await auth.signIn(email, password);
      router.replace(next);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (auth.loading) return <FullScreenSpinner />;

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ backgroundColor: "#0079bf" }}>
      <div className="pointer-events-none absolute inset-0 flex gap-4 p-8 opacity-25">
        {["To do", "Doing", "Review", "Done"].map((column) => (
          <div key={column} className="hidden w-64 rounded-xl bg-white/80 p-3 md:block">
            <div className="mb-3 h-4 w-24 rounded bg-[#dfe1e6]" />
            <div className="mb-2 h-16 rounded-lg bg-white" />
            <div className="h-10 rounded-lg bg-white" />
            <span className="sr-only">{column}</span>
          </div>
        ))}
      </div>
      <div className="relative flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-2xl">
          <Logo />
          <h1 className="mt-4 text-2xl font-semibold text-[#172b4d]">
            {mode === "sign-in" ? "Sign in to your boards" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-[#5e6c84]">Team tasks, arranged in lists.</p>
          {!configured ? (
            <p className="mt-4 rounded-md bg-[#fff7d6] px-3 py-2 text-sm text-[#7f5f01]">
              Add the Firebase web config to <span className="font-medium">.env.local</span>, then restart. Use the keys in .env.example.
            </p>
          ) : null}
          <form className="mt-6 flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
            {mode === "sign-up" ? (
              <label className="text-sm font-medium">
                Name
                <TextInput className="mt-1" value={name} onChange={(event) => setName(event.target.value)} required />
              </label>
            ) : null}
            <label className="text-sm font-medium">
              Email
              <TextInput className="mt-1" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label className="text-sm font-medium">
              Password
              <TextInput className="mt-1" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} />
            </label>
            <ErrorText>{error || auth.error}</ErrorText>
            <Button type="submit" disabled={busy || !configured}>
              {busy ? "Please wait..." : mode === "sign-in" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <Button
            type="button"
            variant="quiet"
            className="mt-3 w-full"
            disabled={busy || !configured}
            onClick={() => {
              setBusy(true);
              setError(null);
              auth
                .signInWithGoogle()
                .then(() => router.replace(next))
                .catch((err: unknown) => setError(authErrorMessage(err)))
                .finally(() => setBusy(false));
            }}
          >
            Continue with Google
          </Button>
          <button
            type="button"
            className="mt-4 text-sm text-[#0c66e4]"
            onClick={() => {
              setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              setError(null);
            }}
          >
            {mode === "sign-in" ? "Need an account? Create one" : "Already have an account? Sign in"}
          </button>
          <ServiceStatus health={health} />
        </div>
      </div>
    </div>
  );
}

function ServiceStatus({ health }: { health: HealthResponse | null | undefined }) {
  if (health === undefined) return null;
  if (health === null) {
    return <p className="mt-6 text-xs text-[#5e6c84]">API is not running. Start the app with npm run dev.</p>;
  }
  const items = [
    ["Database", health.mongo],
    ["Firebase admin", health.firebase],
    ["ImageKit", health.imagekit],
    ["Email", health.resend],
  ] as const;
  return (
    <ul className="mt-6 flex flex-wrap gap-2">
      {items.map(([label, ready]) => (
        <li key={label} className="rounded-full bg-[#f1f2f4] px-2 py-1 text-xs text-[#44546f]">
          {label}: {ready ? "ready" : "not configured"}
        </li>
      ))}
    </ul>
  );
}
