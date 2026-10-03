"use client";

import { useEffect, useRef, useState } from "react";
import type { Game } from "@/lib/types";
import {
  ConnectionQuality,
  LocalTrackPublication,
  RemoteTrack,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";

type LiveRoomProps = {
  gameId: string;
  game?: Game;
  role: "viewer" | "broadcaster";
};

function isMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function qualityLabel(quality: ConnectionQuality) {
  switch (quality) {
    case ConnectionQuality.Excellent:
      return "Excellent";
    case ConnectionQuality.Good:
      return "Good";
    case ConnectionQuality.Poor:
      return "Poor";
    case ConnectionQuality.Lost:
      return "Lost";
    default:
      return "Checking";
  }
}

function qualityLevel(quality: ConnectionQuality) {
  switch (quality) {
    case ConnectionQuality.Excellent:
      return 4;
    case ConnectionQuality.Good:
      return 3;
    case ConnectionQuality.Poor:
      return 2;
    case ConnectionQuality.Lost:
      return 1;
    default:
      return 2;
  }
}

export function LiveRoom({ gameId, game, role }: LiveRoomProps) {
  const [status, setStatus] = useState(
    role === "viewer" ? "Starting live video…" : "Ready to go live"
  );
  const [connecting, setConnecting] = useState(false);
  const [active, setActive] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>(
    ConnectionQuality.Unknown
  );
  const [cameraLabel, setCameraLabel] = useState("");
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("user");
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const liveRoomRef = useRef<HTMLElement | null>(null);

  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);

  const intentionalDisconnectRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const reconnectAttemptsRef = useRef(0);

  function stopRawCamera() {
    const stream = cameraStreamRef.current;

    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
    }

    cameraStreamRef.current = null;
    cameraTrackRef.current = null;
  }

  function detachAllRemoteTracks() {
    const room = roomRef.current;

    if (room) {
      room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((publication) => {
          try {
            publication.track?.detach();
          } catch {}
        });
      });
    }
  }

  function clearMedia() {
    detachAllRemoteTracks();

    const container = mediaRef.current;
    if (!container) return;

    container.querySelectorAll("video, audio").forEach((element) => {
      const media = element as HTMLMediaElement;

      try {
        media.pause();
      } catch {}

      media.srcObject = null;
      media.remove();
    });
  }

  function configureVideoElement(video: HTMLVideoElement) {
    video.autoplay = true;
    video.playsInline = true;
    video.controls = false;
    video.muted = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.display = "block";
    video.style.objectFit = "cover";
    video.style.background = "#000";
  }

  function attachRemoteTrack(track: RemoteTrack) {
    const container = mediaRef.current;
    if (!container) return;

    if (track.kind === Track.Kind.Video) {
      container.querySelectorAll("video").forEach((element) => {
        try {
          track.detach(element);
        } catch {}
        element.remove();
      });

      const element = track.attach();
      const video = element as HTMLVideoElement;

      configureVideoElement(video);

      container.appendChild(video);
      setHasVideo(true);
      setError("");

      void video.play().catch((playError) => {
        console.warn("Remote video playback requires interaction:", playError);
      });

      return;
    }

    if (track.kind === Track.Kind.Audio) {
      container.querySelectorAll("audio").forEach((element) => {
        element.remove();
      });

      const element = track.attach();
      const audio = element as HTMLAudioElement;

      audio.autoplay = true;
      audio.controls = false;
      audio.muted = muted;
      audio.volume = muted ? 0 : 1;

      container.appendChild(audio);

      void audio
        .play()
        .then(() => {
          setAudioBlocked(false);
        })
        .catch((playError) => {
          console.warn(
            "Remote audio autoplay blocked:",
            playError
          );
          setAudioBlocked(true);
        });
    }
  }

  function attachLocalPreview(stream: MediaStream) {
    const container = mediaRef.current;
    if (!container) return;

    container.querySelectorAll("video").forEach((element) => {
      element.remove();
    });

    const video = document.createElement("video");
    configureVideoElement(video);
    video.srcObject = stream;

    container.appendChild(video);

    setHasVideo(true);

    void video.play().catch(() => {});
  }

  function subscribeToRemotePublications(room: Room) {
    room.remoteParticipants.forEach((participant) => {
      participant.trackPublications.forEach((publication) => {
        if (
          publication.kind !== Track.Kind.Video &&
          publication.kind !== Track.Kind.Audio
        ) {
          return;
        }

        console.log(
          "GameDay remote publication:",
          participant.identity,
          publication.kind,
          publication.trackSid,
          publication.isSubscribed
        );

        if (publication.isSubscribed && publication.track) {
          attachRemoteTrack(publication.track as RemoteTrack);
          return;
        }

        try {
          publication.setSubscribed(true);
        } catch (subscriptionError) {
          console.error(
            "GameDay subscription request failed:",
            subscriptionError
          );
        }
      });
    });
  }

  async function enableViewerAudio() {
    const room = roomRef.current;

    if (!room) return;

    try {
      await room.startAudio();
    } catch (audioError) {
      console.warn("LiveKit audio start failed:", audioError);
    }

    const container = mediaRef.current;

    if (container) {
      const media = Array.from(
        container.querySelectorAll("audio, video")
      );

      for (const element of media) {
        const mediaElement = element as HTMLMediaElement;

        if (mediaElement.tagName === "AUDIO") {
          mediaElement.muted = false;
          mediaElement.volume = 1;
        }

        try {
          await mediaElement.play();
        } catch {}
      }
    }

    setMuted(false);
    setAudioBlocked(!room.canPlaybackAudio);
  }

  function toggleViewerMute() {
    const container = mediaRef.current;
    if (!container) return;

    const nextMuted = !muted;

    container.querySelectorAll("audio").forEach((element) => {
      const audio = element as HTMLAudioElement;
      audio.muted = nextMuted;
      audio.volume = nextMuted ? 0 : 1;
    });

    setMuted(nextMuted);

    if (!nextMuted) {
      void enableViewerAudio();
    }
  }

  async function toggleFullscreen() {
    const roomElement = liveRoomRef.current;
    if (!roomElement) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setFullscreen(false);
        return;
      }

      if (roomElement.requestFullscreen) {
        await roomElement.requestFullscreen();
        setFullscreen(true);
      }
    } catch (fullscreenError) {
      console.warn("Fullscreen unavailable:", fullscreenError);
    }
  }

  async function disconnect() {
    intentionalDisconnectRef.current = true;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    const room = roomRef.current;

    try {
      if (room?.localParticipant) {
        try {
          await room.localParticipant.setMicrophoneEnabled(false);
        } catch {}

        if (cameraTrackRef.current) {
          try {
            room.localParticipant.unpublishTrack(
              cameraTrackRef.current
            );
          } catch {}
        }
      }
    } catch {}

    try {
      await room?.disconnect();
    } catch {}

    stopRawCamera();
    clearMedia();

    roomRef.current = null;

    setActive(false);
    setHasVideo(false);
    setCameraEnabled(false);
    setMicrophoneEnabled(false);
    setAudioBlocked(false);
    setConnectionQuality(ConnectionQuality.Unknown);

    if (role === "broadcaster") {
      setStatus("Stream ended");
    } else {
      setStatus("Not connected");
    }
  }

  async function connect() {
    if (connecting || active) return;

    setConnecting(true);
    setError("");
    setStatus(
      role === "broadcaster"
        ? "Starting your live stream…"
        : "Connecting to live video…"
    );

    intentionalDisconnectRef.current = false;

    try {
      const response = await fetch("/api/livekit/token", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          gameId,
          role,
        }),
      });

      let body: {
        token?: string;
        serverUrl?: string;
        room?: string;
        error?: string;
      } = {};

      try {
        body = await response.json();
      } catch {
        body = {};
      }

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error(
            "Live video is temporarily busy. Please wait a moment and try again."
          );
        }

        throw new Error(
          body.error ||
            `Live video authorization failed (${response.status}).`
        );
      }

      if (!body.token || !body.serverUrl) {
        throw new Error(
          "Live video configuration is incomplete."
        );
      }

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
          "Live video is configured for a local LiveKit server. Production needs a public wss:// LiveKit endpoint."
        );
      }

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        stopLocalTrackOnUnpublish: false,
      });

      roomRef.current = room;

      room.on(RoomEvent.TrackPublished, (publication, participant) => {
        console.log(
          "GameDay remote track published:",
          participant.identity,
          publication.kind,
          publication.trackSid
        );

        if (role !== "viewer") return;

        try {
          publication.setSubscribed(true);
        } catch (subscriptionError) {
          console.error(
            "GameDay could not subscribe to published track:",
            subscriptionError
          );
        }
      });

      room.on(
        RoomEvent.TrackSubscribed,
        (track, publication, participant) => {
          console.log(
            "GameDay REMOTE TRACK SUBSCRIBED:",
            participant.identity,
            publication.kind,
            publication.trackSid
          );

          attachRemoteTrack(track);

          if (track.kind === Track.Kind.Video) {
            setHasVideo(true);
            setStatus("Live now");
            setError("");
          }
        }
      );

      room.on(
        RoomEvent.TrackUnsubscribed,
        (track) => {
          console.log(
            "GameDay remote track unsubscribed:",
            track.kind
          );

          try {
            track.detach().forEach((element) => {
              element.remove();
            });
          } catch {}

          if (track.kind === Track.Kind.Video) {
            setHasVideo(false);
          }
        }
      );

      room.on(
        RoomEvent.TrackSubscriptionFailed,
        (trackSid, participant) => {
          console.error(
            "GameDay remote track subscription failed:",
            trackSid,
            participant.identity
          );

          setError(
            "The live camera is available, but this device could not receive the video."
          );
        }
      );

      room.on(
        RoomEvent.TrackStreamStateChanged,
        (publication, streamState, participant) => {
          console.log(
            "GameDay remote stream state:",
            participant.identity,
            publication.kind,
            streamState
          );

          if (
            role === "viewer" &&
            publication.kind === Track.Kind.Video &&
            streamState === "paused"
          ) {
            setStatus("Optimizing video quality…");
          } else if (role === "viewer" && hasVideo) {
            setStatus("Live now");
          }
        }
      );

      room.on(
        RoomEvent.ConnectionQualityChanged,
        (connectionQuality, participant) => {
          if (role === "viewer" && !participant.isLocal) {
            setConnectionQuality(connectionQuality);
          }
        }
      );

      room.on(
        RoomEvent.AudioPlaybackStatusChanged,
        (playing) => {
          setAudioBlocked(!playing);
        }
      );

      room.on(
        RoomEvent.ParticipantConnected,
        (participant) => {
          console.log(
            "GameDay participant connected:",
            participant.identity
          );

          if (role !== "viewer") return;

          participant.trackPublications.forEach((publication) => {
            if (
              publication.kind === Track.Kind.Video ||
              publication.kind === Track.Kind.Audio
            ) {
              try {
                publication.setSubscribed(true);
              } catch {}
            }
          });

          setStatus(
            hasVideo ? "Live now" : "Waiting for live camera…"
          );
        }
      );

      room.on(
        RoomEvent.ParticipantDisconnected,
        (participant) => {
          console.log(
            "GameDay participant disconnected:",
            participant.identity
          );

          if (role === "viewer") {
            setHasVideo(false);
            setStatus("Camera disconnected");
          }
        }
      );

      room.on(RoomEvent.Reconnecting, () => {
        setStatus("Reconnecting…");
      });

      room.on(RoomEvent.Reconnected, () => {
        reconnectAttemptsRef.current = 0;
        setError("");

        if (role === "viewer") {
          subscribeToRemotePublications(room);
          setStatus(
            hasVideo ? "Live now" : "Connected. Waiting for camera…"
          );
        } else {
          setStatus("Live stream reconnected");
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        setActive(false);

        if (intentionalDisconnectRef.current) {
          return;
        }

        if (
          role === "viewer" &&
          reconnectAttemptsRef.current < 1
        ) {
          reconnectAttemptsRef.current += 1;

          setHasVideo(false);
          setStatus("Connection lost. Reconnecting…");

          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            void connect();
          }, 1500);

          return;
        }

        setHasVideo(false);
        setError("The live connection ended.");
        setStatus("Stream disconnected");
      });

      /*
       * Pre-warm the LiveKit connection before the actual connect.
       * This reduces connection setup time for viewers.
       */
      await room.prepareConnection(
        body.serverUrl,
        body.token
      );

      await room.connect(
        body.serverUrl,
        body.token,
        {
          autoSubscribe: true,
        }
      );

      setActive(true);
      setError("");

      console.log(
        "GameDay connected:",
        room.name,
        "participants:",
        room.remoteParticipants.size
      );

      if (role === "viewer") {
        subscribeToRemotePublications(room);

        if (room.canPlaybackAudio) {
          setAudioBlocked(false);
        } else {
          setAudioBlocked(true);
        }

        if (room.remoteParticipants.size === 0) {
          setStatus("Connected. Waiting for the camera…");
        } else {
          setStatus("Connected. Starting live video…");
        }

        return;
      }

      /*
       * BROADCASTER
       *
       * We intentionally use browser getUserMedia instead of LiveKit's
       * camera helper because this Kali/Firefox system has a broken default
       * IPU6 video input but a working Razer Kiyo Pro.
       */
      setStatus("Finding camera…");

      async function getVideoInputs() {
        const devices =
          await navigator.mediaDevices.enumerateDevices();

        return devices.filter(
          (device) => device.kind === "videoinput"
        );
      }

      function findPreferredCamera(devices: MediaDeviceInfo[]) {
        return (
          devices.find((device) =>
            device.label
              .toLowerCase()
              .includes("razer kiyo pro")
          ) ??
          devices.find((device) =>
            device.label.toLowerCase().includes("razer")
          ) ??
          devices.find((device) =>
            device.label.toLowerCase().includes("kiyo")
          )
        );
      }

      let cameras = await getVideoInputs();
      let selectedCamera = findPreferredCamera(cameras);

      if (!selectedCamera?.deviceId) {
        try {
          const permissionStream =
            await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });

          permissionStream.getTracks().forEach((track) => {
            try {
              track.stop();
            } catch {}
          });
        } catch (permissionError) {
          console.warn(
            "Default camera permission attempt failed:",
            permissionError
          );
        }

        cameras = await getVideoInputs();
        selectedCamera = findPreferredCamera(cameras);
      }

      console.log(
        "GameDay video inputs:",
        cameras.map((device) => ({
          label: device.label,
          deviceId: device.deviceId,
        }))
      );

      const orderedCameras = selectedCamera
        ? [
            selectedCamera,
            ...cameras.filter(
              (device) =>
                device.deviceId !== selectedCamera?.deviceId
            ),
          ]
        : cameras;

      let cameraStream: MediaStream | null = null;
      let cameraTrack: MediaStreamTrack | null = null;
      let openedLabel = "";

      for (const device of orderedCameras) {
        if (!device.deviceId) continue;

        try {
          setStatus(
            `Starting ${device.label || "camera"}…`
          );

          const stream =
            await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: {
                  exact: device.deviceId,
                },
              },
              audio: false,
            });

          const track = stream.getVideoTracks()[0];

          if (!track) {
            stream.getTracks().forEach((t) => {
              try {
                t.stop();
              } catch {}
            });

            continue;
          }

          cameraStream = stream;
          cameraTrack = track;
          openedLabel =
            track.label || device.label || "Camera";

          const detectedFacing = track.getSettings().facingMode;

          if (
            detectedFacing === "environment" ||
            detectedFacing === "user"
          ) {
            setCameraFacing(detectedFacing);
          }

          break;
        } catch (cameraError) {
          console.warn(
            "GameDay camera failed:",
            device.label || "(unnamed)",
            cameraError
          );
        }
      }

      if (!cameraTrack || !cameraStream) {
        throw new Error(
          "GameDay could not open an available camera."
        );
      }

      cameraStreamRef.current = cameraStream;
      cameraTrackRef.current = cameraTrack;

      setCameraLabel(openedLabel);
      attachLocalPreview(cameraStream);

      setStatus("Publishing live video…");

      const cameraPublication =
        await room.localParticipant.publishTrack(
          cameraTrack,
          {
            name: "gameday-camera",
            source: Track.Source.Camera,
            simulcast: true,
          }
        );

      if (!cameraPublication?.videoTrack) {
        stopRawCamera();

        throw new Error(
          "The camera opened, but LiveKit could not publish it."
        );
      }

      setCameraEnabled(true);
      setActive(true);
      setStatus("You are LIVE");
      setError("");

      try {
        const microphonePublication =
          await room.localParticipant.setMicrophoneEnabled(
            true
          );

        setMicrophoneEnabled(
          Boolean(microphonePublication)
        );
      } catch (microphoneError) {
        console.warn(
          "Microphone could not be enabled:",
          microphoneError
        );

        setMicrophoneEnabled(false);
      }
    } catch (connectError) {
      console.error("LIVE VIDEO ERROR:", connectError);

      try {
        await roomRef.current?.disconnect();
      } catch {}

      roomRef.current = null;

      stopRawCamera();
      clearMedia();

      setActive(false);
      setHasVideo(false);
      setCameraEnabled(false);
      setMicrophoneEnabled(false);

      const message =
        connectError instanceof Error
          ? connectError.message
          : "Live video could not be started.";

      setError(message);
      setStatus("Live video unavailable");
    } finally {
      setConnecting(false);
    }
  }

  function isMobileCameraBrowser() {
    if (typeof navigator === "undefined") return false;

    return (
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 &&
        /Macintosh/i.test(navigator.userAgent))
    );
  }

  async function switchCamera() {
    if (role !== "broadcaster") return;

    const room = roomRef.current;
    const publication =
      room?.localParticipant.getTrackPublication(
        Track.Source.Camera
      );
    const videoTrack = publication?.videoTrack;

    if (!room || !videoTrack) {
      setError("The live camera is not available.");
      return;
    }

    const nextFacing =
      cameraFacing === "environment"
        ? "user"
        : "environment";

    setStatus(
      nextFacing === "environment"
        ? "Switching to back camera…"
        : "Switching to front camera…"
    );
    setError("");

    try {
      await videoTrack.restartTrack({
        facingMode: nextFacing,
      });

      const mediaTrack = videoTrack.mediaStreamTrack;

      if (mediaTrack.readyState === "ended") {
        throw new Error(
          "The camera stopped while switching."
        );
      }

      const actualFacing =
        mediaTrack.getSettings().facingMode;

      cameraTrackRef.current = mediaTrack;
      cameraStreamRef.current = new MediaStream([
        mediaTrack,
      ]);

      setCameraFacing(
        actualFacing === "environment" ||
          actualFacing === "user"
          ? actualFacing
          : nextFacing
      );

      setCameraLabel(
        mediaTrack.label || "Camera"
      );

      attachLocalPreview(
        cameraStreamRef.current
      );

      setCameraEnabled(true);
      setHasVideo(true);
      setActive(true);
      setError("");
      setStatus("You are LIVE");
    } catch (cameraError) {
      console.error(
        "GameDay camera switch failed:",
        cameraError
      );

      setError(
        cameraError instanceof Error
          ? cameraError.message
          : "The camera could not be switched."
      );

      setStatus("Camera switch failed");
    }
  }

  async function toggleMicrophone() {
    if (role !== "broadcaster") return;

    const room = roomRef.current;
    if (!room) return;

    try {
      const next = !microphoneEnabled;

      const publication =
        await room.localParticipant.setMicrophoneEnabled(
          next
        );

      setMicrophoneEnabled(
        next && Boolean(publication)
      );
    } catch (microphoneError) {
      console.error(
        "Microphone toggle failed:",
        microphoneError
      );

      setError(
        "The microphone could not be changed."
      );
    }
  }

  useEffect(() => {
    if (role === "viewer") {
      void connect();
    }

    function handleFullscreenChange() {
      setFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener(
      "fullscreenchange",
      handleFullscreenChange
    );

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        handleFullscreenChange
      );

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }

      intentionalDisconnectRef.current = true;

      stopRawCamera();

      const room = roomRef.current;

      if (room) {
        void room.disconnect();
      }
    };
  }, [role, gameId]);

  const qualityBars = qualityLevel(connectionQuality);

  return (
    <section className="gdpLiveRoom" ref={liveRoomRef}>
      <style>{`
        .gdpLiveRoom {
          width: 100%;
          overflow: hidden;
          border-radius: 16px;
          border: 1px solid #26262c;
          background: #08080a;
          color: #fff;
          box-shadow: 0 18px 50px rgba(0,0,0,.28);
        }

        .gdpLiveRoom * {
          box-sizing: border-box;
        }

        .gdpLiveHead {
          display: grid;
          grid-template-columns: 105px minmax(0,1fr) auto auto;
          align-items: center;
          gap: 6px;
          padding: 4px 7px;
          min-height: 42px;
          height: 42px;
          background: #101014;
          border-bottom: 1px solid #24242a;
        }

        .gdpLiveHeadLeft {
          min-width: 0;
          overflow: hidden;
        }

        .gdpLiveTitle {
          margin: 0;
          font-size: 10px;
          line-height: 1;
          font-weight: 900;
          white-space: nowrap;
        }

        .gdpLiveSub {
          margin-top: 2px;
          font-size: 7px;
          line-height: 1;
          color: #777c86;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .gdpGameHeaderScore {
          width: 100%;
          min-width: 0;
          height: 34px;
          display: grid;
          grid-template-columns: minmax(42px,1fr) 72px minmax(42px,1fr);
          align-items: center;
          gap: 3px;
        }

        .gdpGameHeaderTeam {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 4px;
          line-height: 1;
        }

        .gdpGameHeaderTeam.away {
          justify-content: flex-end;
          text-align: right;
        }

        .gdpGameHeaderTeam.home {
          justify-content: flex-start;
          text-align: left;
        }

        .gdpGameHeaderTeam span {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #aeb3bc;
          font-size: 7px;
          font-weight: 850;
        }

        .gdpGameHeaderTeam strong {
          flex: 0 0 auto;
          color: #fff;
          font-size: 17px;
          line-height: 1;
          font-weight: 950;
        }

        .gdpGameHeaderCenter {
          width: 72px;
          height: 34px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .gdpGameHeaderInning {
          color: #c3c7cf;
          font-size: 7px;
          line-height: 1;
          font-weight: 950;
          letter-spacing: .05em;
        }

        .gdpGameHeaderCount {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 2px;
          margin-top: 2px;
        }

        .gdpGameHeaderCount span {
          min-width: 16px;
          height: 13px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 1px;
          border: 1px solid #343740;
          border-radius: 3px;
          background: #15161b;
          color: #d6dae0;
          font-size: 5px;
          font-weight: 900;
        }

        .gdpGameHeaderCount b {
          color: #fff;
          font-weight: 950;
        }

        .gdpGameHeaderDiamond {
          display: none;
        }

        .gdpHeaderFullscreen {
          width: 28px;
          height: 28px;
          min-height: 28px;
          padding: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #373a43;
          border-radius: 6px;
          background: #15161b;
          color: #fff;
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
        }

        .gdpHeaderFullscreen:hover {
          background: #23252c;
        }

        .gdpLiveBadge {
          min-height: 25px;
          padding: 0 7px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border-radius: 999px;
          background: #19191f;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: .06em;
          text-transform: uppercase;
        }

        .gdpLiveStage {
          position: relative;
          clear: both;
          margin: 0;
          padding: 0;
          width: 100%;
          aspect-ratio: 16 / 9;
          min-height: 220px;
          background:
            radial-gradient(circle at 50% 45%, #17171b 0, #0b0b0e 58%, #050506 100%);
          overflow: hidden;
        }

        .gdpLiveMedia {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        .gdpLiveMedia video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .gdpLiveMedia audio {
          position: absolute;
          width: 1px;
          height: 1px;
          opacity: 0;
          pointer-events: none;
        }

        .gdpLivePlaceholder {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          padding: 24px;
          text-align: center;
        }

        .gdpLivePlaceholderInner {
          max-width: 310px;
        }

        .gdpLiveCameraIcon {
          width: 58px;
          height: 58px;
          margin: 0 auto 14px;
          border-radius: 18px;
          display: grid;
          place-items: center;
          background: #17171d;
          border: 1px solid #303039;
          font-size: 26px;
        }

        .gdpLivePlaceholderTitle {
          font-size: 16px;
          font-weight: 900;
          margin-bottom: 6px;
        }

        .gdpLivePlaceholderText {
          color: #92929b;
          font-size: 12px;
          line-height: 1.5;
        }

        .gdpLiveTopOverlay {
          position: absolute;
          top: 12px;
          left: 12px;
          right: 12px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
          pointer-events: none;
        }

        .gdpLiveTopLeft {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .gdpLivePill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 30px;
          padding: 0 10px;
          border-radius: 999px;
          background: rgba(0,0,0,.72);
          border: 1px solid rgba(255,255,255,.10);
          backdrop-filter: blur(10px);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .06em;
          text-transform: uppercase;
        }

        .gdpLivePill.red {
          background: #d9003f;
          border-color: #ff3d70;
        }

        .gdpLiveQuality {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-height: 30px;
          padding: 0 10px;
          border-radius: 999px;
          background: rgba(0,0,0,.72);
          border: 1px solid rgba(255,255,255,.10);
          backdrop-filter: blur(10px);
          font-size: 10px;
          color: #d8d8de;
        }

        .gdpLiveBars {
          display: inline-flex;
          align-items: flex-end;
          gap: 2px;
          height: 13px;
        }

        .gdpLiveBar {
          width: 3px;
          border-radius: 2px;
          background: #55555e;
        }

        .gdpLiveBar:nth-child(1) { height: 4px; }
        .gdpLiveBar:nth-child(2) { height: 7px; }
        .gdpLiveBar:nth-child(3) { height: 10px; }
        .gdpLiveBar:nth-child(4) { height: 13px; }

        .gdpLiveBar.on {
          background: #46dc9a;
        }

        .gdpLiveControlRow {
          position: absolute;
          left: 12px;
          right: 12px;
          bottom: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .gdpLiveControlsLeft,
        .gdpLiveControlsRight {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .gdpLiveButton {
          min-height: 36px;
          padding: 0 12px;
          border: 1px solid rgba(255,255,255,.16);
          border-radius: 9px;
          background: rgba(0,0,0,.72);
          color: #fff;
          cursor: pointer;
          font-size: 11px;
          font-weight: 850;
          backdrop-filter: blur(10px);
        }

        .gdpLiveButton:hover {
          background: rgba(30,30,34,.88);
        }

        .gdpLiveButton.primary {
          background: #7c2cff;
          border-color: #9456ff;
        }

        .gdpLiveButton.danger {
          background: #d9003f;
          border-color: #ff3d70;
        }

        .gdpLiveButton:disabled {
          opacity: .55;
          cursor: not-allowed;
        }

        .gdpLiveAudioPrompt {
          position: absolute;
          left: 50%;
          bottom: 64px;
          transform: translateX(-50%);
          width: max-content;
          max-width: calc(100% - 28px);
          padding: 10px 13px;
          border-radius: 11px;
          background: rgba(0,0,0,.82);
          border: 1px solid rgba(255,255,255,.16);
          box-shadow: 0 12px 30px rgba(0,0,0,.35);
          font-size: 11px;
          font-weight: 800;
          color: #fff;
          cursor: pointer;
          backdrop-filter: blur(12px);
        }

        .gdpLiveCenterAction {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          display: grid;
          place-items: center;
          gap: 9px;
          text-align: center;
        }

        .gdpLiveSpinner {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          border: 3px solid rgba(255,255,255,.15);
          border-top-color: #fff;
          animation: gdpLiveSpin .8s linear infinite;
          margin: 0 auto;
        }

        @keyframes gdpLiveSpin {
          to { transform: rotate(360deg); }
        }

        .gdpLiveError {
          margin: 0;
          padding: 10px 13px;
          background: #220c12;
          border-top: 1px solid #48131e;
          color: #ffb5c5;
          font-size: 11px;
          line-height: 1.45;
        }

        .gdpLiveFooter {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 10px 13px;
          background: #101014;
          border-top: 1px solid #24242a;
          color: #8f8f98;
          font-size: 10px;
        }

        .gdpLiveFooterStrong {
          color: #e9e9ed;
          font-weight: 800;
        }

        @media (max-width: 600px) {
          .gdpLiveRoom {
            border-radius: 12px;
          }

          .gdpLiveHead {
            padding: 11px;
          }

          .gdpLiveTitle {
            font-size: 13px;
          }

          .gdpLiveSub {
            font-size: 10px;
          }

          .gdpLiveStage {
            min-height: 190px;
          }

          .gdpLiveQuality {
            display: none;
          }

          .gdpLiveControlRow {
            left: 9px;
            right: 9px;
            bottom: 9px;
          }

          .gdpLiveButton {
            min-height: 34px;
            padding: 0 10px;
          }

          .gdpLiveFooter {
            padding: 9px 11px;
          }
        }

        /* =====================================================
           FINAL GAME CAMERA HEADER + FULLSCREEN
           ===================================================== */

        .gdpLiveRoom {
          position: relative;
        }

        .gdpLiveHead {
          position: relative !important;
          z-index: 10 !important;
          min-height: 76px !important;
          height: 76px !important;
          padding: 8px 12px !important;
          display: grid !important;
          grid-template-columns: 125px minmax(0,1fr) auto auto !important;
          align-items: center !important;
          gap: 10px !important;
        }

        .gdpGameHeaderScore {
          min-width: 0 !important;
          width: 100% !important;
          height: 60px !important;
          display: grid !important;
          grid-template-columns: minmax(80px,1fr) 108px minmax(80px,1fr) !important;
          align-items: center !important;
          gap: 8px !important;
        }

        .gdpGameHeaderTeam {
          min-width: 0 !important;
          display: flex !important;
          align-items: center !important;
          gap: 7px !important;
        }

        .gdpGameHeaderTeam.away {
          justify-content: flex-end !important;
          text-align: right !important;
        }

        .gdpGameHeaderTeam.home {
          justify-content: flex-start !important;
          text-align: left !important;
        }

        .gdpGameHeaderTeam span {
          min-width: 0 !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
          color: #d6d9df !important;
          font-size: 10px !important;
          font-weight: 850 !important;
        }

        .gdpGameHeaderTeam strong {
          color: #fff !important;
          font-size: 30px !important;
          line-height: 1 !important;
          font-weight: 950 !important;
        }

        .gdpGameHeaderCenter {
          width: 108px !important;
          height: 60px !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
        }

        .gdpGameHeaderInning {
          color: #fff !important;
          font-size: 10px !important;
          line-height: 1 !important;
          font-weight: 950 !important;
          letter-spacing: .08em !important;
        }

        .gdpGameHeaderCount {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 3px !important;
          margin-top: 5px !important;
        }

        .gdpGameHeaderCount span {
          min-width: 25px !important;
          height: 21px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 2px !important;
          border: 1px solid #41444d !important;
          border-radius: 4px !important;
          background: #15161b !important;
          color: #e5e7eb !important;
          font-size: 7px !important;
          font-weight: 900 !important;
        }

        .gdpGameHeaderDiamond {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 36px !important;
          height: 25px !important;
          margin-top: 2px !important;
        }

        .gdpGameHeaderDiamondField {
          position: relative !important;
          width: 30px !important;
          height: 30px !important;
        }

        .gdpGameHeaderDiamondField::before {
          content: "" !important;
          position: absolute !important;
          width: 20px !important;
          height: 20px !important;
          left: 5px !important;
          top: 5px !important;
          border: 1px solid rgba(255,255,255,.6) !important;
          transform: rotate(45deg) !important;
        }

        .gdpGameHeaderBase {
          position: absolute !important;
          width: 6px !important;
          height: 6px !important;
          border: 1px solid #fff !important;
          background: #101216 !important;
          transform: rotate(45deg) !important;
        }

        .gdpGameHeaderBase.occupied {
          background: #ffd42a !important;
          border-color: #ffd42a !important;
        }

        .gdpGameHeaderBase.second {
          left: 12px !important;
          top: 0 !important;
        }

        .gdpGameHeaderBase.third {
          left: 0 !important;
          top: 12px !important;
        }

        .gdpGameHeaderBase.first {
          right: 0 !important;
          top: 12px !important;
        }

        .gdpGameHeaderHome {
          position: absolute !important;
          left: 10px !important;
          bottom: 0 !important;
          width: 8px !important;
          height: 8px !important;
          background: #fff !important;
          clip-path: polygon(0 0,100% 0,100% 65%,50% 100%,0 65%) !important;
        }

        .gdpHeaderFullscreen {
          width: 38px !important;
          height: 38px !important;
          min-height: 38px !important;
          padding: 0 !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          border: 1px solid #434751 !important;
          border-radius: 8px !important;
          background: #15161b !important;
          color: #fff !important;
          cursor: pointer !important;
          font-size: 19px !important;
        }

        .gdpLiveRoom:fullscreen {
          position: fixed !important;
          inset: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          max-width: none !important;
          max-height: none !important;
          margin: 0 !important;
          padding: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: #000 !important;
          display: flex !important;
          flex-direction: column !important;
          overflow: hidden !important;
        }

        .gdpLiveRoom:fullscreen .gdpLiveHead {
          flex: 0 0 76px !important;
          min-height: 76px !important;
          height: 76px !important;
          width: 100% !important;
        }

        .gdpLiveRoom:fullscreen .gdpLiveStage {
          flex: 1 1 auto !important;
          min-height: 0 !important;
          height: auto !important;
          width: 100% !important;
          aspect-ratio: auto !important;
        }

        .gdpLiveRoom:fullscreen .gdpLiveMedia {
          width: 100% !important;
          height: 100% !important;
        }

        .gdpLiveRoom:fullscreen .gdpLiveMedia video {
          width: 100% !important;
          height: 100% !important;
          max-width: none !important;
          max-height: none !important;
          object-fit: contain !important;
        }

        @media (max-width: 700px) {
          .gdpLiveRoom .gdpLiveHead {
            min-height: 68px !important;
            height: 68px !important;
            padding: 7px 8px !important;
            grid-template-columns: 82px minmax(0,1fr) auto auto !important;
            gap: 5px !important;
          }

          .gdpLiveRoom .gdpLiveTitle {
            font-size: 10px !important;
          }

          .gdpLiveRoom .gdpLiveSub {
            font-size: 7px !important;
          }

          .gdpGameHeaderScore {
            height: 54px !important;
            grid-template-columns: minmax(42px,1fr) 88px minmax(42px,1fr) !important;
            gap: 3px !important;
          }

          .gdpGameHeaderTeam span {
            font-size: 7px !important;
          }

          .gdpGameHeaderTeam strong {
            font-size: 23px !important;
          }

          .gdpGameHeaderCenter {
            width: 88px !important;
            height: 54px !important;
          }

          .gdpGameHeaderInning {
            font-size: 8px !important;
          }

          .gdpGameHeaderCount span {
            min-width: 20px !important;
            height: 18px !important;
            font-size: 6px !important;
          }

          .gdpHeaderFullscreen {
            width: 32px !important;
            height: 32px !important;
            min-height: 32px !important;
            font-size: 16px !important;
          }

          .gdpLiveRoom:fullscreen .gdpLiveHead {
            flex-basis: 68px !important;
            min-height: 68px !important;
            height: 68px !important;
          }
        }

      `}</style>

      <div className="gdpLiveHead">
        <div className="gdpLiveHeadLeft">
          <h3 className="gdpLiveTitle">
            {role === "broadcaster"
              ? "Game camera"
              : "GameDay Live"}
          </h3>

          <div className="gdpLiveSub">
            {role === "broadcaster"
              ? cameraLabel || status
              : status}
          </div>
        </div>


        {game && (
          <div className="gdpGameHeaderScore">

            <div className="gdpGameHeaderTeam away">
              <span>{game.away_name}</span>
              <strong>{game.away_score}</strong>
            </div>

            <div className="gdpGameHeaderCenter">
              <div className="gdpGameHeaderInning">
                {game.half === "top" ? "TOP" : "BOT"} {game.inning}
              </div>

              <div className="gdpGameHeaderCount">
                <span><b>B</b>{game.balls}</span>
                <span><b>S</b>{game.strikes}</span>
                <span><b>O</b>{game.outs}</span>
              </div>

              <div className="gdpGameHeaderDiamond">
                <div className="gdpGameHeaderDiamondField">
                  <span className={`gdpGameHeaderBase second ${game.bases?.["2"] ? "occupied" : ""}`} />
                  <span className={`gdpGameHeaderBase third ${game.bases?.["3"] ? "occupied" : ""}`} />
                  <span className={`gdpGameHeaderBase first ${game.bases?.["1"] ? "occupied" : ""}`} />
                  <span className="gdpGameHeaderHome" />
                </div>
              </div>
            </div>

            <div className="gdpGameHeaderTeam home">
              <strong>{game.home_score}</strong>
              <span>{game.home_name}</span>
            </div>

          </div>
        )}


        <button
          type="button"
          className="gdpHeaderFullscreen"
          onClick={() => void toggleFullscreen()}
          aria-label="Toggle fullscreen"
          title="Toggle fullscreen"
        >
          {fullscreen ? "↙" : "⛶"}
        </button>

        <div className="gdpLiveBadge">
          <span
            className={`gdpLiveDot ${
              active && (hasVideo || role === "broadcaster")
                ? "live"
                : ""
            }`}
          />
          {active && (hasVideo || role === "broadcaster")
            ? "Live"
            : "Offline"}
        </div>
      </div>

      <div className="gdpLiveStage" ref={stageRef}>
        <div className="gdpLiveMedia" ref={mediaRef} />

        {!hasVideo && (
          <div className="gdpLivePlaceholder">
            <div className="gdpLivePlaceholderInner">
              <div className="gdpLiveCameraIcon">
                {role === "broadcaster" ? "◉" : "▶"}
              </div>

              {connecting ? (
                <>
                  <div className="gdpLiveSpinner" />
                  <div
                    className="gdpLivePlaceholderTitle"
                    style={{ marginTop: 12 }}
                  >
                    {role === "broadcaster"
                      ? "Starting camera"
                      : "Connecting to the game"}
                  </div>
                  <div className="gdpLivePlaceholderText">
                    {status}
                  </div>
                </>
              ) : (
                <>
                  <div className="gdpLivePlaceholderTitle">
                    {role === "broadcaster"
                      ? "Ready to stream"
                      : "Waiting for the live camera"}
                  </div>

                  <div className="gdpLivePlaceholderText">
                    {role === "broadcaster"
                      ? "Start the camera to put the game live."
                      : "The stream will appear here automatically when the camera is live."}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {hasVideo && (
          <div className="gdpLiveTopOverlay">
            <div className="gdpLiveTopLeft">
              <div className="gdpLivePill red">
                <span className="gdpLiveDot live" />
                LIVE
              </div>

              {role === "broadcaster" && (
                <>
                  <div className="gdpLivePill">
                    CAM {cameraEnabled ? "ON" : "OFF"}
                  </div>

                  <div className="gdpLivePill">
                    MIC {microphoneEnabled ? "ON" : "OFF"}
                  </div>
                </>
              )}
            </div>

            {role === "viewer" && (
              <div className="gdpLiveQuality">
                <span className="gdpLiveBars">
                  {[1, 2, 3, 4].map((bar) => (
                    <span
                      key={bar}
                      className={`gdpLiveBar ${
                        bar <= qualityBars ? "on" : ""
                      }`}
                    />
                  ))}
                </span>

                {qualityLabel(connectionQuality)}
              </div>
            )}
          </div>
        )}

        {role === "viewer" &&
          active &&
          hasVideo &&
          audioBlocked && (
            <button
              className="gdpLiveAudioPrompt"
              onClick={() => void enableViewerAudio()}
            >
              🔊 Tap to turn on game audio
            </button>
          )}

        <div className="gdpLiveControlRow">
          <div className="gdpLiveControlsLeft">
            {role === "viewer" && active && hasVideo && (
              <button
                className="gdpLiveButton"
                onClick={toggleViewerMute}
              >
                {muted ? "🔇 Sound off" : "🔊 Sound on"}
              </button>
            )}

            {role === "broadcaster" && active && (
              <button
                className="gdpLiveButton"
                onClick={() => void toggleMicrophone()}
              >
                {microphoneEnabled
                  ? "🎙 Mic on"
                  : "🔇 Mic off"}
              </button>
            )}

            {role === "broadcaster" &&
              active &&
              cameraEnabled &&
              isMobileCameraBrowser() && (
                <button
                  type="button"
                  className="gdpLiveButton gdpCameraSwitchButton"
                  onClick={() => void switchCamera()}
                >
                  {cameraFacing === "environment"
                    ? "↩ Front camera"
                    : "↪ Back camera"}
                </button>
              )}
          </div>

          <div className="gdpLiveControlsRight">
            {(active || connecting) &&
              role === "broadcaster" && (
                <button
                  className="gdpLiveButton danger"
                  disabled={connecting}
                  onClick={() => void disconnect()}
                >
                  {connecting ? "Starting…" : "End live"}
                </button>
              )}

            {!active &&
              !connecting &&
              (role === "broadcaster" || error) && (
                <button
                  className="gdpLiveButton primary"
                  onClick={() => void connect()}
                >
                  {role === "broadcaster"
                    ? "Start camera"
                    : "Reconnect"}
                </button>
              )}

          </div>
        </div>
      </div>

      {error && (
        <p className="gdpLiveError">
          {error}
        </p>
      )}

      <div className="gdpLiveFooter">
        <span>
          <span className="gdpLiveFooterStrong">
            {role === "broadcaster"
              ? "Broadcast"
              : "Live stream"}
          </span>
          {" · "}
          Low-latency video
        </span>

        <span>
          {role === "broadcaster"
            ? cameraLabel || "Camera"
            : qualityLabel(connectionQuality)}
        </span>
      </div>
    </section>
  );
}
