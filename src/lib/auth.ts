import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function requireMembership() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const cookieStore=await cookies();
  const activeOrganization=cookieStore.get("gameday_org")?.value;
  let query=supabase
    .from("organization_members")
    .select("organization_id,role,organizations(name)")
    .eq("user_id", user.id);
  if(activeOrganization)query=query.eq("organization_id",activeOrganization);
  let {data:membership,error}=await query.order("created_at").limit(1).maybeSingle();
  if(!membership&&activeOrganization){
    const fallback=await supabase.from("organization_members").select("organization_id,role,organizations(name)").eq("user_id",user.id).order("created_at").limit(1).single();
    membership=fallback.data;error=fallback.error;
  }
  if (error || !membership) throw new Error("Your organization membership could not be loaded.");
  return { supabase, user, membership };
}
