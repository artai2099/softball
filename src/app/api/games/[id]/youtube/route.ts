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

function egressClient() {
  // Egress APIs use HTTPS even when browser media connects over WSS.
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

function isYoutubeCapture(info: {
  web?: { url?: string };
  request?: { case?: string; value?: { url?: string } };
}, url: string) {
  return info.web?.url === url ||
    (info.request?.case === "web" && info.request.value?.url === url);
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

async function listYouTubeEgress(roomName: string, url: string) {
  const client = egressClient();
  const items = await client.listEgress({ roomName, active: true });
  return items.filter((item) => isYoutubeCapture(item as never, url));
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

  let active = false;
  try {
    active = (await listYouTubeEgress(`game-${auth.game.id}`, url)).length > 0;
  } catch (error) {
    console.error("Unable to check YouTube egress status", error);
    return NextResponse.json({ error: "Could not check LiveKit broadcast status." }, { status: 503 });
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

  if (!env.YOUTUBE_STREAM_KEY) {
    return NextResponse.json({ error: "YouTube streaming is not configured. Add YOUTUBE_STREAM_KEY to the server environment." }, { status: 503 });
  }

  if (auth.game.visibility !== "public") {
    return NextResponse.json({ error: "Set this game to Public before streaming its scoreboard to YouTube." }, { status: 409 });
  }

  if (auth.game.status !== "live") {
    return NextResponse.json({ error: "Start the softball game before starting YouTube Live." }, { status: 409 });
  }

  const keyHash = createHash("sha256")
    .update(`${auth.user.id}:youtube-egress:${auth.game.id}`)
    .digest("hex");
  const { data: allowed, error: limitError } = await auth.admin.rpc("consume_rate_limit", {
    p_key_hash: keyHash,
    p_limit: 6,
    p_window_seconds: 60,
  });
  if (limitError) {
    console.error("YouTube broadcast rate limiter failed", limitError);
    return NextResponse.json({ error: "Broadcast protection is temporarily unavailable." }, { status: 503 });
  }
  if (allowed !== true) return NextResponse.json({ error: "Too many broadcast changes. Wait a minute and try again." }, { status: 429 });

  let url: string;
  try {
    url = captureUrl(auth.game.public_id);
  } catch {
    return NextResponse.json({ error: "YouTube capture requires a public HTTPS app URL." }, { status: 503 });
  }

  const client = egressClient();
  const roomName = `game-${auth.game.id}`;

  try {
    const active = await listYouTubeEgress(roomName, url);

    if (parsed.data.action === "start") {
      if (active.length > 0) {
        return NextResponse.json({ active: true, message: "YouTube broadcast is already starting or live." });
      }

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

      if (!info.egressId) {
        return NextResponse.json({ error: "LiveKit did not return a broadcast ID." }, { status: 502 });
      }

      return NextResponse.json({ active: true, message: "YouTube broadcast is starting." }, { status: 202 });
    }

    if (active.length === 0) {
      return NextResponse.json({ active: false, message: "No GameDay YouTube broadcast is active." });
    }

    await Promise.all(active.map((item) => {
      if (!item.egressId) throw new Error("LiveKit broadcast ID is missing.");
      return client.stopEgress(item.egressId);
    }));

    return NextResponse.json({ active: false, message: "YouTube broadcast stop requested." });
  } catch (error) {
    console.error("YouTube Live egress request failed", error);
    return NextResponse.json({
      error: parsed.data.action === "start"
        ? "Could not start YouTube Live. Check the LiveKit Egress service and YouTube stream settings."
        : "Could not stop YouTube Live. Check LiveKit Egress status and try again.",
    }, { status: 502 });
  }
}
