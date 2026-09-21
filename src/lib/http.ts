import { NextResponse } from "next/server";

/** Validate browser state-changing requests against the public origin.
 * Uses forwarded host/proto when the app is behind a reverse proxy (Vercel,
 * ingress, etc.), while still requiring an Origin header.
 */
export function rejectUntrustedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return NextResponse.json({ error: "Origin header required" }, { status: 403 });

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || new URL(request.url).protocol.replace(":", "");
  if (!host) return NextResponse.json({ error: "Host header required" }, { status: 403 });

  let expected: string;
  try {
    expected = new URL(`${proto}://${host}`).origin;
  } catch {
    return NextResponse.json({ error: "Invalid request host" }, { status: 403 });
  }
  if (origin !== expected) return NextResponse.json({ error: "Untrusted request origin" }, { status: 403 });
  return null;
}
