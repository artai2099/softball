"use server";

import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/auth";

export async function createGame(formData: FormData) {
  const { supabase, user, membership } = await requireMembership();
  if (!['owner','admin','scorekeeper'].includes(membership.role)) throw new Error("You do not have permission to create games.");
  const homeTeamId = String(formData.get("homeTeamId") || "");
  const awayName = String(formData.get("awayName") || "").trim();
  const { data: homeTeam } = await supabase.from("teams").select("id,name").eq("id", homeTeamId).eq("organization_id", membership.organization_id).single();
  if (!homeTeam || !awayName) throw new Error("A valid home team and opponent are required.");
  const { data, error } = await supabase.from("games").insert({
    organization_id: membership.organization_id,
    home_team_id: homeTeamId || null,
    home_name: homeTeam.name,
    away_name: awayName,
    game_date: new Date(String(formData.get("gameDate"))).toISOString(),
    venue: String(formData.get("venue") || "").trim(),
    visibility: formData.get("visibility") === "public" ? "public" : "private",
    innings_scheduled: Number(formData.get("innings") || 7),
    created_by: user.id
  }).select("id").single();
  if (error || !data) throw new Error(error?.message || "Game could not be created.");
  redirect(`/dashboard/games/${data.id}`);
}
