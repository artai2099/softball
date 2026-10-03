"use client";

import { useEffect, useRef, useState } from "react";
import type { Game } from "@/lib/types";
import { createLocalTracks, Room, RoomEvent, Track } from "livekit-client";

export function LiveRoom({
  gameId,
  role,
  game,
}: {
  gameId: string;
  role: "viewer" | "broadcaster";
  game: Game;
}) {
  const [status, setStatus] = useState("Ready");
  const [active, setActive] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const mediaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      void roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, []);

  async function connect() {
    setStatus("Connecting…");

    const response = await fetch("/api/livekit/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameId, role }),
    });

    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.error || "Video connection failed");
    }

    if (typeof window !== "undefined") {
      const serverUrl = new URL(body.serverUrl);

      const browserIsLocal = [
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
      ].includes(window.location.hostname);

      const liveKitIsLocal = [
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
      ].includes(serverUrl.hostname);

      if (liveKitIsLocal && !browserIsLocal) {
        throw new Error(
          "Live video is configured for localhost. Set LIVEKIT_PUBLIC_URL in Vercel to a public wss:// LiveKit endpoint."
        );
      }
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    roomRef.current = room;

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (
        track.kind === Track.Kind.Video ||
        track.kind === Track.Kind.Audio
      ) {
        const element = track.attach();

        if (track.kind === Track.Kind.Video) {
          element.classList.add("gdpStreamVideo");
        } else {
          element.classList.add("gdpStreamAudio");
        }

        mediaRef.current?.appendChild(element);
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((element) => element.remove());
    });

    room.on(RoomEvent.Disconnected, () => {
      setActive(false);
      setStatus("Disconnected");
    });

    await room.connect(body.serverUrl, body.token);

    if (role === "broadcaster") {
      let tracks;

      try {
        /*
         * Prefer the rear/environment camera on phones,
         * but allow the browser to choose another camera if
         * that constraint is unavailable.
         */
        tracks = await createLocalTracks({
          audio: true,
          video: {
            facingMode: "environment",
          },
        });
      } catch {
        /*
         * Desktop browsers and some devices do not expose
         * an environment camera. Fall back to any available
         * video input instead of failing the entire stream.
         */
        try {
          tracks = await createLocalTracks({
            audio: true,
            video: true,
          });
        } catch {
          /*
           * If the microphone is the part that failed,
           * still allow the camera to start.
           */
          tracks = await createLocalTracks({
            audio: false,
            video: true,
          });
        }
      }

      for (const track of tracks) {
        await room.localParticipant.publishTrack(track);

        const element = track.attach();

        if (track.kind === Track.Kind.Video) {
          element.classList.add("gdpStreamVideo");
        } else {
          element.classList.add("gdpStreamAudio");
        }

        mediaRef.current?.appendChild(element);
      }
    }

    setActive(true);
    setStatus(
      role === "broadcaster"
        ? "Camera is live"
        : "Watching live game"
    );
  }

  async function toggle() {
    try {
      if (active) {
        await roomRef.current?.disconnect();
        roomRef.current = null;

        if (mediaRef.current) {
          mediaRef.current
            .querySelectorAll("video, audio")
            .forEach((element) => element.remove());
        }

        setActive(false);
        setStatus("Ready");
      } else {
        await connect();
      }
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Video failed"
      );
    }
  }

  async function fullscreen() {
    const element = mediaRef.current;

    if (!element) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await element.requestFullscreen();
      }
    } catch {
      setStatus("Fullscreen unavailable");
    }
  }

  const awayScore = game.away_score ?? 0;
  const homeScore = game.home_score ?? 0;
  const inning = game.inning ?? 1;
  const half = game.half === "top" ? "TOP" : "BOT";

  return (
    <section className="gdpStream">
      <div className="gdpStreamStage" ref={mediaRef}>
        {!active && (
          <div className="gdpStreamEmpty">
            <div className="gdpStreamEmptyIcon">
              <span>▶</span>
            </div>

            <strong>
              {role === "broadcaster"
                ? "Game Camera"
                : "Live Game"}
            </strong>

            <span>
              {role === "broadcaster"
                ? "Start the camera when you are ready to stream."
                : "Live video will appear here."}
            </span>
          </div>
        )}

        {active && (
          <div className="gdpLivePill">
            <span />
            LIVE
          </div>
        )}

        <div className="gdpScoreBug">
          <div className="gdpScoreTeam gdpScoreAway">
            <span>{game.away_name || "AWAY"}</span>
            <strong>{awayScore}</strong>
          </div>

          <div className="gdpScoreInning">
            <span>{half}</span>
            <strong>{inning}</strong>
          </div>

          <div className="gdpScoreTeam gdpScoreHome">
            <strong>{homeScore}</strong>
            <span>{game.home_name || "HOME"}</span>
          </div>

          <div className="gdpCount">
            <div>
              <span>B</span>
              <strong>{game.balls ?? 0}</strong>
            </div>
            <div>
              <span>S</span>
              <strong>{game.strikes ?? 0}</strong>
            </div>
            <div>
              <span>O</span>
              <strong>{game.outs ?? 0}</strong>
            </div>
          </div>

          <div className="gdpDiamond" aria-label="Base runners">
            <span
              className={`gdpBase gdpSecond ${
                game.bases?.["2"] ? "occupied" : ""
              }`}
            />
            <span
              className={`gdpBase gdpFirst ${
                game.bases?.["1"] ? "occupied" : ""
              }`}
            />
            <span
              className={`gdpBase gdpThird ${
                game.bases?.["3"] ? "occupied" : ""
              }`}
            />
            <span className="gdpBase gdpHome" />
          </div>
        </div>

        <div className="gdpStreamTopControls">
          <div className="gdpStreamBrand">
            <span className="gdpBrandMark">G</span>
            <span>GameDay</span>
          </div>

          {active && (
            <button
              type="button"
              className="gdpFullscreenButton"
              onClick={fullscreen}
              aria-label="Enter fullscreen"
              title="Fullscreen"
            >
              ⛶
            </button>
          )}
        </div>

        <div className="gdpStreamBottom">
          <div className="gdpConnection">
            <span className={active ? "connected" : ""} />
            <div>
              <strong>
                {active
                  ? role === "broadcaster"
                    ? "Streaming live"
                    : "Live stream"
                  : "Camera ready"}
              </strong>
              <small>{status}</small>
            </div>
          </div>

          <button
            type="button"
            className={`gdpStreamButton ${
              active ? "disconnect" : "start"
            }`}
            onClick={toggle}
          >
            <span className="gdpButtonIcon">
              {active ? "■" : "●"}
            </span>

            {active
              ? "Disconnect"
              : role === "broadcaster"
                ? "Start Camera"
                : "Watch Live"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .gdpStream {
          width: 100%;
          margin: 0;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          background: #080a0e;
          box-shadow:
            0 18px 50px rgba(0, 0, 0, 0.25),
            0 2px 10px rgba(0, 0, 0, 0.2);
        }

        .gdpStreamStage {
          position: relative;
          width: 100%;
          min-height: 300px;
          aspect-ratio: 16 / 9;
          overflow: hidden;
          background: #000;
          isolation: isolate;
        }

        .gdpStreamStage :global(.gdpStreamVideo) {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: block;
          object-fit: contain;
          background: #000;
          z-index: 1;
        }

        .gdpStreamStage :global(.gdpStreamAudio) {
          display: none;
        }

        .gdpStreamStage:fullscreen {
          width: 100vw;
          height: 100vh;
          min-height: 0;
          aspect-ratio: auto;
          border: 0;
          border-radius: 0;
          background: #000;
        }

        .gdpStreamStage:fullscreen :global(.gdpStreamVideo) {
          object-fit: contain;
        }

        .gdpStreamEmpty {
          position: absolute;
          inset: 0;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 30px;
          text-align: center;
          color: white;
          background:
            radial-gradient(
              circle at 50% 38%,
              rgba(45, 52, 64, 0.75),
              rgba(8, 10, 14, 0.96) 62%
            );
        }

        .gdpStreamEmptyIcon {
          width: 52px;
          height: 52px;
          display: grid;
          place-items: center;
          margin-bottom: 6px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 15px;
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.82);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
        }

        .gdpStreamEmptyIcon span {
          font-size: 18px;
        }

        .gdpStreamEmpty strong {
          font-size: 17px;
          font-weight: 800;
          letter-spacing: -0.02em;
        }

        .gdpStreamEmpty > span {
          max-width: 330px;
          color: rgba(255, 255, 255, 0.52);
          font-size: 12px;
        }

        .gdpLivePill {
          position: absolute;
          top: 14px;
          left: 14px;
          z-index: 8;
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 6px 9px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 999px;
          background: rgba(5, 7, 10, 0.78);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          color: white;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 0.1em;
        }

        .gdpLivePill span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #ff3b30;
          box-shadow: 0 0 0 3px rgba(255, 59, 48, 0.16);
        }

        .gdpScoreBug {
          position: absolute;
          top: 14px;
          left: 50%;
          z-index: 7;
          transform: translateX(-50%);
          width: min(760px, calc(100% - 100px));
          min-height: 54px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 54px minmax(0, 1fr) auto 56px;
          align-items: center;
          gap: 8px;
          padding: 7px 10px;
          box-sizing: border-box;
          border: 1px solid rgba(255, 255, 255, 0.13);
          border-radius: 13px;
          background: rgba(5, 7, 10, 0.86);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          color: white;
          pointer-events: none;
        }

        .gdpScoreTeam {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .gdpScoreAway {
          justify-content: flex-start;
        }

        .gdpScoreHome {
          justify-content: flex-end;
        }

        .gdpScoreTeam span {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255, 255, 255, 0.68);
          font-size: 10px;
          font-weight: 750;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .gdpScoreTeam strong {
          flex: 0 0 auto;
          font-size: 23px;
          line-height: 1;
          font-weight: 900;
        }

        .gdpScoreInning {
          width: 54px;
          min-width: 54px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 5px 3px;
          box-sizing: border-box;
          border-radius: 9px;
          background: rgba(255, 255, 255, 0.08);
        }

        .gdpScoreInning span {
          color: rgba(255, 255, 255, 0.55);
          font-size: 8px;
          line-height: 1;
          font-weight: 850;
          letter-spacing: 0.08em;
        }

        .gdpScoreInning strong {
          margin-top: 3px;
          font-size: 17px;
          line-height: 1;
          font-weight: 900;
        }

        .gdpCount {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 7px 9px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 9px;
          background: rgba(255, 255, 255, 0.045);
        }

        .gdpCount div {
          display: flex;
          align-items: center;
          gap: 3px;
        }

        .gdpCount span {
          color: rgba(255, 255, 255, 0.48);
          font-size: 8px;
          font-weight: 850;
        }

        .gdpCount strong {
          min-width: 12px;
          color: white;
          font-size: 11px;
          line-height: 1;
          font-weight: 900;
          text-align: center;
        }

        .gdpDiamond {
          position: relative;
          width: 48px;
          height: 48px;
        }

        .gdpBase {
          position: absolute;
          width: 13px;
          height: 13px;
          box-sizing: border-box;
          transform: rotate(45deg);
          border: 1.5px solid rgba(255, 255, 255, 0.55);
          border-radius: 2px;
          background: rgba(255, 255, 255, 0.07);
        }

        .gdpBase.occupied {
          border-color: white;
          background: #ef4444;
          box-shadow: 0 0 12px rgba(239, 68, 68, 0.6);
        }

        .gdpSecond {
          top: 1px;
          left: 17px;
        }

        .gdpFirst {
          top: 18px;
          right: 0;
        }

        .gdpThird {
          top: 18px;
          left: 0;
        }

        .gdpHome {
          bottom: 0;
          left: 17px;
          background: rgba(255, 255, 255, 0.12);
        }

        .gdpStreamTopControls {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          z-index: 6;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px;
          pointer-events: none;
          background: linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0.45),
            transparent
          );
        }

        .gdpStreamBrand {
          display: flex;
          align-items: center;
          gap: 7px;
          color: rgba(255, 255, 255, 0.78);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.04em;
        }

        .gdpBrandMark {
          width: 22px;
          height: 22px;
          display: grid;
          place-items: center;
          border-radius: 7px;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          font-size: 11px;
          font-weight: 900;
        }

        .gdpFullscreenButton {
          pointer-events: auto;
          width: 36px;
          height: 36px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 10px;
          background: rgba(0, 0, 0, 0.45);
          color: white;
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        .gdpFullscreenButton:active {
          transform: scale(0.95);
        }

        .gdpStreamBottom {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 6;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
          padding: 34px 14px 14px;
          background: linear-gradient(
            to top,
            rgba(0, 0, 0, 0.76),
            rgba(0, 0, 0, 0)
          );
          box-sizing: border-box;
        }

        .gdpConnection {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 9px;
          color: white;
        }

        .gdpConnection > span {
          width: 8px;
          height: 8px;
          flex: 0 0 auto;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.3);
        }

        .gdpConnection > span.connected {
          background: #35d07f;
          box-shadow: 0 0 0 4px rgba(53, 208, 127, 0.12);
        }

        .gdpConnection div {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .gdpConnection strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 11px;
          font-weight: 800;
        }

        .gdpConnection small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255, 255, 255, 0.52);
          font-size: 9px;
        }

        .gdpStreamButton {
          pointer-events: auto;
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 15px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 10px;
          color: white;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.24);
        }

        .gdpStreamButton.start {
          background: rgba(124, 58, 237, 0.95);
          border-color: rgba(167, 139, 250, 0.45);
        }

        .gdpStreamButton.disconnect {
          background: rgba(120, 20, 20, 0.88);
          border-color: rgba(255, 120, 120, 0.22);
        }

        .gdpStreamButton:active {
          transform: translateY(1px);
        }

        .gdpButtonIcon {
          font-size: 9px;
        }

        .gdpStreamStage:fullscreen .gdpScoreBug {
          top: max(14px, env(safe-area-inset-top));
        }

        .gdpStreamStage:fullscreen .gdpStreamBottom {
          padding-bottom: max(14px, env(safe-area-inset-bottom));
        }

        @media (max-width: 700px) {
          .gdpStream {
            border-radius: 12px;
          }

          .gdpStreamStage {
            min-height: 240px;
          }

          .gdpScoreBug {
            width: calc(100% - 20px);
            grid-template-columns:
              minmax(0, 1fr)
              44px
              minmax(0, 1fr);
            gap: 5px;
            padding: 6px;
            min-height: 48px;
          }

          .gdpScoreTeam {
            gap: 5px;
          }

          .gdpScoreTeam span {
            max-width: 70px;
            font-size: 8px;
          }

          .gdpScoreTeam strong {
            font-size: 19px;
          }

          .gdpScoreInning {
            width: 44px;
            min-width: 44px;
          }

          .gdpScoreInning strong {
            font-size: 15px;
          }

          .gdpCount {
            grid-column: 1 / 2;
            justify-self: start;
            padding: 5px 7px;
          }

          .gdpDiamond {
            grid-column: 3 / 4;
            justify-self: end;
            transform: scale(0.82);
            transform-origin: right center;
          }

          .gdpStreamBrand {
            display: none;
          }

          .gdpLivePill {
            top: 10px;
            left: 10px;
          }

          .gdpStreamTopControls {
            padding: 10px;
            justify-content: flex-end;
          }

          .gdpStreamBottom {
            padding: 28px 10px 10px;
          }

          .gdpConnection small {
            display: none;
          }

          .gdpStreamButton {
            min-height: 38px;
            padding: 0 12px;
          }
        }

        @media (orientation: portrait) and (max-width: 600px) {
          .gdpStreamStage {
            aspect-ratio: 9 / 16;
            min-height: 520px;
          }

          .gdpStreamStage :global(.gdpStreamVideo) {
            object-fit: contain;
          }

          .gdpScoreBug {
            top: 48px;
            grid-template-columns:
              minmax(0, 1fr)
              42px
              minmax(0, 1fr);
            width: calc(100% - 16px);
          }

          .gdpScoreTeam span {
            max-width: 58px;
          }

          .gdpScoreTeam strong {
            font-size: 18px;
          }

          .gdpCount {
            margin-top: 2px;
          }

          .gdpDiamond {
            transform: scale(0.76);
          }
        }

        @media (orientation: landscape) and (max-height: 600px) {
          .gdpStreamStage {
            min-height: 220px;
            aspect-ratio: 16 / 9;
          }

          .gdpScoreBug {
            top: 8px;
            width: min(760px, calc(100% - 90px));
            min-height: 46px;
          }

          .gdpScoreTeam strong {
            font-size: 18px;
          }

          .gdpScoreTeam span {
            max-width: 100px;
          }

          .gdpCount {
            padding: 5px 7px;
          }

          .gdpDiamond {
            transform: scale(0.78);
          }

          .gdpStreamBottom {
            padding: 24px 10px 8px;
          }
        }

        @media (orientation: portrait) and (min-width: 601px) {
          .gdpStreamStage:fullscreen {
            aspect-ratio: auto;
          }

          .gdpStreamStage:fullscreen :global(.gdpStreamVideo) {
            object-fit: contain;
          }
        }
      `}</style>
    </section>
  );
}
