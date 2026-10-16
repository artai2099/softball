export type StatLine = {
  playerId: string; name: string; jersey: number; order: number | null;
  pa: number; ab: number; r: number; h: number; singles: number; doubles: number;
  triples: number; hr: number; rbi: number; bb: number; hbp: number; so: number;
  sb: number; cs: number; sf: number; sacrifices: number;
  pitchingOuts: number; earnedRuns: number; runsAllowed: number; walksAllowed: number;
  strikeoutsPitched: number; hitsAllowed: number; hitBattersAllowed: number;
  putouts: number; assists: number; fieldingErrors: number;
};
export type TeamBox = { rows: StatLine[]; runs: number; hits: number; errors: number; lob: number; runsByInning: number[] };
export type Player = { player_id: string; batting_order: number | null; first_name: string; last_name: string; jersey_number: number };
export type GameEvent = { result: string; details: Record<string, unknown> | null; voided_at: string | null; sequence: number; state_after?: Record<string, unknown> | null };
type Bases = { 1: string | null; 2: string | null; 3: string | null };

const PA_RESULTS = new Set(["walk","hbp","single","double","triple","home_run","strikeout","out","error","double_play","triple_play","sacrifice_fly","sacrifice_bunt"]);
const HITS: Record<string, "singles" | "doubles" | "triples" | "hr"> = { single:"singles", double:"doubles", triple:"triples", home_run:"hr" };
const emptyBases = (): Bases => ({1:null,2:null,3:null});
function emptyStat(p: Player): StatLine {
  return {playerId:p.player_id,name:`${p.first_name} ${p.last_name}`.trim(),jersey:p.jersey_number,order:p.batting_order,
    pa:0,ab:0,r:0,h:0,singles:0,doubles:0,triples:0,hr:0,rbi:0,bb:0,hbp:0,so:0,sb:0,cs:0,sf:0,sacrifices:0,
    pitchingOuts:0,earnedRuns:0,runsAllowed:0,walksAllowed:0,strikeoutsPitched:0,hitsAllowed:0,hitBattersAllowed:0,putouts:0,assists:0,fieldingErrors:0};
}
function newTeam(players: Player[]): TeamBox & {stats: Map<string,StatLine>} {
  const stats = new Map(players.map(p=>[p.player_id,emptyStat(p)]));
  return {rows:[],runs:0,hits:0,errors:0,lob:0,runsByInning:[],stats};
}
function strings(values: unknown[]): string[] { return [...new Set(values.filter((v):v is string=>typeof v==="string"&&v.length>0))]; }
function batterIdOf(event: GameEvent): string | null { const v=event.details?.batter_id; return typeof v==="string"?v:null; }
function isPA(event: GameEvent): boolean { return typeof event.details?.plate_appearance==="boolean" ? event.details.plate_appearance : PA_RESULTS.has(event.result); }
function advanceBases(result: string, batter: string | null, bases: Bases) {
  const {1:b1,2:b2,3:b3}=bases; const scored:string[]=[];
  if(result==="walk"||result==="hbp"){
    if(b1&&b2&&b3)scored.push(b3);
    // Only forced runners advance. If first is empty, runners on second and
    // third stay put; if first is occupied, second moves only when forced.
    return {scored,bases:{1:batter,2:b1??b2,3:b1&&b2?b2:b3} as Bases};
  }
  if(result==="single"||result==="error"){
    if(b3)scored.push(b3);
    return {scored,bases:{1:batter,2:b1,3:b2} as Bases};
  }
  if(result==="double"){
    if(b3)scored.push(b3); if(b2)scored.push(b2);
    return {scored,bases:{1:null,2:batter,3:b1} as Bases};
  }
  if(result==="triple"){
    if(b1)scored.push(b1); if(b2)scored.push(b2); if(b3)scored.push(b3);
    return {scored,bases:{1:null,2:null,3:batter} as Bases};
  }
  if(result==="home_run"){
    // Credit runners in their natural scoring order, then the batter.
    if(b3)scored.push(b3); if(b2)scored.push(b2); if(b1)scored.push(b1); if(batter)scored.push(batter);
    return {scored,bases:emptyBases()};
  }
  if(result==="sacrifice_fly"){
    if(b3)scored.push(b3);
    return {scored,bases:{1:b1,2:b2,3:null} as Bases};
  }
  if(result==="sacrifice_bunt"){
    if(b3)scored.push(b3);
    return {scored,bases:{1:null,2:b1,3:b2} as Bases};
  }
  return {scored,bases};
}
type RunDelta = { home: number; away: number };
type TeamSide = "home" | "away";

function snapshotInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function ensureInning(team: TeamBox, inning: number) {
  while (team.runsByInning.length < inning) team.runsByInning.push(0);
}

function addTeamRuns(team: TeamBox, inning: number, count: number) {
  if (count <= 0) return;
  team.runs += count;
  ensureInning(team, inning);
  team.runsByInning[inning - 1] += count;
}

function creditKnownScorers(
  ids: string[],
  countBySide: RunDelta,
  teams: { home: TeamBox & { stats: Map<string, StatLine> }; away: TeamBox & { stats: Map<string, StatLine> } },
  playerTeam: Map<string, TeamSide>,
) {
  const credited: RunDelta = { home: 0, away: 0 };
  for (const id of ids) {
    const side = playerTeam.get(id);
    if (!side || credited[side] >= countBySide[side]) continue;
    const row = teams[side].stats.get(id);
    if (row) {
      row.r++;
      credited[side]++;
    }
  }
}

function applyEventRuns(
  teams: { home: TeamBox & { stats: Map<string, StatLine> }; away: TeamBox & { stats: Map<string, StatLine> } },
  inning: number,
  scoreDelta: RunDelta | null,
  fallbackSide: TeamSide,
  knownScorers: string[],
  fallbackCount: number,
  playerTeam: Map<string, TeamSide>,
) {
  if (scoreDelta) {
    // Recorded game snapshots are the source of truth for the team score and
    // inning totals. Individual runs are credited only when the scorer is known.
    addTeamRuns(teams.home, inning, scoreDelta.home);
    addTeamRuns(teams.away, inning, scoreDelta.away);
    creditKnownScorers(knownScorers, scoreDelta, teams, playerTeam);
    return;
  }

  addTeamRuns(teams[fallbackSide], inning, fallbackCount);
  let credited = 0;
  for (const id of knownScorers) {
    if (credited >= fallbackCount) break;
    const row = teams[fallbackSide].stats.get(id);
    if (row) {
      row.r++;
      credited++;
    }
  }
}

export function calculateGameStats(homePlayers: Player[], awayPlayers: Player[], events: GameEvent[]): {home:TeamBox;away:TeamBox} {
  const home=newTeam(homePlayers), away=newTeam(awayPlayers);
  const playerTeam=new Map<string,"home"|"away">();
  homePlayers.forEach(p=>playerTeam.set(p.player_id,"home")); awayPlayers.forEach(p=>playerTeam.set(p.player_id,"away"));
  let bases=emptyBases(), outs=0, inning=1, half:"top"|"bottom"="top", lastPitcherId:string|null=null;
  let priorSnapshotHomeScore = 0;
  let priorSnapshotAwayScore = 0;
  let priorEventHadScoreSnapshot = true;
  const syncFromSnapshot=(event: GameEvent) => {
    const snapshot=event.state_after;
    if(!snapshot)return;
    const nextInning=Number(snapshot.inning);
    const nextHalf=snapshot.half==="top"||snapshot.half==="bottom"?snapshot.half:null;
    const nextOuts=Number(snapshot.outs);
    if(Number.isInteger(nextInning)&&nextInning>0&&nextHalf&&Number.isInteger(nextOuts)&&nextOuts>=0&&nextOuts<=2){
      if(nextHalf!==half||nextInning!==inning)lastPitcherId=null;
      inning=nextInning;half=nextHalf;outs=nextOuts;
    }
    const snapshotBases=snapshot.bases;
    if(snapshotBases&&typeof snapshotBases==="object"){
      const b=snapshotBases as Record<string,unknown>;
      bases={
        1:typeof b["1"]==="string"?b["1"]:null,
        2:typeof b["2"]==="string"?b["2"]:null,
        3:typeof b["3"]==="string"?b["3"]:null,
      };
    }
  };
  const ordered=events.filter(e=>!e.voided_at).sort((a,b)=>a.sequence-b.sequence);
  for(const [eventIndex,event] of ordered.entries()){
    ensureInning(home,inning); ensureInning(away,inning);
    const inningForEvent = inning;
    const halfForEvent = half;
    const snapshotHomeScore = snapshotInteger(event.state_after?.home_score);
    const snapshotAwayScore = snapshotInteger(event.state_after?.away_score);
    const hasScoreSnapshot = snapshotHomeScore !== null && snapshotAwayScore !== null;
    let scoreDelta: RunDelta | null = null;
    if (hasScoreSnapshot) {
      if (eventIndex === 0 || priorEventHadScoreSnapshot) {
        scoreDelta = {
          home: Math.max(0, snapshotHomeScore - priorSnapshotHomeScore),
          away: Math.max(0, snapshotAwayScore - priorSnapshotAwayScore),
        };
      }
      priorSnapshotHomeScore = snapshotHomeScore;
      priorSnapshotAwayScore = snapshotAwayScore;
    }
    priorEventHadScoreSnapshot = hasScoreSnapshot;

    const details=event.details??{};
    const batter=batterIdOf(event), batterTeam=batter?playerTeam.get(batter):undefined;
    // The batter ID is used for individual stats; the half-inning is the
    // fallback for team stats when opponent/legacy batter IDs are unavailable.
    const battingSide: TeamSide = batterTeam ?? (halfForEvent === "top" ? "away" : "home");
    const batting=battingSide==="home"?home:away;
    const fielding=batting===home?away:home;
    const suppliedPitcher=typeof details.pitcher_id==="string"?details.pitcher_id:null;
    if(suppliedPitcher)lastPitcherId=suppliedPitcher;
    const pitcherTeam=lastPitcherId?playerTeam.get(lastPitcherId):undefined;
    const pitcher=lastPitcherId?(pitcherTeam==="home"?home.stats.get(lastPitcherId):pitcherTeam==="away"?away.stats.get(lastPitcherId):undefined):undefined;

    if(["runner_advance","runner_score","runner_out","stolen_base","caught_stealing"].includes(event.result)){
      const runner=typeof details.runner_id==="string"?details.runner_id:null;
      const runnerTeamName=runner?playerTeam.get(runner):undefined;
      const runnerTeam=runnerTeamName==="home"?home:runnerTeamName==="away"?away:(half==="top"?away:home);
      const from=details.base_from==="1"||details.base_from==="2"||details.base_from==="3"?Number(details.base_from) as 1|2|3:null;
      const to=details.base_to==="1"||details.base_to==="2"||details.base_to==="3"?Number(details.base_to) as 1|2|3:null;
      if(from!==null&&(event.result==="runner_advance"||event.result==="stolen_base")&&to!==null){
        const id=bases[from]??runner; bases[from]=null; bases[to]=id;
        if(event.result==="stolen_base"&&id){const row=runnerTeam.stats.get(id);if(row)row.sb++;}
      } else if(from!==null&&["runner_score","runner_out","caught_stealing"].includes(event.result)){
        const id=bases[from]??runner; bases[from]=null;
        if(event.result==="runner_score"&&id){
          const fallbackSide: TeamSide = runnerTeam === home ? "home" : "away";
          applyEventRuns(
            { home, away },
            inningForEvent,
            scoreDelta,
            fallbackSide,
            [id],
            1,
            playerTeam,
          );
          const runsAllowedOnPlay = scoreDelta ? scoreDelta.home + scoreDelta.away : 1;
          if (pitcher && runsAllowedOnPlay > 0) pitcher.runsAllowed += runsAllowedOnPlay;
        } else if(event.result==="runner_out"||event.result==="caught_stealing"){
          if(event.result==="caught_stealing"&&id){const row=runnerTeam.stats.get(id);if(row)row.cs++;}
          outs++;
          if(pitcher)pitcher.pitchingOuts++;
          if(outs>=3){runnerTeam.lob += [bases[1],bases[2],bases[3]].filter(Boolean).length;bases=emptyBases();outs=0;if(half==="top")half="bottom";else{half="top";inning++;}lastPitcherId=null;}
        }
      }
      syncFromSnapshot(event);ensureInning(home,inning);ensureInning(away,inning);continue;
    }

    if(event.result==="error"&&fielding)fielding.errors++;
    // Team hits do not depend on the batter ID being present in a roster.
    if(HITS[event.result])batting.hits++;
    if(event.result==="error"&&fielding&&typeof details.error_fielder_id==="string"){
      const row=fielding.stats.get(details.error_fielder_id);if(row)row.fieldingErrors++;
    }
    if(pitcher){
      if(event.result==="walk")pitcher.walksAllowed++;
      if(event.result==="hbp")pitcher.hitBattersAllowed++;
      if(event.result==="strikeout")pitcher.strikeoutsPitched++;
      if(HITS[event.result])pitcher.hitsAllowed++;
    }
    if(event.result==="sacrifice_fly"&&batter&&batting){const row=batting.stats.get(batter);if(row){row.pa++;row.sf++;}}
    if(event.result==="sacrifice_bunt"&&batter&&batting){const row=batting.stats.get(batter);if(row){row.pa++;row.sacrifices++;}}
    if(isPA(event)&&batter&&batting){
      const row=batting.stats.get(batter);
      if(row&&event.result!=="sacrifice_fly"&&event.result!=="sacrifice_bunt"){
        row.pa++;
        if(event.result==="walk")row.bb++;
        else if(event.result==="hbp")row.hbp++;
        else {row.ab++;if(event.result==="strikeout")row.so++;const key=HITS[event.result];if(key){row.h++;row[key]++;}}
      }
    }
    if(["out","strikeout","double_play","triple_play","sacrifice_fly","sacrifice_bunt"].includes(event.result)&&fielding){
      const count=event.result==="double_play"?2:event.result==="triple_play"?3:1;
      const ids=[details.out_fielder_id_1,details.out_fielder_id_2,details.out_fielder_id_3].filter((v):v is string=>typeof v==="string");
      ids.slice(0,count).forEach((id,index)=>{const row=fielding.stats.get(id);if(row){if(index===count-1)row.putouts++;else row.assists++;}});
    }
    const movement=advanceBases(event.result,batter,bases);
    const scored=strings(movement.scored);
    const runsOnBattingSide = scoreDelta
      ? scoreDelta[battingSide]
      : scored.length;
    const earnedRunsOnPlay=Number(details.earned_runs??0);
    if(pitcher&&runsOnBattingSide>0&&Number.isFinite(earnedRunsOnPlay)&&earnedRunsOnPlay>0){
      pitcher.earnedRuns+=Math.min(earnedRunsOnPlay,runsOnBattingSide);
    }
    if(pitcher&&runsOnBattingSide>0)pitcher.runsAllowed+=runsOnBattingSide;
    if(batter&&["walk","hbp","single","double","triple","home_run","sacrifice_fly","sacrifice_bunt"].includes(event.result)){
      const row=batting.stats.get(batter);
      if(row){
        const explicit=details.rbi;
        row.rbi+=typeof explicit==="number"
          ? Math.max(0,explicit)
          : runsOnBattingSide;
      }
    }
    applyEventRuns(
      { home, away },
      inningForEvent,
      scoreDelta,
      battingSide,
      scored,
      scored.length,
      playerTeam,
    );
    bases=movement.bases;
    const outCount=event.result==="double_play"?2:event.result==="triple_play"?3:["strikeout","out","sacrifice_fly","sacrifice_bunt"].includes(event.result)?1:0;
    outs+=outCount;
    if(pitcher&&outCount)pitcher.pitchingOuts+=outCount;
    if(outs>=3){if(batting)batting.lob += [bases[1],bases[2],bases[3]].filter(Boolean).length;bases=emptyBases();outs=0;if(half==="top")half="bottom";else{half="top";inning++;}lastPitcherId=null;}
    syncFromSnapshot(event);ensureInning(home,inning);ensureInning(away,inning);
  }
  home.rows=[...home.stats.values()];away.rows=[...away.stats.values()];
  return {home,away};
}
export function rate(numerator:number,denominator:number){return denominator?(numerator/denominator).toFixed(3).replace(/^0/,""):".000";}
export function obp(stat:StatLine){return rate(stat.h+stat.bb+stat.hbp,stat.ab+stat.bb+stat.hbp+stat.sf);}
export function slg(stat:StatLine){return rate(stat.singles+2*stat.doubles+3*stat.triples+4*stat.hr,stat.ab);}
export function ops(stat:StatLine){return (Number(obp(stat))+Number(slg(stat))).toFixed(3).replace(/^0/,"");}

export function era(stat: Pick<StatLine, "earnedRuns" | "pitchingOuts">, inningsPerGame = 7) {
  return stat.pitchingOuts > 0
    ? ((stat.earnedRuns * inningsPerGame * 3) / stat.pitchingOuts).toFixed(2)
    : "—";
}

export function whip(stat: Pick<StatLine, "walksAllowed" | "hitsAllowed" | "pitchingOuts">) {
  return stat.pitchingOuts > 0
    ? (((stat.walksAllowed + stat.hitsAllowed) * 3) / stat.pitchingOuts).toFixed(2)
    : "—";
}
