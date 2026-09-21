import { z } from "zod";

export const defensivePositions = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
const defensivePosition = z.enum(defensivePositions);

export const scoreEventSchema = z.object({
  result: z.enum(["ball", "strike", "foul", "single", "double", "triple", "home_run", "walk", "hbp", "strikeout", "out", "error", "double_play", "triple_play"]),
  idempotencyKey: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
  details: z.object({
    batter_id: z.string().uuid().optional(),
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
