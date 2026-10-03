import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, user };
}

export async function getOrganizationMembership() {
  const { supabase, user } = await requireUser();

  const cookieStore = await cookies();
  const activeOrganization = cookieStore.get("gameday_org")?.value;

  let query = supabase
    .from("organization_members")
    .select("organization_id,role,organizations(name)")
    .eq("user_id", user.id);

  if (activeOrganization) {
    query = query.eq("organization_id", activeOrganization);
  }

  let { data: membership, error } = await query
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!membership && activeOrganization) {
    const fallback = await supabase
      .from("organization_members")
      .select("organization_id,role,organizations(name)")
      .eq("user_id", user.id)
      .order("created_at")
      .limit(1)
      .single();

    membership = fallback.data;
    error = fallback.error;
  }

  return {
    supabase,
    user,
    membership,
    error,
  };
}

export async function requireMembership() {
  const result = await getOrganizationMembership();

  if (result.error || !result.membership) {
    throw new Error(
      "Your organization membership could not be loaded.",
    );
  }

  return {
    supabase: result.supabase,
    user: result.user,
    membership: result.membership,
  };
}
