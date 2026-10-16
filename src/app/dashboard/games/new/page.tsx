import Link from "next/link";
import { createGame } from "./actions";
import OpponentTeamPicker from "./OpponentTeamPicker";
import PregameReviewSubmit from "./PregameReviewSubmit";
import RepeatLastMatchupButton from "./RepeatLastMatchupButton";
import { requireMembership } from "@/lib/auth";

export default async function NewGamePage() {
  const { supabase, membership, user } = await requireMembership();

  const { data: teams } = await supabase.from("teams").select("id,name")
    .eq("organization_id", membership.organization_id).order("name");
  const { data: followedMemberships } = await supabase.from("team_memberships")
    .select("team_id").eq("user_id", user.id);
  const followedTeamIds = [...new Set((followedMemberships ?? []).map((item) => item.team_id))];
  const { data: followedTeams } = followedTeamIds.length
    ? await supabase.from("teams").select("id,name,city").in("id", followedTeamIds).order("name")
    : { data: [] };
  const { data: lastGame } = await supabase.from("games")
    .select("home_team_id,away_team_id,away_name,venue,innings_scheduled,visibility")
    .eq("organization_id", membership.organization_id)
    .order("game_date", { ascending: false }).limit(1).maybeSingle();

  const homeTeamId = teams?.some((team) => team.id === lastGame?.home_team_id)
    ? lastGame?.home_team_id ?? "" : teams?.[0]?.id ?? "";
  const followedOpponent = followedTeams?.find((team) => team.id === lastGame?.away_team_id);
  const hasTeams = Boolean(teams?.length);

  return (
    <>
      <div className="pageHead"><div><p className="eyebrow">Schedule</p><h1>New game</h1></div></div>
      {!hasTeams ? (
        <section className="card" style={{ maxWidth: 720 }}>
          <div style={{ border: "1px solid #d9dee7", borderRadius: 12, padding: 24, background: "#fff" }}>
            <p className="eyebrow" style={{ marginBottom: 8 }}>First game setup</p>
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>Create your team first</h2>
            <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
              Before you can create a game, GameDay needs a team to use as your home team. Create your team first, then come back here to schedule the game.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
              <Link href="/dashboard/teams" className="button primary">Create Team</Link>
              <Link href="/dashboard/games" className="button secondary">Back to Games</Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="card">
          <form action={createGame} className="form">
            {lastGame && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                <RepeatLastMatchupButton />
                <span className="muted" style={{ fontSize: 13 }}>
                  Reuses the last home team, opponent, venue, innings and visibility. Set a new date and time.
                </span>
              </div>
            )}
            <label>Home team
              <select name="homeTeamId" required defaultValue={homeTeamId}>
                {teams?.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
            <OpponentTeamPicker
              teams={followedTeams ?? []}
              initialTeamId={followedOpponent?.id ?? ""}
              initialTeamName={followedOpponent ? followedOpponent.name + (followedOpponent.city ? " · " + followedOpponent.city : "") : ""}
            />
            <label>Opponent name (if not selecting a team)
              <input name="awayName" placeholder="Enter opponent name" defaultValue={followedOpponent ? "" : lastGame?.away_name ?? ""} />
            </label>
            <label>Date and time<input name="gameDate" type="datetime-local" required /></label>
            <label>Venue<input name="venue" defaultValue={lastGame?.venue ?? ""} /></label>
            <label>Innings
              <select name="innings" defaultValue={String(lastGame?.innings_scheduled ?? 7)}>
                {[5, 6, 7, 8, 9].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>Visibility
              <select name="visibility" defaultValue={lastGame?.visibility === "public" ? "public" : "private"}>
                <option value="private">Private organization game</option>
                <option value="public">Public score and video page</option>
              </select>
            </label>
            <PregameReviewSubmit />
          </form>
        </section>
      )}
    </>
  );
}
