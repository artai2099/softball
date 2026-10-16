import { z } from "zod";

export const defensivePositions = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
const defensivePosition = z.enum(defensivePositions);

export const scoreEventSchema = z.object({
  result: z.enum(["ball", "strike", "foul", "single", "double", "triple", "home_run", "walk", "hbp", "strikeout", "out", "error", "double_play", "triple_play", "sacrifice_fly", "sacrifice_bunt"]),
  idempotencyKey: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
  details: z.object({
    batter_id: z.string().uuid().optional(),
    pitcher_id: z.string().uuid().optional(),
    error_fielder_id: z.string().uuid().optional(),
    out_fielder_id_1: z.string().uuid().optional(),
    out_fielder_id_2: z.string().uuid().optional(),
    out_fielder_id_3: z.string().uuid().optional(),
    rbi: z.number().int().nonnegative().optional(),
    error_position: defensivePosition.optional(),
    out_position_1: defensivePosition.optional(),
    out_position_2: defensivePosition.optional(),
    out_position_3: defensivePosition.optional()
  }).default({})
}).superRefine((value, ctx) => {
  const required = value.result === "error" ? ["error_position"]
    : value.result === "out" ? ["out_position_1"]
    : value.result === "double_play" ? ["out_position_1", "out_position_2"]
    : value.result === "triple_play" ? ["out_position_1", "out_position_2", "out_position_3"]
    : [];
  for (const key of required) {
    if (!value.details[key as keyof typeof value.details]) {
      ctx.addIssue({ code: "custom", path: ["details", key], message: "Defensive position is required" });
    }
  }
});

export type ScoreEventInput = z.infer<typeof scoreEventSchema>;

export const runnerActionSchema = z.object({
  action: z.enum(["advance", "score", "out"]),
  baseFrom: z.enum(["1", "2", "3"]),
  baseTo: z.enum(["2", "3"]).optional(),
  idempotencyKey: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
}).superRefine((value, ctx) => {
  if (value.action === "advance") {
    const expectedTo = value.baseFrom === "1" ? "2" : value.baseFrom === "2" ? "3" : undefined;
    if (!expectedTo || value.baseTo !== expectedTo) {
      ctx.addIssue({ code: "custom", path: ["baseTo"], message: "Runner must advance to the next base." });
    }
  }
});
