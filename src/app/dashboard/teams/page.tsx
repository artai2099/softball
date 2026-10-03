import Link from "next/link";
import { createTeam } from "./actions";
import { requireMembership } from "@/lib/auth";

export default async function TeamsPage() {
  const { supabase, membership, user } = await requireMembership();

  const { data: memberships } = await supabase
    .from("team_memberships")
    .select("team_id")
    .eq("user_id", user.id);

  const teamIds = (memberships ?? []).map((item) => item.team_id);

  const { data: teams } = teamIds.length
    ? await supabase
        .from("teams")
        .select("*,players(count)")
        .in("id", teamIds)
        .order("name")
    : { data: [] };

  const canCreateTeam = ["owner", "admin"].includes(membership.role);

  return (
    <>
      <div className="pageHead">
        <div>
          <p className="eyebrow">Roster management</p>
          <h1>Teams</h1>
        </div>

        <Link href="/dashboard/teams/find" className="button">
          Find a Team
        </Link>
      </div>

      {canCreateTeam && (
        <section className="card">
          <h2>Create a team</h2>

          <form action={createTeam} className="form">
            <label>
              Team name
              <input name="name" required />
            </label>

            <label>
              Short name
              <input name="shortName" maxLength={8} />
            </label>

            <label>
              City
              <input name="city" />
            </label>

            <label>
              Team color
              <input
                name="color"
                type="color"
                defaultValue="#0066b2"
              />
            </label>

            <button className="button primary">
              Create team
            </button>
          </form>
        </section>
      )}

      <section className="grid" style={{ marginTop: 18 }}>
        {teams?.length ? (
          teams.map((team) => (
            <Link
              href={`/dashboard/teams/${team.id}`}
              className="card"
              key={team.id}
            >
              <div
                className="teamCode"
                style={{ background: team.color || "#0066b2" }}
              >
                {team.short_name ||
                  team.name.slice(0, 3).toUpperCase()}
              </div>

              <h2 style={{ marginTop: 12 }}>
                {team.name}
              </h2>

              <p className="muted">
                {team.city || "City not set"} ·{" "}
                {team.players?.[0]?.count || 0} players
              </p>
            </Link>
          ))
        ) : (
          <div className="empty">
            You are not a member of any teams yet.
          </div>
        )}
      </section>
    </>
  );
}
