"use client";

import { useState } from "react";

type RosterPlayer = {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | string | null;
};

type ExistingLineupPlayer = {
  player_id: string;
  batting_order: number;
  position: string | null;
};

type LineupEditorProps = {
  roster: RosterPlayer[];
  lineupPlayers: ExistingLineupPlayer[];
  action: (formData: FormData) => void | Promise<void>;
  gameId: string;
};

const POSITIONS = ["", "P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DP", "FLEX"];

export default function LineupEditor({ roster, lineupPlayers, action, gameId }: LineupEditorProps) {
  const savedByPlayer = new Map(lineupPlayers.map((player) => [player.player_id, player]));
  const [orderedIds, setOrderedIds] = useState(() =>
    roster
      .filter((player) => savedByPlayer.has(player.id))
      .sort((a, b) => (savedByPlayer.get(a.id)?.batting_order ?? 999) - (savedByPlayer.get(b.id)?.batting_order ?? 999))
      .map((player) => player.id),
  );
  const [positions, setPositions] = useState<Record<string, string>>(() =>
    Object.fromEntries(roster.map((player) => [player.id, savedByPlayer.get(player.id)?.position ?? ""])),
  );
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const activeIds = new Set(orderedIds);
  const availablePlayers = roster.filter((player) => !activeIds.has(player.id));
  const allOrderedIds = [...orderedIds, ...availablePlayers.map((player) => player.id)];
  const playerById = new Map(roster.map((player) => [player.id, player]));

  function move(id: string, direction: -1 | 1) {
    setOrderedIds((current) => {
      const index = current.indexOf(id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function addToLineup(id: string) {
    setOrderedIds((current) => current.includes(id) ? current : [...current, id]);
  }

  function removeFromLineup(id: string) {
    setOrderedIds((current) => current.filter((playerId) => playerId !== id));
  }

  function dropOn(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setOrderedIds((current) => {
      const next = [...current];
      const from = next.indexOf(draggedId);
      const to = next.indexOf(targetId);
      if (from < 0 || to < 0) return current;
      next.splice(from, 1);
      next.splice(to, 0, draggedId);
      return next;
    });
    setDraggedId(null);
    setDragOverId(null);
  }

  return (
    <form action={action}>
      <input type="hidden" name="game_id" value={gameId} />
      <p className="muted" style={{ lineHeight: 1.6, marginTop: 0 }}>
        Drag players to reorder them, or use the up/down arrows. Add roster players to the batting order and assign positions. Changes are saved when you press Save starting lineup.
      </p>

      <div className="lineupEditorSection">
        <div className="lineupEditorHeading">
          <h2>Batting order</h2>
          <span className="muted">{orderedIds.length} player{orderedIds.length === 1 ? "" : "s"}</span>
        </div>
        {orderedIds.length === 0 && <p className="empty">Add players below to build your starting lineup.</p>}
        <ol className="lineupOrderedList">
          {orderedIds.map((id, index) => {
            const player = playerById.get(id);
            if (!player) return null;
            return (
              <li
                key={id}
                className={`lineupPlayerRow${dragOverId === id ? " lineupPlayerRowDropTarget" : ""}`}
                draggable
                onDragStart={(event) => {
                  setDraggedId(id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", id);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverId(id);
                }}
                onDragLeave={() => setDragOverId((current) => current === id ? null : current)}
                onDrop={(event) => {
                  event.preventDefault();
                  dropOn(id);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDragOverId(null);
                }}
              >
                <span className="lineupDragHandle" aria-hidden="true">⠿</span>
                <span className="lineupOrderNumber">{index + 1}</span>
                <span className="lineupPlayerName">
                  <strong>#{player.jersey_number ?? "—"} {player.first_name} {player.last_name}</strong>
                  <span className="muted">Starter</span>
                </span>
                <input type="hidden" name={`order_${id}`} value={index + 1} />
                <label className="lineupPosition">
                  <span>Position</span>
                  <select name={`position_${id}`} value={positions[id] ?? ""} onChange={(event) => setPositions((current) => ({ ...current, [id]: event.target.value }))}>
                    {POSITIONS.map((position) => <option key={position || "none"} value={position}>{position || "Not set"}</option>)}
                  </select>
                </label>
                <div className="lineupRowActions">
                  <button type="button" className="button secondary lineupArrow" aria-label={`Move ${player.first_name} up`} disabled={index === 0} onClick={() => move(id, -1)}>↑</button>
                  <button type="button" className="button secondary lineupArrow" aria-label={`Move ${player.first_name} down`} disabled={index === orderedIds.length - 1} onClick={() => move(id, 1)}>↓</button>
                  <button type="button" className="button secondary lineupRemove" onClick={() => removeFromLineup(id)}>Remove</button>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="lineupEditorSection">
        <div className="lineupEditorHeading">
          <h2>Available roster</h2>
          <span className="muted">{availablePlayers.length} available</span>
        </div>
        {availablePlayers.length === 0 ? (
          <p className="muted">All active roster players are in the batting order.</p>
        ) : (
          <ul className="lineupAvailableList">
            {availablePlayers.map((player) => (
              <li key={player.id} className="lineupAvailableRow">
                <span><strong>#{player.jersey_number ?? "—"} {player.first_name} {player.last_name}</strong></span>
                <button type="button" className="button secondary" onClick={() => addToLineup(player.id)}>+ Add to lineup</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <style>{`
        .lineupEditorSection { margin-top: 22px; }
        .lineupEditorHeading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }
        .lineupEditorHeading h2 { margin:0; font-size:17px; }
        .lineupOrderedList,.lineupAvailableList { list-style:none; padding:0; margin:0; display:grid; gap:8px; }
        .lineupPlayerRow { display:grid; grid-template-columns:20px 30px minmax(120px,1fr) 115px auto; gap:10px; align-items:center; border:1px solid var(--border,#2b3038); border-radius:12px; padding:10px; background:var(--card,#11151b); }
        .lineupPlayerRowDropTarget { outline:2px solid var(--accent,#6da8ff); }
        .lineupDragHandle { cursor:grab; color:var(--muted,#8b93a1); font-size:22px; touch-action:none; }
        .lineupOrderNumber { display:grid; place-items:center; width:28px; height:28px; border-radius:8px; background:var(--surface-secondary,#252b34); font-weight:800; }
        .lineupPlayerName { display:grid; gap:3px; min-width:0; }
        .lineupPlayerName strong { overflow-wrap:anywhere; }
        .lineupPlayerName .muted,.lineupPosition span { font-size:11px; }
        .lineupPosition { display:grid; gap:4px; margin:0; }
        .lineupPosition select { width:100%; min-width:0; }
        .lineupRowActions { display:flex; gap:5px; align-items:center; }
        .lineupArrow { min-width:34px; padding:6px 9px; }
        .lineupArrow:disabled { opacity:.35; cursor:not-allowed; }
        .lineupRemove { padding:6px 9px; }
        .lineupAvailableRow { display:flex; justify-content:space-between; align-items:center; gap:12px; border:1px solid var(--border,#2b3038); border-radius:10px; padding:10px; }
        @media(max-width:650px) {
          .lineupPlayerRow { grid-template-columns:16px 28px minmax(0,1fr) 95px; gap:7px; padding:8px; }
          .lineupPlayerName { grid-column:3; }
          .lineupPosition { grid-column:4; grid-row:1; }
          .lineupRowActions { grid-column:2 / 5; justify-content:flex-end; }
          .lineupRemove { margin-left:4px; }
          .lineupAvailableRow { align-items:flex-start; flex-direction:column; }
        }
      `}</style>
      <div style={{ display:"flex", flexWrap:"wrap", gap:10, justifyContent:"space-between", marginTop:22 }}>
        <a className="button secondary" href={`/dashboard/games/${gameId}`}>Back to game</a>
        <button className="button red" type="submit">Save starting lineup</button>
      </div>
    </form>
  );
}
