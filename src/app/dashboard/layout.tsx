import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireMembership } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const {supabase,user,membership}=await requireMembership();
  if (!user) redirect("/login");
  const {data:memberships}=await supabase.from("organization_members").select("organization_id,organizations(name)").eq("user_id",user.id).order("created_at");
  const organizations=(memberships||[]).map(item=>({id:item.organization_id,name:(Array.isArray(item.organizations)?item.organizations[0]?.name:item.organizations?.name)||"Organization"}));
  return <AppShell userName={String(user.user_metadata?.display_name || user.email || "Account")} organizations={organizations} activeOrganization={membership.organization_id}>{children}</AppShell>;
}
