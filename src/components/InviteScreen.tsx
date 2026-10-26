"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/format";
import { Button, FullScreenSpinner, Logo } from "@/components/ui";

export function InviteScreen() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const auth = useAuth();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.signedIn) {
      router.replace(`/login?next=/invite/${token}`);
      return;
    }
    let cancelled = false;
    api
      .acceptInvite(token)
      .then((result) => {
        if (cancelled) return;
        setWorkspaceName(result.workspaceName);
        router.replace(`/w/${result.workspaceId}`);
      })
      .catch(async (error: unknown) => {
        if (cancelled) return;
        try {
          const preview = await api.invitePreview(token);
          setWorkspaceName(preview.workspaceName);
          setMessage(
            preview.matchesAccount
              ? errorMessage(error)
              : `This invite was sent to ${preview.email}. You are signed in as ${auth.user?.email}.`,
          );
        } catch (previewError) {
          setMessage(errorMessage(previewError));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [auth.loading, auth.signedIn, router, token]);

  if (auth.loading || (auth.user && !message)) return <FullScreenSpinner />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0079bf] p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-2xl">
        <Logo />
        <h1 className="mt-4 text-xl font-semibold">{workspaceName ? `Invite to ${workspaceName}` : "Workspace invite"}</h1>
        <p className="mt-2 text-sm text-[#5e6c84]">{message}</p>
        <div className="mt-5 flex gap-2">
          <Link href="/home">
            <Button type="button" variant="quiet">
              Go to your boards
            </Button>
          </Link>
          <Button type="button" onClick={() => void auth.signOut().then(() => router.replace(`/login?next=/invite/${token}`))}>
            Switch account
          </Button>
        </div>
      </div>
    </div>
  );
}
