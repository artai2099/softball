import type { GameEvent } from "@/lib/types";

const playNames:Record<string,string>={ball:"Ball",strike:"Strike",foul:"Foul",single:"Single",double:"Double",triple:"Triple",home_run:"Home run",walk:"Walk",hbp:"Hit by pitch",strikeout:"Strikeout",out:"Out",error:"Error",double_play:"Double play",triple_play:"Triple play"};

function defensiveText(details:Record<string,string>={}){
  if(details.error_position)return `Error · ${details.error_position}`;
  const outs=[details.out_position_1,details.out_position_2,details.out_position_3].filter(Boolean);
  return outs.length?`Defense · ${outs.join(" → ")}`:"";
}

export function PlayFeed({events}:{events:GameEvent[]}){
  const active=events.filter(event=>!event.voided_at).slice().sort((a,b)=>b.sequence-a.sequence).slice(0,12);
  return <section className="panel"><div className="liveLabel">Play by play</div><div className="playFeed">{active.length?active.map(event=><article className="playRow" key={event.id}><span className="playNumber">{event.sequence}</span><span><strong>{playNames[event.result]||event.result.replaceAll("_"," ")}</strong><small>{defensiveText(event.details)}</small></span><time>{new Date(event.created_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</time></article>):<p className="notice">No plays recorded yet.</p>}</div></section>;
}
