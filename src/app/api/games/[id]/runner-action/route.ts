import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runnerActionSchema } from "@/lib/scoring";
import { rejectUntrustedOrigin } from "@/lib/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = rejectUntrustedOrigin(request);
  if (originError) return originError;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const parsed = runnerActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid runner action", issues: parsed.error.issues }, { status: 400 });
  }

  const { id } = await params;
  const { data, error } = await supabase.rpc("record_runner_action", {
    p_game_id: id,
    p_action: parsed.data.action,
    p_base_from: parsed.data.baseFrom,
    p_base_to: parsed.data.baseTo ?? null,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_expected_version: parsed.data.expectedVersion,
  });

  if (error) {
    const status = error.code === "40001" ? 409 : error.code === "42501" ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(
    { game: Array.isArray(data) ? data[0] : data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
