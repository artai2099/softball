import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/auth";
import { addPlayer } from "./actions";

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, membership } = await requireMembership();
  const [{ data: team }, { data: players }] = await Promise.all([
    supabase.from("teams").select("*").eq("id",id).eq("organization_id",membership.organization_id).single(),
    supabase.from("players").select("*").eq("team_id",id).eq("active",true).order("jersey_number")
  ]);
  if (!team) notFound();
  const canEdit=['owner','admin','scorekeeper'].includes(membership.role);
  const action=addPlayer.bind(null,id);
  return <><div className="pageHead"><div><p className="eyebrow">{team.city||"Team roster"}</p><h1>{team.name}</h1></div></div>{canEdit&&<section className="card"><h2>Add player</h2><form action={action} className="form"><label>First name<input name="firstName" required /></label><label>Last name<input name="lastName" required /></label><label>Jersey number<input name="jerseyNumber" type="number" min="0" max="999" required /></label><label>Position<select name="position">{['P','C','1B','2B','3B','SS','LF','CF','RF','DP','UTIL'].map(position=><option key={position}>{position}</option>)}</select></label><button className="button primary">Add player</button></form></section>}<section className="grid" style={{marginTop:18}}>{players?.length?players.map(player=><article className="card" key={player.id}><div className="teamRow"><span className="teamCode">#{player.jersey_number}</span><strong>{player.first_name} {player.last_name}</strong><b>{player.position}</b></div></article>):<div className="empty">No players on this roster.</div>}</section></>;
}
