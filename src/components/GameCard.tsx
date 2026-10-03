import Link from "next/link";
import type { Game } from "@/lib/types";

const abbr = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

const formatDate = (date: string) =>
  new Date(date).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function GameCard({ game }: { game: Game }) {
  const live = game.status === "live";
  const final = game.status === "final";
  const active = live || final;

  const inningText = live
    ? `${game.half === "top" ? "Top" : "Bottom"} ${game.inning} • ${
        game.outs
      } ${game.outs === 1 ? "Out" : "Outs"}`
    : final
      ? "Final"
      : "Scheduled";

  const actionLabel = live
    ? "Continue Scoring"
    : final
      ? "Box Score"
      : "Game Setup";

  return (
    <article className={`gameCardV2 ${game.status}`}>
      <div className="gameCardTop">
        <span className={`gameStatus ${game.status}`}>
          {live ? "● LIVE" : final ? "FINAL" : "UPCOMING"}
        </span>

        <span className="gameDate">{formatDate(game.game_date)}</span>
      </div>

      <div className="gameCardBody">
        <div className="gameTeamRow">
          <div className="gameTeamIdentity">
            <span className="gameTeamCode">{abbr(game.home_name)}</span>

            <div>
              <span className="gameTeamSide">HOME</span>
              <strong>{game.home_name}</strong>
            </div>
          </div>

          <strong className="gameTeamScore">
            {active ? game.home_score : "—"}
          </strong>
        </div>

        <div className="gameDivider">
          <span>VS</span>
        </div>

        <div className="gameTeamRow">
          <div className="gameTeamIdentity">
            <span className="gameTeamCode">{abbr(game.away_name)}</span>

            <div>
              <span className="gameTeamSide">AWAY</span>
              <strong>{game.away_name}</strong>
            </div>
          </div>

          <strong className="gameTeamScore">
            {active ? game.away_score : "—"}
          </strong>
        </div>
      </div>

      <div className="gameCardInfo">
        <span>{inningText}</span>
        <span>{game.venue || "Venue not set"}</span>
      </div>

      <div className="gameCardFooter">
        <Link
          href={`/dashboard/games/${game.id}`}
          className={`button ${live ? "red" : "primary"} gameCardButton`}
        >
          {actionLabel}
        </Link>
      </div>
    </article>
  );
}
