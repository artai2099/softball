import { describe, expect, it } from "vitest";
import { runnerActionSchema, scoreEventSchema } from "../src/lib/scoring";

const base = { idempotencyKey: "8e583fe5-35ec-4ea7-abcb-23bd6a713fc3", expectedVersion: 0 };

describe("scoreEventSchema", () => {
  it("accepts ordinary pitch events", () => {
    expect(scoreEventSchema.safeParse({ ...base, result: "ball", details: {} }).success).toBe(true);
  });
  it("requires a position for an error", () => {
    expect(scoreEventSchema.safeParse({ ...base, result: "error", details: {} }).success).toBe(false);
    expect(scoreEventSchema.safeParse({ ...base, result: "error", details: { error_position: "SS" } }).success).toBe(true);
  });
  it("requires every out position for double and triple plays", () => {
    expect(scoreEventSchema.safeParse({ ...base, result: "double_play", details: { out_position_1: "SS" } }).success).toBe(false);
    expect(scoreEventSchema.safeParse({ ...base, result: "double_play", details: { out_position_1: "SS", out_position_2: "1B" } }).success).toBe(true);
    expect(scoreEventSchema.safeParse({ ...base, result: "triple_play", details: { out_position_1: "SS", out_position_2: "2B", out_position_3: "1B" } }).success).toBe(true);
  });
  it("rejects stale or malformed request identifiers", () => {
    expect(scoreEventSchema.safeParse({ ...base, idempotencyKey: "not-a-uuid", result: "single" }).success).toBe(false);
    expect(scoreEventSchema.safeParse({ ...base, expectedVersion: -1, result: "single" }).success).toBe(false);
  });
});


describe("runnerActionSchema", () => {
  const runnerBase = { idempotencyKey: "8e583fe5-35ec-4ea7-abcb-23bd6a713fc3", expectedVersion: 3 };
  it("accepts advancing a runner to the next base", () => {
    expect(runnerActionSchema.safeParse({ ...runnerBase, action: "advance", baseFrom: "1", baseTo: "2" }).success).toBe(true);
    expect(runnerActionSchema.safeParse({ ...runnerBase, action: "advance", baseFrom: "2", baseTo: "3" }).success).toBe(true);
  });
  it("rejects skipping bases or advancing home from third", () => {
    expect(runnerActionSchema.safeParse({ ...runnerBase, action: "advance", baseFrom: "1", baseTo: "3" }).success).toBe(false);
    expect(runnerActionSchema.safeParse({ ...runnerBase, action: "advance", baseFrom: "3" }).success).toBe(false);
  });
  it("accepts scoring and runner-out actions from any base", () => {
    for (const baseFrom of ["1", "2", "3"] as const) {
      expect(runnerActionSchema.safeParse({ ...runnerBase, action: "score", baseFrom }).success).toBe(true);
      expect(runnerActionSchema.safeParse({ ...runnerBase, action: "out", baseFrom }).success).toBe(true);
    }
  });
});
