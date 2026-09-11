"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { defensivePositions } from "@/lib/scoring";
import type { Game,GameEvent } from "@/lib/types";
import { LiveRoom } from "./LiveRoom";
import { PlayFeed } from "./PlayFeed";

const labels: Record<string,string> = { ball:"Ball",strike:"Strike",foul:"Foul",single:"1B",double:"2B",triple:"3B",home_run:"HR",walk:"Walk",hbp:"HBP",strikeout:"Strikeout",out:"Out",error:"Error",double_play:"Double play",triple_play:"Triple play" };

export function ScoringConsole({ initialGame,initialEvents,canScore }: { initialGame: Game;initialEvents:GameEvent[];canScore:boolean }) {
  const [game, setGame] = useState(initialGame);
  const [events,setEvents]=useState(initialEvents);
  const [pending, setPending] = useState<string | null>(null);
  const [positions, setPositions] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const channel = supabase.channel(`game-${game.id}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${game.id}` }, payload => setGame(payload.new as Game)).on("postgres_changes",{event:"INSERT",schema:"public",table:"game_events",filter:`game_id=eq.${game.id}`},payload=>setEvents(current=>[...current,payload.new as GameEvent])).on("postgres_changes",{event:"UPDATE",schema:"public",table:"game_events",filter:`game_id=eq.${game.id}`},payload=>setEvents(current=>current.map(event=>event.id===payload.new.id?payload.new as GameEvent:event))).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [game.id, supabase]);

  const required = pending === "error" || pending === "out" ? 1 : pending === "double_play" ? 2 : pending === "triple_play" ? 3 : 0;
  async function record(result: string, selected: string[] = []) {
    setSaving(true); setMessage("");
    const details = result === "error" ? { error_position: selected[0] } : Object.fromEntries(selected.map((position,index) => [`out_position_${index+1}`,position]));
    try {
      const response = await fetch(`/api/games/${game.id}/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ result, details, idempotencyKey: crypto.randomUUID(), expectedVersion: game.version }) });
      const body = await response.json();
      if (response.status === 409) { const latest = await supabase.from("games").select("*").eq("id",game.id).single(); if (latest.data) setGame(latest.data as Game); throw new Error("Another scorekeeper updated the game. The latest score has been loaded."); }
      if (!response.ok) throw new Error(body.error || "Play could not be recorded");
      setGame(body.game as Game); setPending(null); setPositions([]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Play could not be recorded"); }
    finally { setSaving(false); }
  }
  function choose(result: string) {
    if (["out","error","double_play","triple_play"].includes(result)) { setPending(result); setPositions([]); }
    else void record(result);
  }
  function selectPosition(position: string) { setPositions(current => current.length < required ? [...current,position] : [...current.slice(0,-1),position]); }
  async function undo() {
    setSaving(true); setMessage("");
    try { const response=await fetch(`/api/games/${game.id}/undo`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({expectedVersion:game.version})});const body=await response.json();if(!response.ok)throw new Error(body.error||"Undo failed");setGame(body.game as Game); }
    catch(error){setMessage(error instanceof Error?error.message:"Undo failed");} finally{setSaving(false)}
  }
  async function finish() {
    if(!window.confirm("Finalize this game?"))return;
    setSaving(true);setMessage("");
    try{const response=await fetch(`/api/games/${game.id}/finish`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({expectedVersion:game.version})});const body=await response.json();if(!response.ok)throw new Error(body.error||"Game could not be finalized");setGame(body.game as Game)}
    catch(error){setMessage(error instanceof Error?error.message:"Game could not be finalized")}finally{setSaving(false)}
  }

  return <div className="livePage"><div className="liveGrid"><div>
    <div className="liveLabel">{game.status==="live"?"● Live scorecast":game.status==="final"?"Final":"Scheduled"} · {game.venue || "GameDay Field"}</div>
    <section className="scoreboard"><div><div className="teamLabel">{game.home_name}</div><div className="score">{game.home_score}</div></div><div className="inningBox"><small>{game.half === "top" ? "▲ TOP" : "▼ BOT"}</small><div style={{ fontSize: 28, fontWeight: 950 }}>{game.inning}</div><small>{game.outs} OUT</small></div><div><div className="teamLabel">{game.away_name}</div><div className="score">{game.away_score}</div></div></section>
    <section className="panel"><div className="pageHead"><div><div className="liveLabel">Pitch count</div><div className="count"><span>B {game.balls}</span><span>S {game.strikes}</span><span>O {game.outs}</span><span>P {game.pitch_count}</span></div></div><div>{canScore&&<><button className="button secondary" disabled={saving} onClick={()=>void undo()}>Undo</button> <button className="button red" disabled={saving||game.status==="final"} onClick={()=>void finish()}>Finish</button></>} {game.visibility==="public"?<a className="button secondary" href={`/watch/${game.public_id}`}>Viewer page</a>:<span className="notice">Private game</span>}</div></div></section>
    {canScore?<section className="panel"><div className="liveLabel">Pitch and play result</div><div className="actionGrid">{Object.entries(labels).map(([result,label]) => <button disabled={saving||game.status==="final"} className={`scoreButton ${result==="ball"?"primary":""} ${result==="home_run"||result==="out"?"danger":""}`} key={result} onClick={() => choose(result)}>{label}</button>)}</div></section>:<p className="notice">You have read-only access to this game.</p>}
    {canScore&&pending && <section className="panel"><h3>{labels[pending]}</h3><p className="notice">Select {required} defensive position{required>1?"s":""} in out order.</p><div className="defenseGrid">{defensivePositions.map(position => <button className={`position ${positions.includes(position)?"selected":""}`} key={position} onClick={() => selectPosition(position)}>{position}</button>)}</div><div className="pageHead" style={{marginTop:12,marginBottom:0}}><span>{positions.join(" → ") || "No position selected"}</span><div><button className="button secondary" onClick={() => setPending(null)}>Cancel</button> <button className="button red" disabled={positions.length!==required||saving} onClick={() => void record(pending,positions)}>Record play</button></div></div></section>}
    {message && <p className="error" role="alert">{message}</p>}
  </div><aside><section className="panel"><div className="liveLabel">Base runners</div><div className="diamond"><div className="diamondShape"><i className={`base one ${game.bases?.["1"]?"on":""}`} /><i className={`base two ${game.bases?.["2"]?"on":""}`} /><i className={`base three ${game.bases?.["3"]?"on":""}`} /></div></div></section><PlayFeed events={events}/><LiveRoom gameId={game.id} role={canScore?"broadcaster":"viewer"} /></aside></div></div>;
}
