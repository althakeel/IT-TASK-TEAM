"use client";

import Link from "next/link";
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { useAuth } from "@/lib/auth-context";
import { NotificationBell } from "@/components/Notifications";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="grid grid-cols-3 items-end gap-0.5" aria-hidden>
        <span className="h-3 w-1.5 rounded-sm bg-[#61bd4f]" />
        <span className="h-4 w-1.5 rounded-sm bg-[#f2d600]" />
        <span className="h-5 w-1.5 rounded-sm bg-[#0079bf]" />
      </span>
      <span className={cx("text-base font-semibold tracking-tight", light ? "text-white" : "text-[#172b4d]")}>Boards</span>
    </span>
  );
}

export function Avatar({ name, photo, size = 28 }: { name: string; photo?: string; size?: number }) {
  const initial = (name || "?").trim().slice(0, 1).toUpperCase() || "?";
  if (photo) {
    return (
      // Firebase and ImageKit photos come from several hosts.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-[#0c66e4] font-semibold text-white"
      style={{ width: size, height: size, fontSize: size < 26 ? 11 : 12 }}
    >
      {initial}
    </span>
  );
}

export function AppHeader() {
  const { user, signOut } = useAuth();
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[#dfe1e6] bg-white px-4">
      <Link href="/home" className="rounded-md px-1 py-1 hover:bg-[#091e420f]">
        <Logo />
      </Link>
      {user ? (
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-[#5e6c84] sm:inline">
            {user.name}
            {user.isAdmin ? " · Admin" : ""}
          </span>
          <NotificationBell />
          <Avatar name={user.name} photo={user.photo} />
          <button type="button" onClick={() => void signOut()} className="text-sm font-medium text-[#5e6c84] hover:text-[#172b4d]">
            Sign out
          </button>
        </div>
      ) : null}
    </header>
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" | "danger" | "ghost" }) {
  const styles = {
    primary: "bg-[#0c66e4] text-white hover:bg-[#0055cc]",
    quiet: "bg-[#091e420f] text-[#172b4d] hover:bg-[#091e4224]",
    danger: "bg-[#c9372c] text-white hover:bg-[#ae2e24]",
    ghost: "bg-white/15 text-white hover:bg-white/25",
  };
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60",
        styles[variant],
        className,
      )}
    />
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "w-full rounded-md border border-[#dfe1e6] bg-white px-3 py-2 text-sm text-[#172b4d] outline-none focus:border-[#0c66e4]",
        props.className,
      )}
    />
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        "w-full rounded-md border border-[#dfe1e6] bg-white px-3 py-2 text-sm text-[#172b4d] outline-none focus:border-[#0c66e4]",
        props.className,
      )}
    />
  );
}

export function Spinner() {
  return <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#dfe1e6] border-t-[#0c66e4]" />;
}

export function FullScreenSpinner({ light = false }: { light?: boolean }) {
  return (
    <div className={cx("flex min-h-screen items-center justify-center", light && "bg-black/10")}>
      <Spinner />
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/50 p-6" onMouseDown={onClose}>
      <div
        className="mt-10 w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[#172b4d]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md px-2 py-1 text-[#5e6c84] hover:bg-[#091e420f]">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-[#ae2e24]">{children}</p>;
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-md bg-[#ae2e24] px-4 py-2 text-sm text-white shadow-lg">
      <span>{message}</span>
      <button type="button" onClick={onClose} className="font-semibold">
        Dismiss
      </button>
    </div>
  );
}
