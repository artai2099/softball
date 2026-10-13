import { createHash } from "node:crypto";
import { EgressClient, StreamOutput, StreamProtocol } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { rejectUntrustedOrigin } from "@/lib/http";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.object({ action: z.enum(["start", "stop"]) });
const YOUTUBE_RTMPS_BASE = "rtmps://a.rtmps.youtube.com:443/live2";
const START_LEASE_TTL_MS = 2 * 60 * 1000;

function egressClient() {
  // LiveKit's server API uses HTTPS even when browser media connects over WSS.
  const apiUrl = env.LIVEKIT_URL.replace(/^wss:/, "https:");
  return new EgressClient(apiUrl, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
}

function captureUrl(publicId: string) {
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production" && !appUrl.startsWith("https://")) {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTPS in production for YouTube capture.");
  }
  return `${appUrl}/watch/${publicId}?broadcast=1`;
}

async function getGameAndAuthorize(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Authentication required" }, { status: 401 }) } as const;
  }

  const admin = createAdminClient();
  const { data: game, error: gameError } = await admin
    .from("games")
    .select("id,organization_id,visibility,status,public_id,home_team_id,away_team_id")
    .eq("id", id)
    .maybeSingle();

  if (gameError || !game) {
    return { response: NextResponse.json({ error: "Game not found" }, { status: 404 }) } as const;
  }

  const { data: membership } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", game.organization_id)
    .eq("user_id", user.id)
    .maybeSingle();

  const organizationCanScore = Boolean(
    membership && ["owner", "admin", "scorekeeper"].includes(membership.role),
  );

  const teamIds = [game.home_team_id, game.away_team_id]
    .filter((teamId): teamId is string => Boolean(teamId));
  let teamManagerCanScore = false;

  if (teamIds.length > 0) {
    const { data: teamMemberships } = await admin
      .from("team_memberships")
      .select("team_id,role")
      .eq("user_id", user.id)
      .in("team_id", teamIds);

    teamManagerCanScore = Boolean(
      teamMemberships?.some((member) => member.role === "manager"),
    );
  }

  if (!organizationCanScore && !teamManagerCanScore) {
    return { response: NextResponse.json({ error: "You cannot manage this game's YouTube stream" }, { status: 403 }) } as const;
  }

  return { admin, game, user } as const;
}

async function getBroadcastRow(admin: ReturnType<typeof createAdminClient>, gameId: string) {
  return admin
    .from("youtube_live_broadcasts")
    .select("game_id,egress_id,status,created_at")
    .eq("game_id", gameId)
    .maybeSingle();
}

async function isEgressActive(egressId: string) {
  const client = egressClient();
  return (await client.listEgress({ egressId, active: true })).length > 0;
}

async function allowBroadcastChange(admin: ReturnType<typeof createAdminClient>, userId: string, gameId: string) {
  const keyHash = createHash("sha256")
    .update(`${userId}:youtube-egress:${gameId}`)
    .digest("hex");
  const { data: allowed, error } = await admin.rpc("consume_rate_limit", {
    p_key_hash: keyHash,
    p_limit: 6,
    p_window_seconds: 60,
  });

  if (error) {
    console.error("YouTube broadcast rate limiter failed");
    return NextResponse.json({ error: "Broadcast protection is temporarily unavailable." }, { status: 503 });
  }

  if (allowed !== true) {
    return NextResponse.json({ error: "Too many broadcast changes. Wait a minute and try again." }, { status: 429 });
  }

  return null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getGameAndAuthorize(id);
  if ("response" in auth) return auth.response;

  let url: string;
  try {
    url = captureUrl(auth.game.public_id);
  } catch {
    return NextResponse.json({ error: "YouTube capture requires a public HTTPS app URL." }, { status: 503 });
  }

  const { data: broadcast, error } = await getBroadcastRow(auth.admin, auth.game.id);
  if (error) {
    console.error("YouTube broadcast status lookup failed");
    return NextResponse.json({ error: "Could not check YouTube broadcast status." }, { status: 503 });
  }

  let active = false;
  if (broadcast) {
    if (!broadcast.egress_id) {
      const ageMs = Date.now() - new Date(broadcast.created_at).getTime();
      if (broadcast.status === "starting" && ageMs <= START_LEASE_TTL_MS) {
        active = true;
      } else {
        await auth.admin.from("youtube_live_broadcasts").delete().eq("game_id", auth.game.id);
      }
    } else {
      try {
        active = await isEgressActive(broadcast.egress_id);
        if (!active) {
          await auth.admin.from("youtube_live_broadcasts").delete().eq("game_id", auth.game.id);
        }
      } catch {
        console.error("LiveKit YouTube egress status lookup failed");
        return NextResponse.json({ error: "Could not check LiveKit broadcast status." }, { status: 503 });
      }
    }
  }

  return NextResponse.json({
    configured: Boolean(env.YOUTUBE_STREAM_KEY),
    canBroadcast: auth.game.visibility === "public" && auth.game.status === "live",
    active,
    watchUrl: env.YOUTUBE_WATCH_URL || null,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = rejectUntrustedOrigin(request);
  if (originError) return originError;

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid YouTube broadcast action." }, { status: 400 });

  const { id } = await params;
  const auth = await getGameAndAuthorize(id);
  if ("response" in auth) return auth.response;

  const limitError = await allowBroadcastChange(auth.admin, auth.user.id, auth.game.id);
  if (limitError) return limitError;

  let url: string;
  try {
    url = captureUrl(auth.game.public_id);
  } catch {
    return NextResponse.json({ error: "YouTube capture requires a public HTTPS app URL." }, { status: 503 });
  }

  const client = egressClient();

  if (parsed.data.action === "start") {
    if (!env.YOUTUBE_STREAM_KEY) {
      return NextResponse.json({ error: "YouTube streaming is not configured. Add YOUTUBE_STREAM_KEY to the server environment." }, { status: 503 });
    }
    if (auth.game.visibility !== "public") {
      return NextResponse.json({ error: "Set this game to Public before streaming its scoreboard to YouTube." }, { status: 409 });
    }
    if (auth.game.status !== "live") {
      return NextResponse.json({ error: "Start the softball game before starting YouTube Live." }, { status: 409 });
    }

    const { data: existing, error: existingError } = await getBroadcastRow(auth.admin, auth.game.id);
    if (existingError) {
      return NextResponse.json({ error: "Could not verify whether a YouTube broadcast is already running." }, { status: 503 });
    }
    if (existing) {
      const ageMs = Date.now() - new Date(existing.created_at).getTime();
      if (existing.egress_id && await isEgressActive(existing.egress_id)) {
        return NextResponse.json({ active: true, message: "YouTube broadcast is already starting or live." });
      }
      if (!existing.egress_id && existing.status === "starting" && ageMs <= START_LEASE_TTL_MS) {
        return NextResponse.json({ active: true, message: "YouTube broadcast is already starting. Wait a moment and refresh status." }, { status: 409 });
      }
      await auth.admin.from("youtube_live_broadcasts").delete().eq("game_id", auth.game.id);
    }

    const { error: reserveError } = await auth.admin
      .from("youtube_live_broadcasts")
      .insert({ game_id: auth.game.id, status: "starting", created_by: auth.user.id });
    if (reserveError) {
      if (reserveError.code === "23505") {
        return NextResponse.json({ active: true, message: "A YouTube broadcast is already being started." }, { status: 409 });
      }
      console.error("Could not reserve YouTube broadcast state");
      return NextResponse.json({ error: "Could not reserve a YouTube broadcast. Check the database migration." }, { status: 503 });
    }

    try {
      const info = await client.startWebEgress(
        url,
        {
          stream: new StreamOutput({
            protocol: StreamProtocol.RTMP,
            urls: [`${YOUTUBE_RTMPS_BASE}/${env.YOUTUBE_STREAM_KEY}`],
          }),
        },
        { videoOnly: false },
      );

      if (!info.egressId) throw new Error("LiveKit did not return a broadcast ID.");

      const { error: saveError } = await auth.admin
        .from("youtube_live_broadcasts")
        .update({ egress_id: info.egressId, status: "active", updated_at: new Date().toISOString() })
        .eq("game_id", auth.game.id);

      if (saveError) {
        await client.stopEgress(info.egressId).catch(() => undefined);
        throw new Error("Could not save broadcast state.");
      }

      return NextResponse.json({ active: true, message: "YouTube broadcast is starting." }, { status: 202 });
    } catch (error) {
      console.error("YouTube Live start failed", error instanceof Error ? error.name : "unknown error");
      await auth.admin.from("youtube_live_broadcasts").delete().eq("game_id", auth.game.id);
      return NextResponse.json({
        error: "Could not start YouTube Live. Check the LiveKit Egress service and YouTube stream settings.",
      }, { status: 502 });
    }
  }

  const { data: broadcast, error: broadcastError } = await getBroadcastRow(auth.admin, auth.game.id);
  if (broadcastError) {
    return NextResponse.json({ error: "Could not load YouTube broadcast state." }, { status: 503 });
  }
  if (!broadcast) {
    return NextResponse.json({ active: false, message: "No GameDay YouTube broadcast is active." });
  }

  if (!broadcast.egress_id) {
    const ageMs = Date.now() - new Date(broadcast.created_at).getTime();
    if (broadcast.status === "starting" && ageMs <= START_LEASE_TTL_MS) {
      return NextResponse.json({ error: "The broadcast is still starting. Wait a moment and try stopping it again." }, { status: 409 });
    }
    await auth.admin.from("youtube_live_broadcasts").delete().eq("game_id", auth.game.id);
    return NextResponse.json({ active: false, message: "The YouTube broadcast was not active." });
  }

  try {
    if (await isEgressActive(broadcast.egress_id)) {
      await client.stopEgress(broadcast.egress_id);
    }
    await auth.admin.from("youtube_live_broadcasts").delete().eq("game_id", auth.game.id);
    return NextResponse.json({ active: false, message: "YouTube broadcast stop requested." });
  } catch {
    console.error("YouTube Live stop failed");
    return NextResponse.json({ error: "Could not stop YouTube Live. Check LiveKit Egress status and try again." }, { status: 502 });
  }
}
