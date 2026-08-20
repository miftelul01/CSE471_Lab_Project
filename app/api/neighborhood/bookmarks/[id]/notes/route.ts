import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { assertCanDeleteNote, loadVisibleBookmark } from "@/lib/authz";
import { MAX_NOTE_LENGTH } from "@/lib/neighborhood";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string } };

/**
 * M2.4 — the house's own annotations on a place.
 *
 * Any resident may write one on any HOUSE-visible entry. This is the part of
 * the feature a web search cannot replace: which counter is honest, what time
 * they actually open, who to ask for.
 */

export const dynamic = "force-dynamic";

export const POST = withUser(async (user, req: Request, { params }: Params) => {
  const bookmark = await loadVisibleBookmark(user, params.id);
  if (bookmark.deletedAt) return badRequest("That place has been removed from the map.");

  const body = await readJson<{ body?: string }>(req);
  const text = body?.body?.toString().trim();
  if (!text) return badRequest("Write something before saving the note.");
  if (text.length > MAX_NOTE_LENGTH) {
    return badRequest(`Note must be ${MAX_NOTE_LENGTH} characters or fewer.`);
  }

  const note = await prisma.bookmarkNote.create({
    data: {
      bookmarkId: bookmark.id,
      body: text,
      authorId: user.id,
      // Frozen at write time, so the note still says who wrote it after they
      // move out and their account is deleted.
      authorName: user.profile.name || user.email,
    },
    select: { id: true, body: true, authorId: true, authorName: true, createdAt: true },
  });

  return ok({ note }, 201);
});

/**
 * Soft-delete one note. Takes the id in the body rather than the path because
 * a note only ever exists in the context of its bookmark, and routing it that
 * way keeps the permission check on the bookmark where it belongs.
 */
export const DELETE = withUser(async (user, req: Request, { params }: Params) => {
  await loadVisibleBookmark(user, params.id);

  const body = await readJson<{ noteId?: string }>(req);
  const noteId = body?.noteId?.toString();
  if (!noteId) return badRequest("Which note? Send noteId.");

  const note = await assertCanDeleteNote(user, noteId);
  if (note.bookmarkId !== params.id) return badRequest("That note isn't on this place.");

  await prisma.bookmarkNote.update({
    where: { id: noteId },
    data: { deletedAt: new Date() },
  });

  return ok({ deleted: true });
});
