"use client";

import { useMemo, useState } from "react";

type TeamOption = { id: string; name: string; city: string | null };

export default function OpponentTeamPicker({ teams }: { teams: TeamOption[] }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [open, setOpen] = useState(false);
  const selected = teams.find((team) => team.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return teams.filter((team) =>
      !needle || `${team.name} ${team.city ?? ""}`.toLocaleLowerCase().includes(needle)
    );
  }, [teams, query]);

  return (
    <div>
      <label htmlFor="opponent-team-search">Opponent team you follow</label>
      <input
        id="opponent-team-search"
        type="search"
        value={query}
        autoComplete="off"
        placeholder="Search followed teams by name or city"
        aria-expanded={open}
        aria-controls="opponent-team-options"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelectedId("");
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Enter" && open && filtered.length) {
            event.preventDefault();
            setSelectedId(filtered[0].id);
            setQuery(`${filtered[0].name}${filtered[0].city ? ` · ${filtered[0].city}` : ""}`);
            setOpen(false);
          }
        }}
      />
      <input type="hidden" name="awayTeamId" value={selectedId} />
      {open && (
        <div
          id="opponent-team-options"
          role="listbox"
          aria-label="Followed teams"
          style={{ marginTop: 6, maxHeight: 220, overflowY: "auto", border: "1px solid #cbd3df", borderRadius: 8, background: "#fff" }}
        >
          {filtered.length ? filtered.map((team) => (
            <button
              key={team.id}
              type="button"
              role="option"
              aria-selected={selectedId === team.id}
              onClick={() => {
                setSelectedId(team.id);
                setQuery(`${team.name}${team.city ? ` · ${team.city}` : ""}`);
                setOpen(false);
              }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 12px", border: 0, borderBottom: "1px solid #edf0f4", background: selectedId === team.id ? "#eaf2ff" : "#fff", color: "#15233a", cursor: "pointer" }}
            >
              <strong>{team.name}</strong>
              {team.city && <span style={{ display: "block", color: "#647084", fontSize: 12, marginTop: 2 }}>{team.city}</span>}
            </button>
          )) : (
            <p style={{ padding: "10px 12px", margin: 0, color: "#647084", fontSize: 13 }}>
              No followed teams match. You can enter the opponent name below.
            </p>
          )}
        </div>
      )}
      {selected && (
        <button type="button" className="button secondary" style={{ marginTop: 8 }} onClick={() => { setSelectedId(""); setQuery(""); setOpen(false); }}>
          Clear selected team
        </button>
      )}
      <span className="muted" style={{ display: "block", marginTop: 6 }}>
        Search by team name or city, then select a result. Or enter an opponent name below.
      </span>
    </div>
  );
}
