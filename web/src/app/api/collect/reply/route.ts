import { NextResponse } from "next/server";
import { putReply, workerAuthorized, type CollectReply } from "@/lib/rendezvous";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/collect/reply — the cashier worker files its answer to a
 * collection note: the item sealed to the buyer's one-time key, or a
 * plain refusal. Worker only (shared-secret bearer). A reply is filed
 * under the request id it answers; the worker re-posts live replies
 * for ten minutes so any serverless instance the buyer's page polls
 * can serve it.
 */
async function fileReply(reply: CollectReply): Promise<NextResponse> {
  try {
    await putReply(reply);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "The answer could not be filed." }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!workerAuthorized(req)) {
    return NextResponse.json({ error: "Not the cashier." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Unreadable reply." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const requestId = b.requestId;
  if (typeof requestId !== "string" || !/^[0-9a-f]{64}$/.test(requestId)) {
    return NextResponse.json({ error: "A reply must name its request." }, { status: 400 });
  }
  if (b.status === "ready") {
    const sealedB64 = b.sealedB64;
    const workerPubB64 = b.workerPubB64;
    if (
      typeof sealedB64 !== "string" ||
      sealedB64.length === 0 ||
      sealedB64.length > 8192 ||
      typeof workerPubB64 !== "string" ||
      workerPubB64.length === 0 ||
      workerPubB64.length > 256
    ) {
      return NextResponse.json({ error: "A ready reply must carry its sealed item." }, { status: 400 });
    }
    const reply: CollectReply = { requestId, status: "ready", sealedB64, workerPubB64 };
    return fileReply(reply);
  }
  if (b.status === "rejected") {
    const reason = b.reason;
    if (typeof reason !== "string" || reason.length === 0 || reason.length > 300) {
      return NextResponse.json({ error: "A refusal must carry a plain reason." }, { status: 400 });
    }
    const reply: CollectReply = { requestId, status: "rejected", reason };
    return fileReply(reply);
  }
  return NextResponse.json({ error: "Unknown reply status." }, { status: 400 });
}
