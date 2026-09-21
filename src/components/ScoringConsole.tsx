"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { defensivePositions } from "@/lib/scoring";
import type { Game,GameEvent } from "@/lib/types";
import { LiveRoom } from "./LiveRoom";
import { PlayFeed } from "./PlayFeed";

const labels: Record<string,string> = { ball:"Ball",strike:"Strike",foul:"Foul",single:"1B",double:"2B",triple:"3B",home_run:"HR",walk:"Walk",hbp:"HBP",strikeout:"Strikeout",out:"Out",error:"Error",double_play:"Double play",triple_play:"Triple play" };

export function ScoringConsole({ initialGame,initialEvents,canScore }: { initialGame: Game;initialEvents:GameEvent[];canScore:boolean }) {
  const [game,setGame]=useState(initialGame); const [events,setEvents]=useState(initialEvents);
  const [pending,setPending]=useState<string|null>(null); const [positions,setPositions]=useState<string[]>([]);
  const [batterId,setBatterId]=useState<string|null>(initialGame.current_batter_id); const [players,setPlayers]=useState<{id:string;first_name:string;last_name:string;jersey_number:number}[]>([]);
  const [message,setMessage]=useState(""); const [saving,setSaving]=useState(false);
  const supabase=useMemo(()=>createClient(),[]);

  useEffect(()=>{ const channel=supabase.channel(`game-${game.id}`).on("postgres_changes",{event:"UPDATE",schema:"public",table:"games",filter:`id=eq.${game.id}`},p=>setGame(p.new as Game)).on("postgres_changes",{event:"INSERT",schema:"public",table:"game_events",filter:`game_id=eq.${game.id}`},p=>setEvents(c=>c.some(e=>e.id===p.new.id)?c:[...c,p.new as GameEvent])).subscribe(); return()=>{void supabase.removeChannel(channel)}; },[game.id,supabase]);

  useEffect(()=>{ if(!game.home_team_id)return; void supabase.from("players").select("id,first_name,last_name,jersey_number").eq("team_id",game.home_team_id).eq("active",true).order("jersey_number").then(({data})=>setPlayers(data||[])); },[game.home_team_id,supabase]);

  const required=pending==="error"||pending==="out"?1:pending==="double_play"?2:pending==="triple_play"?3:0;
  const activeBatter=players.find(p=>p.id===batterId);
  async function record(result:string,selected:string[]=[]) {
    setSaving(true);setMessage("");
    const details={...(result==="error"?{error_position:selected[0]}:Object.fromEntries(selected.map((position,index)=>[`out_position_${index+1}`,position]))),...(batterId?{batter_id:batterId}:{})};
    try{const controller=new AbortController();
      const timeout=window.setTimeout(()=>controller.abort(),10000);
      let response:Response;
      try {
        response=await fetch(`/api/games/${game.id}/events`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({result,details,idempotencyKey:crypto.randomUUID(),expectedVersion:game.version}),signal:controller.signal});
      } catch (error) {
        throw new Error(error instanceof DOMException && error.name==="AbortError" ? "Scoring request timed out. Check your connection and Supabase status." : "Could not reach the scoring server.");
      } finally {
        window.clearTimeout(timeout);
      }
      const contentType=response.headers.get("content-type")||"";
      const body=contentType.includes("application/json") ? await response.json() : {error:`Scoring server returned HTTP ${response.status}`};
      if(response.status===409){const latest=await supabase.from("games").select("*").eq("id",game.id).single();if(latest.data)setGame(latest.data as Game);throw new Error("Another scorekeeper updated the game. The latest score has been loaded.");}
      if(!response.ok)throw new Error(body.error||"Play could not be recorded"); setGame(body.game as Game); setBatterId((body.game as Game).current_batter_id||null); setPending(null);setPositions([]);
    }catch(error){setMessage(error instanceof Error?error.message:"Play could not be recorded");}finally{setSaving(false)}
  }
  function choose(result:string){if(["out","error","double_play","triple_play"].includes(result)){setPending(result);setPositions([])}else void record(result)}
  function selectPosition(position:string){setPositions(c=>c.length<required?[...c,position]:[...c.slice(0,-1),position])}
  async function undo(){if(game.status==="final")return;setSaving(true);setMessage("");try{const r=await fetch(`/api/games/${game.id}/undo`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({expectedVersion:game.version})});const b=await r.json();if(!r.ok)throw new Error(b.error||"Undo failed");setGame(b.game as Game);setBatterId((b.game as Game).current_batter_id||null)}catch(e){setMessage(e instanceof Error?e.message:"Undo failed")}finally{setSaving(false)}}
  async function finish(){if(!window.confirm("Finalize this game? You can reopen it later."))return;setSaving(true);setMessage("");try{const r=await fetch(`/api/games/${game.id}/finish`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({expectedVersion:game.version})});const b=await r.json();if(!r.ok)throw new Error(b.error||"Game could not be finalized");setGame(b.game as Game)}catch(e){setMessage(e instanceof Error?e.message:"Game could not be finalized")}finally{setSaving(false)}}
  async function reopen(){setSaving(true);setMessage("");try{const r=await fetch(`/api/games/${game.id}/reopen`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({expectedVersion:game.version})});const b=await r.json();if(!r.ok)throw new Error(b.error||"Game could not be reopened");setGame(b.game as Game)}catch(e){setMessage(e instanceof Error?e.message:"Game could not be reopened")}finally{setSaving(false)}}

  return <div className="livePage"><div className="liveGrid"><main>
    <div className="liveLabel">{game.status==="live"?"● Live scorecast":game.status==="final"?"Final":"Scheduled"} · {game.venue||"GameDay Field"}</div>
    <section className="scoreboard"><div><div className="teamLabel">{game.away_name}</div><div className="score">{game.away_score}</div></div><div className="inningBox"><small>{game.half==="top"?"▲ TOP":"▼ BOT"}</small><div className="inningNumber">{game.inning}</div><small>{game.outs} OUT</small></div><div><div className="teamLabel">{game.home_name}</div><div className="score">{game.home_score}</div></div></section>
    <section className="panel"><div className="pageHead"><div><div className="liveLabel">At bat</div><div className="batterLine">{activeBatter?`#${activeBatter.jersey_number} ${activeBatter.first_name} ${activeBatter.last_name}`:game.half==="bottom"?"Select batter":"Opponent batter"}</div></div><div className="batterPicker">{game.half==="bottom"&&players.length>0&&<select value={batterId||""} onChange={e=>setBatterId(e.target.value||null)} disabled={!canScore||saving||game.status==="final"}><option value="">Select batter</option>{players.map(p=><option key={p.id} value={p.id}>#{p.jersey_number} {p.first_name} {p.last_name}</option>)}</select>}</div></div><div className="count"><span>B {game.balls}</span><span>S {game.strikes}</span><span>O {game.outs}</span><span>P {(game.pitch_count ?? 0)}</span></div></section>
    {canScore?<section className="panel"><div className="liveLabel">Pitch / play</div><div className="actionGrid">{Object.entries(labels).map(([result,label])=><button type="button" disabled={saving||game.status==="final"} className={`scoreButton ${result==="ball"?"primary":""} ${result==="home_run"||result==="out"?"danger":""}`} key={result} onClick={()=>choose(result)}>{label}</button>)}</div></section>:<p className="notice">You have read-only access to this game.</p>}
    {canScore&&pending&&<section className="panel"><h3>{labels[pending]}</h3><p className="notice">Select {required} defensive position{required>1?"s":""} in out order.</p><div className="defenseGrid">{defensivePositions.map(position=><button type="button" className={`position ${positions.includes(position)?"selected":""}`} key={position} onClick={()=>selectPosition(position)}>{position}</button>)}</div><div className="pageHead actionFooter"><span>{positions.join(" → ")||"No position selected"}</span><div><button type="button" className="button secondary" onClick={()=>setPending(null)}>Cancel</button> <button type="button" className="button red" disabled={positions.length!==required||saving} onClick={()=>void record(pending,positions)}>Record play</button></div></div></section>}
    {message&&<p className="error" role="alert">{message}</p>}
  </main><aside>
    <section className="panel"><div className="liveLabel">Base runners</div><div className="diamond"><div className={`baseNode home ${game.bases?.["1"]?"on":""}`}><span>1B</span></div><div className={`baseNode second ${game.bases?.["2"]?"on":""}`}><span>2B</span></div><div className={`baseNode third ${game.bases?.["3"]?"on":""}`}><span>3B</span></div><div className="baseNode plate"><span>HP</span></div></div><div className="runnerLegend">{(["1","2","3"] as const).map(base=>game.bases?.[base]?<div key={base}><b>{base}B</b> · runner on base</div>:null)}{!game.bases?.["1"]&&!game.bases?.["2"]&&!game.bases?.["3"]&&<span>Bases empty</span>}</div></section>
    {canScore&&<section className="panel gameControls"><div className="liveLabel">Game controls</div><div className="controlRow"><button type="button" className="button secondary" disabled={saving||game.status==="final"} onClick={()=>void undo()}>Undo</button>{game.status==="final"?<button type="button" className="button primary" disabled={saving} onClick={()=>void reopen()}>Reopen game</button>:<button type="button" className="button red" disabled={saving} onClick={()=>void finish()}>Finish game</button>}</div></section>}
    <PlayFeed events={events}/><LiveRoom gameId={game.id} role={canScore?"broadcaster":"viewer"} /></aside></div></div>;
}
