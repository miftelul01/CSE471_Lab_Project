"use client";

import { useEffect, useState } from "react";

import { Badge, Card, ErrorNote, SuccessNote, secondaryButtonClass } from "@/components/ui";

type Status = {
  tasksConnected: boolean;
  calendarFreebusyConnected: boolean;
  needsReconnect: boolean;
  googleConfigured: boolean;
};

/**
 * The explicit, disclosed consent step spec requirement 8 asks for —
 * separate from Google login, which only ever grants openid/email/profile.
 * This is what actually satisfies "disclose what will be read/written
 * before connecting": Google's own consent screen is generic and doesn't
 * name the Household Chores list by name the way this card does.
 */
export function GoogleConnectCard({ googleStatus }: { googleStatus: "connected" | "error" | null }) {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch("/api/google/status")
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => {});
  }, [googleStatus]);

  if (!status) return null;

  if (!status.googleConfigured) {
    return (
      <Card className="border-amber-200 bg-amber-50/60">
        <p className="text-sm text-amber-800">
          Google sign-in isn&apos;t configured for this deployment yet, so chores can&apos;t push to
          Google Tasks. Assignments still rotate normally — they just won&apos;t show up in anyone&apos;s
          Google Tasks until this is set up.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-slate-900">Google Tasks</h2>

      {googleStatus === "connected" ? <SuccessNote>Connected.</SuccessNote> : null}
      {googleStatus === "error" ? <ErrorNote>Couldn&apos;t connect — try again.</ErrorNote> : null}

      {status.needsReconnect ? (
        <ErrorNote>Your Google access has expired or was revoked — reconnect below.</ErrorNote>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {status.tasksConnected ? (
          <Badge tone="green">Household Chores list connected</Badge>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              Connecting creates a &ldquo;Household Chores&rdquo; list in your Google Tasks and
              adds/updates/removes tasks there as chores rotate. It does not touch your other lists.
            </p>
            <a href="/api/google/connect?scope=tasks" className={secondaryButtonClass}>
              Connect Google Tasks
            </a>
          </>
        )}
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        {status.calendarFreebusyConnected ? (
          <Badge tone="slate">Calendar conflict checks connected</Badge>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-slate-500">
              Optional: connect your calendar so a due date landing during a busy stretch can be
              flagged before it&apos;s missed. Read-only — only checks whether you&apos;re free/busy,
              never event details.
            </p>
            <a href="/api/google/connect?scope=calendar" className={secondaryButtonClass}>
              Connect calendar
            </a>
          </div>
        )}
      </div>
    </Card>
  );
}
