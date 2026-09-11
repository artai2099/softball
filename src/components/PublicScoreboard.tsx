"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Game,GameEvent } from "@/lib/types";
import { LiveRoom } from "./LiveRoom";
import { PlayFeed } from "./PlayFeed";

export function PublicScoreboard({ initialGame,initialEvents }: { initialGame: Game;initialEvents:GameEvent[] }) {
  const [game,setGame]=useState(initialGame);
  const [events,setEvents]=useState(initialEvents);
  const supabase=useMemo(()=>createClient(),[]);
  useEffect(()=>{const channel=supabase.channel(`public-game-${game.id}`).on("postgres_changes",{event:"UPDATE",schema:"public",table:"games",filter:`id=eq.${game.id}`},payload=>setGame(payload.new as Game)).on("postgres_changes",{event:"INSERT",schema:"public",table:"game_events",filter:`game_id=eq.${game.id}`},payload=>setEvents(current=>[...current,payload.new as GameEvent])).on("postgres_changes",{event:"UPDATE",schema:"public",table:"game_events",filter:`game_id=eq.${game.id}`},payload=>setEvents(current=>current.map(event=>event.id===payload.new.id?payload.new as GameEvent:event))).subscribe();return()=>{void supabase.removeChannel(channel)}},[game.id,supabase]);
  return <main className="livePage" style={{minHeight:"100vh"}}><div style={{maxWidth:760,margin:"auto"}}><div className="brand" style={{marginBottom:28}}><span>G</span>GameDay Softball</div><div className="liveLabel">{game.status==="live"?"● Live scorecast":game.status} · {game.venue||"GameDay Field"}</div><section className="scoreboard"><div><div className="teamLabel">{game.home_name}</div><div className="score">{game.home_score}</div></div><div className="inningBox"><small>{game.half==="top"?"▲ TOP":"▼ BOT"}</small><div style={{fontSize:28,fontWeight:950}}>{game.inning}</div><small>{game.outs} OUT</small></div><div><div className="teamLabel">{game.away_name}</div><div className="score">{game.away_score}</div></div></section><section className="panel"><div className="count"><span>B {game.balls}</span><span>S {game.strikes}</span><span>O {game.outs}</span><span>P {game.pitch_count}</span></div></section><PlayFeed events={events}/>{game.status==="live"&&<LiveRoom gameId={game.id} role="viewer" />}<p style={{color:"#9fb1c8",textAlign:"center",fontSize:12}}>Scores update automatically. No account is required for public games.</p></div></main>;
}
