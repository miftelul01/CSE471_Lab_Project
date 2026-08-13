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

export async function admitToHouse(
  tx: Prisma.TransactionClient,
  houseId: string,
  userId: string,
  role: UserRole = "RESIDENT"
): Promise<void> {
  const existing = await tx.houseMember.findFirst({
    where: { houseId, userId },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  await tx.houseMember.create({
    data: {
      houseId,
      userId,
      role,
      isHouseAdmin: false,
      status: "ACTIVE",
    },
  });
}
