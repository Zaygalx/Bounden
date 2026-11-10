import { NextResponse } from "next/server";
import { getReply, hasRequest } from "@/lib/rendezvous";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/collect/status?requestId=<sha256 hex> — the buyer's page
 * polls this while it waits at the counter. Answers one of:
 *   { status: "ready", sealedB64, workerPubB64 }  the item, sealed
 *   { status: "rejected", reason }               a plain refusal
 *   { status: "waiting" }                        note queued, no answer yet
 *   { status: "unknown" }                        no such note on file
 * A "ready" reply is ciphertext only the requesting tab can open.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const id = new URL(req.url).searchParams.get("requestId") ?? "";
  if (!/^[0-9a-f]{64}$/.test(id)) {
    return NextResponse.json({ status: "unknown" });
  }
  try {
    const reply = await getReply(id);
    if (reply) return NextResponse.json(reply);
    if (await hasRequest(id)) return NextResponse.json({ status: "waiting" });
    return NextResponse.json({ status: "unknown" });
  } catch {
    // A failed read proves nothing about the note; "waiting" keeps the
    // buyer at the counter rather than telling them it vanished.
    return NextResponse.json({ status: "waiting" });
  }
}
