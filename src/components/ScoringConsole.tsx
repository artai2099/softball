"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { defensivePositions } from "@/lib/scoring";
import type { Game,GameEvent,GameLineupPlayerView } from "@/lib/types";
import { LiveRoom } from "./LiveRoom";
import { PlayFeed } from "./PlayFeed";
import { SubstitutionPanel } from "./SubstitutionPanel";
import { YouTubeStreamControl } from "./YouTubeStreamControl";

const labels: Record<string,string> = { ball:"Ball",strike:"Strike",foul:"Foul",single:"1B",double:"2B",triple:"3B",home_run:"HR",walk:"Walk",hbp:"HBP",strikeout:"Strikeout",out:"Out",error:"Error",double_play:"Double play",triple_play:"Triple play" };

export function ScoringConsole({ initialGame,initialEvents,initialLineup,canScore }: { initialGame: Game;initialEvents:GameEvent[];initialLineup:GameLineupPlayerView[];canScore:boolean }) {
  const [game,setGame]=useState(initialGame); const [events,setEvents]=useState(initialEvents);
  const [pending,setPending]=useState<string|null>(null); const [positions,setPositions]=useState<string[]>([]);
  const [selectedRunnerBase,setSelectedRunnerBase]=useState<"1"|"2"|"3"|"home"|null>(null);
  const [runnerModalOpen,setRunnerModalOpen]=useState(false);
  const [batterId,setBatterId]=useState<string|null>(initialGame.current_batter_id); const [players,setPlayers]=useState<{id:string;first_name:string;last_name:string;jersey_number:number}[]>([]);
  const [message,setMessage]=useState(""); const [saving,setSaving]=useState(false);
  const supabase=useMemo(()=>createClient(),[]);

  const scoringPlayers = initialLineup.length > 0
    ? initialLineup
    : players.map((player) => ({
        id: player.id,
        player_id: player.id,
        first_name: player.first_name,
        last_name: player.last_name,
        jersey_number: player.jersey_number,
        batting_order: null,
        position: "",
        starter: true,
        active: true,
        entered_at: null,
        left_at: null,
        lineup_id: "",
        created_at: "",
      }));

  useEffect(() => {
    if (game.half !== "bottom") {
      if (batterId !== null) {
        setBatterId(null);
      }
      return;
    }

    if (scoringPlayers.length === 0) {
      return;
    }

    const ordered = [...scoringPlayers]
      .filter((player) => player.active && player.batting_order != null)
      .sort((a, b) => (a.batting_order ?? 0) - (b.batting_order ?? 0));

    const nextBatter = game.current_batter_id || ordered[0]?.player_id || null;

    if (nextBatter && batterId !== nextBatter) {
      setBatterId(nextBatter);
    }
  }, [game.half, game.current_batter_id, scoringPlayers, batterId]);
  useEffect(()=>{ const channel=supabase.channel(`game-${game.id}`).on("postgres_changes",{event:"UPDATE",schema:"public",table:"games",filter:`id=eq.${game.id}`},p=>setGame(p.new as Game)).on("postgres_changes",{event:"INSERT",schema:"public",table:"game_events",filter:`game_id=eq.${game.id}`},p=>setEvents(c=>c.some(e=>e.id===p.new.id)?c:[...c,p.new as GameEvent])).subscribe(); return()=>{void supabase.removeChannel(channel)}; },[game.id,supabase]);

  useEffect(()=>{ if(!game.home_team_id)return; void supabase.from("players").select("id,first_name,last_name,jersey_number").eq("team_id",game.home_team_id).eq("active",true).order("jersey_number").then(({data})=>setPlayers(data||[])); },[game.home_team_id,supabase]);

  const required=pending==="error"||pending==="out"?1:pending==="double_play"?2:pending==="triple_play"?3:0;
  const activeBatter =
    game.half === "bottom"
      ? scoringPlayers.find(p => p.player_id === batterId)
      : undefined;
  async function record(result:string,selected:string[]=[]) {
    setSaving(true);setMessage("");
    const details={...(result==="error"?{error_position:selected[0]}:Object.fromEntries(selected.map((position,index)=>[`out_position_${index+1}`,position]))),...(game.half==="bottom"&&batterId?{batter_id:batterId}:{})};
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
      if(!response.ok)throw new Error(body.error||"Play could not be recorded"); const updatedGame=body.game as Game; setGame(updatedGame); setBatterId(updatedGame.current_batter_id||null); setPending(null);setPositions([]);setRunnerModalOpen(false);setSelectedRunnerBase(null); if(updatedGame.status==="final"){window.location.assign("/dashboard");}
    }catch(error){setMessage(error instanceof Error?error.message:"Play could not be recorded");}finally{setSaving(false)}
  }
  async function runnerAction(action:"advance"|"score"|"out") {
    if (!selectedRunnerBase || selectedRunnerBase === "home") return;
    const baseFrom = selectedRunnerBase;
    const baseTo = action === "advance" ? (baseFrom === "1" ? "2" : baseFrom === "2" ? "3" : undefined) : undefined;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/games/${game.id}/runner-action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          baseFrom,
          ...(baseTo ? { baseTo } : {}),
          idempotencyKey: crypto.randomUUID(),
          expectedVersion: game.version,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 409) {
        const latest = await supabase.from("games").select("*").eq("id", game.id).single();
        if (latest.data) setGame(latest.data as Game);
        throw new Error("Another scorekeeper updated the game. The latest score has been loaded.");
      }
      if (!response.ok) throw new Error(body.error || "Runner action could not be recorded");
      const updatedGame = body.game as Game;
      setGame(updatedGame);
      setBatterId(updatedGame.current_batter_id || null);
      setSelectedRunnerBase(action === "advance" && baseTo ? baseTo : null);
      setRunnerModalOpen(false);
      setMessage(action === "advance" ? `Runner advanced to ${baseTo}B.` : action === "score" ? "Run recorded." : "Runner out recorded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Runner action could not be recorded");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!pending && !runnerModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPending(null);
        setPositions([]);
        setRunnerModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const firstModalButton = pending
      ? ".scoringActionModal .position"
      : ".runnerOutcomeButtons .runnerChoiceButton";
    document.querySelector<HTMLButtonElement>(firstModalButton)?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pending, runnerModalOpen]);

  function choose(result:string){if(["out","error","double_play","triple_play"].includes(result)){setPending(result);setPositions([])}else void record(result)}
  function selectPosition(position:string){setPositions(c=>c.length<required?[...c,position]:[...c.slice(0,-1),position])}
  async function undo(){if(game.status==="final")return;setSaving(true);setMessage("");try{const r=await fetch(`/api/games/${game.id}/undo`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({expectedVersion:game.version})});const b=await r.json();if(!r.ok)throw new Error(b.error||"Undo failed");setGame(b.game as Game);setBatterId((b.game as Game).current_batter_id||null)}catch(e){setMessage(e instanceof Error?e.message:"Undo failed")}finally{setSaving(false)}}
  async function finish(){if(!window.confirm("Finalize this game? You can reopen it later."))return;setSaving(true);setMessage("");try{const r=await fetch(`/api/games/${game.id}/finish`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({expectedVersion:game.version})});const b=await r.json();if(!r.ok)throw new Error(b.error||"Game could not be finalized");setGame(b.game as Game);window.location.assign("/dashboard")}catch(e){setMessage(e instanceof Error?e.message:"Game could not be finalized")}finally{setSaving(false)}}
  async function reopen(){setSaving(true);setMessage("");try{const r=await fetch(`/api/games/${game.id}/reopen`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({expectedVersion:game.version})});const b=await r.json();if(!r.ok)throw new Error(b.error||"Game could not be reopened");setGame(b.game as Game)}catch(e){setMessage(e instanceof Error?e.message:"Game could not be reopened")}finally{setSaving(false)}}

  return (
    <div className="livePage">

      <section className="scorekeeperTop">

        <div className="scorekeeperScore">
          <div className="scoreTeam">
            <span>{game.away_name}</span>
            <strong>{game.away_score}</strong>
          </div>
          <div className="scoreMiddle">
            <b>{game.half === "top" ? "TOP" : "BOT"} {game.inning}</b>
            <div className="scoreCount">
              <span>B {game.balls}</span>
              <span>S {game.strikes}</span>
              <span>O {game.outs}</span>
            </div>
          </div>
          <div className="scoreTeam home">
            <strong>{game.home_score}</strong>
            <span>{game.home_name}</span>
          </div>
        </div>
      </section>

      <section className="cameraPanel">
        <div className="cameraPanelHead">
          <div className="cameraPanelSpacer" aria-hidden="true" />
          <details className="cameraDetails">
            <summary className="gameCameraButton">
              <span className="gameCameraIcon" aria-hidden="true">▶</span>
              <span className="gameCameraCopy">
                <strong>Game Camera</strong>
                <small>Live video and broadcast controls</small>
              </span>
              <span className="gameCameraBadge">VIDEO</span>
              <span className="gameCameraChevron" aria-hidden="true" />
            </summary>
            <div className="cameraDetailsBody">
              <LiveRoom
                gameId={game.id}
                role={canScore ? "broadcaster" : "viewer"}
                game={game}
              />
            </div>
          </details>
        </div>
      </section>

      <div className="liveGrid">

        <main>

          <div className="pageHead scorekeeperStatus" style={{ alignItems: "center", marginBottom: 8 }}>
            <div className="liveLabel">
              {game.status==="live"
                ? "● Live scorecast"
                : game.status==="final"
                  ? "Final"
                  : "Scheduled"} · {game.venue||"GameDay Field"}
            </div>


          </div>


          <section className="panel batterPanel">

            <div className="pageHead">

              <div>

                <div className="liveLabel">
                  At bat
                </div>

                <div className="batterLine">
                  {activeBatter
                    ? `#${activeBatter.jersey_number} ${activeBatter.first_name} ${activeBatter.last_name}`
                    : game.half==="bottom"
                      ? "Select batter"
                      : "Opponent batter"}
                </div>

              </div>


              <div className="batterPicker">

                {game.half==="bottom"&&scoringPlayers.length>0&&(
                  initialLineup.length > 0 ? (
                    <span className="notice">
                      Batting order · {activeBatter?.batting_order ?? 1}
                    </span>
                  ) : (
                    <select
                      value={batterId||""}
                      onChange={e=>setBatterId(e.target.value||null)}
                      disabled={!canScore||saving||game.status==="final"}
                    >
                      <option value="">Select batter</option>

                      {scoringPlayers.map(p=>(
                        <option key={p.player_id} value={p.player_id}>
                          #{p.jersey_number} {p.first_name} {p.last_name}
                        </option>
                      ))}

                    </select>
                  )
                )}

              </div>

            </div>


            <div className="count">
              <span>B {game.balls}</span>
              <span>S {game.strikes}</span>
              <span>O {game.outs}</span>
              <span>P {game.pitch_count ?? 0}</span>
            </div>

          </section>


          {canScore ? (
            <section className="panel pitchPlayPanel">

              <div className="liveLabel">
                Pitch / play
              </div>

              <div className="actionGrid">

                {Object.entries(labels).map(([result,label])=>(
                  <button
                    type="button"
                    disabled={saving||game.status==="final"}
                    className={`scoreButton ${
                      result==="ball" ? "primary" : ""
                    } ${
                      result==="home_run"||result==="out" ? "danger" : ""
                    }`}
                    key={result}
                    onClick={()=>choose(result)}
                  >
                    {label}
                  </button>
                ))}

              </div>

            </section>
          ) : (
            <p className="notice">
              You have read-only access to this game.
            </p>
          )}


          {canScore&&(
            <section className="panel gameControls">

              <div className="liveLabel">
                Game controls
              </div>

              <div className="controlRow">

                <button
                  type="button"
                  className="button secondary"
                  disabled={saving||game.status==="final"}
                  onClick={()=>void undo()}
                >
                  Undo
                </button>


                {game.status==="final" ? (
                  <button
                    type="button"
                    className="button primary"
                    disabled={saving}
                    onClick={()=>void reopen()}
                  >
                    Reopen game
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button red"
                    disabled={saving}
                    onClick={()=>void finish()}
                  >
                    Finish game
                  </button>
                )}

              </div>

            </section>
          )}


          {message&&(
            <p className={`runnerActionMessage ${message.includes("recorded") || message.includes("advanced") ? "notice" : "error"}`} role="alert">
              {message}
            </p>
          )}

        </main>


        <aside>

          <section className="panel baseRunnersPanel">

            <div className="liveLabel">
              Base runners
            </div>

            <div className="baseOnlyField">

              <div className="baseDirt"></div>


              {(["2","3","1"] as const).map(base => {
                const runnerId = game.bases?.[base] ?? null;
                const runner = runnerId
                  ? scoringPlayers.find(
                      player => player.player_id === runnerId,
                    )
                  : null;

                const selected = selectedRunnerBase === base;

                const className =
                  base === "2"
                    ? "baseOnly second"
                    : base === "3"
                      ? "baseOnly third"
                      : "baseOnly first";

                return (
                  <button
                    key={base}
                    type="button"
                    className={`${className} ${
                      runnerId ? "occupied" : ""
                    } ${selected ? "selected" : ""}`}
                    aria-label={
                      runnerId
                        ? runner
                          ? `${base}B runner #${runner.jersey_number}`
                          : `${base}B runner`
                        : `${base}B empty`
                    }
                    onClick={() => {
                      setSelectedRunnerBase(base);
                      setMessage("");
                      setRunnerModalOpen(canScore && game.status !== "final");
                    }}
                  >
                    <span>{runner
                      ? `#${runner.jersey_number}`
                      : `${base}B`}</span>
                  </button>
                );
              })}

              <button
                type="button"
                className={`baseOnly home ${selectedRunnerBase === "home" ? "selected" : ""}`}
                aria-label="Home plate"
                aria-pressed={selectedRunnerBase === "home"}
                onClick={() => {
                  setSelectedRunnerBase("home");
                  setMessage("");
                  setRunnerModalOpen(canScore && game.status !== "final");
                }}
              >
                <span>HOME</span>
              </button>

            </div>

            <div className="runnerLegend">
              {(["1","2","3"] as const).map(base => {
                const runnerId = game.bases?.[base];
                if (!runnerId) return null;
                const runner = scoringPlayers.find(p => p.player_id === runnerId);
                return (
                  <div key={base} className="runnerItem">
                    <b>{base}B</b>
                    <span>
                      {runner
                        ? `#${runner.jersey_number} ${runner.first_name} ${runner.last_name}`
                        : "Runner on base"}
                    </span>
                  </div>
                );
              })}

              {!game.bases?.["1"] && !game.bases?.["2"] && !game.bases?.["3"] && (
                <span>Bases empty</span>
              )}
            </div>

          </section>


          {canScore&&game.status==="live"&&(
            <SubstitutionPanel
              gameId={game.id}
              gameVersion={game.version}
              gameStatus={game.status}
              lineup={initialLineup}
              players={players}
              canScore={canScore}
            />
          )}






        </aside>

      </div>

      <section className="playFeedBottom">
        <PlayFeed events={events} collapsible />
      </section>

      <div className="statsBottomAction">
        <a
          className="button secondary"
          href={`/dashboard/games/${game.id}/stats`}
        >
          Stats
        </a>
      </div>

      <div className="statsBottomAction">

      </div>

      {canScore && pending && typeof document !== "undefined" && createPortal(
        <div
          className="scoringActionModalBackdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPending(null);
              setPositions([]);
            }
          }}
        >
          <section
            className="scoringActionModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scoring-action-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="scoringActionModalHeader">
              <div>
                <div className="scoringActionModalEyebrow">RECORD PLAY</div>
                <h2 id="scoring-action-modal-title">{labels[pending]}</h2>
              </div>
              <button
                type="button"
                className="scoringActionModalClose"
                aria-label="Close position menu"
                onClick={() => {
                  setPending(null);
                  setPositions([]);
                }}
              >
                ×
              </button>
            </div>

            <p className="scoringActionModalInstruction">
              Select {required} defensive position{required > 1 ? "s" : ""} in play order.
            </p>

            <div className="defenseGrid scoringActionModalPositions">
              {defensivePositions.map(position => (
                <button
                  type="button"
                  className={`position ${positions.includes(position) ? "selected" : ""}`}
                  key={position}
                  aria-pressed={positions.includes(position)}
                  onClick={() => selectPosition(position)}
                >
                  {position}
                </button>
              ))}
            </div>

            <div className="scoringActionModalSummary">
              <span className="scoringActionModalEyebrow">PLAY SEQUENCE</span>
              <strong>{positions.length ? positions.join(" → ") : "Select the fielding position"}</strong>
              <span className="scoringActionModalStep">{positions.length} of {required} selected</span>
            </div>

            <div className="scoringActionModalFooter">
              <button
                type="button"
                className="button secondary"
                disabled={saving}
                onClick={() => {
                  setPending(null);
                  setPositions([]);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button red"
                disabled={positions.length !== required || saving}
                onClick={() => void record(pending, positions)}
              >
                {saving ? "Saving…" : "Record play"}
              </button>
            </div>
            {message && <p className="scoringActionModalError" role="alert">{message}</p>}
          </section>
        </div>,
        document.body
      )}

      {canScore && runnerModalOpen && selectedRunnerBase && typeof document !== "undefined" && createPortal(
        <div
          className="scoringActionModalBackdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setRunnerModalOpen(false);
            }
          }}
        >
          <section
            className="scoringActionModal runnerActionModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="runner-action-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="scoringActionModalHeader">
              <div>
                <div className="scoringActionModalEyebrow">
                  {selectedRunnerBase !== "home" && game.bases?.[selectedRunnerBase] ? "BASE RUNNING" : "RECORD AT-BAT"}
                </div>
                <h2 id="runner-action-modal-title">
                  {selectedRunnerBase !== "home" && game.bases?.[selectedRunnerBase]
                    ? `Runner at ${selectedRunnerBase}B`
                    : "Record batter result"}
                </h2>
              </div>
              <button
                type="button"
                className="scoringActionModalClose"
                aria-label="Close runner action menu"
                onClick={() => setRunnerModalOpen(false)}
              >
                ×
              </button>
            </div>

            {selectedRunnerBase !== "home" && game.bases?.[selectedRunnerBase] ? (
              <>
                <p className="scoringActionModalInstruction">
                  Choose the result for this runner. Hit advances safely to the next base; a hit from 3B scores a run. Out records a runner out.
                </p>

                <div className="runnerOutcomeButtons">
                  <button
                    type="button"
                    className="button primary runnerChoiceButton"
                    disabled={!canScore || saving || game.status === "final" || (selectedRunnerBase !== "3" && Boolean(game.bases[selectedRunnerBase === "1" ? "2" : "3"]))}
                    onClick={() => void runnerAction(selectedRunnerBase === "3" ? "score" : "advance")}
                  >
                    {saving ? "Saving…" : "Hit"}
                  </button>
                  <button
                    type="button"
                    className="button red runnerChoiceButton"
                    disabled={!canScore || saving || game.status === "final"}
                    onClick={() => void runnerAction("out")}
                  >
                    {saving ? "Saving…" : "Out"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="scoringActionModalInstruction">
                  {selectedRunnerBase === "home" ? "Choose the batter’s result below. GameDay Pro will move runners and update the score automatically." : `No runner is on ${selectedRunnerBase}B. Record the batter’s hit below. GameDay Pro will move runners and update the score automatically.`}
                </p>

                <div className="runnerOutcomeButtons batterResultButtons">
                  <button
                    type="button"
                    className="button primary runnerChoiceButton"
                    disabled={!canScore || saving || game.status === "final"}
                    onClick={() => void record("single")}
                  >
                    {saving ? "Saving…" : "Hit · Single"}
                  </button>
                  <button
                    type="button"
                    className="button secondary runnerChoiceButton"
                    disabled={!canScore || saving || game.status === "final"}
                    onClick={() => void record("double")}
                  >
                    Double
                  </button>
                  <button
                    type="button"
                    className="button secondary runnerChoiceButton"
                    disabled={!canScore || saving || game.status === "final"}
                    onClick={() => void record("triple")}
                  >
                    Triple
                  </button>
                  <button
                    type="button"
                    className="button primary runnerChoiceButton"
                    disabled={!canScore || saving || game.status === "final"}
                    onClick={() => void record("home_run")}
                  >
                    Home Run
                  </button>
                  <button
                    type="button"
                    className="button red runnerChoiceButton"
                    disabled={!canScore || saving || game.status === "final"}
                    onClick={() => { setRunnerModalOpen(false); setSelectedRunnerBase(null); choose("out"); }}
                  >
                    Out
                  </button>
                </div>
              </>
            )}

            {message && <p className="scoringActionModalError" role="alert">{message}</p>}
          </section>
        </div>,
        document.body
      )}

      {canScore && <YouTubeStreamControl gameId={game.id} />}

    </div>
  );

}
