import { NextResponse } from "next/server";

/** Order lookup form target: /orders?id=<n> → /orders/<n>. */
export function GET(req: Request): NextResponse {
  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim() ?? "";
  if (!/^\d+$/.test(id)) {
    return NextResponse.redirect(new URL("/", url));
  }
  return NextResponse.redirect(new URL(`/orders/${id}`, url));
}
