import Link from "next/link";
import { createGame } from "./actions";
import { requireMembership } from "@/lib/auth";

export default async function NewGamePage() {
  const { supabase, membership } = await requireMembership();

  const { data: teams } = await supabase
    .from("teams")
    .select("id,name")
    .eq("organization_id", membership.organization_id)
    .order("name");

  const hasTeams = Boolean(teams?.length);

  return (
    <>
      <div className="pageHead">
        <div>
          <p className="eyebrow">Schedule</p>
          <h1>New game</h1>
        </div>
      </div>

      {!hasTeams ? (
        <section className="card" style={{ maxWidth: 720 }}>
          <div
            style={{
              border: "1px solid #d9dee7",
              borderRadius: 12,
              padding: 24,
              background: "#fff",
            }}
          >
            <p className="eyebrow" style={{ marginBottom: 8 }}>
              First game setup
            </p>

            <h2 style={{ marginTop: 0, marginBottom: 10 }}>
              Create your team first
            </h2>

            <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
              Before you can create a game, GameDay needs a team to use as your
              home team. Create your team first, then come back here to schedule
              the game.
            </p>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 20,
              }}
            >
              <Link href="/dashboard/teams" className="button primary">
                Create Team
              </Link>

              <Link href="/dashboard/games" className="button secondary">
                Back to Games
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="card">
          <form action={createGame} className="form">
            <label>
              Home team
              <select name="homeTeamId" required>
                {teams?.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Opponent
              <input name="awayName" required />
            </label>

            <label>
              Date and time
              <input name="gameDate" type="datetime-local" required />
            </label>

            <label>
              Venue
              <input name="venue" />
            </label>

            <label>
              Innings
              <select name="innings" defaultValue="7">
                {[5, 6, 7, 8, 9].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Visibility
              <select name="visibility" defaultValue="private">
                <option value="private">Private organization game</option>
                <option value="public">Public score and video page</option>
              </select>
            </label>

            <button className="button red" type="submit">
              Create game
            </button>
          </form>
        </section>
      )}
    </>
  );
}
