import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  calculateGameStats,
  obp,
  ops,
  rate,
  slg,
  type GameEvent,
  type Player,
  type StatLine,
  type TeamBox,
} from "@/lib/stats/gameStats";

async function loadPlayers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  gameId: string,
  teamId: string | null,
) {
  if (!teamId) return [] as Player[];

  const { data: lineup } = await supabase
    .from("game_lineups")
    .select("id")
    .eq("game_id", gameId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (lineup?.id) {
    const { data } = await supabase
      .from("game_lineup_players")
      .select(`player_id,batting_order,players(first_name,last_name,jersey_number)`)
      .eq("lineup_id", lineup.id)
      .order("batting_order");

    return (data ?? []).map((row: any) => {
      const p = Array.isArray(row.players) ? row.players[0] : row.players;
      return {
        player_id: row.player_id,
        batting_order: row.batting_order,
        first_name: p?.first_name ?? "",
        last_name: p?.last_name ?? "",
        jersey_number: p?.jersey_number ?? 0,
      };
    });
  }

  const { data } = await supabase
    .from("players")
    .select("id,first_name,last_name,jersey_number")
    .eq("team_id", teamId)
    .eq("active", true)
    .order("jersey_number");

  return (data ?? []).map((p: any) => ({
    player_id: p.id,
    batting_order: null,
    first_name: p.first_name,
    last_name: p.last_name,
    jersey_number: p.jersey_number,
  }));
}

function StatTable({ team, name }: { team: TeamBox; name: string }) {
  const totals: StatLine = team.rows.reduce(
    (t, s) => ({
      ...t,
      pa: t.pa + s.pa,
      ab: t.ab + s.ab,
      r: t.r + s.r,
      h: t.h + s.h,
      singles: t.singles + s.singles,
      doubles: t.doubles + s.doubles,
      triples: t.triples + s.triples,
      hr: t.hr + s.hr,
      rbi: t.rbi + s.rbi,
      bb: t.bb + s.bb,
      hbp: t.hbp + s.hbp,
      so: t.so + s.so,
      sb: 0,
      cs: 0,
      sf: 0,
      playerId: "team",
      name: "TEAM TOTAL",
      jersey: 0,
      order: null,
    }),
    {
      playerId: "team", name: "TEAM TOTAL", jersey: 0, order: null,
      pa: 0, ab: 0, r: 0, h: 0, singles: 0, doubles: 0, triples: 0,
      hr: 0, rbi: 0, bb: 0, hbp: 0, so: 0, sb: 0, cs: 0, sf: 0,
    },
  );

  return (
    <section className="panel" id={name.toLowerCase().replace(/\s+/g, "-")}>
      <div className="pageHead">
        <div>
          <p className="eyebrow">Batting</p>
          <h2>{name}</h2>
        </div>
        <span className="notice">{team.rows.length} players</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 1450 }}>
          <thead>
            <tr>
              <th>Player</th><th>PA</th><th>AB</th><th>R</th><th>H</th>
              <th>1B</th><th>2B</th><th>3B</th><th>HR</th><th>RBI</th>
              <th>BB</th><th>HBP</th><th>SO</th><th>AVG</th>
              <th>OBP</th><th>SLG</th><th>OPS</th>
            </tr>
          </thead>
          <tbody>
            {team.rows.map((s) => (
              <tr key={s.playerId}>
                <td><strong>#{s.jersey} {s.name}</strong></td>
                <td>{s.pa}</td><td>{s.ab}</td><td>{s.r}</td><td>{s.h}</td>
                <td>{s.singles}</td><td>{s.doubles}</td><td>{s.triples}</td><td>{s.hr}</td>
                <td>{s.rbi}</td><td>{s.bb}</td><td>{s.hbp}</td><td>{s.so}</td>
                <td>{rate(s.h, s.ab)}</td><td>{obp(s)}</td><td>{slg(s)}</td><td>{ops(s)}</td>
              </tr>
            ))}
            <tr>
              <td><strong>TEAM TOTAL</strong></td>
              <td>{totals.pa}</td><td>{totals.ab}</td><td>{totals.r}</td><td>{totals.h}</td>
              <td>{totals.singles}</td><td>{totals.doubles}</td><td>{totals.triples}</td><td>{totals.hr}</td>
              <td>{totals.rbi}</td><td>{totals.bb}</td><td>{totals.hbp}</td><td>{totals.so}</td>
              <td>{rate(totals.h, totals.ab)}</td><td>{obp(totals)}</td><td>{slg(totals)}</td><td>{ops(totals)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Linescore({ home, away, homeName, awayName }: {
  home: TeamBox;
  away: TeamBox;
  homeName: string;
  awayName: string;
}) {
  const innings = Math.max(home.runsByInning.length, away.runsByInning.length, 1);
  return (
    <section className="panel" id="linescore">
      <div className="pageHead">
        <div>
          <p className="eyebrow">Box Score</p>
          <h2>Linescore</h2>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 720 }}>
          <thead>
            <tr>
              <th>Team</th>
              {Array.from({ length: innings }, (_, i) => <th key={i}>{i + 1}</th>)}
              <th>R</th><th>H</th><th>E</th><th>LOB</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>{awayName}</strong></td>
              {Array.from({ length: innings }, (_, i) => <td key={i}>{away.runsByInning[i] ?? 0}</td>)}
              <td>{away.runs}</td><td>{away.hits}</td><td>{away.errors}</td><td>{away.lob}</td>
            </tr>
            <tr>
              <td><strong>{homeName}</strong></td>
              {Array.from({ length: innings }, (_, i) => <td key={i}>{home.runsByInning[i] ?? 0}</td>)}
              <td>{home.runs}</td><td>{home.hits}</td><td>{home.errors}</td><td>{home.lob}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function GameStatsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: game } = await supabase.from("games").select("*").eq("id", id).single();
  if (!game) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", game.organization_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) notFound();

  const [{ data: events }, homePlayers, awayPlayers] = await Promise.all([
    supabase.from("game_events").select("result,details,voided_at,sequence").eq("game_id", id).order("sequence"),
    loadPlayers(supabase, id, game.home_team_id),
    loadPlayers(supabase, id, game.away_team_id),
  ]);

  const stats = calculateGameStats(
    homePlayers,
    awayPlayers,
    (events ?? []) as GameEvent[],
  );

  const homeName = game.home_name ?? "Home";
  const awayName = game.away_name ?? "Away";
  const final = game.status === "final";
  const scoreText = `${awayName} ${game.away_score ?? 0} - ${game.home_score ?? 0} ${homeName}`;

  return (
    <div className="livePage">
      <div className="pageHead">
        <div>
          <p className="eyebrow">GameDay Pro • Statistics</p>
          <h1>{scoreText}</h1>
          <p className="notice">
            {final ? "Final" : "Live"} • Game statistics
          </p>
        </div>
        <a className="button secondary" href={`/dashboard/games/${id}`}>Back to Game</a>
      </div>

      <section className="panel">
        <nav style={{ display: "flex", gap: 10, flexWrap: "wrap" }} aria-label="Statistics sections">
          <a className="button" href="#linescore">Overview</a>
          <a className="button secondary" href={`#${awayName.toLowerCase().replace(/\s+/g, "-")}`}>Batting</a>
          <a className="button secondary" href="#pitching">Pitching</a>
          <a className="button secondary" href="#fielding">Fielding</a>
        </nav>
      </section>

      <Linescore home={stats.home} away={stats.away} homeName={homeName} awayName={awayName} />

      <StatTable team={stats.away} name={awayName} />
      <StatTable team={stats.home} name={homeName} />

      <section className="panel" id="pitching">
        <p className="eyebrow">Pitching</p>
        <h2>Pitching</h2>
        <p className="notice">
          Player pitching is not shown yet because the current event model does not store the pitcher for each plate appearance. Game pitch count remains available on the game record.
        </p>
      </section>

      <section className="panel" id="fielding">
        <p className="eyebrow">Fielding</p>
        <h2>Fielding</h2>
        <p className="notice">
          Defensive positions and error events are recorded, but the current model does not yet identify the individual fielder receiving every putout/assist. No individual fielding totals are fabricated.
        </p>
      </section>
    </div>
  );
}
