import Link from "next/link";
import { GameCard } from "@/components/GameCard";
import { requireMembership } from "@/lib/auth";
import type { Game } from "@/lib/types";

export default async function DashboardPage() {
  const { supabase, membership } = await requireMembership();
  const [{ data: games }, { count: teamCount }] = await Promise.all([
    supabase.from("games").select("*").eq("organization_id", membership.organization_id).order("game_date", { ascending: false }).limit(6),
    supabase.from("teams").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id)
  ]);
  return <>
    <div className="pageHead"><div><p className="eyebrow">Organization dashboard</p><h1>Game center</h1></div><Link className="button red" href="/dashboard/games/new">＋ New game</Link></div>
    <section className="grid">
      <div className="card"><h3>Teams</h3><strong style={{ fontSize: 42 }}>{teamCount || 0}</strong><p className="muted">Active teams in your organization</p><Link className="button secondary" href="/dashboard/teams">Manage teams</Link></div>
      <div className="card"><h3>Your role</h3><strong style={{ fontSize: 24, textTransform: "capitalize" }}>{membership.role}</strong><p className="muted">Permissions are enforced in PostgreSQL, not only in the interface.</p></div>
    </section>
    <div className="pageHead" style={{ marginTop: 30 }}><h1>Recent games</h1></div>
    <section className="grid">{games?.length ? games.map(game => <GameCard key={game.id} game={game as Game} />) : <div className="empty">No games yet. Create your first game to begin scoring.</div>}</section>
  </>;
}
