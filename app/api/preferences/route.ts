import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { Preference } from "@/models/Preference";

// NOTE: once the auth module (registration/login) is merged, replace the
// `userId` read from the request body/query with the session's user id.

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  await connectToDatabase();
  const preference = await Preference.findOne({ userId });
  if (!preference) {
    return NextResponse.json({ error: "No preference set for this user" }, { status: 404 });
  }
  return NextResponse.json(preference.toJSON());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    userId,
    budgetMin,
    budgetMax,
    sleepSchedule,
    cleanliness,
    smokingOk,
    petsOk,
    preferredArea,
  } = body;

  if (!userId || budgetMin == null || budgetMax == null || !sleepSchedule || !cleanliness) {
    return NextResponse.json(
      { error: "userId, budgetMin, budgetMax, sleepSchedule and cleanliness are required" },
      { status: 400 }
    );
  }
  if (budgetMin > budgetMax) {
    return NextResponse.json({ error: "budgetMin cannot exceed budgetMax" }, { status: 400 });
  }

  await connectToDatabase();

  const preference = await Preference.findOneAndUpdate(
    { userId },
    {
      userId,
      budgetMin,
      budgetMax,
      sleepSchedule,
      cleanliness,
      smokingOk: !!smokingOk,
      petsOk: !!petsOk,
      preferredArea: preferredArea ?? null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return NextResponse.json(preference.toJSON(), { status: 200 });
}
