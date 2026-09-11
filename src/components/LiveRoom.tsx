"use client";

import { useEffect, useRef, useState } from "react";
import { createLocalTracks, Room, RoomEvent, Track } from "livekit-client";

export function LiveRoom({ gameId, role }: { gameId: string; role: "viewer" | "broadcaster" }) {
  const [status, setStatus] = useState("Not connected");
  const [active, setActive] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const mediaRef = useRef<HTMLDivElement>(null);

  useEffect(()=>()=>{void roomRef.current?.disconnect()},[]);

  async function connect() {
    setStatus("Connecting…");
    const response = await fetch("/api/livekit/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gameId, role }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Video connection failed");
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    room.on(RoomEvent.TrackSubscribed, track => {
      if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) mediaRef.current?.appendChild(track.attach());
    });
    room.on(RoomEvent.TrackUnsubscribed, track => track.detach().forEach(element => element.remove()));
    room.on(RoomEvent.Disconnected, () => { setActive(false); setStatus("Disconnected"); });
    await room.connect(body.serverUrl, body.token);
    if (role === "broadcaster") {
      const tracks=await createLocalTracks({audio:true,video:{facingMode:"environment",width:{ideal:1280},height:{ideal:720}}});
      for(const track of tracks){await room.localParticipant.publishTrack(track);if(track.kind===Track.Kind.Video)mediaRef.current?.appendChild(track.attach())}
    }
    setActive(true);
    setStatus(role === "broadcaster" ? "Camera is live" : "Watching live game");
  }

  async function toggle() {
    try {
      if (active) { await roomRef.current?.disconnect(); roomRef.current = null; if (mediaRef.current) mediaRef.current.innerHTML = ""; }
      else await connect();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Video failed"); }
  }

  return <section className="panel"><div className="pageHead"><div><h3 style={{ margin: 0 }}>{role === "broadcaster" ? "Game camera" : "Live video"}</h3><small>{status}</small></div><button className={`button ${active ? "secondary" : "red"}`} onClick={toggle}>{active ? "Disconnect" : role === "broadcaster" ? "Start camera" : "Watch live"}</button></div><div className="mediaStage" ref={mediaRef} /></section>;
}
