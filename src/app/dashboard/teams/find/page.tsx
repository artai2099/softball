import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { joinTeam } from "../actions";

type SearchParams = {
  q?: string;
};

type JoinableTeam = {
  id: string;
  name: string;
  short_name: string | null;
  city: string | null;
  color: string | null;
  player_count: number | null;
};

export default async function FindTeamPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { supabase } = await requireUser();
  const params = await searchParams;
  const query = String(params.q || "").trim();

  const { data, error } = await supabase.rpc("find_joinable_teams", {
    p_search: query,
  });

  const teams = (data ?? []) as JoinableTeam[];

  return (
    <>
      <div className="pageHead">
        <div>
          <p className="eyebrow">Team directory</p>
          <h1>Find a Team</h1>
          <p className="muted">
            Search for teams that are accepting new members.
          </p>
        </div>

        <Link href="/dashboard/teams" className="button">
          My Teams
        </Link>
      </div>

      <section className="card">
        <form method="get" className="form">
          <label>
            Search by team name, short name, or city
            <input
              name="q"
              defaultValue={query}
              placeholder="e.g. Wildcats"
              autoComplete="off"
            />
          </label>

          <div>
            <button className="button primary" type="submit">
              Search
            </button>

            {query && (
              <Link
                href="/dashboard/teams/find"
                className="button"
                style={{ marginLeft: 8 }}
              >
                Clear
              </Link>
            )}
          </div>
        </form>
      </section>

      <section className="grid" style={{ marginTop: 18 }}>
        {error ? (
          <div className="card">
            <h2>Unable to search teams</h2>
            <p className="muted">{error.message}</p>
          </div>
        ) : teams.length ? (
          teams.map((team) => (
            <div className="card" key={team.id}>
              <div
                className="teamCode"
                style={{ background: team.color || "#0066b2" }}
              >
                {team.short_name || team.name.slice(0, 3).toUpperCase()}
              </div>

              <h2 style={{ marginTop: 12 }}>{team.name}</h2>

              <p className="muted">
                {team.city || "City not set"} · {team.player_count || 0} players
              </p>

              <form action={joinTeam} style={{ marginTop: 16 }}>
                <input type="hidden" name="teamId" value={team.id} />
                <button className="button primary" type="submit">
                  Join Team
                </button>
              </form>
            </div>
          ))
        ) : (
          <div className="empty">
            {query
              ? "No teams accepting members matched your search."
              : "No teams are currently accepting new members."}
          </div>
        )}
      </section>
    </>
  );
}
