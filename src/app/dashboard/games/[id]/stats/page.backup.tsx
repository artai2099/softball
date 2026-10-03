import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type StatLine = {
  playerId: string;
  name: string;
  jersey: number;
  order: number | null;
  pa: number;
  ab: number;
  h: number;
  singles: number;
  doubles: number;
  triples: number;
  hr: number;
  bb: number;
  hbp: number;
  so: number;
};

const PA_RESULTS = new Set([
  "walk",
  "hbp",
  "single",
  "double",
  "triple",
  "home_run",
  "strikeout",
  "out",
  "error",
  "double_play",
  "triple_play",
]);

function avg(h: number, ab: number) {
  return ab ? (h / ab).toFixed(3).replace(/^0/, "") : ".000";
}

function obp(stat: StatLine) {
  const denominator = stat.ab + stat.bb + stat.hbp;
  return denominator
    ? ((stat.h + stat.bb + stat.hbp) / denominator).toFixed(3).replace(/^0/, "")
    : ".000";
}

function slg(stat: StatLine) {
  if (!stat.ab) return ".000";
  const totalBases =
    stat.singles +
    stat.doubles * 2 +
    stat.triples * 3 +
    stat.hr * 4;

  return (totalBases / stat.ab).toFixed(3).replace(/^0/, "");
}

function ops(stat: StatLine) {
  const value =
    Number(obp(stat)) +
    Number(slg(stat));

  return value.toFixed(3).replace(/^0/, "");
}

export default async function GameStatsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: game } = await supabase
    .from("games")
    .select("*")
    .eq("id", id)
    .single();

  if (!game) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", game.organization_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) notFound();

  const [{ data: lineup }, { data: events }] = await Promise.all([
    game.home_team_id
      ? supabase
          .from("game_lineups")
          .select("id")
          .eq("game_id", id)
          .eq("team_id", game.home_team_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("game_events")
      .select("result,details,voided_at,sequence")
      .eq("game_id", id)
      .order("sequence"),
  ]);

  const playerIds = new Set<string>();

  for (const event of events ?? []) {
    if (event.voided_at) continue;

    const batterId =
      typeof event.details?.batter_id === "string"
        ? event.details.batter_id
        : null;

    if (batterId && PA_RESULTS.has(event.result)) {
      playerIds.add(batterId);
    }
  }

  let lineupPlayers: Array<{
    player_id: string;
    batting_order: number | null;
    first_name: string;
    last_name: string;
    jersey_number: number;
  }> = [];

  if (lineup?.id) {
    const { data } = await supabase
      .from("game_lineup_players")
      .select(`
        player_id,
        batting_order,
        players (
          first_name,
          last_name,
          jersey_number
        )
      `)
      .eq("lineup_id", lineup.id)
      .order("batting_order");

    lineupPlayers = (data ?? []).map((row) => {
      const player = Array.isArray(row.players)
        ? row.players[0]
        : row.players;

      return {
        player_id: row.player_id,
        batting_order: row.batting_order,
        first_name: player?.first_name ?? "",
        last_name: player?.last_name ?? "",
        jersey_number: player?.jersey_number ?? 0,
      };
    });
  }

  if (lineupPlayers.length === 0 && game.home_team_id) {
    const { data } = await supabase
      .from("players")
      .select("id,first_name,last_name,jersey_number")
      .eq("team_id", game.home_team_id)
      .eq("active", true)
      .order("jersey_number");

    lineupPlayers = (data ?? []).map((player) => ({
      player_id: player.id,
      batting_order: null,
      first_name: player.first_name,
      last_name: player.last_name,
      jersey_number: player.jersey_number,
    }));
  }

  const stats = new Map<string, StatLine>();

  for (const player of lineupPlayers) {
    stats.set(player.player_id, {
      playerId: player.player_id,
      name: `${player.first_name} ${player.last_name}`.trim(),
      jersey: player.jersey_number,
      order: player.batting_order,
      pa: 0,
      ab: 0,
      h: 0,
      singles: 0,
      doubles: 0,
      triples: 0,
      hr: 0,
      bb: 0,
      hbp: 0,
      so: 0,
    });
  }

  for (const event of events ?? []) {
    if (event.voided_at) continue;
    if (!PA_RESULTS.has(event.result)) continue;

    const batterId =
      typeof event.details?.batter_id === "string"
        ? event.details.batter_id
        : null;

    if (!batterId) continue;

    const stat = stats.get(batterId);
    if (!stat) continue;

    stat.pa += 1;

    switch (event.result) {
      case "walk":
        stat.bb += 1;
        break;

      case "hbp":
        stat.hbp += 1;
        break;

      case "single":
        stat.ab += 1;
        stat.h += 1;
        stat.singles += 1;
        break;

      case "double":
        stat.ab += 1;
        stat.h += 1;
        stat.doubles += 1;
        break;

      case "triple":
        stat.ab += 1;
        stat.h += 1;
        stat.triples += 1;
        break;

      case "home_run":
        stat.ab += 1;
        stat.h += 1;
        stat.hr += 1;
        break;

      case "strikeout":
        stat.ab += 1;
        stat.so += 1;
        break;

      default:
        stat.ab += 1;
        break;
    }
  }

  const rows = lineupPlayers
    .map((player) => stats.get(player.player_id))
    .filter((stat): stat is StatLine => Boolean(stat));

  return (
    <div>
      <div className="pageHead">
        <div>
          <p className="eyebrow">Game stats</p>
          <h1>{game.home_name} vs {game.away_name}</h1>
          <p className="notice">
            {game.status === "final" ? "Final" : "Live"} · {game.venue || "GameDay Field"}
          </p>
        </div>

        <div>
          <a className="button secondary" href={`/dashboard/games/${id}`}>
            Back to game
          </a>
        </div>
      </div>

      <section className="panel">
        <div className="liveLabel">Batting</div>

        {rows.length === 0 ? (
          <p className="notice">
            No batting events have been recorded for this game yet.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 10 }}>Player</th>
                  <th>PA</th>
                  <th>AB</th>
                  <th>H</th>
                  <th>1B</th>
                  <th>2B</th>
                  <th>3B</th>
                  <th>HR</th>
                  <th>BB</th>
                  <th>HBP</th>
                  <th>SO</th>
                  <th>AVG</th>
                  <th>OBP</th>
                  <th>SLG</th>
                  <th>OPS</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((stat) => (
                  <tr key={stat.playerId}>
                    <td style={{ padding: 10, fontWeight: 600 }}>
                      #{stat.jersey} {stat.name}
                    </td>
                    <td style={{ textAlign: "center" }}>{stat.pa}</td>
                    <td style={{ textAlign: "center" }}>{stat.ab}</td>
                    <td style={{ textAlign: "center" }}>{stat.h}</td>
                    <td style={{ textAlign: "center" }}>{stat.singles}</td>
                    <td style={{ textAlign: "center" }}>{stat.doubles}</td>
                    <td style={{ textAlign: "center" }}>{stat.triples}</td>
                    <td style={{ textAlign: "center" }}>{stat.hr}</td>
                    <td style={{ textAlign: "center" }}>{stat.bb}</td>
                    <td style={{ textAlign: "center" }}>{stat.hbp}</td>
                    <td style={{ textAlign: "center" }}>{stat.so}</td>
                    <td style={{ textAlign: "center" }}>{avg(stat.h, stat.ab)}</td>
                    <td style={{ textAlign: "center" }}>{obp(stat)}</td>
                    <td style={{ textAlign: "center" }}>{slg(stat)}</td>
                    <td style={{ textAlign: "center", fontWeight: 700 }}>{ops(stat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="notice" style={{ marginTop: 16 }}>
          Runs, RBI, stolen bases, and caught stealing will be added after the
          scoring events record runner attribution.
        </p>
      </section>
    </div>
  );
}
