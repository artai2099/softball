import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/auth";
import { saveLineup } from "./actions";

const POSITIONS = ["", "P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DP", "FLEX"];

export default async function PregameLineupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const { supabase, membership } = await requireMembership();
  const canManage = ["owner", "admin", "scorekeeper"].includes(membership.role);
  if (!canManage) notFound();

  const { data: game } = await supabase
    .from("games")
    .select("id, organization_id, home_team_id, home_name, away_name, game_date, venue, status")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  if (!game) notFound();
  if (game.status !== "scheduled") notFound();

  const { data: roster, error: rosterError } = await supabase
    .from("players")
    .select("id, first_name, last_name, jersey_number, active")
    .eq("team_id", game.home_team_id)
    .eq("active", true)
    .order("jersey_number", { ascending: true });

  const { data: lineup } = await supabase
    .from("game_lineups")
    .select("id")
    .eq("game_id", game.id)
    .eq("team_id", game.home_team_id)
    .maybeSingle();

  const { data: lineupPlayers } = lineup
    ? await supabase
        .from("game_lineup_players")
        .select("player_id, batting_order, position")
        .eq("lineup_id", lineup.id)
    : { data: [] };

  const savedByPlayer = new Map((lineupPlayers || []).map((player) => [player.player_id, player]));
  const saveAction = saveLineup.bind(null, game.id);

  return (
    <>
      <div className="pageHead">
        <div>
          <p className="eyebrow">Pregame setup</p>
          <h1>Starting lineup</h1>
          <p className="muted" style={{ marginTop: 6 }}>{game.home_name} vs {game.away_name}</p>
        </div>
        <Link className="button secondary" href={`/dashboard/games/${game.id}`}>Back to game</Link>
      </div>

      <section className="card" style={{ maxWidth: 920 }}>
        <p className="muted" style={{ lineHeight: 1.6, marginTop: 0 }}>
          Enter batting-order numbers and defensive positions for the players who will start. Leave both fields blank to keep a roster player out of this game. You can save a draft lineup and return to edit it until scoring begins.
        </p>

        {saved !== undefined && (
          <p className="notice" role="status" style={{ marginBottom: 16 }}>
            Lineup saved. {saved} player{saved === "1" ? "" : "s"} in the batting order.
          </p>
        )}
        {rosterError && <p className="error" role="alert">The team roster could not be loaded: {rosterError.message}</p>}
        {!rosterError && (roster || []).length === 0 && (
          <div className="empty">
            <strong>No active roster players yet</strong>
            <p className="muted">Add players to this team before setting its starting lineup.</p>
            <Link href="/dashboard/teams" className="button primary">Manage teams and roster</Link>
          </div>
        )}

        {(roster || []).length > 0 && (
          <form action={saveAction}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 110px 140px", gap: 10, padding: "0 10px 10px", color: "var(--muted, #8b93a1)", fontSize: 12, fontWeight: 800 }}>
              <span>PLAYER</span><span>BATTING #</span><span>POSITION</span>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {(roster || []).map((player) => {
                const existing = savedByPlayer.get(player.id);
                return (
                  <div key={player.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 110px 140px", gap: 10, alignItems: "center", border: "1px solid var(--border, #2b3038)", borderRadius: 10, padding: 10 }}>
                    <label htmlFor={`order-${player.id}`} style={{ minWidth: 0, margin: 0 }}>
                      <span style={{ display: "block", fontWeight: 800 }}>#{player.jersey_number} {player.first_name} {player.last_name}</span>
                      <span className="muted" style={{ fontSize: 12 }}>{existing ? "In current lineup" : "Roster player"}</span>
                    </label>
                    <input id={`order-${player.id}`} name={`order_${player.id}`} type="number" min="1" max="20" step="1" defaultValue={existing?.batting_order ?? ""} aria-label={`Batting order for ${player.first_name} ${player.last_name}`} />
                    <select name={`position_${player.id}`} defaultValue={existing?.position ?? ""} aria-label={`Position for ${player.first_name} ${player.last_name}`}>
                      {POSITIONS.map((position) => <option key={position || "none"} value={position}>{position || "Not set"}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", marginTop: 20 }}>
              <Link className="button secondary" href={`/dashboard/games/${game.id}`}>Save later / back</Link>
              <button className="button red" type="submit">Save starting lineup</button>
            </div>
          </form>
        )}
      </section>
      <style>{`
        @media (max-width: 560px) {
          .card form > div[style*="grid-template-columns"] { grid-template-columns: minmax(0,1fr) 76px 105px !important; gap: 6px !important; }
          .card form input, .card form select { min-width: 0; width: 100%; box-sizing: border-box; }
        }
      `}</style>
    </>
  );
}
