import Link from "next/link";
import { notFound } from "next/navigation";

import { MessageThread } from "./MessageThread";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function generateMetadata({ params }: { params: { userId: string } }) {
  const other = await prisma.user.findUnique({ where: { id: params.userId }, select: { name: true } });
  return { title: other ? `${other.name} — Messages` : "Messages — Smart Mess" };
}

/** M1.2 — In-App Pre-Request Messaging thread (Mahia Tanzin). */
export default async function MessageThreadPage({ params }: { params: { userId: string } }) {
  const user = await requireUser();
  if (params.userId === user.id) notFound();

  const other = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, name: true, email: true },
  });
  if (!other) notFound();

  return (
    <div className="max-w-2xl">
      <Link href="/messages" className="mb-4 inline-block text-sm text-slate-600 hover:underline">
        ← All messages
      </Link>
      <PageHeader title={other.name || other.email} />
      <MessageThread otherUserId={other.id} currentUserId={user.id} />
    </div>
  );
}
