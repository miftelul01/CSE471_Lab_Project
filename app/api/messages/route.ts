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

/**
 * GET /api/messages            -> inbox: one row per conversation partner
 * GET /api/messages?with=<id>  -> full thread with that user, marks their
 *                                  messages to me as read
 */
export const GET = withUser(async (user, req: Request) => {
  const withUserId = new URL(req.url).searchParams.get("with");

  if (withUserId) {
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: user.id, recipientId: withUserId },
          { senderId: withUserId, recipientId: user.id },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    await prisma.message.updateMany({
      where: { senderId: withUserId, recipientId: user.id, readAt: null },
      data: { readAt: new Date() },
    });

    return ok({ messages });
  }

  // Inbox: every user who has exchanged a message with me, most recent first.
  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: user.id }, { recipientId: user.id }] },
    orderBy: { createdAt: "desc" },
    include: {
      sender: { select: { id: true, name: true, email: true } },
      recipient: { select: { id: true, name: true, email: true } },
    },
  });

  const conversations = new Map<
    string,
    { userId: string; name: string; lastBody: string; lastAt: Date; unread: number }
  >();
  for (const m of messages) {
    const other = m.senderId === user.id ? m.recipient : m.sender;
    const existing = conversations.get(other.id);
    const isUnreadToMe = m.recipientId === user.id && !m.readAt;
    if (!existing) {
      conversations.set(other.id, {
        userId: other.id,
        name: other.name || other.email,
        lastBody: m.body,
        lastAt: m.createdAt,
        unread: isUnreadToMe ? 1 : 0,
      });
    } else if (isUnreadToMe) {
      existing.unread += 1;
    }
  }

  return ok({ conversations: [...conversations.values()] });
});

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<{ recipient_id: string; body: string; listing_id?: string | null }>(req);
  if (!body?.recipient_id || !body?.body?.trim()) {
    return badRequest("recipient_id and body are required");
  }
  if (body.recipient_id === user.id) return badRequest("You can't message yourself.");

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
      body: body.body.trim(),
    },
  });
  return ok(message, 201);
});
