"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth";

export async function createTeam(formData: FormData) {
  const { supabase, membership } = await requireMembership();
  if (!['owner','admin','scorekeeper'].includes(membership.role)) throw new Error("You do not have permission to create teams.");
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Team name is required.");
  const { error } = await supabase.from("teams").insert({
    organization_id: membership.organization_id,
    name,
    short_name: String(formData.get("shortName") || "").trim().slice(0, 8),
    city: String(formData.get("city") || "").trim(),
    color: String(formData.get("color") || "#0066b2")
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/teams");
  revalidatePath("/dashboard");
}
