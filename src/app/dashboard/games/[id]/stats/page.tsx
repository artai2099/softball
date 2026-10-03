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
  const d = stat.ab + stat.bb + stat.hbp;
  return d
    ? ((stat.h + stat.bb + stat.hbp) / d).toFixed(3).replace(/^0/, "")
    : ".000";
}

function slg(stat: StatLine) {
  if (!stat.ab) return ".000";

  const bases =
    stat.singles +
    stat.doubles * 2 +
    stat.triples * 3 +
    stat.hr * 4;

  return (bases / stat.ab).toFixed(3).replace(/^0/, "");
}

function ops(stat: StatLine) {
  return (Number(obp(stat)) + Number(slg(stat)))
    .toFixed(3)
    .replace(/^0/, "");
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
        players(
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

    lineupPlayers = (data ?? []).map((p) => ({
      player_id: p.id,
      batting_order: null,
      first_name: p.first_name,
      last_name: p.last_name,
      jersey_number: p.jersey_number,
    }));
  }

  const stats = new Map<string, StatLine>();

  lineupPlayers.forEach((p) => {
    stats.set(p.player_id, {
      playerId: p.player_id,
      name: `${p.first_name} ${p.last_name}`.trim(),
      jersey: p.jersey_number,
      order: p.batting_order,
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
  });

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

    stat.pa++;

    switch (event.result) {
      case "walk":
        stat.bb++;
        break;

      case "hbp":
        stat.hbp++;
        break;

      case "single":
        stat.ab++;
        stat.h++;
        stat.singles++;
        break;

      case "double":
        stat.ab++;
        stat.h++;
        stat.doubles++;
        break;

      case "triple":
        stat.ab++;
        stat.h++;
        stat.triples++;
        break;

      case "home_run":
        stat.ab++;
        stat.h++;
        stat.hr++;
        break;

      case "strikeout":
        stat.ab++;
        stat.so++;
        break;

      default:
        stat.ab++;
    }
  }

  const rows = lineupPlayers
    .map((p) => stats.get(p.player_id))
    .filter((x): x is StatLine => Boolean(x));

  return (
    <div className="livePage">

      <div className="pageHead">
        <div>
          <p className="eyebrow">Game Stats</p>
          <h1>
            {game.home_name} vs {game.away_name}
          </h1>
          <p className="notice">
            {game.status === "final" ? "Final" : "Live"}
          </p>
        </div>

        <a className="button secondary" href={`/dashboard/games/${id}`}>
          Back to Game
        </a>
      </div>


      <div className="panel">

        <nav style={{display:"flex",gap:12,marginBottom:20}}>
          <button className="button">
            Overview
          </button>

          <button className="button secondary">
            Batting
          </button>

          <button className="button secondary">
            Pitching
          </button>

          <button className="button secondary">
            Fielding
          </button>
        </nav>


        <h2>Batting</h2>

        <div style={{overflowX:"auto"}}>

          <table style={{width:"100%",minWidth:1100}}>
            <thead>
              <tr>
                <th>Player</th>
                <th>PA</th>
                <th>AB</th>
                <th>H</th>
                <th>1B</th>
                <th>2B</th>
                <th>3B</th>
                <th>HR</th>
                <th>BB</th>
                <th>SO</th>
                <th>AVG</th>
                <th>OBP</th>
                <th>SLG</th>
                <th>OPS</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((s)=>(
                <tr key={s.playerId}>
                  <td>
                    #{s.jersey} {s.name}
                  </td>
                  <td>{s.pa}</td>
                  <td>{s.ab}</td>
                  <td>{s.h}</td>
                  <td>{s.singles}</td>
                  <td>{s.doubles}</td>
                  <td>{s.triples}</td>
                  <td>{s.hr}</td>
                  <td>{s.bb}</td>
                  <td>{s.so}</td>
                  <td>{avg(s.h,s.ab)}</td>
                  <td>{obp(s)}</td>
                  <td>{slg(s)}</td>
                  <td>{ops(s)}</td>
                </tr>
              ))}
            </tbody>

          </table>

        </div>


        <hr />

        <h2>Pitching</h2>
        <p className="notice">
          Pitching stats will be available after pitcher tracking is added.
        </p>


        <h2>Fielding</h2>
        <p className="notice">
          Fielding stats will be available after defensive play tracking is added.
        </p>

      </div>

    </div>
  );
}
