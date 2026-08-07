import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { JoinRequest } from "@/models/JoinRequest";
import { Listing } from "@/models/Listing";

// GET: list join requests either sent by a resident (?userId=) or
// received by a landlord for their listings (?landlordId=)
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const landlordId = req.nextUrl.searchParams.get("landlordId");

  await connectToDatabase();

  if (userId) {
    const requests = await JoinRequest.find({ userId }).populate("listingId").sort({ createdAt: -1 });
    const shaped = requests.map((r) => {
      const json = r.toJSON() as any;
      return { id: json.id, status: json.status, createdAt: json.createdAt, listing: json.listingId };
    });
    return NextResponse.json({ requests: shaped });
  }

  if (landlordId) {
    const listingIds = (await Listing.find({ landlordId }).select("_id")).map((l) => l._id);
    const requests = await JoinRequest.find({ listingId: { $in: listingIds } })
      .populate("listingId")
      .sort({ createdAt: -1 });
    const shaped = requests.map((r) => {
      const json = r.toJSON() as any;
      return { id: json.id, status: json.status, userId: json.userId, listing: json.listingId };
    });
    return NextResponse.json({ requests: shaped });
  }

  return NextResponse.json({ error: "userId or landlordId is required" }, { status: 400 });
}

// POST: resident sends a formal join request for a listing
export async function POST(req: NextRequest) {
  const { userId, listingId, message } = await req.json();
  if (!userId || !listingId) {
    return NextResponse.json({ error: "userId and listingId are required" }, { status: 400 });
  }

  await connectToDatabase();

  const existing = await JoinRequest.findOne({ userId, listingId, status: "PENDING" });
  if (existing) {
    return NextResponse.json(
      { error: "A pending join request for this listing already exists" },
      { status: 409 }
    );
  }

  const joinRequest = await JoinRequest.create({ userId, listingId, message: message ?? null });
  return NextResponse.json(joinRequest.toJSON(), { status: 201 });
}

// PATCH: landlord accepts or rejects a pending request
export async function PATCH(req: NextRequest) {
  const { requestId, status } = await req.json();
  if (!requestId || !["ACCEPTED", "REJECTED", "WITHDRAWN"].includes(status)) {
    return NextResponse.json(
      { error: "requestId and a valid status (ACCEPTED, REJECTED, WITHDRAWN) are required" },
      { status: 400 }
    );
  }

  await connectToDatabase();
  const updated = await JoinRequest.findByIdAndUpdate(requestId, { status }, { new: true });
  if (!updated) {
    return NextResponse.json({ error: "Join request not found" }, { status: 404 });
  }
  return NextResponse.json(updated.toJSON());
}
