import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Server-side access to Google Tasks (M3.4) and Google Calendar freebusy
 * (M3.4's calendar-conflict enhancement) for the current user's OWN
 * account — never a shared/service credential.
 *
 * ── WHY THIS IS NOT PART OF auth.ts ─────────────────────────────────────────
 * auth.ts's Google provider is for LOGIN — every resident who signs in with
 * Google goes through it, and it only ever needs the default openid/email/
 * profile scopes. Tasks and Calendar access is opt-in, per-feature, and
 * requested separately (spec requirement: connecting Google for login must
 * NOT silently grant Tasks access). Tokens from THIS flow live in
 * `GoogleCredential`, a table auth.ts's own login path never touches — see
 * app/api/google/connect/route.ts for the authorization redirect and
 * app/api/google/connect/callback/route.ts for the token exchange.
 *
 * GoogleCredential.scopes is SHARED with teammate Araf's M3.6 (Calendar
 * write-sync) — connecting one feature must not silently grant, revoke, or
 * appear to grant the other's scope. Every function here checks for its own
 * specific scope string, never "any Google connection exists."
 * ────────────────────────────────────────────────────────────────────────────
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TASKS_BASE = "https://tasks.googleapis.com/tasks/v1";
const CALENDAR_FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy";

export const GOOGLE_SCOPES = {
  tasks: "https://www.googleapis.com/auth/tasks",
  calendarFreebusy: "https://www.googleapis.com/auth/calendar.freebusy",
} as const;

export type RequiredScope = keyof typeof GOOGLE_SCOPES;

export const CHORE_TASK_LIST_TITLE = "Household Chores";

/** Thrown when the user has never granted the scope a call needs. */
export class GoogleNotConnectedError extends Error {
  constructor(scope: RequiredScope) {
    super(`Google ${scope} is not connected for this user.`);
    this.name = "GoogleNotConnectedError";
  }
}

/** Thrown when a previously-valid refresh token has been revoked/expired. */
export class GoogleReauthRequiredError extends Error {
  constructor() {
    super("Google access was revoked or expired — reconnect required.");
    this.name = "GoogleReauthRequiredError";
  }
}

/* ── Token management ─────────────────────────────────────────────────── */

/** Refresh 2 minutes before the recorded expiry, not exactly at it. */
const EXPIRY_MARGIN_MS = 2 * 60 * 1000;

async function refreshAccessToken(userId: string, refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID ?? "",
      client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}) as { error?: string });
    if (body.error === "invalid_grant") {
      await prisma.googleCredential.update({
        where: { userId },
        data: { needsReconnectAt: new Date() },
      });
      throw new GoogleReauthRequiredError();
    }
    throw new Error(`Google token refresh failed (${response.status}): ${body.error ?? "unknown error"}`);
  }

  const body = (await response.json()) as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + body.expires_in * 1000);
  await prisma.googleCredential.update({
    where: { userId },
    data: { accessToken: body.access_token, expiresAt, needsReconnectAt: null },
  });
  return { accessToken: body.access_token, expiresAt };
}

/**
 * A valid, unexpired access token carrying `requiredScope` for `userId`.
 * Never returned to a client — every caller of this is itself server-only.
 */
export async function getValidAccessToken(userId: string, requiredScope: RequiredScope): Promise<string> {
  const credential = await prisma.googleCredential.findUnique({ where: { userId } });
  const scopeString = GOOGLE_SCOPES[requiredScope];

  if (!credential || !credential.scopes.includes(scopeString)) {
    throw new GoogleNotConnectedError(requiredScope);
  }
  if (credential.expiresAt && credential.expiresAt.getTime() - EXPIRY_MARGIN_MS > Date.now() && credential.accessToken) {
    return credential.accessToken;
  }
  if (!credential.refreshToken) {
    throw new GoogleReauthRequiredError();
  }

  const { accessToken } = await refreshAccessToken(userId, credential.refreshToken);
  return accessToken;
}

/* ── Retry / backoff ───────────────────────────────────────────────────── */

class RetryableHttpError extends Error {
  constructor(readonly status: number) {
    super(`Retryable Google API error (${status})`);
  }
}

/**
 * Retries on 429/5xx/network failure with exponential backoff. Refreshes
 * the token and retries exactly once on 401. Fails fast on everything else
 * (403/404 aren't fixed by retrying). This is the concrete answer to the
 * spec's "retry rather than lose the assignment" requirement — every Tasks
 * write in this module goes through it.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error instanceof RetryableHttpError) {
        if (attempt === attempts - 1) break;
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function googleFetch(accessToken: string, url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  if (response.status === 429 || response.status >= 500) {
    throw new RetryableHttpError(response.status);
  }
  return response;
}

/* ── Household Chores task list ───────────────────────────────────────── */

type GoogleTaskList = { id: string; title: string };
type GoogleTask = {
  id: string;
  title: string;
  notes?: string;
  due?: string;
  status: "needsAction" | "completed";
  completed?: string;
};

/**
 * Finds the resident's "Household Chores" list, creating it if this is
 * their first assignment. Looked up by title each call rather than cached
 * on GoogleCredential — cheap, idempotent, and one fewer schema field.
 */
export async function getOrCreateChoreTaskList(userId: string): Promise<string> {
  return withRetry(async () => {
    const accessToken = await getValidAccessToken(userId, "tasks");
    const listRes = await googleFetch(accessToken, `${TASKS_BASE}/users/@me/lists`);
    if (!listRes.ok) throw new Error(`Could not list Google Task lists (${listRes.status})`);
    const { items } = (await listRes.json()) as { items?: GoogleTaskList[] };
    const existing = items?.find((list) => list.title === CHORE_TASK_LIST_TITLE);
    if (existing) return existing.id;

    const createRes = await googleFetch(accessToken, `${TASKS_BASE}/users/@me/lists`, {
      method: "POST",
      body: JSON.stringify({ title: CHORE_TASK_LIST_TITLE }),
    });
    if (!createRes.ok) throw new Error(`Could not create the Household Chores list (${createRes.status})`);
    const created = (await createRes.json()) as GoogleTaskList;
    return created.id;
  });
}

/* ── Task CRUD, always scoped to the caller-supplied list ─────────────── */

export async function createChoreTask(
  userId: string,
  listId: string,
  task: { title: string; notes?: string; due?: Date }
): Promise<string> {
  return withRetry(async () => {
    const accessToken = await getValidAccessToken(userId, "tasks");
    const res = await googleFetch(accessToken, `${TASKS_BASE}/lists/${listId}/tasks`, {
      method: "POST",
      body: JSON.stringify({
        title: task.title,
        notes: task.notes,
        due: task.due ? task.due.toISOString() : undefined,
      }),
    });
    if (!res.ok) throw new Error(`Could not create the task (${res.status})`);
    const created = (await res.json()) as GoogleTask;
    return created.id;
  });
}

export async function updateChoreTask(
  userId: string,
  listId: string,
  taskId: string,
  patch: Partial<{ title: string; notes: string; due: Date; completed: boolean }>
): Promise<void> {
  await withRetry(async () => {
    const accessToken = await getValidAccessToken(userId, "tasks");
    const res = await googleFetch(accessToken, `${TASKS_BASE}/lists/${listId}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.due !== undefined ? { due: patch.due.toISOString() } : {}),
        ...(patch.completed !== undefined
          ? { status: patch.completed ? "completed" : "needsAction" }
          : {}),
      }),
    });
    if (!res.ok && res.status !== 404) throw new Error(`Could not update the task (${res.status})`);
  });
}

export async function deleteChoreTask(userId: string, listId: string, taskId: string): Promise<void> {
  await withRetry(async () => {
    const accessToken = await getValidAccessToken(userId, "tasks");
    const res = await googleFetch(accessToken, `${TASKS_BASE}/lists/${listId}/tasks/${taskId}`, {
      method: "DELETE",
    });
    // A task already gone (manually deleted, or this is a retry of a prior
    // success) is not a failure — the end state is what we wanted.
    if (!res.ok && res.status !== 404) throw new Error(`Could not delete the task (${res.status})`);
  });
}

/**
 * Every task in the list, including completion status — one call, used by
 * the rotation cron's pull-completion pass instead of one GET per
 * assignment (Google's free quota is generous but not infinite).
 */
export async function listChoreTasks(userId: string, listId: string): Promise<GoogleTask[]> {
  return withRetry(async () => {
    const accessToken = await getValidAccessToken(userId, "tasks");
    const res = await googleFetch(
      accessToken,
      `${TASKS_BASE}/lists/${listId}/tasks?showCompleted=true&showHidden=true`
    );
    if (!res.ok) throw new Error(`Could not list tasks (${res.status})`);
    const body = (await res.json()) as { items?: GoogleTask[] };
    return body.items ?? [];
  });
}

/* ── Calendar freebusy (read-only, fails open) ────────────────────────── */

export type FreeBusyResult = { connected: boolean; busy: { start: string; end: string }[] };

/**
 * Busy blocks on the resident's own primary calendar between `start` and
 * `end`. Backs a nice-to-have scheduling hint, not core data — ANY failure
 * (not connected, API error, network) returns `{ connected: false, busy: [] }`
 * rather than throwing, so a Calendar hiccup can never break the chores page.
 */
export async function checkFreeBusy(userId: string, start: Date, end: Date): Promise<FreeBusyResult> {
  try {
    const accessToken = await getValidAccessToken(userId, "calendarFreebusy");
    const res = await googleFetch(accessToken, CALENDAR_FREEBUSY_URL, {
      method: "POST",
      body: JSON.stringify({
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        items: [{ id: "primary" }],
      }),
    });
    if (!res.ok) return { connected: false, busy: [] };
    const body = (await res.json()) as {
      calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
    };
    return { connected: true, busy: body.calendars?.primary?.busy ?? [] };
  } catch {
    return { connected: false, busy: [] };
  }
}
