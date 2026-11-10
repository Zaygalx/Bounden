import { NextResponse } from "next/server";
import { listRequests, workerAuthorized } from "@/lib/rendezvous";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/collect/requests — the cashier worker's side of the post
 * box: every collection note still within its fifteen minutes. Worker
 * only (shared-secret bearer); the notes themselves are signatures,
 * public by nature, but the queue is not a public noticeboard.
 */
export async function GET(req: Request): Promise<NextResponse> {
  if (!workerAuthorized(req)) {
    return NextResponse.json({ error: "Not the cashier." }, { status: 401 });
  }
  try {
    return NextResponse.json({ requests: await listRequests() });
  } catch {
    return NextResponse.json({ error: "The post box could not be read." }, { status: 500 });
  }
}
