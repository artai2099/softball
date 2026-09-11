import Link from "next/link";
import { createTeam } from "./actions";
import { requireMembership } from "@/lib/auth";

export default async function TeamsPage() {
  const { supabase, membership } = await requireMembership();
  const { data: teams } = await supabase.from("teams").select("*,players(count)").eq("organization_id", membership.organization_id).order("name");
  const canEdit = ['owner','admin','scorekeeper'].includes(membership.role);
  return <>
    <div className="pageHead"><div><p className="eyebrow">Roster management</p><h1>Teams</h1></div></div>
    {canEdit && <section className="card"><h2>Create a team</h2><form action={createTeam} className="form"><label>Team name<input name="name" required /></label><label>Short name<input name="shortName" maxLength={8} /></label><label>City<input name="city" /></label><label>Team color<input name="color" type="color" defaultValue="#0066b2" /></label><button className="button primary">Create team</button></form></section>}
    <section className="grid" style={{ marginTop: 18 }}>{teams?.length ? teams.map(team => <Link href={`/dashboard/teams/${team.id}`} className="card" key={team.id}><div className="teamCode" style={{ background: team.color }}>{team.short_name || team.name.slice(0, 3).toUpperCase()}</div><h2 style={{ marginTop: 12 }}>{team.name}</h2><p className="muted">{team.city || "City not set"} · {team.players?.[0]?.count || 0} players</p></Link>) : <div className="empty">No teams have been created.</div>}</section>
  </>;
}
