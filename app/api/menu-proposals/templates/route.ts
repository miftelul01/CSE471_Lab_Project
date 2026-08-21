import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { assertHouseMember } from "@/lib/authz";
import { MAX_TEMPLATE_NAME_LENGTH, validateDayProposalInput } from "@/lib/menu";
import { prisma } from "@/lib/prisma";
import type { DietaryTag, NutritionProfile } from "@prisma/client";

/** M2.2 — Reusable menu templates (scoped enhancement, Mahia Tanzin). */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before using templates.");
  await assertHouseMember(user, houseId);

  const templates = await prisma.menuTemplate.findMany({
    where: { houseId },
    orderBy: { createdAt: "desc" },
  });
  return ok({ templates });
});

type TemplateBody = {
  name: string;
  breakfast?: string | null;
  lunch?: string | null;
  dinner?: string | null;
  estimatedCostPerHead?: number | string | null;
  nutritionProfile?: NutritionProfile | null;
  dietaryTags?: DietaryTag[];
};

export const POST = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before saving a template.");
  await assertHouseMember(user, houseId);

  const body = await readJson<TemplateBody>(req);
  if (!body?.name?.trim()) return badRequest("A template needs a name.");
  if (body.name.trim().length > MAX_TEMPLATE_NAME_LENGTH) {
    return badRequest(`Template name must be ${MAX_TEMPLATE_NAME_LENGTH} characters or fewer.`);
  }

  // Reuse the day-proposal validator for the meal/cost/dietary fields —
  // dayOfWeek isn't meaningful for a template, so a placeholder value just
  // satisfies that one check.
  const validationError = validateDayProposalInput({ ...body, dayOfWeek: 0 });
  if (validationError) return badRequest(validationError);

  const template = await prisma.menuTemplate.create({
    data: {
      houseId,
      createdById: user.id,
      name: body.name.trim(),
      breakfast: body.breakfast?.trim() || null,
      lunch: body.lunch?.trim() || null,
      dinner: body.dinner?.trim() || null,
      estimatedCostPerHead:
        body.estimatedCostPerHead != null && body.estimatedCostPerHead !== "" ? Number(body.estimatedCostPerHead) : null,
      nutritionProfile: body.nutritionProfile ?? null,
      dietaryTags: body.dietaryTags ?? [],
    },
  });
  return ok(template, 201);
});
