import { createGame } from "./actions";
import { requireMembership } from "@/lib/auth";

export default async function NewGamePage() {
  const { supabase, membership } = await requireMembership();
  const { data: teams } = await supabase.from("teams").select("id,name").eq("organization_id", membership.organization_id).order("name");
  return <><div className="pageHead"><div><p className="eyebrow">Schedule</p><h1>New game</h1></div></div><section className="card"><form action={createGame} className="form">
    <label>Home team<select name="homeTeamId" required>{teams?.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
    <label>Opponent<input name="awayName" required /></label>
    <label>Date and time<input name="gameDate" type="datetime-local" required /></label>
    <label>Venue<input name="venue" /></label>
    <label>Innings<select name="innings" defaultValue="7">{[5,6,7,8,9].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    <label>Visibility<select name="visibility" defaultValue="private"><option value="private">Private organization game</option><option value="public">Public score and video page</option></select></label>
    <button className="button red">Create game</button>
  </form></section></>;
}
