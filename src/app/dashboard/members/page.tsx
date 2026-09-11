import { requireMembership } from "@/lib/auth";
import { addMember } from "./actions";

type Member={user_id:string;email:string;display_name:string;role:string};

export default async function MembersPage(){
  const {supabase,membership}=await requireMembership();
  const canManage=["owner","admin"].includes(membership.role);
  const {data}=canManage?await supabase.rpc("list_org_members",{p_organization_id:membership.organization_id}):{data:[]};
  const members=(data||[]) as Member[];
  return <><div className="pageHead"><div><p className="eyebrow">Access control</p><h1>Organization members</h1></div></div>{canManage?<><section className="card"><h2>Add an existing user</h2><p className="muted">The person must create a GameDay account first. Then add their email and assign the minimum role they need.</p><form action={addMember} className="form"><label>Email<input name="email" type="email" required /></label><label>Role<select name="role"><option value="viewer">Viewer</option><option value="scorekeeper">Scorekeeper</option>{membership.role==="owner"&&<option value="admin">Administrator</option>}</select></label><button className="button primary">Add member</button></form></section><section className="card" style={{marginTop:18}}><h2>Members</h2>{members.map(member=><div className="teamRow" key={member.user_id}><span className="teamCode">{member.display_name.slice(0,2).toUpperCase()}</span><span><strong>{member.display_name}</strong><small className="muted" style={{display:"block"}}>{member.email}</small></span><b style={{textTransform:"capitalize"}}>{member.role}</b></div>)}</section></>:<p className="notice">Only organization owners and administrators can view or change membership.</p>}</>;
}
