export type MemberRole = "owner" | "admin" | "scorekeeper" | "viewer";

export type GameStatus = "scheduled" | "live" | "final";

export interface Team {
id: string;
organization_id: string;
name: string;
short_name: string;
color: string;
city: string;
}

export interface Game {
id: string;
public_id: string;
organization_id: string;
home_team_id: string | null;
away_team_id: string | null;
home_name: string;
away_name: string;
game_date: string;
venue: string;
visibility: "private" | "public";
status: GameStatus;
inning: number;
half: "top" | "bottom";
outs: number;
balls: number;
strikes: number;
pitch_count: number;
current_batter_id: string | null;
home_score: number;
away_score: number;
bases: Record<"1" | "2" | "3", string | null>;
version: number;
}

export interface GameEvent {
id: string;
game_id: string;
sequence: number;
result: string;
details: Record<string, string>;
state_after: Record<string, unknown>;
voided_at: string | null;
created_at: string;
}
