import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { Favorite } from "@/models/Favorite";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  await connectToDatabase();
  const favorites = await Favorite.find({ userId }).populate("listingId").sort({ createdAt: -1 });
  const shaped = favorites.map((f) => {
    const json = f.toJSON() as any;
    return { id: json.id, listing: json.listingId };
  });
  return NextResponse.json({ favorites: shaped });
}

export async function POST(req: NextRequest) {
  const { userId, listingId } = await req.json();
  if (!userId || !listingId) {
    return NextResponse.json({ error: "userId and listingId are required" }, { status: 400 });
  }
  await connectToDatabase();

  const favorite = await Favorite.findOneAndUpdate(
    { userId, listingId },
    { userId, listingId },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return NextResponse.json(favorite.toJSON(), { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { userId, listingId } = await req.json();
  if (!userId || !listingId) {
    return NextResponse.json({ error: "userId and listingId are required" }, { status: 400 });
  }
  await connectToDatabase();
  await Favorite.deleteOne({ userId, listingId });
  return NextResponse.json({ success: true });
}
