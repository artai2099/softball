"use client";

import { useRef, useState } from "react";

type Review = {
  home: string;
  away: string;
  date: string;
  venue: string;
  innings: string;
  visibility: string;
};

function displayDate(value: string) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function PregameReviewSubmit() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [review, setReview] = useState<Review | null>(null);

  function openReview() {
    const form = buttonRef.current?.closest("form");
    if (!form) return;
    const values = new FormData(form);
    const selectedHome = form.querySelector<HTMLSelectElement>('select[name="homeTeamId"]');
    const selectedOpponent = form.querySelector<HTMLInputElement>('input[name="awayTeamId"]');
    const opponentName = String(values.get("awayName") ?? "").trim();
    const selectedTeamLabel = selectedOpponent?.value
      ? document.querySelector("#opponent-team-search")?.getAttribute("value")
      : "";
    const opponentSearch = form.querySelector<HTMLInputElement>("#opponent-team-search");
    const innings = String(values.get("innings") ?? "7");
    const visibility = String(values.get("visibility") ?? "private");

    setReview({
      home: selectedHome?.selectedOptions[0]?.textContent?.trim() || "Not selected",
      away: (opponentSearch?.value && selectedOpponent?.value
        ? opponentSearch.value
        : opponentName) || "Not entered",
      date: displayDate(String(values.get("gameDate") ?? "")),
      venue: String(values.get("venue") ?? "").trim() || "Not set",
      innings: `${innings} innings`,
      visibility: visibility === "public" ? "Public score and video page" : "Private organization game",
    });
    void selectedTeamLabel;
  }

  function confirmCreate() {
    const form = buttonRef.current?.closest("form");
    if (!form) return;
    setReview(null);
    form.requestSubmit();
  }

  return (
    <>
      <button ref={buttonRef} className="button red" type="button" onClick={openReview}>
        Review game details
      </button>
      {review && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReview(null);
          }}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(3,12,28,.72)", display: "grid", placeItems: "center", padding: 16 }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="pregame-review-title"
            className="card"
            style={{ width: "min(520px,100%)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 80px #0005" }}
          >
            <p className="eyebrow" style={{ marginBottom: 8 }}>Pregame check</p>
            <h2 id="pregame-review-title" style={{ marginTop: 0 }}>Review your game</h2>
            <p className="muted" style={{ lineHeight: 1.5 }}>Check these details before creating the game. You can go back to make changes.</p>
            <dl style={{ display: "grid", gridTemplateColumns: "minmax(100px,.7fr) minmax(0,1.3fr)", gap: "12px 16px", margin: "20px 0" }}>
              <dt className="muted">Matchup</dt><dd style={{ margin: 0, fontWeight: 800 }}>{review.away} at {review.home}</dd>
              <dt className="muted">Date & time</dt><dd style={{ margin: 0 }}>{review.date}</dd>
              <dt className="muted">Venue</dt><dd style={{ margin: 0 }}>{review.venue}</dd>
              <dt className="muted">Length</dt><dd style={{ margin: 0 }}>{review.innings}</dd>
              <dt className="muted">Scoreboard</dt><dd style={{ margin: 0 }}>{review.visibility}</dd>
            </dl>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="button secondary" onClick={() => setReview(null)}>Back to edit</button>
              <button type="button" className="button red" onClick={confirmCreate}>Confirm & create game</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
