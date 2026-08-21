"use client";

import { useCallback, useEffect, useState } from "react";

import { AdminSettingsPanel } from "./AdminSettingsPanel";
import { CreateChoreForm } from "./CreateChoreForm";
import { GoogleConnectCard } from "./GoogleConnectCard";
import { SwapAndMarketplacePanel } from "./SwapAndMarketplacePanel";
import { Badge, Card, EmptyState, ErrorNote, secondaryButtonClass } from "@/components/ui";

type Subtask = {
  id: string;
  title: string;
  status: "PENDING" | "COMPLETED" | "MISSED";
  userId: string;
  user: { id: string; name: string | null };
};

type Assignment = {
  id: string;
  userId: string;
  dueDate: string;
  status: "PENDING" | "COMPLETED" | "MISSED";
  user: { id: string; name: string | null };
  subtasks: Subtask[];
  rating: { avg: number | null; count: number } | null;
};

type ChoreRow = {
  id: string;
  name: string;
  description: string | null;
  frequency: string;
  rotationOrder: string[];
  assignments: Assignment[];
};

type AdminInfo = {
  neverConnectedGoogleTasks: { id: string; name: string | null }[];
  needsGoogleReconnect: { id: string; name: string | null }[];
  coverageGaps: string[];
};

type ApiResponse = {
  chores: ChoreRow[];
  choreQualityRatingEnabled: boolean;
  isAdmin: boolean;
  admin: AdminInfo | null;
  houseMembers: { id: string; name: string | null }[];
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function ChoresView({
  currentUserId,
  googleStatus,
}: {
  currentUserId: string;
  googleStatus: "connected" | "error" | null;
}) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [calendarHints, setCalendarHints] = useState<Record<string, { hasConflict: boolean; connected: boolean }>>({});
  const [absenceForm, setAbsenceForm] = useState({ startDate: "", endDate: "" });
  const [absenceFormError, setAbsenceFormError] = useState<string | null>(null);
  const [absences, setAbsences] = useState<
    { id: string; startDate: string; endDate: string; reason: string | null; userId: string; user: { name: string | null } }[]
  >([]);
  const [splitOpenFor, setSplitOpenFor] = useState<string | null>(null);
  const [splitRows, setSplitRows] = useState<{ userId: string; title: string }[]>([
    { userId: "", title: "" },
    { userId: "", title: "" },
  ]);
  const [splitError, setSplitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [choresRes, absencesRes] = await Promise.all([fetch("/api/chores"), fetch("/api/chores/absences")]);
    const choresBody = await choresRes.json();
    if (!choresRes.ok) {
      setError(choresBody.error ?? "Could not load chores");
      return;
    }
    setError(null);
    setData(choresBody);
    const absencesBody = await absencesRes.json().catch(() => null);
    if (absencesRes.ok) setAbsences(absencesBody?.absences ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function complete(assignmentId: string) {
    setBusyId(assignmentId);
    await fetch(`/api/chores/assignments/${assignmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete" }),
    });
    setBusyId(null);
    void load();
  }

  async function submitSplit(assignmentId: string) {
    const rows = splitRows.filter((r) => r.userId && r.title.trim());
    if (rows.length < 2) {
      setSplitError("Fill in at least 2 pieces (assignee + a short title each).");
      return;
    }
    setBusyId(assignmentId);
    const res = await fetch(`/api/chores/assignments/${assignmentId}/split`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtasks: rows }),
    });
    const body = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setSplitError(body.error ?? "Could not split this chore");
      return;
    }
    setSplitOpenFor(null);
    setSplitRows([{ userId: "", title: "" }, { userId: "", title: "" }]);
    setSplitError(null);
    void load();
  }

  async function completeSubtask(assignmentId: string, subtaskId: string) {
    setBusyId(subtaskId);
    await fetch(`/api/chores/assignments/${assignmentId}/subtasks/${subtaskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    setBusyId(null);
    void load();
  }

  async function checkCalendar(assignmentId: string) {
    const res = await fetch(`/api/chores/assignments/${assignmentId}/calendar-check`);
    const body = await res.json();
    setCalendarHints((prev) => ({ ...prev, [assignmentId]: body }));
  }

  async function rate(assignmentId: string, score: number) {
    setBusyId(assignmentId);
    await fetch(`/api/chores/assignments/${assignmentId}/ratings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score }),
    });
    setBusyId(null);
    void load();
  }

  async function submitAbsence(e: React.FormEvent) {
    e.preventDefault();
    if (!absenceForm.startDate || !absenceForm.endDate) return;
    setAbsenceFormError(null);
    const res = await fetch("/api/chores/absences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(absenceForm),
    });
    const body = await res.json();
    if (!res.ok) {
      setAbsenceFormError(body.error ?? "Could not save that absence");
      return;
    }
    setAbsenceForm({ startDate: "", endDate: "" });
    void load();
  }

  async function cancelAbsence(id: string) {
    await fetch(`/api/chores/absences/${id}`, { method: "DELETE" });
    void load();
  }

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  const myAssignments = data.chores
    .flatMap((c) => c.assignments.map((a) => ({ ...a, choreName: c.name })))
    .filter((a) => a.userId === currentUserId && a.status === "PENDING");

  return (
    <div className="space-y-4">
      <GoogleConnectCard googleStatus={googleStatus} />

      {data.isAdmin ? (
        <AdminSettingsPanel
          adminInfo={data.admin}
          choreQualityRatingEnabled={data.choreQualityRatingEnabled}
          chores={data.chores.map((c) => ({ id: c.id, name: c.name, frequency: c.frequency }))}
          onChanged={load}
        />
      ) : null}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-700">{data.chores.length} chores</h2>
        {data.isAdmin ? <CreateChoreForm onCreated={load} /> : null}
      </div>

      {data.chores.length === 0 ? (
        <EmptyState title="No chores yet" hint={data.isAdmin ? "Create the first one above." : "Ask your house admin to set one up."} />
      ) : (
        <div className="space-y-3">
          {data.chores.map((chore) => {
            const current = chore.assignments[0];
            return (
              <Card key={chore.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium text-slate-900">{chore.name}</h3>
                    <p className="text-xs text-slate-500">{chore.frequency.toLowerCase()}</p>
                  </div>
                  {current ? (
                    <Badge tone={current.status === "COMPLETED" ? "green" : current.status === "MISSED" ? "red" : "slate"}>
                      {current.status}
                    </Badge>
                  ) : null}
                </div>

                {!current ? (
                  <p className="mt-2 text-xs text-slate-400">No assignment yet — the rotation runs daily.</p>
                ) : current.subtasks.length > 0 ? (
                  <ul className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
                    {current.subtasks.map((s) => (
                      <li key={s.id} className="flex items-center justify-between text-sm">
                        <span>
                          {s.title} — <span className="text-slate-500">{s.user.name ?? "someone"}</span>
                        </span>
                        {s.status === "COMPLETED" ? (
                          <Badge tone="green">Done</Badge>
                        ) : s.userId === currentUserId ? (
                          <button
                            type="button"
                            className="text-xs text-brand-700 underline"
                            onClick={() => completeSubtask(current.id, s.id)}
                            disabled={busyId === s.id}
                          >
                            Mark done
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-sm">
                    <span className="text-slate-700">
                      {current.user.name ?? "Someone"} · due {formatDate(current.dueDate)}
                    </span>
                    {current.status === "PENDING" && current.userId === currentUserId ? (
                      <>
                        <button
                          type="button"
                          className="text-xs text-brand-700 underline"
                          onClick={() => complete(current.id)}
                          disabled={busyId === current.id}
                        >
                          Mark done
                        </button>
                        <button
                          type="button"
                          className="text-xs text-slate-500 underline"
                          onClick={() => checkCalendar(current.id)}
                        >
                          Check my calendar
                        </button>
                        {calendarHints[current.id]?.connected && calendarHints[current.id]?.hasConflict ? (
                          <Badge tone="amber">Busy that day</Badge>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                )}

                {current?.status === "COMPLETED" && data.choreQualityRatingEnabled && current.userId !== currentUserId ? (
                  <div className="mt-2 flex items-center gap-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
                    Rate how well it was done:
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" className="hover:text-amber-600" onClick={() => rate(current.id, n)}>
                        ★{n}
                      </button>
                    ))}
                    {current.rating?.count ? (
                      <span className="ml-2">
                        (avg {current.rating.avg?.toFixed(1)} from {current.rating.count})
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {data.isAdmin && current && current.status === "PENDING" && current.subtasks.length === 0 ? (
                  <div className="mt-2 border-t border-slate-100 pt-2">
                    {splitOpenFor !== current.id ? (
                      <button
                        type="button"
                        className="text-xs text-brand-700 underline"
                        onClick={() => setSplitOpenFor(current.id)}
                      >
                        Split into pieces
                      </button>
                    ) : (
                      <div className="space-y-1.5">
                        <p className="text-xs text-slate-500">
                          Break this into pieces assigned to different people — it only completes
                          once every piece does.
                        </p>
                        {splitRows.map((row, i) => (
                          <div key={i} className="flex gap-2">
                            <select
                              className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                              value={row.userId}
                              onChange={(e) =>
                                setSplitRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, userId: e.target.value } : r)))
                              }
                            >
                              <option value="">Who…</option>
                              {data.houseMembers.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name ?? m.id}
                                </option>
                              ))}
                            </select>
                            <input
                              className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                              placeholder="e.g. countertops"
                              value={row.title}
                              onChange={(e) =>
                                setSplitRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, title: e.target.value } : r)))
                              }
                            />
                          </div>
                        ))}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="text-xs text-slate-500"
                            onClick={() => setSplitRows((rows) => [...rows, { userId: "", title: "" }])}
                          >
                            + Add piece
                          </button>
                          <button
                            type="button"
                            className="text-xs text-brand-700 underline"
                            onClick={() => submitSplit(current.id)}
                            disabled={busyId === current.id}
                          >
                            Save split
                          </button>
                          <button type="button" className="text-xs text-slate-400" onClick={() => setSplitOpenFor(null)}>
                            Cancel
                          </button>
                        </div>
                        {splitError ? <ErrorNote>{splitError}</ErrorNote> : null}
                      </div>
                    )}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Away for a while?</h2>
        <p className="mb-2 text-xs text-slate-500">
          Rotation skips you for chores due during this window, without losing your place in the order.
        </p>
        <form onSubmit={submitAbsence} className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-600">
            From
            <input
              type="date"
              className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1 text-sm"
              value={absenceForm.startDate}
              onChange={(e) => setAbsenceForm((f) => ({ ...f, startDate: e.target.value }))}
              required
            />
          </label>
          <label className="text-xs text-slate-600">
            To
            <input
              type="date"
              className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1 text-sm"
              value={absenceForm.endDate}
              onChange={(e) => setAbsenceForm((f) => ({ ...f, endDate: e.target.value }))}
              required
            />
          </label>
          <button type="submit" className={secondaryButtonClass}>
            Mark unavailable
          </button>
        </form>
        {absenceFormError ? <ErrorNote>{absenceFormError}</ErrorNote> : null}

        {absences.length > 0 ? (
          <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-xs">
            {absences.map((a) => (
              <li key={a.id} className="flex items-center justify-between">
                <span className="text-slate-600">
                  <span className="font-medium text-slate-800">{a.user.name ?? "Someone"}</span> —{" "}
                  {formatDate(a.startDate)} to {formatDate(a.endDate)}
                  {a.reason ? ` (${a.reason})` : ""}
                </span>
                {a.userId === currentUserId ? (
                  <button type="button" className="text-slate-400 underline" onClick={() => cancelAbsence(a.id)}>
                    Cancel
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-slate-400">Nobody has an absence logged right now.</p>
        )}
      </Card>

      <SwapAndMarketplacePanel
        myUserId={currentUserId}
        myAssignments={myAssignments.map((a) => ({
          id: a.id,
          dueDate: a.dueDate,
          userId: a.userId,
          chore: { name: a.choreName },
        }))}
      />
    </div>
  );
}
