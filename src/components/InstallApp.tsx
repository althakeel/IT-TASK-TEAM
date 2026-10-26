"use client";

import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallApp() {
  const [promptEvent, setPromptEvent] = useState<InstallPrompt | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    const iosStandalone = "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || iosStandalone;
    setInstalled(standalone);
    function onPrompt(event: Event) {
      event.preventDefault();
      setPromptEvent(event as InstallPrompt);
    }
    function onInstalled() {
      setInstalled(true);
      setPromptEvent(null);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  return (
    <>
      <button
        type="button"
        className="fixed bottom-16 right-3 z-30 rounded-full bg-[#0c66e4] px-3 py-2 text-xs font-semibold text-white shadow-md"
        onClick={() => {
          if (promptEvent) {
            void promptEvent.prompt().then(() => setPromptEvent(null));
            return;
          }
          const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
          setHint(ios ? "In Safari, tap Share, then Add to Home Screen." : "Open the browser menu and choose Install app.");
        }}
      >
        Install app
      </button>
      {hint ? (
        <p className="fixed bottom-28 right-3 z-30 max-w-56 rounded-lg bg-[#172b4d] px-3 py-2 text-xs text-white shadow-md">{hint}</p>
      ) : null}
    </>
  );
}

export function Clock({ light = false }: { light?: boolean }) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    function tick() {
      setLabel(
        new Intl.DateTimeFormat(undefined, {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date()),
      );
    }
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <time className={light ? "text-xs font-medium text-white" : "text-xs font-medium text-[#172b4d]"}>{label || "\u00a0"}</time>
  );
}
