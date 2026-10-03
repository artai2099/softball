import { AppShell } from "@/components/AppShell";
import {
  requireUser,
  getOrganizationMembership,
} from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireUser();
  const { supabase, membership } =
    await getOrganizationMembership();

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, organizations(name)")
    .eq("user_id", user.id)
    .order("created_at");

  const organizations = (memberships || []).map((item) => {
    const org = item.organizations as
      | { name?: string }
      | { name?: string }[]
      | null;

    const name = Array.isArray(org)
      ? org[0]?.name
      : org?.name;

    return {
      id: item.organization_id,
      name: name || "Organization",
    };
  });

  return (
    <AppShell
      userName={String(
        user.user_metadata?.display_name ||
          user.email ||
          "Account",
      )}
      organizations={organizations}
      activeOrganization={membership?.organization_id || ""}
      hasOrganizationMembership={Boolean(membership)}
    >
      {children}
    </AppShell>
  );
}
