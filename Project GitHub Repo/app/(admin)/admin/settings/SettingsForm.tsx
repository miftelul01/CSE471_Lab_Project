"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, EmptyState, ErrorNote, SuccessNote, buttonClass, inputClass } from "@/components/ui";
import { SETTING_KINDS, type PlatformSettings } from "@/lib/settings";
import type { PlatformSetting } from "@prisma/client";

export function SettingsForm({ settings }: { settings: PlatformSetting[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Local edits, keyed by setting name, so each row saves independently.
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(settings.map((s) => [s.key, String(s.value)]))
  );

  async function save(key: string, value: unknown) {
    setBusy(key);
    setError(null);
    setNotice(null);

    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    const body = await response.json().catch(() => ({}));

    setBusy(null);
    if (!response.ok) {
      setError(body.error ?? "Could not save the setting");
      return;
    }
    setNotice(`Saved ${key}.`);
    router.refresh();
  }

  if (settings.length === 0) {
    return <EmptyState title="No settings found" hint="Migration 0014 seeds the defaults." />;
  }

  return (
    <div className="space-y-3">
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {notice ? <SuccessNote>{notice}</SuccessNote> : null}

      {settings.map((setting) => {
        const kind = SETTING_KINDS[setting.key as keyof PlatformSettings] ?? "text";

        return (
          <Card key={setting.key}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="font-mono text-sm font-medium text-slate-900">{setting.key}</h2>
                <p className="mt-0.5 text-sm text-slate-600">{setting.description}</p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {kind === "boolean" ? (
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy === setting.key}
                    onClick={() => save(setting.key, !(setting.value === true))}
                  >
                    {setting.value === true ? "On — turn off" : "Off — turn on"}
                  </button>
                ) : (
                  <>
                    <input
                      className={`${inputClass} w-44`}
                      type={kind === "number" ? "number" : "text"}
                      min={kind === "number" ? 0 : undefined}
                      value={drafts[setting.key] ?? ""}
                      onChange={(e) =>
                        setDrafts({ ...drafts, [setting.key]: e.target.value })
                      }
                    />
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={busy === setting.key}
                      onClick={() =>
                        save(
                          setting.key,
                          kind === "number"
                            ? Number(drafts[setting.key])
                            : drafts[setting.key]
                        )
                      }
                    >
                      Save
                    </button>
                  </>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
