import { notFound } from "next/navigation";
import { ScoringConsole } from "@/components/ScoringConsole";
import { createClient } from "@/lib/supabase/server";
import type { Game,GameEvent } from "@/lib/types";

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: game },{data:events}] = await Promise.all([supabase.from("games").select("*").eq("id", id).single(),supabase.from("game_events").select("*").eq("game_id",id).order("sequence")]);
  if (!game) notFound();
  const { data: { user } }=await supabase.auth.getUser();
  const { data: membership }=await supabase.from("organization_members").select("role").eq("organization_id",game.organization_id).eq("user_id",user!.id).single();
  const canScore=Boolean(membership&&["owner","admin","scorekeeper"].includes(membership.role));
  return <ScoringConsole initialGame={game as Game} initialEvents={(events||[]) as GameEvent[]} canScore={canScore} />;
}
