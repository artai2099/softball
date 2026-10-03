"use client";

import { useEffect, useRef, useState } from "react";
import { createLocalTracks, Room, RoomEvent, Track } from "livekit-client";

export function LiveRoom({
  gameId,
  role,
}: {
  gameId: string;
  role: "viewer" | "broadcaster";
}) {
  const [status, setStatus] = useState("Not connected");
  const [active, setActive] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const mediaRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => {
    void roomRef.current?.disconnect();
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
        mediaRef.current?.appendChild(track.attach());
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
      const tracks = await createLocalTracks({
        audio: true,
        video: {
          facingMode: "environment",
        },
      });

      for (const track of tracks) {
        await room.localParticipant.publishTrack(track);

        if (track.kind === Track.Kind.Video) {
          mediaRef.current?.appendChild(track.attach());
        }
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
          mediaRef.current.innerHTML = "";
        }
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

  return (
    <section className="gdpCamera">
      <div className="gdpCameraStage" ref={mediaRef}>
        {!active && (
          <div className="gdpCameraEmpty">
            <div className="gdpCameraIcon">
              <span>●</span>
            </div>

            <strong>
              {role === "broadcaster"
                ? "Game Camera"
                : "Live Game"}
            </strong>

            <span>
              {role === "broadcaster"
                ? "Start the camera when you're ready to stream."
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

        <div className="gdpCameraTop">
          <div className="gdpCameraTitle">
            <strong>
              {role === "broadcaster"
                ? "Game Camera"
                : "Live Game"}
            </strong>
            <small>{status}</small>
          </div>

          {active && (
            <button
              type="button"
              className="gdpIconButton"
              onClick={fullscreen}
              aria-label="Fullscreen"
              title="Fullscreen"
            >
              ⛶
            </button>
          )}
        </div>

        <div className="gdpCameraBottom">
          <div className="gdpCameraStatus">
            <span className={active ? "online" : ""} />
            {active ? "Connected" : "Ready"}
          </div>

          <button
            type="button"
            className={`gdpCameraButton ${
              active ? "stop" : "start"
            }`}
            onClick={toggle}
          >
            <span className="gdpCameraButtonIcon">
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
        .gdpCamera {
          width: 100%;
          margin: 0;
          border-radius: 18px;
          overflow: hidden;
          background: #090b0f;
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow:
            0 14px 40px rgba(0, 0, 0, 0.18),
            0 2px 8px rgba(0, 0, 0, 0.12);
        }

        .gdpCameraStage {
          position: relative;
          width: 100%;
          min-height: 260px;
          aspect-ratio: 16 / 9;
          overflow: hidden;
          background:
            radial-gradient(
              circle at 50% 35%,
              #20252e 0%,
              #101318 42%,
              #07090c 100%
            );
          isolation: isolate;
        }

        .gdpCameraStage :global(video) {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          z-index: 1;
        }

        .gdpCameraStage:fullscreen {
          width: 100vw;
          height: 100vh;
          aspect-ratio: auto;
          border-radius: 0;
          background: #000;
        }

        .gdpCameraStage:fullscreen :global(video) {
          object-fit: contain;
        }

        .gdpCameraTop,
        .gdpCameraBottom {
          position: absolute;
          left: 0;
          right: 0;
          z-index: 3;
          display: flex;
          align-items: center;
          justify-content: space-between;
          pointer-events: none;
        }

        .gdpCameraTop {
          top: 0;
          padding: 14px;
          background: linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0.72),
            rgba(0, 0, 0, 0)
          );
        }

        .gdpCameraBottom {
          bottom: 0;
          padding: 18px 14px 14px;
          background: linear-gradient(
            to top,
            rgba(0, 0, 0, 0.78),
            rgba(0, 0, 0, 0)
          );
        }

        .gdpCameraTitle {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
          color: white;
          text-shadow: 0 1px 5px rgba(0, 0, 0, 0.5);
        }

        .gdpCameraTitle strong {
          font-size: 15px;
          line-height: 1.1;
          font-weight: 750;
          letter-spacing: -0.01em;
        }

        .gdpCameraTitle small {
          max-width: 260px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255, 255, 255, 0.68);
          font-size: 11px;
        }

        .gdpLiveBadge {
          position: absolute;
          top: 15px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 4;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(180, 24, 24, 0.92);
          color: white;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
        }

        .gdpLiveBadge span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: white;
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.14);
        }

        .gdpIconButton {
          pointer-events: auto;
          width: 38px;
          height: 38px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 11px;
          background: rgba(0, 0, 0, 0.42);
          color: white;
          font-size: 21px;
          line-height: 1;
          cursor: pointer;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        .gdpIconButton:active {
          transform: scale(0.95);
        }

        .gdpCameraStatus {
          display: flex;
          align-items: center;
          gap: 7px;
          color: rgba(255, 255, 255, 0.76);
          font-size: 11px;
          font-weight: 600;
        }

        .gdpCameraStatus span {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.35);
        }

        .gdpCameraStatus span.online {
          background: #35d07f;
          box-shadow: 0 0 0 4px rgba(53, 208, 127, 0.12);
        }

        .gdpCameraButton {
          pointer-events: auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 42px;
          padding: 0 16px;
          border: 0;
          border-radius: 12px;
          color: white;
          font-size: 13px;
          font-weight: 750;
          cursor: pointer;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
          transition:
            transform 120ms ease,
            filter 120ms ease;
        }

        .gdpCameraButton:hover {
          filter: brightness(1.08);
        }

        .gdpCameraButton:active {
          transform: scale(0.97);
        }

        .gdpCameraButton.start {
          background: #e53935;
        }

        .gdpCameraButton.stop {
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.18);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        .gdpCameraButtonIcon {
          font-size: 10px;
        }

        .gdpCameraEmpty {
          position: absolute;
          inset: 0;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 60px 30px;
          color: white;
          text-align: center;
        }

        .gdpCameraEmpty strong {
          font-size: 17px;
          font-weight: 750;
        }

        .gdpCameraEmpty > span {
          max-width: 280px;
          color: rgba(255, 255, 255, 0.52);
          font-size: 12px;
          line-height: 1.5;
        }

        .gdpCameraIcon {
          width: 54px;
          height: 54px;
          margin-bottom: 4px;
          display: grid;
          place-items: center;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.09);
          color: rgba(255, 255, 255, 0.65);
          font-size: 18px;
        }

        @media (max-width: 600px) {
          .gdpCamera {
            border-radius: 14px;
          }

          .gdpCameraStage {
            min-height: 220px;
            aspect-ratio: 4 / 3;
          }

          .gdpCameraTop {
            padding: 11px;
          }

          .gdpCameraBottom {
            padding: 20px 11px 11px;
          }

          .gdpCameraTitle strong {
            font-size: 14px;
          }

          .gdpCameraButton {
            min-height: 40px;
            padding: 0 13px;
            font-size: 12px;
          }

          .gdpCameraStatus {
            font-size: 10px;
          }

          .gdpIconButton {
            width: 36px;
            height: 36px;
          }
        }
      `}</style>
    </section>
  );
}
