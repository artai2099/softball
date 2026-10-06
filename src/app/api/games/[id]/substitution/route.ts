import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const substitutionSchema = z.object({
  outgoingPlayerId: z.string().uuid(),
  incomingPlayerId: z.string().uuid(),
  battingOrder: z.number().int().positive(),
  position: z.string().max(10),
  expectedVersion: z.number().int().nonnegative(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const parsed = substitutionSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid substitution request" },
      { status: 400 },
    );
  }

  const {
    outgoingPlayerId,
    incomingPlayerId,
    battingOrder,
    position,
    expectedVersion,
  } = parsed.data;

  const { data, error } = await supabase.rpc("record_game_substitution", {
    p_game_id: id,
    p_outgoing_player_id: outgoingPlayerId,
    p_incoming_player_id: incomingPlayerId,
    p_batting_order: battingOrder,
    p_position: position,
    p_expected_version: expectedVersion,
  });

  if (error) {
    const status =
      error.code === "40001"
        ? 409
        : error.code === "42501"
          ? 403
          : error.code === "P0002"
            ? 404
            : 400;

    return NextResponse.json(
      { error: error.message || "Substitution could not be completed" },
      { status },
    );
  }

  return NextResponse.json(
    {
      game: Array.isArray(data) ? data[0] : data,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
