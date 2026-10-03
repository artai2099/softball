export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { requireMembership } from "@/lib/auth";
import type { Game } from "@/lib/types";

function gameDate(value: string) {
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function gameTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusLabel(status: Game["status"]) {
  if (status === "live") return "LIVE";
  if (status === "final") return "FINAL";
  return "UPCOMING";
}

export default async function DashboardPage() {
  const { supabase, membership, user } = await requireMembership();

  const [{ data: games }, { count: teamCount }] = await Promise.all([
    supabase
      .from("games")
      .select("*")
      .eq("organization_id", membership.organization_id)
      .order("game_date", { ascending: false })
      .limit(12),

    supabase
      .from("teams")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", membership.organization_id),
  ]);

  const allGames = (games || []) as Game[];

  const liveGames = allGames.filter((game) => game.status === "live");

  const recentGames = allGames
    .filter((game) => game.status === "final" || game.status === "live")
    .slice(0, 5);

  const upcomingGames = allGames
    .filter((game) => game.status === "scheduled")
    .sort(
      (a, b) =>
        new Date(a.game_date).getTime() -
        new Date(b.game_date).getTime()
    )
    .slice(0, 4);

  const name =
    user.user_metadata?.display_name ||
    user.email?.split("@")[0] ||
    "there";

  return (
    <>
      <style>{`
        .gdpDashboard {
          min-height: 100%;
          background: #050505;
          color: #fff;
          padding: 28px;
        }

        .gdpContainer {
          width: min(1180px, 100%);
          margin: 0 auto;
        }

        .gdpTop {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 20px;
          margin-bottom: 24px;
        }

        .gdpKicker {
          margin: 0 0 8px;
          color: #8e8894;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .18em;
          text-transform: uppercase;
        }

        .gdpTitle {
          margin: 0;
          font-size: clamp(32px, 4vw, 52px);
          line-height: .98;
          letter-spacing: -.055em;
          font-weight: 900;
        }

        .gdpTitle span {
          color: #9a54ff;
        }

        .gdpActions {
          display: flex;
          gap: 9px;
          flex-wrap: wrap;
        }

        .gdpButton {
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 15px;
          border-radius: 8px;
          text-decoration: none;
          font-size: 12px;
          font-weight: 800;
        }

        .gdpButtonPrimary {
          color: #fff;
          background: #7d2bea;
        }

        .gdpButtonSecondary {
          color: #d8d3dd;
          border: 1px solid #2d2931;
          background: #0c0c0f;
        }

        .gdpStats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          margin-bottom: 34px;
          border-top: 1px solid #242126;
          border-bottom: 1px solid #242126;
        }

        .gdpStat {
          padding: 18px 20px;
          border-right: 1px solid #242126;
        }

        .gdpStat:last-child {
          border-right: 0;
        }

        .gdpStatLabel {
          display: block;
          color: #77717d;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .15em;
        }

        .gdpStatValue {
          display: block;
          margin-top: 7px;
          font-size: 30px;
          line-height: 1;
          font-weight: 900;
        }

        .gdpSection {
          margin-bottom: 38px;
        }

        .gdpSectionHead {
          display: flex;
          justify-content: space-between;
          align-items: end;
          gap: 15px;
          margin-bottom: 14px;
        }

        .gdpSectionHead h2 {
          margin: 0;
          font-size: 24px;
          letter-spacing: -.035em;
        }

        .gdpSectionHead a {
          color: #9f98a6;
          text-decoration: none;
          font-size: 11px;
          font-weight: 750;
        }

        .gdpRecentList {
          border-top: 1px solid #242126;
        }

        .gdpRecentRow {
          display: grid;
          grid-template-columns: 86px 1fr 82px 74px 24px;
          align-items: center;
          gap: 16px;
          min-height: 86px;
          padding: 0 10px;
          border-bottom: 1px solid #242126;
          color: inherit;
          text-decoration: none;
          transition: background .15s ease;
        }

        .gdpRecentRow:hover {
          background: #0d0b10;
        }

        .gdpDate strong {
          display: block;
          color: #fff;
          font-size: 14px;
        }

        .gdpDate span {
          display: block;
          margin-top: 3px;
          color: #6f6875;
          font-size: 9px;
          text-transform: uppercase;
        }

        .gdpMatchup {
          min-width: 0;
        }

        .gdpTeamLine {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .gdpTeamLine + .gdpTeamLine {
          margin-top: 6px;
        }

        .gdpTeamName {
          min-width: 0;
          overflow: hidden;
          color: #e9e5ec;
          font-size: 13px;
          font-weight: 700;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .gdpScore {
          color: #fff;
          font-size: 17px;
          font-weight: 900;
        }

        .gdpVs {
          margin: 2px 0 0;
          color: #5d5662;
          font-size: 8px;
          text-transform: uppercase;
          letter-spacing: .12em;
        }

        .gdpStatus {
          justify-self: start;
          padding: 6px 8px;
          border-radius: 999px;
          color: #a9a2ae;
          background: #111014;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: .1em;
        }

        .gdpStatusLive {
          color: #00d7c2;
          background: #081b19;
        }

        .gdpArrow {
          color: #625b68;
          font-size: 17px;
        }

        .gdpEmpty {
          padding: 38px 20px;
          border: 1px solid #242126;
          text-align: center;
        }

        .gdpEmpty strong {
          display: block;
          color: #ddd8e1;
          font-size: 13px;
        }

        .gdpEmpty span {
          display: block;
          margin-top: 5px;
          color: #716a77;
          font-size: 11px;
        }

        .gdpUpcoming {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .gdpUpcomingCard {
          padding: 18px;
          border: 1px solid #242126;
          background: #09090b;
          color: inherit;
          text-decoration: none;
        }

        .gdpUpcomingMeta {
          display: flex;
          justify-content: space-between;
          color: #716a77;
          font-size: 9px;
        }

        .gdpUpcomingTeams {
          margin-top: 20px;
        }

        .gdpUpcomingTeams strong {
          display: block;
          color: #eeeaf1;
          font-size: 14px;
        }

        .gdpUpcomingTeams span {
          display: block;
          margin: 5px 0;
          color: #5e5764;
          font-size: 9px;
          text-transform: uppercase;
        }

        .gdpLive {
          margin-bottom: 34px;
          padding: 22px;
          border: 1px solid #153c38;
          background: #071211;
        }

        .gdpLiveTop {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 20px;
        }

        .gdpLiveLabel {
          color: #00d7c2;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: .14em;
        }

        .gdpLiveInning {
          color: #77747a;
          font-size: 10px;
        }

        .gdpLiveTeams {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 15px;
        }

        .gdpLiveTeam {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
        }

        .gdpLiveTeamName {
          min-width: 0;
        }

        .gdpLiveTeamName small {
          display: block;
          margin-bottom: 4px;
          color: #68646a;
          font-size: 8px;
          letter-spacing: .12em;
        }

        .gdpLiveTeamName strong {
          display: block;
          overflow: hidden;
          font-size: 15px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .gdpLiveScore {
          font-size: 32px;
          font-weight: 900;
        }

        .gdpLiveVs {
          color: #5e6764;
          font-size: 9px;
          letter-spacing: .12em;
        }

        @media (max-width: 760px) {
          .gdpDashboard {
            padding: 18px 14px 90px;
          }

          .gdpTop {
            display: block;
          }

          .gdpActions {
            margin-top: 18px;
          }

          .gdpStats {
            grid-template-columns: repeat(3, 1fr);
          }

          .gdpStat {
            padding: 15px 10px;
          }

          .gdpStatValue {
            font-size: 24px;
          }

          .gdpRecentRow {
            grid-template-columns: 58px 1fr 55px 18px;
            gap: 9px;
            padding: 0 2px;
          }

          .gdpStatus {
            display: none;
          }

          .gdpUpcoming {
            grid-template-columns: 1fr;
          }

          .gdpLiveTeams {
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .gdpLiveVs {
            display: none;
          }
        }
      `}</style>

      <div className="gdpDashboard">
        <div className="gdpContainer">
          <div className="gdpTop">
            <div>
              <p className="gdpKicker">GameDay Command Center</p>
              <h1 className="gdpTitle">
                Welcome back, <span>{name}</span>.
              </h1>
            </div>

            <div className="gdpActions">
              <Link
                href="/dashboard/games/new"
                className="gdpButton gdpButtonPrimary"
              >
                + New Game
              </Link>

              <Link
                href="/dashboard/games"
                className="gdpButton gdpButtonSecondary"
              >
                All Games →
              </Link>
            </div>
          </div>

          <div className="gdpStats">
            <div className="gdpStat">
              <span className="gdpStatLabel">TEAMS</span>
              <strong className="gdpStatValue">{teamCount || 0}</strong>
            </div>

            <div className="gdpStat">
              <span className="gdpStatLabel">LIVE</span>
              <strong className="gdpStatValue">{liveGames.length}</strong>
            </div>

            <div className="gdpStat">
              <span className="gdpStatLabel">UPCOMING</span>
              <strong className="gdpStatValue">
                {upcomingGames.length}
              </strong>
            </div>
          </div>

          {liveGames[0] && (
            <section className="gdpLive">
              <div className="gdpLiveTop">
                <span className="gdpLiveLabel">● LIVE GAME</span>
                <span className="gdpLiveInning">
                  {liveGames[0].half === "top" ? "TOP" : "BOTTOM"}{" "}
                  {liveGames[0].inning}
                </span>
              </div>

              <div className="gdpLiveTeams">
                <div className="gdpLiveTeam">
                  <div className="gdpLiveTeamName">
                    <small>HOME</small>
                    <strong>{liveGames[0].home_name}</strong>
                  </div>

                  <span className="gdpLiveScore">
                    {liveGames[0].home_score}
                  </span>
                </div>

                <span className="gdpLiveVs">VS</span>

                <div className="gdpLiveTeam">
                  <div className="gdpLiveTeamName">
                    <small>AWAY</small>
                    <strong>{liveGames[0].away_name}</strong>
                  </div>

                  <span className="gdpLiveScore">
                    {liveGames[0].away_score}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 18 }}>
                <Link
                  href={`/dashboard/games/${liveGames[0].id}`}
                  className="gdpButton gdpButtonPrimary"
                >
                  Continue Scoring →
                </Link>
              </div>
            </section>
          )}

          <section className="gdpSection">
            <div className="gdpSectionHead">
              <div>
                <p className="gdpKicker">Activity</p>
                <h2>Recent Games</h2>
              </div>

              <Link href="/dashboard/games">View all →</Link>
            </div>

            {recentGames.length ? (
              <div className="gdpRecentList">
                {recentGames.map((game) => (
                  <Link
                    key={game.id}
                    href={`/dashboard/games/${game.id}`}
                    className="gdpRecentRow"
                  >
                    <div className="gdpDate">
                      <strong>{gameDate(game.game_date)}</strong>
                      <span>{gameTime(game.game_date)}</span>
                    </div>

                    <div className="gdpMatchup">
                      <div className="gdpTeamLine">
                        <span className="gdpTeamName">
                          {game.home_name}
                        </span>
                        <span className="gdpScore">
                          {game.status === "scheduled"
                            ? "—"
                            : game.home_score}
                        </span>
                      </div>

                      <p className="gdpVs">vs</p>

                      <div className="gdpTeamLine">
                        <span className="gdpTeamName">
                          {game.away_name}
                        </span>
                        <span className="gdpScore">
                          {game.status === "scheduled"
                            ? "—"
                            : game.away_score}
                        </span>
                      </div>
                    </div>

                    <span
                      className={
                        game.status === "live"
                          ? "gdpStatus gdpStatusLive"
                          : "gdpStatus"
                      }
                    >
                      {statusLabel(game.status)}
                    </span>

                    <span className="gdpArrow">→</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="gdpEmpty">
                <strong>No recent games yet.</strong>
                <span>
                  Once you score a game, it will appear here.
                </span>
              </div>
            )}
          </section>

          <section className="gdpSection">
            <div className="gdpSectionHead">
              <div>
                <p className="gdpKicker">Next</p>
                <h2>Upcoming Games</h2>
              </div>

              <Link href="/dashboard/games">View schedule →</Link>
            </div>

            {upcomingGames.length ? (
              <div className="gdpUpcoming">
                {upcomingGames.map((game) => (
                  <Link
                    key={game.id}
                    href={`/dashboard/games/${game.id}`}
                    className="gdpUpcomingCard"
                  >
                    <div className="gdpUpcomingMeta">
                      <span>{gameDate(game.game_date)}</span>
                      <span>{gameTime(game.game_date)}</span>
                    </div>

                    <div className="gdpUpcomingTeams">
                      <strong>{game.home_name}</strong>
                      <span>vs</span>
                      <strong>{game.away_name}</strong>
                    </div>

                    <div
                      style={{
                        marginTop: 16,
                        color: "#6f6875",
                        fontSize: 10,
                      }}
                    >
                      {game.venue || "Venue not set"}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="gdpEmpty">
                <strong>No upcoming games.</strong>
                <span>Schedule your next game to get started.</span>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
