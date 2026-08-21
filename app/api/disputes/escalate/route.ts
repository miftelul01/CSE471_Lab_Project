import { NextResponse } from "next/server";
import { checkDisputeTimeouts } from "@/Araf/M3.5-MessCourt/disputes";
import { authorizedCron } from "@/lib/cron";

export const dynamic = "force-dynamic";

/**
 * M3.5 Mess Court — 48-hour auto-escalation job (Md. Mahidul Alam Araf).
 */
export async function POST(req: Request) {
  if (!authorizedCron(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const escalatedIds = await checkDisputeTimeouts();
    return NextResponse.json({ message: "Success", escalatedCount: escalatedIds.length, escalatedIds });
  } catch (error) {
    console.error("Dispute escalate cron error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
