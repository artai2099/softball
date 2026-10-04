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
        tracks = await createLocalTracks({
          audio: true,
          video: {
            facingMode: "environment",
          },
        });
      } catch {
        try {
          tracks = await createLocalTracks({
            audio: true,
            video: true,
          });
        } catch {
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
            <div className="gdpEmptyCamera">
              <span className="gdpCameraLens" />
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
          <div className="gdpLiveBadge">
            <span />
            LIVE
          </div>
        )}

        {/* Professional broadcast scorebug */}
        <div className="gdpBroadcastScorebug">

          <div className="gdpBroadcastTeam away">
            <div className="gdpTeamInfo">
              <span className="gdpTeamSide">AWAY</span>
              <strong>{game.away_name || "Away"}</strong>
            </div>
            <b>{awayScore}</b>
          </div>

          <div className="gdpBroadcastInning">
            <span>{half}</span>
            <strong>{inning}</strong>
          </div>

          <div className="gdpBroadcastTeam home">
            <b>{homeScore}</b>
            <div className="gdpTeamInfo">
              <span className="gdpTeamSide">HOME</span>
              <strong>{game.home_name || "Home"}</strong>
            </div>
          </div>

          <div className="gdpBroadcastCount">
            <div>
              <span>B</span>
              <b>{game.balls ?? 0}</b>
            </div>

            <div>
              <span>S</span>
              <b>{game.strikes ?? 0}</b>
            </div>

            <div>
              <span>O</span>
              <b>{game.outs ?? 0}</b>
            </div>
          </div>

          <div className="gdpBroadcastDiamond">
            <span
              className={`base second ${
                game.bases?.["2"] ? "occupied" : ""
              }`}
            />
            <span
              className={`base first ${
                game.bases?.["1"] ? "occupied" : ""
              }`}
            />
            <span
              className={`base third ${
                game.bases?.["3"] ? "occupied" : ""
              }`}
            />
            <span className="base home" />
          </div>
        </div>

        {/* Fullscreen control */}
        {active && (
          <button
            type="button"
            className="gdpFullscreen"
            onClick={fullscreen}
            aria-label="Fullscreen"
            title="Fullscreen"
          >
            <span>⛶</span>
          </button>
        )}

        {/* Bottom camera controls */}
        <div className="gdpStreamControls">

          <div className="gdpStreamStatus">
            <span className={active ? "online" : ""} />

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
            className={`gdpStreamAction ${
              active ? "disconnect" : "start"
            }`}
            onClick={toggle}
          >
            <span className="actionIcon">
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
          border-radius: 14px;
          background: #050608;
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
          z-index: 1;
          width: 100%;
          height: 100%;
          display: block;
          object-fit: contain;
          background: #000;
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

        /* Empty camera state */
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
              circle at 50% 42%,
              #1d222b 0%,
              #0c0f14 48%,
              #050608 100%
            );
        }

        .gdpEmptyCamera {
          width: 58px;
          height: 42px;
          position: relative;
          display: grid;
          place-items: center;
          margin-bottom: 8px;
          border: 1px solid rgba(255, 255, 255, 0.17);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.06);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
        }

        .gdpEmptyCamera::before {
          content: "";
          position: absolute;
          right: -7px;
          top: 12px;
          width: 8px;
          height: 17px;
          border-radius: 2px;
          background: rgba(255, 255, 255, 0.14);
        }

        .gdpCameraLens {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.65);
          border-radius: 50%;
          box-shadow:
            inset 0 0 0 4px rgba(255, 255, 255, 0.06),
            0 0 12px rgba(255, 255, 255, 0.08);
        }

        .gdpStreamEmpty strong {
          font-size: 17px;
          font-weight: 800;
          letter-spacing: -0.02em;
        }

        .gdpStreamEmpty > span {
          max-width: 330px;
          color: rgba(255, 255, 255, 0.48);
          font-size: 12px;
        }

        /* LIVE indicator */
        .gdpLiveBadge {
          position: absolute;
          top: 14px;
          left: 14px;
          z-index: 10;
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 6px 9px;
          border: 1px solid rgba(255, 255, 255, 0.13);
          border-radius: 999px;
          background: rgba(4, 6, 9, 0.78);
          color: white;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.1em;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .gdpLiveBadge span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #ff3b30;
          box-shadow:
            0 0 0 3px rgba(255, 59, 48, 0.13),
            0 0 10px rgba(255, 59, 48, 0.45);
        }

        /* Main broadcast scorebug */
        .gdpBroadcastScorebug {
          position: absolute;
          top: 14px;
          left: 50%;
          z-index: 8;
          transform: translateX(-50%);
          width: min(780px, calc(100% - 108px));
          min-height: 58px;
          display: grid;
          grid-template-columns:
            minmax(0, 1fr)
            52px
            minmax(0, 1fr)
            auto
            48px;
          align-items: center;
          gap: 7px;
          padding: 6px 9px;
          box-sizing: border-box;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 11px;
          background: rgba(3, 5, 8, 0.9);
          box-shadow:
            0 12px 30px rgba(0, 0, 0, 0.32),
            inset 0 1px 0 rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          color: white;
          pointer-events: none;
        }

        .gdpBroadcastTeam {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .gdpBroadcastTeam.away {
          justify-content: flex-start;
        }

        .gdpBroadcastTeam.home {
          justify-content: flex-end;
        }

        .gdpTeamInfo {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .gdpBroadcastTeam.home .gdpTeamInfo {
          align-items: flex-end;
        }

        .gdpTeamSide {
          color: rgba(255, 255, 255, 0.42);
          font-size: 7px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: 0.1em;
        }

        .gdpTeamInfo strong {
          max-width: 125px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255, 255, 255, 0.78);
          font-size: 10px;
          line-height: 1.1;
          font-weight: 750;
        }

        .gdpBroadcastTeam > b {
          min-width: 23px;
          font-size: 23px;
          line-height: 1;
          font-weight: 900;
          text-align: center;
        }

        .gdpBroadcastInning {
          width: 52px;
          min-width: 52px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 5px 3px;
          box-sizing: border-box;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.075);
        }

        .gdpBroadcastInning span {
          color: rgba(255, 255, 255, 0.45);
          font-size: 7px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: 0.1em;
        }

        .gdpBroadcastInning strong {
          margin-top: 3px;
          font-size: 17px;
          line-height: 1;
          font-weight: 900;
        }

        /* Count */
        .gdpBroadcastCount {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 7px 8px;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.035);
        }

        .gdpBroadcastCount div {
          display: flex;
          align-items: center;
          gap: 3px;
        }

        .gdpBroadcastCount span {
          color: rgba(255, 255, 255, 0.4);
          font-size: 7px;
          font-weight: 900;
        }

        .gdpBroadcastCount b {
          min-width: 11px;
          color: white;
          font-size: 10px;
          line-height: 1;
          font-weight: 900;
          text-align: center;
        }

        /* Base diamond */
        .gdpBroadcastDiamond {
          position: relative;
          width: 42px;
          height: 42px;
        }

        .gdpBroadcastDiamond .base {
          position: absolute;
          width: 11px;
          height: 11px;
          box-sizing: border-box;
          transform: rotate(45deg);
          border: 1.4px solid rgba(255, 255, 255, 0.48);
          border-radius: 2px;
          background: rgba(255, 255, 255, 0.06);
        }

        .gdpBroadcastDiamond .base.occupied {
          border-color: white;
          background: #ef4444;
          box-shadow:
            0 0 8px rgba(239, 68, 68, 0.6),
            0 0 14px rgba(239, 68, 68, 0.25);
        }

        .gdpBroadcastDiamond .second {
          top: 1px;
          left: 15px;
        }

        .gdpBroadcastDiamond .first {
          top: 16px;
          right: 0;
        }

        .gdpBroadcastDiamond .third {
          top: 16px;
          left: 0;
        }

        .gdpBroadcastDiamond .home {
          bottom: 0;
          left: 15px;
          background: rgba(255, 255, 255, 0.1);
        }

        /* Fullscreen */
        .gdpFullscreen {
          position: absolute;
          top: 14px;
          right: 14px;
          z-index: 10;
          width: 35px;
          height: 35px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 9px;
          background: rgba(3, 5, 8, 0.68);
          color: white;
          font-size: 19px;
          line-height: 1;
          cursor: pointer;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .gdpFullscreen:active {
          transform: scale(0.95);
        }

        /* Bottom controls */
        .gdpStreamControls {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 9;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 14px;
          padding: 34px 14px 13px;
          box-sizing: border-box;
          background:
            linear-gradient(
              to top,
              rgba(0, 0, 0, 0.82),
              rgba(0, 0, 0, 0)
            );
        }

        .gdpStreamStatus {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          color: white;
        }

        .gdpStreamStatus > span {
          width: 7px;
          height: 7px;
          flex: 0 0 auto;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.3);
        }

        .gdpStreamStatus > span.online {
          background: #35d07f;
          box-shadow: 0 0 0 4px rgba(53, 208, 127, 0.1);
        }

        .gdpStreamStatus div {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .gdpStreamStatus strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 10px;
          font-weight: 800;
        }

        .gdpStreamStatus small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255, 255, 255, 0.43);
          font-size: 8px;
        }

        .gdpStreamAction {
          pointer-events: auto;
          min-height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 0 14px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 9px;
          color: white;
          font-size: 10px;
          font-weight: 850;
          cursor: pointer;
          box-shadow: 0 7px 20px rgba(0, 0, 0, 0.25);
        }

        .gdpStreamAction.start {
          background: #7c3aed;
          border-color: rgba(196, 181, 253, 0.4);
        }

        .gdpStreamAction.disconnect {
          background: rgba(126, 25, 25, 0.92);
          border-color: rgba(255, 130, 130, 0.22);
        }

        .gdpStreamAction:active {
          transform: translateY(1px);
        }

        .actionIcon {
          font-size: 8px;
        }

        /* Mobile */
        @media (max-width: 700px) {
          .gdpStream {
            border-radius: 11px;
          }

          .gdpStreamStage {
            min-height: 240px;
          }

          .gdpBroadcastScorebug {
            top: 10px;
            width: calc(100% - 82px);
            min-height: 48px;
            grid-template-columns:
              minmax(0, 1fr)
              43px
              minmax(0, 1fr);
            gap: 5px;
            padding: 5px 6px;
          }

          .gdpBroadcastTeam {
            gap: 5px;
          }

          .gdpTeamInfo strong {
            max-width: 62px;
            font-size: 8px;
          }

          .gdpTeamSide {
            font-size: 6px;
          }

          .gdpBroadcastTeam > b {
            min-width: 19px;
            font-size: 19px;
          }

          .gdpBroadcastInning {
            width: 43px;
            min-width: 43px;
          }

          .gdpBroadcastInning strong {
            font-size: 15px;
          }

          .gdpBroadcastCount {
            grid-column: 1 / 2;
            justify-self: start;
            padding: 5px 6px;
            gap: 5px;
          }

          .gdpBroadcastDiamond {
            grid-column: 3 / 4;
            justify-self: end;
            transform: scale(0.82);
            transform-origin: right center;
          }

          .gdpLiveBadge {
            top: 9px;
            left: 9px;
          }

          .gdpFullscreen {
            top: 9px;
            right: 9px;
          }

          .gdpStreamControls {
            padding: 28px 9px 9px;
          }

          .gdpStreamStatus small {
            display: none;
          }

          .gdpStreamAction {
            min-height: 37px;
            padding: 0 11px;
          }
        }

        /* Portrait phone */
        @media (orientation: portrait) and (max-width: 600px) {
          .gdpStreamStage {
            aspect-ratio: 9 / 16;
            min-height: 500px;
          }

          .gdpStreamStage :global(.gdpStreamVideo) {
            object-fit: contain;
          }

          .gdpBroadcastScorebug {
            top: 45px;
            width: calc(100% - 14px);
          }

          .gdpTeamInfo strong {
            max-width: 55px;
          }

          .gdpBroadcastDiamond {
            transform: scale(0.75);
          }
        }

        /* Short landscape phone */
        @media (orientation: landscape) and (max-height: 600px) {
          .gdpStreamStage {
            min-height: 210px;
            aspect-ratio: 16 / 9;
          }

          .gdpBroadcastScorebug {
            top: 7px;
            width: min(760px, calc(100% - 80px));
            min-height: 44px;
          }

          .gdpBroadcastTeam > b {
            font-size: 18px;
          }

          .gdpTeamInfo strong {
            max-width: 95px;
          }

          .gdpBroadcastDiamond {
            transform: scale(0.76);
          }

          .gdpStreamControls {
            padding: 23px 9px 7px;
          }
        }

        /* Fullscreen safe areas */
        .gdpStreamStage:fullscreen .gdpBroadcastScorebug {
          top: max(12px, env(safe-area-inset-top));
        }

        .gdpStreamStage:fullscreen .gdpFullscreen {
          top: max(12px, env(safe-area-inset-top));
          right: max(12px, env(safe-area-inset-right));
        }

        .gdpStreamStage:fullscreen .gdpStreamControls {
          padding-bottom: max(13px, env(safe-area-inset-bottom));
          padding-left: max(13px, env(safe-area-inset-left));
          padding-right: max(13px, env(safe-area-inset-right));
        }

        @media (orientation: portrait) and (max-width: 600px) {
          .gdpStreamStage:fullscreen .gdpStreamVideo {
            object-fit: contain;
          }

          .gdpStreamStage:fullscreen .gdpBroadcastScorebug {
            top: max(46px, env(safe-area-inset-top));
          }
        }
      `}</style>
    </section>
  );
}
