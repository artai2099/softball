"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth";

export async function addPlayer(teamId: string, formData: FormData) {
  const { supabase, membership } = await requireMembership();
  if (!['owner','admin','scorekeeper'].includes(membership.role)) throw new Error("You do not have permission to edit this roster.");
  const { data: team } = await supabase.from("teams").select("id").eq("id", teamId).eq("organization_id", membership.organization_id).single();
  if (!team) throw new Error("Team not found.");
  const { error } = await supabase.from("players").insert({
    team_id: teamId,
    first_name: String(formData.get("firstName") || "").trim(),
    last_name: String(formData.get("lastName") || "").trim(),
    jersey_number: Number(formData.get("jerseyNumber")),
    position: String(formData.get("position") || "").trim()
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/teams/${teamId}`);
}
