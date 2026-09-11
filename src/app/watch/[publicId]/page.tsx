import { notFound } from "next/navigation";
import { PublicScoreboard } from "@/components/PublicScoreboard";
import { createClient } from "@/lib/supabase/server";
import type { Game,GameEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WatchPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const supabase = await createClient();
  const { data: game } = await supabase.from("games").select("*").eq("public_id", publicId).eq("visibility", "public").single();
  if (!game) notFound();
  const {data:events}=await supabase.from("game_events").select("*").eq("game_id",game.id).is("voided_at",null).order("sequence");
  return <PublicScoreboard initialGame={game as Game} initialEvents={(events||[]) as GameEvent[]} />;
}
