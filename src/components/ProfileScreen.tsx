"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import ImageKit from "imagekit-javascript";
import { updateProfile } from "firebase/auth";
import { api } from "@/lib/api";
import { DEFAULT_ALERT_PREFS, loadAlertPrefs, saveAlertPrefs } from "@/lib/alert-prefs";
import { useAuth } from "@/lib/auth-context";
import { getFirebaseAuth } from "@/lib/firebase";
import { errorMessage } from "@/lib/format";
import { AppHeader, Avatar, Button, FullScreenSpinner, TextInput } from "@/components/ui";

export function ProfileScreen() {
  const auth = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alertPrefs, setAlertPrefs] = useState(() => loadAlertPrefs());
  const [alertSaved, setAlertSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.loading && !auth.signedIn) router.replace("/login?next=/profile");
  }, [auth.loading, auth.signedIn, router]);

  useEffect(() => {
    if (auth.user) setName(auth.user.name);
  }, [auth.user]);

  if (auth.loading || !auth.user) return <FullScreenSpinner />;

  const user = auth.user;

  async function saveName(event: FormEvent) {
    event.preventDefault();
    const next = name.trim();
    if (!next) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await api.updateProfile(next);
      auth.setProfile({ name: saved.name });
      const current = getFirebaseAuth()?.currentUser;
      if (current) await updateProfile(current, { displayName: saved.name });
      setMessage("Name saved.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Choose an image.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Images need to be under 8 MB.");
      return;
    }
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const authParams = await api.imageKitAuth();
      const imagekit = new ImageKit({ publicKey: authParams.publicKey, urlEndpoint: authParams.urlEndpoint });
      const uploaded = await imagekit.upload({
        file,
        fileName: file.name || "profile",
        signature: authParams.signature,
        token: authParams.token,
        expire: authParams.expire,
        folder: "/profiles",
        useUniqueFileName: true,
      });
      const saved = await api.updatePhoto(uploaded.url);
      auth.setProfile({ photo: saved.photo });
      setMessage("Photo saved. It shows wherever you are tagged.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col pb-16">
      <AppHeader />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-1 text-sm text-[#5e6c84]">This name and photo are what other people see when you are tagged.</p>
        <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <Avatar name={user.name} photo={user.photo} size={72} />
            <div>
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="rounded-md bg-[#0c66e4] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {uploading ? "Uploading..." : "Change photo"}
              </button>
              <p className="mt-2 text-xs text-[#5e6c84]">JPG or PNG, up to 8 MB.</p>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void uploadPhoto(file);
            }}
          />
          <form className="mt-6 flex flex-col gap-3" onSubmit={(event) => void saveName(event)}>
            <label className="text-sm font-medium">
              Name
              <TextInput className="mt-1" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
            </label>
            <p className="text-sm text-[#5e6c84]">{user.email}</p>
            {error ? <p className="text-sm text-[#ae2e24]">{error}</p> : null}
            {message ? <p className="text-sm text-[#216e4e]">{message}</p> : null}
            <Button type="submit" disabled={busy || !name.trim() || name.trim() === user.name}>
              {busy ? "Saving..." : "Save name"}
            </Button>
          </form>
        </section>

        <section className="mt-6 rounded-xl border border-[#dfe1e6] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Card timeline alert colors</h2>
          <p className="mt-1 text-sm text-[#5e6c84]">
            Customize when cards change color as a timeline gets close. More than the warning time stays normal white.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-[#dfe1e6] p-3">
              <p className="text-xs font-semibold uppercase text-[#44546f]">Warning alert</p>
              <label className="mt-2 block text-xs font-medium text-[#5e6c84]">
                Minutes before deadline (default 120 = 2h)
                <TextInput
                  type="number"
                  min={0}
                  max={10080}
                  className="mt-1"
                  value={alertPrefs.warningMinutes}
                  onChange={(event) => {
                    const next = { ...alertPrefs, warningMinutes: Math.max(0, Number(event.target.value) || 0) };
                    setAlertPrefs(next);
                    setAlertSaved(null);
                  }}
                />
              </label>
              <label className="mt-3 flex items-center justify-between text-xs font-medium text-[#5e6c84]">
                <span>Card color</span>
                <input
                  type="color"
                  value={alertPrefs.warningColor}
                  onChange={(event) => {
                    setAlertPrefs({ ...alertPrefs, warningColor: event.target.value });
                    setAlertSaved(null);
                  }}
                  className="h-8 w-14 cursor-pointer rounded border border-[#dfe1e6]"
                />
              </label>
              <div className="mt-3 rounded-md px-2.5 py-1.5 text-xs font-medium text-white" style={{ backgroundColor: alertPrefs.warningColor }}>
                Preview · Under {alertPrefs.warningMinutes}m left
              </div>
            </div>

            <div className="rounded-lg border border-[#dfe1e6] p-3">
              <p className="text-xs font-semibold uppercase text-[#44546f]">Urgent alert</p>
              <label className="mt-2 block text-xs font-medium text-[#5e6c84]">
                Minutes before deadline (default 10m)
                <TextInput
                  type="number"
                  min={0}
                  max={10080}
                  className="mt-1"
                  value={alertPrefs.urgentMinutes}
                  onChange={(event) => {
                    const next = { ...alertPrefs, urgentMinutes: Math.max(0, Number(event.target.value) || 0) };
                    setAlertPrefs(next);
                    setAlertSaved(null);
                  }}
                />
              </label>
              <label className="mt-3 flex items-center justify-between text-xs font-medium text-[#5e6c84]">
                <span>Card color</span>
                <input
                  type="color"
                  value={alertPrefs.urgentColor}
                  onChange={(event) => {
                    setAlertPrefs({ ...alertPrefs, urgentColor: event.target.value });
                    setAlertSaved(null);
                  }}
                  className="h-8 w-14 cursor-pointer rounded border border-[#dfe1e6]"
                />
              </label>
              <div className="mt-3 rounded-md px-2.5 py-1.5 text-xs font-medium text-white" style={{ backgroundColor: alertPrefs.urgentColor }}>
                Preview · Under {alertPrefs.urgentMinutes}m left
              </div>
            </div>
          </div>
          {alertSaved ? <p className="mt-3 text-sm text-[#216e4e]">{alertSaved}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                saveAlertPrefs(alertPrefs);
                setAlertSaved("Card timeline colors saved.");
              }}
            >
              Save alert settings
            </Button>
            <Button
              type="button"
              variant="quiet"
              onClick={() => {
                setAlertPrefs(DEFAULT_ALERT_PREFS);
                saveAlertPrefs(DEFAULT_ALERT_PREFS);
                setAlertSaved("Reset to defaults (2h orange, 10m red).");
              }}
            >
              Reset defaults
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
