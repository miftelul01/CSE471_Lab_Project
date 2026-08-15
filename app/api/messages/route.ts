import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/**
 * M1.2 — In-App Pre-Request Messaging (Mahia Tanzin).
 *
 * A lightweight, structured chat channel between two users, optionally
 * scoped to the listing/roommate-post the conversation is about — meant for
 * use BEFORE a binding join request or match request, to reduce awkward
 * mismatches. Not gated by the contact-info privacy matrix: an active
 * conversation necessarily involves knowing who you're talking to, the same
 * way DMing someone on any platform reveals their handle.
 */

export const dynamic = "force-dynamic";

/** Postgres `text` has no limit; a chat box that accepts a novel is a way to
 * make every inbox render unusable for the recipient. */
const MAX_BODY = 2000;

/** Newest N messages in a thread. Older history would need paging, which the
 * UI does not have yet — better to bound it than to load a year of chat. */
const THREAD_LIMIT = 200;

/** Messages scanned when building the inbox summary. See the note below. */
const INBOX_SCAN_LIMIT = 500;

/**
 * GET /api/messages            -> inbox: one row per conversation partner
 * GET /api/messages?with=<id>  -> recent thread with that user, marks their
 *                                  messages to me as read
 */
export const GET = withUser(async (user, req: Request) => {
  const withUserId = new URL(req.url).searchParams.get("with");

  if (withUserId) {
    const recent = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: user.id, recipientId: withUserId },
          { senderId: withUserId, recipientId: user.id },
        ],
      },
      // Newest first to apply the cap, then flipped back so the client still
      // receives the thread oldest-first.
      orderBy: { createdAt: "desc" },
      take: THREAD_LIMIT,
    });
    const messages = recent.reverse();

    await prisma.message.updateMany({
      where: { senderId: withUserId, recipientId: user.id, readAt: null },
      data: { readAt: new Date() },
    });

    return ok({ messages });
  }

  /**
   * Inbox: one row per conversation partner, most recent first.
   *
   * Bounded because this used to load EVERY message the user had ever sent or
   * received — both user relations joined — and reduce it to conversations in
   * JavaScript. That is a query whose cost grows forever for the most active
   * users, which are exactly the ones who open this page most.
   *
   * The scan window is the honest compromise short of a proper
   * `DISTINCT ON (partner)` query: it covers recent conversations correctly,
   * and a user past the window sees their most recent partners rather than
   * all of them. The unread tally is counted separately, so it stays exact
   * however far back the unread message is.
   */
  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: user.id }, { recipientId: user.id }] },
    orderBy: { createdAt: "desc" },
    take: INBOX_SCAN_LIMIT,
    include: {
      sender: { select: { id: true, name: true, email: true } },
      recipient: { select: { id: true, name: true, email: true } },
    },
  });

  const unreadBySender = new Map(
    (
      await prisma.message.groupBy({
        by: ["senderId"],
        where: { recipientId: user.id, readAt: null },
        _count: { _all: true },
      })
    ).map((row) => [row.senderId, row._count._all])
  );

  const conversations = new Map<
    string,
    { userId: string; name: string; lastBody: string; lastAt: Date; unread: number }
  >();
  for (const m of messages) {
    const other = m.senderId === user.id ? m.recipient : m.sender;
    if (conversations.has(other.id)) continue;
    conversations.set(other.id, {
      userId: other.id,
      name: other.name || other.email,
      lastBody: m.body,
      lastAt: m.createdAt,
      // From the exact aggregate, not from counting the scanned window.
      unread: unreadBySender.get(other.id) ?? 0,
    });
  }

  return ok({ conversations: [...conversations.values()] });
});

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<{ recipient_id: string; body: string; listing_id?: string | null }>(req);
  if (!body?.recipient_id || !body?.body?.trim()) {
    return badRequest("recipient_id and body are required");
  }
  if (body.recipient_id === user.id) return badRequest("You can't message yourself.");

  const text = body.body.trim();
  if (text.length > MAX_BODY) {
    return badRequest(`Message must be ${MAX_BODY} characters or fewer.`);
  }

  // A bad id would otherwise surface as a foreign-key error phrased as
  // "That refers to something which doesn't exist."
  const recipient = await prisma.user.findUnique({
    where: { id: body.recipient_id },
    select: { id: true },
  });
  if (!recipient) return badRequest("There's nobody to send that to.");

  const blocked = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: user.id, blockedId: body.recipient_id },
        { blockerId: body.recipient_id, blockedId: user.id },
      ],
    },
    select: { id: true },
  });
  if (blocked) return badRequest("You can't message this user.");

  const message = await prisma.message.create({
    data: {
      senderId: user.id,
      recipientId: body.recipient_id,
      listingId: body.listing_id || null,
      body: text,
    },
  });
  return ok(message, 201);
});
