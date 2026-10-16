"use server";

import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/auth";

export async function createGame(formData: FormData) {
  const { supabase, user, membership } = await requireMembership();

  if (!["owner", "admin", "scorekeeper"].includes(membership.role)) {
    throw new Error("You do not have permission to create games.");
  }

  const homeTeamId = String(formData.get("homeTeamId") || "").trim();
  const awayTeamId = String(formData.get("awayTeamId") || "").trim();
  let awayName = String(formData.get("awayName") || "").trim();

  if (!homeTeamId) {
    throw new Error(
      "Create a team before creating a game. Go to Teams and create your team first."
    );
  }

  const { data: homeTeam, error: homeTeamError } = await supabase
    .from("teams")
    .select("id,name")
    .eq("id", homeTeamId)
    .eq("organization_id", membership.organization_id)
    .single();

  if (homeTeamError || !homeTeam) {
    throw new Error(
      "The selected home team could not be found. Create or select a valid team."
    );
  }

  let selectedAwayTeamId: string | null = null;

  if (awayTeamId) {
    const { data: followedMembership } = await supabase
      .from("team_memberships")
      .select("team_id")
      .eq("user_id", user.id)
      .eq("team_id", awayTeamId)
      .maybeSingle();

    if (!followedMembership) {
      throw new Error("Choose a team you follow as the opponent.");
    }

    const { data: awayTeam, error: awayTeamError } = await supabase
      .from("teams")
      .select("id,name")
      .eq("id", awayTeamId)
      .single();

    if (awayTeamError || !awayTeam) {
      throw new Error("The selected opponent team could not be found.");
    }

    if (awayTeam.id === homeTeam.id) {
      throw new Error("The home team and opponent must be different.");
    }

    selectedAwayTeamId = awayTeam.id;
    awayName = awayTeam.name;
  }

  if (!awayName) {
    throw new Error("Choose a followed opponent team or enter an opponent name.");
  }

  const gameDateValue = String(formData.get("gameDate") || "").trim();

  if (!gameDateValue) {
    throw new Error("Game date and time are required.");
  }

  const gameDate = new Date(gameDateValue);

  if (Number.isNaN(gameDate.getTime())) {
    throw new Error("Please enter a valid game date and time.");
  }

  const { data, error } = await supabase
    .from("games")
    .insert({
      organization_id: membership.organization_id,
      home_team_id: homeTeam.id,
      home_name: homeTeam.name,
      away_team_id: selectedAwayTeamId,
      away_name: awayName,
      game_date: gameDate.toISOString(),
      venue: String(formData.get("venue") || "").trim(),
      visibility:
        formData.get("visibility") === "public" ? "public" : "private",
      innings_scheduled: Number(formData.get("innings") || 7),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Game could not be created.");
  }

  redirect(`/dashboard/games/${data.id}`);
}
