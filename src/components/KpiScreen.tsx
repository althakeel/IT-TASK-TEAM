"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KpiReport, KpiStatus, MemberKpis } from "@shared/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { errorMessage, formatDue } from "@/lib/format";
import { AppHeader, Avatar, Button, ErrorText, FullScreenSpinner, Modal, TextInput } from "@/components/ui";

const COLORS = {
  onTime: "#1f845a",
  late: "#b38600",
  overdue: "#c9372c",
  open: "#8590a2",
};

export function KpiScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [report, setReport] = useState<KpiReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.loading && !auth.signedIn) router.replace("/login?next=/kpis");
  }, [auth.loading, auth.signedIn, router]);

  useEffect(() => {
    if (!auth.user) return;
    if (!auth.user.isAdmin) {
      router.replace("/home");
      return;
    }
    let cancelled = false;
    api
      .kpis()
      .then((data) => {
        if (cancelled) return;
        setReport(data);
        setWorkspaceId((current) => current || data.workspaces[0]?.id || "");
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [auth.user, router]);

  if (auth.loading || (auth.user?.isAdmin && !report && !error)) return <FullScreenSpinner />;

  const members = report?.members ?? [];
  const maxTasks = Math.max(1, ...members.map((member) => member.tasks));

  return (
    <div className="flex min-h-screen flex-col pb-16">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">KPIs</h1>
            <p className="mt-1 text-sm text-[#5e6c84]">Every member, across all boards. A task is on time when it is finished before the due date.</p>
          </div>
          <Button type="button" onClick={() => setAdding(true)}>
            Add member
          </Button>
        </div>
        <ErrorText>{error}</ErrorText>
        {notice ? <p className="text-sm text-[#216e4e]">{notice}</p> : null}
        <ul className="flex flex-wrap gap-3 text-xs text-[#5e6c84]">
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLORS.onTime }} /> On time</li>
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLORS.late }} /> Completed late</li>
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLORS.overdue }} /> Overdue</li>
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLORS.open }} /> Still open</li>
        </ul>
        {members.length === 0 ? <p className="text-sm text-[#5e6c84]">No members yet. Add someone to start tracking their tasks.</p> : null}
        <ul className="flex flex-col gap-3">
          {members.map((member) => (
            <li key={member.userId} className="rounded-2xl bg-white p-4 shadow-sm">
              <button type="button" className="w-full text-left" onClick={() => setOpenId((current) => (current === member.userId ? null : member.userId))}>
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={member.name || member.email} photo={member.photo} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{member.name || member.email}</p>
                    <p className="truncate text-xs text-[#5e6c84]">{member.email}</p>
                  </div>
                  <Kpi label="Tasks" value={member.tasks} />
                  <Kpi label="On time" value={member.onTime} tone="good" />
                  <Kpi label="Late" value={member.late} tone="warn" />
                  <Kpi label="Overdue" value={member.overdue} tone="bad" />
                  <Kpi label="Open" value={member.open} />
                </div>
                <Bar member={member} max={maxTasks} />
              </button>
              {openId === member.userId ? <TaskList member={member} /> : null}
            </li>
          ))}
        </ul>
      </main>
      {adding && report ? (
        <Modal title="Add a member" onClose={() => setAdding(false)}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const next = email.trim();
              if (!next || !workspaceId) return;
              setBusy(true);
              setError(null);
              api
                .invite(workspaceId, next, "member")
                .then((member) => {
                  setEmail("");
                  setAdding(false);
                  setNotice(member.emailSent ? `Invite emailed to ${member.email}.` : `Invite saved for ${member.email}. They appear here after they sign in.`);
                })
                .catch((err: unknown) => setError(errorMessage(err)))
                .finally(() => setBusy(false));
            }}
          >
            <p className="text-sm text-[#5e6c84]">They join when they sign in with this email. Their KPIs show after they are tagged on a task.</p>
            {report.workspaces.length > 1 ? (
              <label className="text-sm font-medium">
                Workspace
                <select
                  value={workspaceId}
                  onChange={(event) => setWorkspaceId(event.target.value)}
                  className="mt-1 w-full rounded-md border border-[#dfe1e6] px-3 py-2 text-sm"
                >
                  {report.workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <TextInput type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@althakeel.com" required />
            <Button type="submit" disabled={busy}>
              {busy ? "Sending..." : "Send invite"}
            </Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

const STATUS_LABEL: Record<KpiStatus, string> = {
  onTime: "On time",
  late: "Completed late",
  overdue: "Overdue",
  open: "Still open",
};

const STATUS_CLASS: Record<KpiStatus, string> = {
  onTime: "bg-[#dcfff1] text-[#216e4e]",
  late: "bg-[#fff7d6] text-[#7f5f01]",
  overdue: "bg-[#ffeceb] text-[#ae2e24]",
  open: "bg-[#f1f2f4] text-[#44546f]",
};

function TaskList({ member }: { member: MemberKpis }) {
  if (member.items.length === 0) {
    return <p className="mt-4 border-t border-[#dfe1e6] pt-3 text-sm text-[#5e6c84]">No tasks are tagged for this person yet.</p>;
  }
  return (
    <ul className="mt-4 flex flex-col gap-2 border-t border-[#dfe1e6] pt-3">
      {member.items.map((task) => (
        <li key={task.id}>
          <Link href={`/b/${task.boardId}?card=${task.id}`} className="flex items-center gap-3 rounded-xl bg-[#f7f8fa] px-3 py-2 hover:bg-[#e9f2ff]">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{task.title}</span>
              <span className="block truncate text-xs text-[#5e6c84]">
                {task.boardTitle} · {task.listTitle}
                {task.dueDate ? ` · Due ${formatDue(task.dueDate)}` : " · No due date"}
              </span>
            </span>
            <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${STATUS_CLASS[task.status]}`}>{STATUS_LABEL[task.status]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" | "bad" }) {
  const toneClass = tone === "good" ? "text-[#216e4e]" : tone === "warn" ? "text-[#7f5f01]" : tone === "bad" ? "text-[#ae2e24]" : "text-[#172b4d]";
  return (
    <div className="min-w-16">
      <p className={`text-lg font-semibold ${toneClass}`}>{value}</p>
      <p className="text-[11px] text-[#5e6c84]">{label}</p>
    </div>
  );
}

function Bar({ member, max }: { member: MemberKpis; max: number }) {
  const width = member.tasks === 0 ? 0 : Math.max(8, (member.tasks / max) * 100);
  const parts = [
    { key: "onTime", n: member.onTime, color: COLORS.onTime },
    { key: "late", n: member.late, color: COLORS.late },
    { key: "overdue", n: member.overdue, color: COLORS.overdue },
    { key: "open", n: member.open, color: COLORS.open },
  ];
  return (
    <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#f1f2f4]">
      <div className="flex h-full" style={{ width: `${width}%` }}>
        {parts.map((part) =>
          part.n > 0 ? <span key={part.key} className="h-full" style={{ width: `${(part.n / member.tasks) * 100}%`, backgroundColor: part.color }} /> : null,
        )}
      </div>
    </div>
  );
}
