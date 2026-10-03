import Link from "next/link";
import { requireMembership } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Game = {
  id: string;
  home_name: string;
  away_name: string;
  home_score: number;
  away_score: number;
  game_date: string;
  venue: string;
  status: "scheduled" | "live" | "final";
  inning: number;
  half: "top" | "bottom";
  outs: number;
  innings_scheduled: number;
};

function formatGameDate(dateValue: string) {
  const date = new Date(dateValue);

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatShortDate(dateValue: string) {
  const date = new Date(dateValue);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTime(dateValue: string) {
  const date = new Date(dateValue);

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function statusLabel(status: Game["status"]) {
  if (status === "live") return "LIVE";
  if (status === "final") return "FINAL";
  return "UPCOMING";
}

function ScoreLine({
  game,
  compact = false,
}: {
  game: Game;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) auto auto",
        gap: compact ? 8 : 12,
        alignItems: "center",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: 800,
            fontSize: compact ? 15 : 17,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {game.away_name}
        </div>

        <div
          style={{
            fontWeight: 800,
            fontSize: compact ? 15 : 17,
            marginTop: 6,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {game.home_name}
        </div>
      </div>

      <div
        style={{
          fontWeight: 900,
          fontSize: compact ? 20 : 28,
          lineHeight: 1.25,
          textAlign: "right",
        }}
      >
        {game.away_score}
        <br />
        {game.home_score}
      </div>

      <div
        style={{
          fontSize: 11,
          color: "#aeb5c0",
          textAlign: "right",
          textTransform: "uppercase",
          letterSpacing: ".06em",
          fontWeight: 800,
        }}
      >
        {game.status === "live" ? (
          <>
            {game.half === "top" ? "TOP" : "BOT"}
            <br />
            {game.inning}
          </>
        ) : (
          <>
            {game.status === "final" ? "FINAL" : "GAME"}
          </>
        )}
      </div>
    </div>
  );
}

function LiveGameCard({ game }: { game: Game }) {
  return (
    <Link
      href={`/dashboard/games/${game.id}`}
      className="gameCenterLiveCard"
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        background:
          "linear-gradient(135deg, #151515 0%, #0c0c0d 100%)",
        border: "1px solid #5b2134",
        borderRadius: 14,
        padding: 20,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            background: "#e50046",
            color: "#fff",
            borderRadius: 999,
            padding: "6px 11px",
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: ".08em",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#fff",
              display: "inline-block",
            }}
          />
          LIVE
        </span>

        <span
          style={{
            color: "#9da5b2",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {game.venue || "Venue not set"}
        </span>
      </div>

      <ScoreLine game={game} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          marginTop: 20,
          paddingTop: 14,
          borderTop: "1px solid #27282d",
          color: "#aeb5c0",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <span>
          {game.half === "top" ? "Top" : "Bottom"} {game.inning}
        </span>
        <span>{game.outs} out{game.outs === 1 ? "" : "s"}</span>
        <span>Open scoring →</span>
      </div>
    </Link>
  );
}

function UpcomingGameCard({ game }: { game: Game }) {
  return (
    <Link
      href={`/dashboard/games/${game.id}`}
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        background: "#0d0d0f",
        border: "1px solid #25272c",
        borderRadius: 12,
        padding: 18,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <div>
          <div
            style={{
              color: "#7c2cff",
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              marginBottom: 5,
            }}
          >
            Upcoming
          </div>

          <div
            style={{
              fontSize: 18,
              fontWeight: 900,
              color: "#fff",
            }}
          >
            {game.home_name}
          </div>

          <div
            style={{
              fontSize: 14,
              color: "#9fa6b2",
              fontWeight: 700,
              marginTop: 3,
            }}
          >
            vs {game.away_name}
          </div>
        </div>

        <div
          style={{
            minWidth: 78,
            textAlign: "right",
            color: "#fff",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 900 }}>
            {formatTime(game.game_date)}
          </div>
          <div
            style={{
              color: "#9fa6b2",
              fontSize: 11,
              fontWeight: 700,
              marginTop: 3,
            }}
          >
            {formatShortDate(game.game_date)}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          color: "#9fa6b2",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <span>📍 {game.venue || "Venue not set"}</span>
        <span>·</span>
        <span>{game.innings_scheduled} innings</span>
      </div>
    </Link>
  );
}

function CompletedGameCard({ game }: { game: Game }) {
  return (
    <Link
      href={`/dashboard/games/${game.id}`}
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        background: "#0d0d0f",
        border: "1px solid #25272c",
        borderRadius: 12,
        padding: 18,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <span
          style={{
            color: "#8f97a3",
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: ".08em",
          }}
        >
          FINAL
        </span>

        <span
          style={{
            color: "#8f97a3",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {formatShortDate(game.game_date)}
        </span>
      </div>

      <ScoreLine game={game} compact />

      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: "1px solid #25272c",
          color: "#777f8c",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {game.venue || "Venue not set"}
      </div>
    </Link>
  );
}

export default async function GamesPage() {
  const { supabase, membership } = await requireMembership();

  const { data: games, error } = await supabase
    .from("games")
    .select(
      "id,home_name,away_name,home_score,away_score,game_date,venue,status,inning,half,outs,innings_scheduled",
    )
    .eq("organization_id", membership.organization_id)
    .order("game_date", { ascending: false });

  if (error) {
    return (
      <>
        <div className="pageHead">
          <div>
            <p className="eyebrow">Game management</p>
            <h1>Game Center</h1>
          </div>

          <Link
            href="/dashboard/games/new"
            className="button red"
            style={{ textDecoration: "none" }}
          >
            ＋ NEW GAME
          </Link>
        </div>

        <section className="card">
          <p className="error" role="alert">
            Games could not be loaded.
          </p>
          <p className="muted">{error.message}</p>
        </section>
      </>
    );
  }

  const allGames = (games ?? []) as Game[];
  const liveGames = allGames.filter((game) => game.status === "live");
  const upcomingGames = allGames
    .filter((game) => game.status === "scheduled")
    .sort(
      (a, b) =>
        new Date(a.game_date).getTime() -
        new Date(b.game_date).getTime(),
    );
  const completedGames = allGames
    .filter((game) => game.status === "final")
    .sort(
      (a, b) =>
        new Date(b.game_date).getTime() -
        new Date(a.game_date).getTime(),
    );

  const nextGame = upcomingGames[0] ?? null;

  return (
    <>
      <style>{`
        .gameCenterHero {
          background: linear-gradient(135deg,#111827 0%,#090909 100%);
          border: 1px solid #292d35;
          border-radius: 14px;
          padding: 22px;
          margin-bottom: 22px;
        }

        .gameCenterStats {
          display:grid;
          grid-template-columns:repeat(3,minmax(0,1fr));
          gap:10px;
          margin-top:18px;
        }

        .gameCenterStat {
          background:#111214;
          border:1px solid #26282d;
          border-radius:10px;
          padding:14px;
          text-decoration:none;
          color:#fff;
        }

        .gameCenterStatValue {
          font-size:24px;
          line-height:1;
          font-weight:900;
        }

        .gameCenterStatLabel {
          margin-top:6px;
          color:#8f97a3;
          font-size:11px;
          font-weight:800;
          text-transform:uppercase;
          letter-spacing:.07em;
        }

        .gameCenterSection {
          margin-top:24px;
        }

        .gameCenterSectionHead {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          margin-bottom:10px;
        }

        .gameCenterSectionTitle {
          color:#fff;
          font-size:16px;
          font-weight:900;
          letter-spacing:.02em;
          margin:0;
        }

        .gameCenterSectionCount {
          color:#7f8794;
          font-size:11px;
          font-weight:800;
        }

        .gameCenterLiveGrid {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:12px;
        }

        .gameCenterUpcomingGrid {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:12px;
        }

        .gameCenterCompletedGrid {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:12px;
        }

        .gameCenterLiveCard:hover,
        .gameCenterUpcomingGrid a:hover,
        .gameCenterCompletedGrid a:hover {
          border-color:#454851 !important;
        }

        @media (max-width:700px) {
          .gameCenterHero {
            padding:18px;
          }

          .gameCenterStats {
            grid-template-columns:1fr;
          }

          .gameCenterLiveGrid,
          .gameCenterUpcomingGrid,
          .gameCenterCompletedGrid {
            grid-template-columns:1fr;
          }
        }
      `}</style>

      <div className="pageHead">
        <div>
          <p className="eyebrow">Game management</p>
          <h1>Game Center</h1>
        </div>

        <Link
          href="/dashboard/games/new"
          className="button red"
          style={{
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          ＋ NEW GAME
        </Link>
      </div>

      <section className="gameCenterHero">
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                color: "#9b9ba3",
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: ".09em",
                textTransform: "uppercase",
                marginBottom: 7,
              }}
            >
              GameDay
            </div>

            <h2
              style={{
                margin: 0,
                color: "#fff",
                fontSize: 28,
                lineHeight: 1.1,
                fontWeight: 950,
              }}
            >
              Your Games
            </h2>

            <p
              style={{
                margin: "8px 0 0",
                color: "#aeb5c0",
                fontSize: 13,
                fontWeight: 650,
              }}
            >
              Schedule, score, follow and review every game in one place.
            </p>
          </div>

          {nextGame && (
            <Link
              href={`/dashboard/games/${nextGame.id}`}
              style={{
                display: "block",
                textDecoration: "none",
                background: "#15171b",
                border: "1px solid #30343c",
                borderRadius: 10,
                padding: 13,
                minWidth: 220,
                color: "#fff",
              }}
            >
              <div
                style={{
                  color: "#8f97a3",
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                }}
              >
                Next Game
              </div>

              <div
                style={{
                  marginTop: 5,
                  fontSize: 15,
                  fontWeight: 900,
                }}
              >
                {nextGame.home_name} vs {nextGame.away_name}
              </div>

              <div
                style={{
                  marginTop: 4,
                  color: "#aeb5c0",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {formatGameDate(nextGame.game_date)}
              </div>
            </Link>
          )}
        </div>

        <div className="gameCenterStats">
          <div className="gameCenterStat">
            <div className="gameCenterStatValue">{liveGames.length}</div>
            <div className="gameCenterStatLabel">Live</div>
          </div>

          <div className="gameCenterStat">
            <div className="gameCenterStatValue">{upcomingGames.length}</div>
            <div className="gameCenterStatLabel">Upcoming</div>
          </div>

          <div className="gameCenterStat">
            <div className="gameCenterStatValue">{completedGames.length}</div>
            <div className="gameCenterStatLabel">Completed</div>
          </div>
        </div>
      </section>

      <section className="gameCenterSection">
        <div className="gameCenterSectionHead">
          <h2 className="gameCenterSectionTitle">LIVE GAMES</h2>
          <span className="gameCenterSectionCount">
            {liveGames.length} game{liveGames.length === 1 ? "" : "s"}
          </span>
        </div>

        {liveGames.length > 0 ? (
          <div className="gameCenterLiveGrid">
            {liveGames.map((game) => (
              <LiveGameCard key={game.id} game={game} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <strong>No live games</strong>
            <p className="muted" style={{ marginBottom: 0 }}>
              Games you start scoring will appear here automatically.
            </p>
          </div>
        )}
      </section>

      <section className="gameCenterSection">
        <div className="gameCenterSectionHead">
          <h2 className="gameCenterSectionTitle">UPCOMING</h2>
          <span className="gameCenterSectionCount">
            {upcomingGames.length} game{upcomingGames.length === 1 ? "" : "s"}
          </span>
        </div>

        {upcomingGames.length > 0 ? (
          <div className="gameCenterUpcomingGrid">
            {upcomingGames.map((game) => (
              <UpcomingGameCard key={game.id} game={game} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <strong>No upcoming games</strong>
            <p className="muted" style={{ marginBottom: 12 }}>
              Create your next game to add it to the schedule.
            </p>

            <Link
              href="/dashboard/games/new"
              className="button primary"
              style={{ textDecoration: "none" }}
            >
              ＋ New Game
            </Link>
          </div>
        )}
      </section>

      <section className="gameCenterSection">
        <div className="gameCenterSectionHead">
          <h2 className="gameCenterSectionTitle">COMPLETED</h2>
          <span className="gameCenterSectionCount">
            {completedGames.length} game
            {completedGames.length === 1 ? "" : "s"}
          </span>
        </div>

        {completedGames.length > 0 ? (
          <div className="gameCenterCompletedGrid">
            {completedGames.map((game) => (
              <CompletedGameCard key={game.id} game={game} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <strong>No completed games</strong>
            <p className="muted" style={{ marginBottom: 0 }}>
              Finished games will appear here with their final scores.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
