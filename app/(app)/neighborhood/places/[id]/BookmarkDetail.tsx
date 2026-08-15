"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { HouseMap } from "../../HouseMap";
import {
  Badge,
  Card,
  ErrorNote,
  Field,
  buttonClass,
  inputClass,
  secondaryButtonClass,
} from "@/components/ui";
import {
  CATEGORY_LABELS,
  DEAL_STATUS_LABELS,
  MAX_DEAL_TITLE_LENGTH,
  MAX_NOTE_LENGTH,
  NOTES_PREVIEW_COUNT,
  ROUTE_PROFILES,
  ROUTE_PROFILE_LABELS,
  VERDICT_LABELS,
  formatDhakaDate,
  formatDhakaDateTime,
  formatStraightLine,
  type BookmarkNoteView,
  type Coords,
  type DealView,
  type Freshness,
  type RouteProfile,
} from "@/lib/neighborhood";
import type { BookmarkCategory, Verdict, Visibility } from "@prisma/client";

/**
 * One place, in full: what the house knows about it, how current that
 * knowledge is, and how to get there.
 */

export type DetailBookmark = {
  id: string;
  name: string;
  category: BookmarkCategory;
  visibility: Visibility;
  address: string | null;
  lat: number | null;
  lng: number | null;
  isOnline: boolean;
  onlineUrl: string | null;
  addedByName: string;
  createdAt: string;
  deletedAt: string | null;
  distanceKm: number | null;
  freshness: Freshness;
  canEdit: boolean;
};

export type ConfirmationEntry = {
  id: string;
  verdict: Verdict;
  residentName: string;
  createdAt: string;
};

export function BookmarkDetail({
  bookmark,
  notes,
  confirmations,
  deals,
  pin,
  styleUrl,
}: {
  bookmark: DetailBookmark;
  notes: BookmarkNoteView[];
  confirmations: ConfirmationEntry[];
  deals: DealView[];
  pin: Coords | null;
  styleUrl: string;
}) {
  const router = useRouter();

  const [noteBody, setNoteBody] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [profile, setProfile] = useState<RouteProfile>("foot-walking");
  const [route, setRoute] = useState<{
    label: string;
    approximate: boolean;
    geometry: [number, number][] | null;
    reason?: string;
  } | null>(null);
  const [dealForm, setDealForm] = useState({ title: "", discountNote: "", validUntil: "" });
  const [showDealForm, setShowDealForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const visibleNotes = expanded ? notes : notes.slice(0, NOTES_PREVIEW_COUNT);

  async function post(url: string, body: unknown, method = "POST") {
    setBusy(true);
    setError(null);
    setNotice(null);

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(payload.error ?? "That didn't work.");
      return null;
    }
    return payload;
  }

  async function addNote(event: React.FormEvent) {
    event.preventDefault();
    const result = await post(`/api/neighborhood/bookmarks/${bookmark.id}/notes`, {
      body: noteBody,
    });
    if (result) {
      setNoteBody("");
      router.refresh();
    }
  }

  async function confirm(verdict: Verdict) {
    const result = await post(`/api/neighborhood/bookmarks/${bookmark.id}/confirm`, { verdict });
    if (result) {
      if (result.message) setNotice(result.message);
      router.refresh();
    }
  }

  async function getDirections() {
    const result = await post("/api/neighborhood/directions", {
      bookmarkId: bookmark.id,
      profile,
    });
    if (result) {
      setRoute({
        label: result.label,
        approximate: result.approximate,
        geometry: result.geometry,
        reason: result.reason,
      });
    }
  }

  async function addDeal(event: React.FormEvent) {
    event.preventDefault();
    const result = await post("/api/neighborhood/deals", {
      bookmarkId: bookmark.id,
      title: dealForm.title,
      discountNote: dealForm.discountNote || null,
      validUntil: dealForm.validUntil || null,
    });
    if (result) {
      setDealForm({ title: "", discountNote: "", validUntil: "" });
      setShowDealForm(false);
      router.refresh();
    }
  }

  async function remove() {
    const result = await post(`/api/neighborhood/bookmarks/${bookmark.id}`, {}, "DELETE");
    if (result) router.push("/neighborhood");
  }

  /**
   * Hand a private pin to the household.
   *
   * This is the control a departing resident is meant to reach for: their
   * private bookmarks are purged 14 days after they leave, and anything worth
   * keeping has to become the house's before then. It is one-way on purpose —
   * un-sharing something the flat has since written notes on would take their
   * words with it.
   */
  async function shareWithHouse() {
    const result = await post(
      `/api/neighborhood/bookmarks/${bookmark.id}`,
      { visibility: "HOUSE" },
      "PATCH"
    );
    if (result) router.refresh();
  }

  return (
    <div className="space-y-6">
      {bookmark.deletedAt ? (
        <Card className="border-rose-200 bg-rose-50">
          <p className="text-sm text-rose-900">
            This place was removed from the house map on {formatDhakaDate(bookmark.deletedAt)}. Your
            house admin can restore it from the neighbourhood page.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">{bookmark.name}</h2>
                  <Badge tone="slate">{CATEGORY_LABELS[bookmark.category]}</Badge>
                  {bookmark.visibility === "PRIVATE" ? <Badge tone="blue">Only you</Badge> : null}
                </div>
                {bookmark.address ? (
                  <p className="mt-1 text-sm text-slate-600">{bookmark.address}</p>
                ) : null}
                <p className="mt-1 text-xs text-slate-500">
                  Added by {bookmark.addedByName} on {formatDhakaDate(bookmark.createdAt)}
                </p>
              </div>

              <div className="text-right">
                {bookmark.isOnline ? (
                  <span className="text-xs text-slate-500">Online / delivery</span>
                ) : bookmark.distanceKm !== null ? (
                  <span className="tabular text-sm font-medium text-slate-700">
                    {formatStraightLine(bookmark.distanceKm)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge
                tone={
                  bookmark.freshness.tone === "green"
                    ? "green"
                    : bookmark.freshness.tone === "amber"
                      ? "amber"
                      : "slate"
                }
              >
                {bookmark.freshness.label}
              </Badge>
              {bookmark.freshness.confirmLabel ? (
                <span className="text-xs text-slate-500">{bookmark.freshness.confirmLabel}</span>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => confirm("STILL_THERE")}
                disabled={busy || bookmark.deletedAt !== null}
              >
                Still there
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => confirm("GONE")}
                disabled={busy || bookmark.deletedAt !== null}
              >
                Report gone
              </button>

              {bookmark.isOnline && bookmark.onlineUrl ? (
                <a
                  href={bookmark.onlineUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={secondaryButtonClass}
                >
                  Open link
                </a>
              ) : null}

              {!bookmark.isOnline && bookmark.lat !== null && pin ? (
                <>
                  <select
                    className="rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-700"
                    value={profile}
                    onChange={(event) => setProfile(event.target.value as RouteProfile)}
                    aria-label="Travel mode"
                  >
                    {ROUTE_PROFILES.map((option) => (
                      <option key={option} value={option}>
                        {ROUTE_PROFILE_LABELS[option]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={getDirections}
                    disabled={busy}
                  >
                    Get directions
                  </button>
                </>
              ) : null}

              {bookmark.canEdit && !bookmark.deletedAt && bookmark.visibility === "PRIVATE" ? (
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={shareWithHouse}
                  disabled={busy}
                >
                  Share with the house
                </button>
              ) : null}

              {bookmark.canEdit && !bookmark.deletedAt ? (
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={remove}
                  disabled={busy}
                >
                  Remove from map
                </button>
              ) : null}
            </div>

            {route ? (
              <p className="mt-3 text-sm text-slate-700">
                {ROUTE_PROFILE_LABELS[profile]}: {route.label}
                {route.approximate ? (
                  <span className="ml-1.5 text-xs text-amber-700">
                    approximate — {route.reason ?? "routing unavailable, showing straight-line"}
                  </span>
                ) : null}
              </p>
            ) : null}

            {notice ? <p className="mt-2 text-sm text-amber-700">{notice}</p> : null}
            {error ? <div className="mt-2"><ErrorNote>{error}</ErrorNote></div> : null}
          </Card>

          {/* Notes — the knowledge half of the knowledge base. */}
          <Card>
            <h3 className="text-sm font-semibold text-slate-900">
              What the house knows ({notes.length})
            </h3>

            {notes.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                Nothing written down yet. Opening hours, who to ask for, what to avoid — anything
                you&apos;d otherwise have to tell the next person out loud.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {visibleNotes.map((note) => (
                  <li key={note.id} className="border-l-2 border-slate-100 pl-3">
                    <p className="text-sm text-slate-800">{note.body}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {note.authorName} · {formatDhakaDate(note.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {notes.length > NOTES_PREVIEW_COUNT ? (
              <button
                type="button"
                className="mt-3 text-sm text-brand-700 hover:text-brand-800"
                onClick={() => setExpanded((prev) => !prev)}
              >
                {expanded
                  ? "Show fewer"
                  : `Show all ${notes.length} notes`}
              </button>
            ) : null}

            {bookmark.deletedAt ? null : (
              <form onSubmit={addNote} className="mt-4 space-y-2">
                <textarea
                  className={inputClass}
                  rows={2}
                  value={noteBody}
                  onChange={(event) => setNoteBody(event.target.value)}
                  maxLength={MAX_NOTE_LENGTH}
                  placeholder="Add what you learned…"
                />
                <button
                  type="submit"
                  className={secondaryButtonClass}
                  disabled={busy || !noteBody.trim()}
                >
                  {busy ? "Saving…" : "Add note"}
                </button>
              </form>
            )}
          </Card>

          {/* Deals attached to this place. */}
          <Card>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Deals ({deals.length})</h3>
              {bookmark.deletedAt ? null : (
                <button
                  type="button"
                  className="text-sm text-brand-700 hover:text-brand-800"
                  onClick={() => setShowDealForm((prev) => !prev)}
                >
                  {showDealForm ? "Cancel" : "Post a deal"}
                </button>
              )}
            </div>

            {showDealForm ? (
              <form onSubmit={addDeal} className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
                <Field label="What's the offer">
                  <input
                    className={inputClass}
                    value={dealForm.title}
                    onChange={(event) => setDealForm({ ...dealForm, title: event.target.value })}
                    maxLength={MAX_DEAL_TITLE_LENGTH}
                    placeholder="Eid discount on rice"
                    required
                  />
                </Field>
                <Field label="Discount">
                  <input
                    className={inputClass}
                    value={dealForm.discountNote}
                    onChange={(event) =>
                      setDealForm({ ...dealForm, discountNote: event.target.value })
                    }
                    placeholder="৳80 off a 5kg bag"
                  />
                </Field>
                <Field
                  label="Ends on"
                  hint="Leave blank for a standing arrangement — those get re-checked every 30 days instead."
                >
                  <input
                    type="date"
                    className={inputClass}
                    value={dealForm.validUntil}
                    onChange={(event) =>
                      setDealForm({ ...dealForm, validUntil: event.target.value })
                    }
                  />
                </Field>
                <button type="submit" className={buttonClass} disabled={busy || !dealForm.title.trim()}>
                  {busy ? "Posting…" : "Post deal"}
                </button>
              </form>
            ) : null}

            {deals.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No deals recorded here.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {deals.map((deal) => (
                  <li key={deal.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0 text-sm">
                      <span className="font-medium text-slate-800">{deal.title}</span>
                      {deal.discountNote ? (
                        <span className="ml-1.5 text-slate-600">{deal.discountNote}</span>
                      ) : null}
                      <span className="ml-1.5 text-xs text-slate-400">
                        {deal.validUntil ? `until ${formatDhakaDate(deal.validUntil)}` : "open-ended"}
                      </span>
                    </span>
                    <Badge
                      tone={
                        deal.status === "ACTIVE"
                          ? "green"
                          : deal.status === "EXPIRING_SOON"
                            ? "amber"
                            : "slate"
                      }
                    >
                      {DEAL_STATUS_LABELS[deal.status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {!bookmark.isOnline && bookmark.lat !== null && bookmark.lng !== null ? (
            <HouseMap
              pin={pin}
              styleUrl={styleUrl}
              routeGeometry={route?.geometry ?? null}
              markers={[
                {
                  id: bookmark.id,
                  name: bookmark.name,
                  category: bookmark.category,
                  lat: bookmark.lat,
                  lng: bookmark.lng,
                },
              ]}
              className="h-64"
            />
          ) : null}

          <Card>
            <h3 className="text-sm font-semibold text-slate-900">Confirmation history</h3>
            {confirmations.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                Nobody has checked on this place yet.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {confirmations.map((entry) => (
                  <li key={entry.id} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-slate-700">
                      {entry.residentName || "A resident"}
                      <span
                        className={`ml-1.5 text-xs ${
                          entry.verdict === "STILL_THERE" ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {VERDICT_LABELS[entry.verdict]}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {formatDhakaDateTime(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
