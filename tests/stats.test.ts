import { describe, expect, it } from "vitest";
import { calculateGameStats, type GameEvent, type Player } from "../src/lib/stats/gameStats";

const homePlayers: Player[] = [
  { player_id: "home-1", batting_order: 1, first_name: "Home", last_name: "Batter", jersey_number: 1 },
];
const awayPlayers: Player[] = [
  { player_id: "away-1", batting_order: 1, first_name: "Away", last_name: "Runner", jersey_number: 7 },
  { player_id: "away-2", batting_order: 2, first_name: "Away", last_name: "Slugger", jersey_number: 9 },
];

function event(sequence: number, result: string, batter_id: string): GameEvent {
  return {
    sequence,
    result,
    details: { batter_id },
    voided_at: null,
  };
}

describe("calculateGameStats", () => {
  it("credits RBI for runs scored on a home run, including the batter", () => {
    const stats = calculateGameStats(homePlayers, awayPlayers, [
      event(1, "single", "away-1"),
      event(2, "home_run", "away-2"),
    ]);

    expect(stats.away.runs).toBe(2);
    expect(stats.away.rows.find((row) => row.playerId === "away-2")).toMatchObject({
      pa: 1,
      ab: 1,
      h: 1,
      hr: 1,
      rbi: 2,
    });
    expect(stats.away.rows.find((row) => row.playerId === "away-1")?.r).toBe(1);
  });

  it("honors an explicit RBI value when one is stored on the event", () => {
    const stats = calculateGameStats(homePlayers, awayPlayers, [
      { ...event(1, "single", "away-1"), details: { batter_id: "away-1" } },
      { ...event(2, "home_run", "away-2"), details: { batter_id: "away-2", rbi: 1 } },
    ]);

    expect(stats.away.rows.find((row) => row.playerId === "away-2")?.rbi).toBe(1);
  });

  it("credits runs from manual runner advance and score events", () => {
    const stats = calculateGameStats(homePlayers, awayPlayers, [
      event(1, "single", "away-1"),
      {
        sequence: 2,
        result: "runner_advance",
        details: { runner_id: "away-1", base_from: "1", base_to: "2" },
        voided_at: null,
      },
      {
        sequence: 3,
        result: "runner_score",
        details: { runner_id: "away-1", base_from: "2", base_to: null },
        voided_at: null,
      },
    ]);

    expect(stats.away.runs).toBe(1);
    expect(stats.away.runsByInning).toEqual([1]);
    expect(stats.away.rows.find((row) => row.playerId === "away-1")?.r).toBe(1);
    // A separate runner action does not guess an RBI for an earlier batter.
    expect(stats.away.rows.find((row) => row.playerId === "away-1")?.rbi).toBe(0);
  });

  it("removes a runner from the bases after a manual runner out", () => {
    const stats = calculateGameStats(homePlayers, awayPlayers, [
      event(1, "single", "away-1"),
      {
        sequence: 2,
        result: "runner_out",
        details: { runner_id: "away-1", base_from: "1", base_to: null },
        voided_at: null,
      },
    ]);

    expect(stats.away.runs).toBe(0);
    expect(stats.away.rows.find((row) => row.playerId === "away-1")?.r).toBe(0);
  });

  it("does not count voided events in batting totals", () => {
    const stats = calculateGameStats(homePlayers, awayPlayers, [
      { ...event(1, "home_run", "away-2"), voided_at: "2026-10-15T12:00:00Z" },
    ]);

    expect(stats.away.runs).toBe(0);
    expect(stats.away.rows.find((row) => row.playerId === "away-2")?.pa).toBe(0);
  });
});
