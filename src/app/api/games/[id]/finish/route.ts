import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rejectUntrustedOrigin } from "@/lib/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError=rejectUntrustedOrigin(request);if(originError)return originError;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const parsed=z.object({expectedVersion:z.number().int().nonnegative()}).safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"Invalid request"},{status:400});
  const { id } = await params;
  const { data, error } = await supabase.rpc("finish_game",{p_game_id:id,p_expected_version:parsed.data.expectedVersion});
  if (error) return NextResponse.json({ error: error.message }, { status: error.code==="40001"?409:error.code==="42501"?403:400 });
  return NextResponse.json({ game: Array.isArray(data)?data[0]:data },{headers:{"Cache-Control":"no-store"}});
}
