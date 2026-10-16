import { notFound } from "next/navigation";
import Link from "next/link";
import { ScoringConsole } from "@/components/ScoringConsole";
import { createClient } from "@/lib/supabase/server";
import type { Game, GameEvent, GameLineupPlayerView } from "@/lib/types";

export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: game }, { data: events }] = await Promise.all([
    supabase.from("games").select("*").eq("id", id).single(),
    supabase
      .from("game_events")
      .select("*")
      .eq("game_id", id)
      .order("sequence"),
  ]);

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

  const organizationCanScore = Boolean(
    membership &&
      ["owner", "admin", "scorekeeper"].includes(membership.role),
  );

  const teamIds = [game.home_team_id, game.away_team_id].filter(
    (teamId): teamId is string => Boolean(teamId),
  );

  let teamManagerCanScore = false;

  if (teamIds.length > 0) {
    const { data: teamMemberships } = await supabase
      .from("team_memberships")
      .select("team_id, role")
      .eq("user_id", user.id)
      .in("team_id", teamIds);

    teamManagerCanScore = Boolean(
      teamMemberships?.some((member) => member.role === "manager"),
    );
  }

  const canScore = organizationCanScore || teamManagerCanScore;

  async function loadLineup(teamId: string | null): Promise<GameLineupPlayerView[]> {
    if (!teamId) return [];
    const { data: lineup } = await supabase.from("game_lineups").select("id").eq("game_id", game.id).eq("team_id", teamId).maybeSingle();
    if (!lineup) return [];
    const { data: lineupPlayers } = await supabase.from("game_lineup_players").select("*").eq("lineup_id", lineup.id).order("batting_order", { ascending: true });
    const playerIds = (lineupPlayers || []).map((player) => player.player_id);
    if (playerIds.length === 0) return [];
    const { data: playerRows } = await supabase.from("players").select("id, first_name, last_name, jersey_number").in("id", playerIds);
    const playerMap = new Map((playerRows || []).map((player) => [player.id, player]));
    return (lineupPlayers || []).map((lineupPlayer) => {
      const player = playerMap.get(lineupPlayer.player_id);
      return player ? { ...lineupPlayer, first_name: player.first_name, last_name: player.last_name, jersey_number: player.jersey_number } : null;
    }).filter((player): player is GameLineupPlayerView => player !== null);
  }

  let initialLineup: GameLineupPlayerView[] = [];
  let initialAwayLineup: GameLineupPlayerView[] = [];

  [initialLineup, initialAwayLineup] = await Promise.all([loadLineup(game.home_team_id), loadLineup(game.away_team_id)]);

  return (
    <>
      {canScore && game.status === "scheduled" && (
        <section className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <p className="eyebrow" style={{ marginBottom: 5 }}>Before first pitch</p>
            <h2 style={{ margin: 0 }}>Review your starting lineup</h2>
            <p className="muted" style={{ marginBottom: 0, marginTop: 5 }}>Set batting order and defensive positions before scoring begins.</p>
          </div>
          <Link className="button red" href={`/dashboard/games/${game.id}/lineup`}>Edit lineup</Link>
        </section>
      )}
    <ScoringConsole
      initialGame={game as Game}
      initialEvents={(events || []) as GameEvent[]}
      initialLineup={initialLineup}
      initialAwayLineup={initialAwayLineup}
      canScore={canScore}
    />
    </>
  );
}
