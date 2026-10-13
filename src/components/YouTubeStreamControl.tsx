"use client";

import { useCallback, useEffect, useState } from "react";

type YouTubeStatus = {
  configured: boolean;
  canBroadcast: boolean;
  active: boolean;
  watchUrl: string | null;
};

export function YouTubeStreamControl({ gameId }: { gameId: string }) {
  const [status, setStatus] = useState<YouTubeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/games/${gameId}/youtube`, {
        method: "GET",
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Unable to check YouTube Live status.");
      }
      setStatus(body as YouTubeStatus);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to check YouTube Live status.");
    }
  }, [gameId]);

  useEffect(() => {
    void loadStatus();
    const interval = window.setInterval(() => void loadStatus(), 15000);
    return () => window.clearInterval(interval);
  }, [loadStatus]);

  async function toggleBroadcast() {
    if (!status || busy) return;

    const action = status.active ? "stop" : "start";
    const prompt = action === "start"
      ? "Start sending this game's public scoreboard and live camera to your configured YouTube channel?"
      : "Stop this game's YouTube broadcast? The GameDay camera and scoring will remain on.";
    if (!window.confirm(prompt)) return;

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/games/${gameId}/youtube`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "YouTube broadcast request failed.");
      setStatus((current) => current ? { ...current, active: Boolean(body.active) } : current);
      setMessage(body.message || (action === "start" ? "Broadcast start requested." : "Broadcast stop requested."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "YouTube broadcast request failed.");
      await loadStatus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel youtubeStreamControl" aria-labelledby="youtube-stream-heading">
      <div className="youtubeStreamTop">
        <div>
          <div className="liveLabel">LIVE BROADCAST</div>
          <h3 id="youtube-stream-heading">YouTube Live</h3>
          <p>
            Send the live camera and GameDay scoreboard to your YouTube stream.
          </p>
        </div>
        <span className={status?.active ? "youtubeStreamStatus active" : "youtubeStreamStatus"}>
          <span aria-hidden="true" />
          {status?.active ? "Broadcast active" : "Not streaming"}
        </span>
      </div>

      {!status ? (
        <p className="notice">Checking YouTube setup…</p>
      ) : status.active ? (
        <button
          type="button"
          className="button youtubeStopButton"
          disabled={busy}
          onClick={() => void toggleBroadcast()}
        >
          {busy ? "Please wait…" : "■  Stop YouTube Stream"}
        </button>
      ) : !status.configured ? (
        <p className="notice">
          Setup required: add YOUTUBE_STREAM_KEY in the Vercel server environment, then redeploy.
        </p>
      ) : !status.canBroadcast ? (
        <p className="notice">
          To broadcast, make this game Public and start the game first.
        </p>
      ) : (
        <button
          type="button"
          className="button youtubeStartButton"
          disabled={busy}
          onClick={() => void toggleBroadcast()}
        >
          {busy ? "Please wait…" : "▶  Stream to YouTube"}
        </button>
      )}

      {status?.watchUrl && (
        <p className="youtubeStreamLink">
          <a href={status.watchUrl} target="_blank" rel="noreferrer">
            Open YouTube watch page ↗
          </a>
        </p>
      )}

      {message && <p className="notice youtubeStreamMessage" role="status">{message}</p>}

      <style jsx>{`
        .youtubeStreamControl { margin-top: 12px; }
        .youtubeStreamTop { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
        h3 { margin: 4px 0 6px; color: var(--text, #f8fafc); font-size: 18px; }
        p { margin: 0 0 12px; color: var(--muted, #94a3b8); font-size: 13px; }
        .youtubeStreamStatus { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--border, #334155); border-radius: 999px; padding: 6px 10px; color: var(--muted, #94a3b8); font-size: 11px; font-weight: 750; }
        .youtubeStreamStatus > span { width: 7px; height: 7px; border-radius: 50%; background: #64748b; }
        .youtubeStreamStatus.active { border-color: rgba(239, 68, 68, .35); color: #fca5a5; }
        .youtubeStreamStatus.active > span { background: #ef4444; box-shadow: 0 0 0 4px rgba(239, 68, 68, .12); }
        .youtubeStartButton, .youtubeStopButton { width: 100%; min-height: 46px; font-weight: 800; }
        .youtubeStartButton { background: #dc2626; color: #fff; border-color: #dc2626; }
        .youtubeStopButton { background: #7f1d1d; color: #fff; border-color: #991b1b; }
        .youtubeStartButton:disabled, .youtubeStopButton:disabled { opacity: .65; cursor: wait; }
        .youtubeStreamLink a { color: #93c5fd; text-decoration: underline; font-weight: 700; }
        .youtubeStreamMessage { overflow-wrap: anywhere; margin-top: 10px; }
        @media (max-width: 600px) { .youtubeStreamTop { flex-direction: column; } }
      `}</style>
    </section>
  );
}
