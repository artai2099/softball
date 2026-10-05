import { describe, expect, it } from "vitest";
import { calculateGameStats, obp, ops, rate, slg } from "../src/lib/stats/gameStats";

const players = [
  { player_id: "a", batting_order: 1, first_name: "A", last_name: "One", jersey_number: 1 },
  { player_id: "b", batting_order: 2, first_name: "B", last_name: "Two", jersey_number: 2 },
  { player_id: "c", batting_order: 3, first_name: "C", last_name: "Three", jersey_number: 3 },
  { player_id: "d", batting_order: 4, first_name: "D", last_name: "Four", jersey_number: 4 },
];

const e = (sequence: number, result: string, batter_id: string, extra: Record<string, unknown> = {}) => ({
  sequence,
  result,
  details: { batter_id, ...extra },
  voided_at: null,
});

describe("professional batting stats", () => {
  it("calculates PA/AB/hits and slash line", () => {
    const { away } = calculateGameStats([], players, [
      e(1, "single", "a"),
      e(2, "double", "b"),
      e(3, "home_run", "c"),
      e(4, "walk", "d"),
    ]);

    const a = away.rows.find((s) => s.playerId === "a")!;
    const b = away.rows.find((s) => s.playerId === "b")!;
    const c = away.rows.find((s) => s.playerId === "c")!;
    const d = away.rows.find((s) => s.playerId === "d")!;

    expect(a).toMatchObject({ pa: 1, ab: 1, h: 1, singles: 1 });
    expect(b).toMatchObject({ pa: 1, ab: 1, h: 1, doubles: 1 });
    expect(c).toMatchObject({ pa: 1, ab: 1, h: 1, hr: 1, r: 1 });
    expect(d).toMatchObject({ pa: 1, ab: 0, bb: 1 });

    expect(rate(2, 4)).toBe(".500");
    expect(slg({ ...a, singles: 1, doubles: 1, triples: 0, hr: 0, ab: 2 })).toBe("1.500");
    expect(obp(d)).toBe("1.000");
    expect(ops(d)).toBe("1.000");
  });

  it("tracks runs from the current base-runner model", () => {
    const { away } = calculateGameStats([], players, [
      e(1, "single", "a"),
      e(2, "single", "b"),
      e(3, "double", "c"),
    ]);

    // A single advances existing runners one base. The double then scores
    // the runner who started on first and leaves the other runner on third.
    expect(away.runs).toBe(1);
    expect(away.rows.find((s) => s.playerId === "a")?.r).toBe(1);
    expect(away.rows.find((s) => s.playerId === "b")?.r).toBe(0);
    expect(away.rows.find((s) => s.playerId === "c")?.r).toBe(0);
  });

  it("ignores voided events", () => {
    const { away } = calculateGameStats([], players, [
      e(1, "home_run", "a"),
      { ...e(2, "home_run", "b"), voided_at: "2026-10-03T00:00:00Z" },
    ]);

    expect(away.runs).toBe(1);
    expect(away.rows.find((s) => s.playerId === "a")?.hr).toBe(1);
    expect(away.rows.find((s) => s.playerId === "b")?.hr).toBe(0);
  });
});
