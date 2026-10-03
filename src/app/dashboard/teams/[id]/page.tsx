import Link from "next/link";
import {
  addPlayer,
  deleteTeam,
  leaveTeam,
  requestTeamAccess,
  setTeamJoinable,
} from "./actions";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TeamMember = {
  id: string;
  user_id: string;
  role: string;
  display_name: string;
};

export default async function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  const { data: team } = await supabase
    .from("teams")
    .select(
      "id, name, short_name, city, color, organization_id, allow_self_join",
    )
    .eq("id", id)
    .single();

  if (!team) {
    return (
      <section className="card">
        <h1>Team not found</h1>
        <p className="muted">
          This team does not exist or you do not have access to it.
        </p>
        <Link href="/dashboard/teams" className="button secondary">
          Back to Teams
        </Link>
      </section>
    );
  }

  const [
    { data: players },
    { data: currentMembership },
    { data: pendingRequest },
    { data: members },
    { data: orgMembership },
  ] = await Promise.all([
    supabase
      .from("players")
      .select(
        "id, first_name, last_name, jersey_number, position, active",
      )
      .eq("team_id", id)
      .order("jersey_number"),

    supabase
      .from("team_memberships")
      .select("id, role")
      .eq("team_id", id)
      .eq("user_id", user.id)
      .maybeSingle(),

    supabase
      .from("team_access_requests")
      .select("id, status")
      .eq("team_id", id)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle(),

    supabase.rpc("get_team_members", {
      p_team_id: id,
    }),

    supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", team.organization_id)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const typedMembers = (members ?? []) as TeamMember[];

  const isOrgManager = ["owner", "admin"].includes(
    orgMembership?.role ?? "",
  );

  const isTeamManager =
    currentMembership?.role === "manager";

  const canManageTeam =
    isOrgManager || isTeamManager;

  const canDeleteTeam =
    isOrgManager || isTeamManager;

  return (
    <>
      <div className="pageHead">
        <div>
          <p className="eyebrow">Team</p>
          <h1>{team.name}</h1>
          <p className="muted">
            {team.city || "City not set"}
            {team.short_name
              ? ` · ${team.short_name}`
              : ""}
          </p>
        </div>

        <Link
          href="/dashboard/teams"
          className="button secondary"
        >
          All Teams
        </Link>
      </div>

      <section
        className="card"
        style={{
          marginBottom: 18,
          borderColor: "#3b4250",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p className="eyebrow">TEAM ACTIONS</p>
            <h2 style={{ marginBottom: 6 }}>
              Manage this team
            </h2>
            <p className="muted">
              {currentMembership
                ? `Your team access: ${currentMembership.role}`
                : "You are not currently a team member."}
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {currentMembership && (
              <form action={leaveTeam.bind(null, id)}>
                <button
                  type="submit"
                  className="button secondary"
                >
                  Leave Team
                </button>
              </form>
            )}

            {canDeleteTeam && (
              <form action={deleteTeam.bind(null, id)}>
                <button
                  type="submit"
                  className="button"
                  style={{
                    background: "#3b0b16",
                    borderColor: "#7f1d35",
                    color: "#ffb4c5",
                  }}
                >
                  Delete Team
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {canManageTeam && (
        <section
          className="card"
          style={{ marginBottom: 18 }}
        >
          <p className="eyebrow">TEAM DIRECTORY</p>

          <h2>
            Allow users to find and join this team
          </h2>

          <p
            className="muted"
            style={{ marginBottom: 14 }}
          >
            When enabled, this team appears in Find a
            Team and signed-in users can join immediately
            as viewers.
          </p>

          <form
            action={setTeamJoinable.bind(null, id)}
          >
            <input
              type="hidden"
              name="enabled"
              value={
                team.allow_self_join
                  ? "false"
                  : "true"
              }
            />

            <button
              className="button primary"
              type="submit"
            >
              {team.allow_self_join
                ? "Stop accepting new members"
                : "Allow users to find and join"}
            </button>
          </form>

          <p
            className="muted"
            style={{ marginTop: 10 }}
          >
            Status:{" "}
            <strong>
              {team.allow_self_join
                ? "Accepting new members"
                : "Not listed in the team directory"}
            </strong>
          </p>
        </section>
      )}

      {canManageTeam && (
        <section
          className="card"
          style={{ marginBottom: 18 }}
        >
          <p className="eyebrow">ROSTER</p>

          <h2>Add Player</h2>

          <form
            action={addPlayer.bind(null, id)}
            className="form"
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(180px,1fr))",
              gap: 12,
            }}
          >
            <label>
              First name
              <input
                name="firstName"
                required
              />
            </label>

            <label>
              Last name
              <input
                name="lastName"
                required
              />
            </label>

            <label>
              Jersey #
              <input
                name="jerseyNumber"
                type="number"
                min="0"
                max="999"
                required
              />
            </label>

            <label>
              Position
              <input
                name="position"
                placeholder="SS, CF, P..."
              />
            </label>

            <div
              style={{
                display: "flex",
                alignItems: "end",
              }}
            >
              <button
                className="button primary"
                type="submit"
              >
                Add Player
              </button>
            </div>
          </form>
        </section>
      )}

      {!currentMembership &&
        pendingRequest &&
        !team.allow_self_join && (
          <section
            className="card"
            style={{ marginBottom: 18 }}
          >
            <p className="eyebrow">ACCESS</p>

            <h2>Request pending</h2>

            <p className="muted">
              Your request to join this team is
              waiting for approval.
            </p>
          </section>
        )}

      {!currentMembership &&
        !pendingRequest &&
        !team.allow_self_join &&
        !orgMembership && (
          <section
            className="card"
            style={{ marginBottom: 18 }}
          >
            <p className="eyebrow">ACCESS</p>

            <h2>Join this team</h2>

            <p className="muted">
              This team is not currently accepting
              direct membership. You can request access
              from the team manager.
            </p>

            <form
              action={requestTeamAccess.bind(null, id)}
            >
              <button
                className="button primary"
                type="submit"
              >
                Request Access
              </button>
            </form>
          </section>
        )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(0,1fr) minmax(0,1fr)",
          gap: 18,
        }}
      >
        <section className="card">
          <p className="eyebrow">TEAM MEMBERS</p>

          <h2>Team Members</h2>

          {typedMembers.length ? (
            <div>
              {typedMembers.map((member) => (
                <div
                  key={member.id}
                  style={{
                    padding: "12px 0",
                    borderBottom:
                      "1px solid #2b3038",
                    display: "flex",
                    justifyContent:
                      "space-between",
                    gap: 12,
                  }}
                >
                  <strong>
                    {member.display_name ||
                      "Team member"}
                  </strong>

                  <span className="muted">
                    {member.role}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              No team members yet.
            </p>
          )}
        </section>

        <section className="card">
          <p className="eyebrow">PLAYERS</p>

          <h2>Players</h2>

          {players?.length ? (
            <div>
              {players.map((player) => (
                <div
                  key={player.id}
                  style={{
                    padding: "12px 0",
                    borderBottom:
                      "1px solid #2b3038",
                    display: "flex",
                    justifyContent:
                      "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    <strong>
                      #{player.jersey_number}{" "}
                      {player.first_name}{" "}
                      {player.last_name}
                    </strong>

                    <div className="muted">
                      {player.position ||
                        "Position not set"}
                      {!player.active
                        ? " · Inactive"
                        : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              No players on the roster.
            </p>
          )}
        </section>
      </div>

      <style>{`
        @media (max-width: 800px) {
          .pageHead {
            gap: 12px;
          }
        }

        @media (max-width: 760px) {
          .card {
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}
