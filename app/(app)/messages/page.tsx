import Link from "next/link";

import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Messages — Smart Mess" };

function formatWhen(date: Date) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** M1.2 — In-App Pre-Request Messaging inbox (Mahia Tanzin). */
export default async function MessagesPage() {
  const user = await requireUser();

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
  const list = [...conversations.values()];

  return (
    <div className="max-w-2xl">
      <PageHeader title="Messages" subtitle="Pre-request conversations with other residents and landlords." />
      {list.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          hint="Message a candidate from your matches, or a landlord from a listing, before sending a request."
        />
      ) : (
        <div className="space-y-2">
          {list.map((c) => (
            <Link key={c.userId} href={`/messages/${c.userId}`}>
              <Card className="transition hover:border-brand-300">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">{c.name}</span>
                  <div className="flex items-center gap-2">
                    {c.unread > 0 ? <Badge tone="green">{c.unread} new</Badge> : null}
                    <span className="text-xs text-slate-400">{formatWhen(c.lastAt)}</span>
                  </div>
                </div>
                <p className="mt-1 truncate text-sm text-slate-600">{c.lastBody}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
