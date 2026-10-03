"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth";

const POSITIONS = new Set([
  "",
  "P",
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "LF",
  "CF",
  "RF",
  "DP",
  "FLEX",
]);

export async function saveLineup(gameId: string, formData: FormData) {
  const { supabase, user, membership } = await requireMembership();

  if (!["owner", "admin", "scorekeeper"].includes(membership.role)) {
    throw new Error("You do not have permission to manage this lineup.");
  }

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id, organization_id, home_team_id")
    .eq("id", gameId)
    .eq("organization_id", membership.organization_id)
    .single();

  if (gameError || !game) {
    throw new Error("Game not found.");
  }

  if (!game.home_team_id) {
    throw new Error("This game does not have a home team.");
  }

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, team_id, active")
    .eq("team_id", game.home_team_id);

  if (playersError) {
    throw new Error(playersError.message);
  }

  const validPlayers = new Map(
    (players || []).map((player) => [player.id, player])
  );

  const selected: Array<{
    player_id: string;
    batting_order: number;
    position: string;
  }> = [];

  const orders = new Set<number>();

  for (const player of players || []) {
    const rawOrder = String(formData.get(`order_${player.id}`) || "").trim();

    if (!rawOrder) {
      continue;
    }

    const battingOrder = Number(rawOrder);

    if (
      !Number.isInteger(battingOrder) ||
      battingOrder < 1 ||
      battingOrder > 20
    ) {
      throw new Error("Batting order must be between 1 and 20.");
    }

    if (orders.has(battingOrder)) {
      throw new Error(`Batting order ${battingOrder} is assigned twice.`);
    }

    orders.add(battingOrder);

    const position = String(
      formData.get(`position_${player.id}`) || ""
    ).trim();

    if (!POSITIONS.has(position)) {
      throw new Error("Invalid defensive position.");
    }

    if (!validPlayers.has(player.id)) {
      throw new Error("Invalid player selected.");
    }

    selected.push({
      player_id: player.id,
      batting_order: battingOrder,
      position,
    });
  }

  selected.sort((a, b) => a.batting_order - b.batting_order);

  const { data: lineup, error: lineupError } = await supabase
    .from("game_lineups")
    .upsert(
      {
        game_id: game.id,
        team_id: game.home_team_id,
      },
      {
        onConflict: "game_id,team_id",
      }
    )
    .select("id")
    .single();

  if (lineupError || !lineup) {
    throw new Error(lineupError?.message || "Could not save lineup.");
  }

  const { error: deleteError } = await supabase
    .from("game_lineup_players")
    .delete()
    .eq("lineup_id", lineup.id);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (selected.length > 0) {
    const { error: insertError } = await supabase
      .from("game_lineup_players")
      .insert(
        selected.map((player) => ({
          lineup_id: lineup.id,
          player_id: player.player_id,
          batting_order: player.batting_order,
          position: player.position,
          starter: true,
          active: true,
          entered_at: new Date().toISOString(),
        }))
      );

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  revalidatePath(`/dashboard/games/${game.id}`);
  revalidatePath(`/dashboard/games/${game.id}/lineup`);

  return { success: true, count: selected.length };
}
