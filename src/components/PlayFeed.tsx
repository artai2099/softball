import type { GameEvent } from "@/lib/types";

const playNames: Record<string, string> = {
  ball: "Ball",
  strike: "Strike",
  foul: "Foul",
  single: "Single",
  double: "Double",
  triple: "Triple",
  home_run: "Home run",
  walk: "Walk",
  hbp: "Hit by pitch",
  strikeout: "Strikeout",
  out: "Out",
  error: "Error",
  double_play: "Double play",
  triple_play: "Triple play",
  runner_advance: "Runner advanced",
  runner_score: "Runner scored",
  runner_out: "Runner out",
};

function defensiveText(details: Record<string, string> = {}) {
  if (details.base_from) {
    const baseLabel = (base: string) => base === "1" ? "1B" : base === "2" ? "2B" : base === "3" ? "3B" : base;
    if (details.base_to) return `${baseLabel(details.base_from)} → ${baseLabel(details.base_to)}`;
    return `${baseLabel(details.base_from)} → Home`;
  }
  if (details.error_position) return `Error · ${details.error_position}`;
  const outs = [
    details.out_position_1,
    details.out_position_2,
    details.out_position_3,
  ].filter(Boolean);
  return outs.length ? `Defense · ${outs.join(" → ")}` : "";
}

export function PlayFeed({
  events,
  collapsible = false,
}: {
  events: GameEvent[];
  collapsible?: boolean;
}) {
  const active = events
    .filter((event) => !event.voided_at)
    .slice()
    .sort((a, b) => b.sequence - a.sequence)
    .slice(0, 12);

  const feed = (
    <div className="playFeed">
      {active.length ? (
        active.map((event) => (
          <article className="playRow" key={event.id}>
            <span className="playNumber">{event.sequence}</span>
            <span>
              <strong>
                {playNames[event.result] || event.result.replaceAll("_", " ")}
              </strong>
              <small>{defensiveText(event.details)}</small>
            </span>
            <time>
              {new Date(event.created_at).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>
          </article>
        ))
      ) : (
        <p className="notice">No plays recorded yet.</p>
      )}
    </div>
  );

  if (collapsible) {
    return (
      <details className="panel playFeedDetails">
        <summary className="playFeedSummary">
          <span>Play-by-Play</span>
          <span className="playFeedMeta">
            {active.length} recent {active.length === 1 ? "play" : "plays"}
            <span className="playFeedChevron" aria-hidden="true" />
          </span>
        </summary>
        {feed}
      </details>
    );
  }

  return (
    <section className="panel">
      <div className="liveLabel">Play by play</div>
      {feed}
    </section>
  );
}
