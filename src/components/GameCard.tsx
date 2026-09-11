import Link from "next/link";
import type { Game } from "@/lib/types";

const abbr = (name: string) => name.split(/\s+/).filter(Boolean).map(word => word[0]).join("").slice(0, 3).toUpperCase();

export function GameCard({ game }: { game: Game }) {
  const active = game.status === "live" || game.status === "final";
  return <article className="card scoreCard">
    <div className="gameMeta"><span className={`status ${game.status}`}>{game.status === "live" ? "● Live" : game.status}</span><span>{new Date(game.game_date).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></div>
    <div className="matchup">
      <div className="teamRow"><span className="teamCode">{abbr(game.home_name)}</span><strong>{game.home_name}</strong><b className="teamScore">{active ? game.home_score : "—"}</b></div>
      <div className="teamRow"><span className="teamCode">{abbr(game.away_name)}</span><strong>{game.away_name}</strong><b className="teamScore">{active ? game.away_score : "—"}</b></div>
    </div>
    <div className="cardFoot"><span className="muted">{game.venue || "Venue not set"}</span><Link className="button primary" href={`/dashboard/games/${game.id}`}>{game.status === "final" ? "Box score" : game.status === "live" ? "Continue" : "Open game"}</Link></div>
  </article>;
}
