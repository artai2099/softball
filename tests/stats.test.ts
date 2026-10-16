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

  it("calculates sacrifice flies, RBI, and explicit earned runs without charging an at-bat", () => {
    const stats = calculateGameStats(homePlayers, awayPlayers, [
      event(1, "triple", "away-1"),
      {
        sequence: 2,
        result: "sacrifice_fly",
        details: { batter_id: "away-2", pitcher_id: "home-1", earned_runs: 1 },
        voided_at: null,
      },
    ]);
    expect(stats.away.rows.find(row => row.playerId === "away-2")).toMatchObject({
      pa: 1, ab: 0, sf: 1, rbi: 1,
    });
    expect(stats.away.runs).toBe(1);
    expect(stats.home.rows.find(row => row.playerId === "home-1")).toMatchObject({
      pitchingOuts: 1, runsAllowed: 1, earnedRuns: 1,
    });
  });

  it("counts a hit batter against the recorded pitcher", () => {
    const stats = calculateGameStats(homePlayers, awayPlayers, [
      {
        sequence: 1,
        result: "hbp",
        details: { batter_id: "away-1", pitcher_id: "home-1" },
        voided_at: null,
      },
    ]);
    expect(stats.home.rows.find(row => row.playerId === "home-1")?.hitBattersAllowed).toBe(1);
    expect(stats.away.rows.find(row => row.playerId === "away-1")?.hbp).toBe(1);
  });

  it("attributes pitching outs and defensive putouts only when player IDs are recorded", () => {
    const stats = calculateGameStats(homePlayers, awayPlayers, [
      {
        sequence: 1,
        result: "out",
        details: { batter_id: "away-1", pitcher_id: "home-1", out_position_1: "SS", out_fielder_id_1: "home-1" },
        voided_at: null,
      },
    ]);
    expect(stats.home.rows.find(row => row.playerId === "home-1")).toMatchObject({
      pitchingOuts: 1, putouts: 1,
    });
  });

  it("counts stolen bases and caught stealing from runner events", () => {
    const stats = calculateGameStats(homePlayers, awayPlayers, [
      event(1, "single", "away-1"),
      {
        sequence: 2,
        result: "stolen_base",
        details: { runner_id: "away-1", base_from: "1", base_to: "2" },
        voided_at: null,
      },
      {
        sequence: 3,
        result: "caught_stealing",
        details: { runner_id: "away-1", base_from: "2", base_to: null },
        voided_at: null,
      },
    ]);
    expect(stats.away.rows.find(row => row.playerId === "away-1")).toMatchObject({ sb: 1, cs: 1 });
  });

  it("uses saved scoring snapshots to keep later runs in the correct inning", () => {
    const out = (sequence: number, outs: number, inning: number) => ({
      sequence,
      result: "out",
      details: { batter_id: "away-1", out_position_1: "SS" },
      state_after: { inning, half: "top", outs, bases: { "1": null, "2": null, "3": null } },
      voided_at: null,
    });
    const stats = calculateGameStats(homePlayers, awayPlayers, [
      out(1, 1, 1),
      out(2, 2, 1),
      out(3, 0, 2),
      {
        sequence: 4,
        result: "home_run",
        details: { batter_id: "away-2" },
        state_after: { inning: 2, half: "top", outs: 0, bases: { "1": null, "2": null, "3": null } },
        voided_at: null,
      },
    ]);
    expect(stats.away.runsByInning).toEqual([0, 1]);
  });

  it("attributes plate appearances to an incoming substitute", () => {
    const substitute: Player = { player_id: "home-sub", batting_order: 1, first_name: "Home", last_name: "Sub", jersey_number: 12 };
    const stats = calculateGameStats([...homePlayers, substitute], awayPlayers, [
      { sequence: 1, result: "single", details: { batter_id: "home-sub" }, voided_at: null },
    ]);
    expect(stats.home.rows.find(row => row.playerId === "home-sub")).toMatchObject({ pa: 1, ab: 1, h: 1, singles: 1 });
    expect(stats.home.rows.find(row => row.playerId === "home-1")?.pa).toBe(0);
  });

  it("reverses voided events after undo without retaining their stats", () => {
    const stats = calculateGameStats(homePlayers, awayPlayers, [
      { ...event(1, "home_run", "away-2"), voided_at: "2026-10-15T12:00:00Z" },
    ]);

    expect(stats.away.runs).toBe(0);
    expect(stats.away.rows.find((row) => row.playerId === "away-2")?.pa).toBe(0);
  });

  it("preserves second and third base runners through a walk when first is empty", () => {
    const hitters: Player[] = [
      ...awayPlayers,
      { player_id: "away-3", batting_order: 3, first_name: "Away", last_name: "Walker", jersey_number: 10 },
      { player_id: "away-4", batting_order: 4, first_name: "Away", last_name: "Homer", jersey_number: 11 },
    ];
    const stats = calculateGameStats(homePlayers, hitters, [
      event(1, "single", "away-1"),
      event(2, "double", "away-2"),
      event(3, "walk", "away-3"),
      event(4, "home_run", "away-4"),
    ]);

    expect(stats.away.runs).toBe(4);
    expect(stats.away.rows.find((row) => row.playerId === "away-1")?.r).toBe(1);
    expect(stats.away.rows.find((row) => row.playerId === "away-2")?.r).toBe(1);
    expect(stats.away.rows.find((row) => row.playerId === "away-3")?.r).toBe(1);
    expect(stats.away.rows.find((row) => row.playerId === "away-4")).toMatchObject({ r: 1, hr: 1, rbi: 4 });
  });

  it("counts team hits even when an event has no roster batter ID", () => {
    const stats = calculateGameStats(homePlayers, awayPlayers, [
      {
        sequence: 1,
        result: "single",
        details: {},
        state_after: {
          inning: 1, half: "top", outs: 0,
          home_score: 0, away_score: 0,
          bases: { "1": "unlisted-opponent-runner", "2": null, "3": null },
        },
        voided_at: null,
      },
    ]);

    expect(stats.away.hits).toBe(1);
    expect(stats.away.rows.reduce((total, row) => total + row.h, 0)).toBe(0);
  });

  it("uses saved score snapshots for team runs when a batter ID is missing", () => {
    const stats = calculateGameStats(homePlayers, awayPlayers, [
      {
        sequence: 1,
        result: "home_run",
        details: {},
        state_after: {
          inning: 1, half: "top", outs: 0,
          home_score: 0, away_score: 1,
          bases: { "1": null, "2": null, "3": null },
        },
        voided_at: null,
      },
    ]);

    expect(stats.away.runs).toBe(1);
    expect(stats.away.runsByInning).toEqual([1]);
    expect(stats.home.runs).toBe(0);
    // Team score remains accurate, while player attribution is not invented.
    expect(stats.away.rows.reduce((total, row) => total + row.r, 0)).toBe(0);
  });
});
