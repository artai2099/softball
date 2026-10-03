import { notFound } from "next/navigation";
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

  let initialLineup: GameLineupPlayerView[] = [];

  if (game.home_team_id) {
    const { data: lineup } = await supabase
      .from("game_lineups")
      .select("id")
      .eq("game_id", game.id)
      .eq("team_id", game.home_team_id)
      .maybeSingle();

    if (lineup) {
      const { data: lineupPlayers } = await supabase
        .from("game_lineup_players")
        .select("*")
        .eq("lineup_id", lineup.id)
        .order("batting_order", { ascending: true });

      const playerIds = (lineupPlayers || []).map((player) => player.player_id);

      if (playerIds.length > 0) {
        const { data: playerRows } = await supabase
          .from("players")
          .select("id, first_name, last_name, jersey_number")
          .in("id", playerIds);

        const playerMap = new Map(
          (playerRows || []).map((player) => [player.id, player]),
        );

        initialLineup = (lineupPlayers || [])
          .map((lineupPlayer) => {
            const player = playerMap.get(lineupPlayer.player_id);

            if (!player) {
              return null;
            }

            return {
              ...lineupPlayer,
              first_name: player.first_name,
              last_name: player.last_name,
              jersey_number: player.jersey_number,
            };
          })
          .filter(
            (player): player is GameLineupPlayerView => player !== null,
          );
      }
    }
  }

  return (
    <ScoringConsole
      initialGame={game as Game}
      initialEvents={(events || []) as GameEvent[]}
      initialLineup={initialLineup}
      canScore={canScore}
    />
  );
}
