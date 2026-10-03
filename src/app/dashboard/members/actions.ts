"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMembership } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "scorekeeper", "viewer"]),
});

export async function addMember(formData: FormData) {
  const { supabase, membership } = await requireMembership();

  const parsed = schema.safeParse({
    email: String(formData.get("email") || "").trim(),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    throw new Error("Enter a valid email and role.");
  }

  const { error } = await supabase.rpc("add_org_member_by_email", {
    p_organization_id: membership.organization_id,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/members");
}

export async function leaveOrganization() {
  const { supabase, membership } = await requireMembership();

  const organizationId = membership.organization_id;

  const { error } = await supabase.rpc("leave_organization", {
    p_organization_id: organizationId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const cookieStore = await cookies();
  const activeOrganization = cookieStore.get("gameday_org")?.value;

  if (activeOrganization === organizationId) {
    cookieStore.delete("gameday_org");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/teams");
  revalidatePath("/dashboard/teams/find");
  revalidatePath("/dashboard/members");

  redirect("/dashboard");
}
