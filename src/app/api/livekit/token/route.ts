import { createHash, randomUUID } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { rejectUntrustedOrigin } from "@/lib/http";
import { env } from "@/lib/env";

const requestSchema = z.object({ gameId: z.string().uuid(), role: z.enum(["viewer", "broadcaster"]) });

export async function POST(request: Request) {
  const originError=rejectUntrustedOrigin(request);if(originError)return originError;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const admin = createAdminClient();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const keyHash = createHash("sha256").update(`${ip}:livekit-token`).digest("hex");
  const { data: allowed } = await admin.rpc("consume_rate_limit", { p_key_hash: keyHash, p_limit: 30, p_window_seconds: 60 });
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { data: game } = await admin.from("games").select("id,organization_id,visibility,status").eq("id", parsed.data.gameId).single();
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let authorized = parsed.data.role === "viewer" && game.visibility === "public";
  if (user) {
    const { data: membership } = await admin.from("organization_members").select("role").eq("organization_id", game.organization_id).eq("user_id", user.id).maybeSingle();
    if (parsed.data.role === "viewer") authorized ||= Boolean(membership);
    else authorized = Boolean(membership && ["owner", "admin", "scorekeeper"].includes(membership.role));
  }
  if (!authorized) return NextResponse.json({ error: "You cannot access this game video" }, { status: 403 });
  const room = `game-${game.id}`;
  const identity = user ? `${user.id}-${randomUUID()}` : `viewer-${randomUUID()}`;
  const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, { identity, ttl: "15m" });
  token.addGrant({ roomJoin: true, room, canPublish: parsed.data.role === "broadcaster", canSubscribe: true, canPublishData: false });
  return NextResponse.json({ token: await token.toJwt(), serverUrl:env.LIVEKIT_URL, room }, { headers: { "Cache-Control": "no-store" } });
}
