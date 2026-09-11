import Link from "next/link";
import { GameCard } from "@/components/GameCard";
import { requireMembership } from "@/lib/auth";
import type { Game } from "@/lib/types";

export default async function GamesPage() {
  const { supabase,membership }=await requireMembership();
  const { data: games }=await supabase.from("games").select("*").eq("organization_id",membership.organization_id).order("game_date",{ascending:false});
  return <><div className="pageHead"><div><p className="eyebrow">Schedule and results</p><h1>Games</h1></div><Link href="/dashboard/games/new" className="button red">＋ New game</Link></div><section className="grid">{games?.length?games.map(game=><GameCard key={game.id} game={game as Game}/>):<div className="empty">No games scheduled.</div>}</section></>;
}
