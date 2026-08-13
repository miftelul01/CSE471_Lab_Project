import { badRequest, forbidden, missingFields, ok, readJson, withUser } from "@/lib/api";
import { isLandlordRole } from "@/lib/authz";
import { createHouseWithOwner } from "@/lib/houses";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Houses the current user actively belongs to. */
export const GET = withUser(async (user) => {
  const houses = await prisma.houseMember.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    include: { house: true },
  });
  return ok({ houses });
});

type CreateHouseBody = { name: string; address: string; area?: string };

/** Creates a house and makes the creator its landlord + house admin. */
export const POST = withUser(async (user, req: Request) => {
  if (!isLandlordRole(user)) {
    return forbidden("Switch your role to Landlord on the profile page before creating a house.");
  }

  const body = await readJson<CreateHouseBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  const missing = missingFields(body, ["name", "address"]);
  if (missing.length > 0) return badRequest(`Missing required fields: ${missing.join(", ")}`);

  const house = await createHouseWithOwner(
    { name: body.name, address: body.address, area: body.area || null },
    user.id,
    user.profile.role
  );
  return ok(house, 201);
});
