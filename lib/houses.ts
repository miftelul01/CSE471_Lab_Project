import { prisma } from "@/lib/prisma";
import type { House, Prisma, UserRole } from "@prisma/client";

export type NewHouse = {
  name: string;
  address: string;
  area?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

/**
 * Creates a house and makes `userId` its landlord and house admin.
 *
 * Both writes go in one prisma.$transaction, so a failure can't leave an
 * orphaned house with nobody in it. (Under Supabase this needed a manual
 * compensating delete, because its REST API had no transactions.)
 */
export async function createHouseWithOwner(
  house: NewHouse,
  userId: string,
  role: UserRole
): Promise<House> {
  return prisma.$transaction(async (tx) => {
    const created = await tx.house.create({
      data: {
        name: house.name,
        address: house.address,
        area: house.area ?? null,
        latitude: house.latitude ?? null,
        longitude: house.longitude ?? null,
        landlordId: userId,
      },
    });

    await tx.houseMember.create({
      data: {
        houseId: created.id,
        userId,
        role,
        isHouseAdmin: true,
        status: "ACTIVE",
      },
    });

    return created;
  });
}

/** Houses the user can post listings against — those they administer. */
export async function getAdministeredHouses(userId: string): Promise<House[]> {
  const memberships = await prisma.houseMember.findMany({
    where: { userId, status: "ACTIVE", isHouseAdmin: true },
    include: { house: true },
  });
  return memberships.map((m) => m.house);
}

/**
 * Admits a user into a house, applying the flat-admin rule.
 *
 * The FIRST resident to join a house becomes its flat admin — the person who
 * runs the household day to day, and the one who may advertise a spare seat to
 * prospective roommates. The landlord owns the property and is a house admin
 * by virtue of that, but they typically do not live there, so somebody inside
 * the flat has to be in charge.
 *
 * Later joiners are ordinary residents; the flat admin can hand the role over.
 */
export async function admitToHouse(
  tx: Prisma.TransactionClient,
  houseId: string,
  userId: string,
  role: UserRole = "RESIDENT"
) {
  const existingFlatAdmin = await tx.houseMember.findFirst({
    where: { houseId, status: "ACTIVE", isHouseAdmin: true, role: "RESIDENT" },
    select: { id: true },
  });

  const isFirstResident = role === "RESIDENT" && existingFlatAdmin === null;

  return tx.houseMember.upsert({
    where: { houseId_userId: { houseId, userId } },
    create: { houseId, userId, role, status: "ACTIVE", isHouseAdmin: isFirstResident },
    update: { status: "ACTIVE" },
  });
}
