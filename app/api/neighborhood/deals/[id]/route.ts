import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { assertCanEditDeal } from "@/lib/authz";
import { MAX_DEAL_TEXT_LENGTH, MAX_DEAL_TITLE_LENGTH } from "@/lib/neighborhood";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string } };

/** M2.4 — editing, pulling and deleting one deal. */

export const dynamic = "force-dynamic";

type PatchBody = {
  title?: string;
  description?: string | null;
  discountNote?: string | null;
  validUntil?: string | null;
  /** Pull the offer before it lapses — the shop stopped honouring it. */
  retire?: boolean;
};

export const PATCH = withUser(async (user, req: Request, { params }: Params) => {
  await assertCanEditDeal(user, params.id);

  const body = await readJson<PatchBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  const data: {
    title?: string;
    description?: string | null;
    discountNote?: string | null;
    validUntil?: Date | null;
    retiredAt?: Date | null;
  } = {};

  // Retiring is not deleting. The offer stays readable — and stays in the
  // shop's deal history — it just stops counting as live.
  if (body.retire !== undefined) {
    data.retiredAt = body.retire ? new Date() : null;
  }

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return badRequest("Give the deal a title.");
    if (title.length > MAX_DEAL_TITLE_LENGTH) {
      return badRequest(`Title must be ${MAX_DEAL_TITLE_LENGTH} characters or fewer.`);
    }
    data.title = title;
  }

  for (const key of ["description", "discountNote"] as const) {
    if (body[key] === undefined) continue;
    const value = body[key]?.toString().trim() || null;
    if (value && value.length > MAX_DEAL_TEXT_LENGTH) {
      return badRequest(`That field must be ${MAX_DEAL_TEXT_LENGTH} characters or fewer.`);
    }
    data[key] = value;
  }

  if (body.validUntil !== undefined) {
    if (body.validUntil === null) {
      data.validUntil = null;
    } else {
      const validUntil = new Date(body.validUntil);
      if (Number.isNaN(validUntil.getTime())) return badRequest("validUntil is not a valid date.");
      data.validUntil = validUntil;
    }
  }

  if (Object.keys(data).length === 0) return badRequest("Nothing to update.");

  // The CHECK constraint on the table enforces the window; this only reaches
  // for the current validFrom when the caller is moving the end date.
  if (data.validUntil) {
    const current = await prisma.deal.findUnique({
      where: { id: params.id },
      select: { validFrom: true },
    });
    if (current && data.validUntil <= current.validFrom) {
      return badRequest("The deal must end after it starts.");
    }
  }

  const deal = await prisma.deal.update({
    where: { id: params.id },
    data,
    select: { id: true, title: true, retiredAt: true },
  });

  return ok({ deal });
});

/** Soft delete, like everything else here. */
export const DELETE = withUser(async (user, _req: Request, { params }: Params) => {
  await assertCanEditDeal(user, params.id);

  await prisma.deal.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  });

  return ok({ deleted: true });
});
