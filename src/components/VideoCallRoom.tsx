"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
} from "agora-rtc-sdk-ng";
import { Loader2, Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoCallRoomProps {
  appointmentId: string;
  accent?: "blue" | "teal";
  leaveHref: string;
}

export default function VideoCallRoom({ appointmentId, accent = "blue", leaveHref }: VideoCallRoomProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"connecting" | "waiting" | "connected" | "error">("connecting");
  const [error, setError] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const localRef = useRef<HTMLDivElement>(null);
  const remoteRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localTracksRef = useRef<{ audio: IMicrophoneAudioTrack; video: ICameraVideoTrack } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function join() {
      const res = await fetch(`/api/appointments/${appointmentId}/video-token`);
      if (!res.ok) {
        if (cancelled) return;
        setError((await res.json().catch(() => ({}))).error ?? "Could not start the video call.");
        setStatus("error");
        return;
      }
      const { appId, token, channel } = await res.json();
      if (cancelled) return;

      const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      clientRef.current = client;

      client.on("user-published", async (user: IAgoraRTCRemoteUser, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "video") {
          user.videoTrack?.play(remoteRef.current!);
          setStatus("connected");
        }
        if (mediaType === "audio") user.audioTrack?.play();
      });
      client.on("user-unpublished", () => setStatus("waiting"));
      client.on("user-left", () => setStatus("waiting"));

      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
      if (cancelled) {
        audioTrack.close();
        videoTrack.close();
        return;
      }
      localTracksRef.current = { audio: audioTrack, video: videoTrack };
      videoTrack.play(localRef.current!);

      await client.join(appId, channel, token, 0);
      if (cancelled) return;
      await client.publish([audioTrack, videoTrack]);
      setStatus((prev) => (prev === "connecting" ? "waiting" : prev));
    }

    join().catch((err) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : "Could not start the video call.");
      setStatus("error");
    });

    return () => {
      cancelled = true;
      localTracksRef.current?.audio.close();
      localTracksRef.current?.video.close();
      clientRef.current?.leave();
    };
  }, [appointmentId]);

  const toggleMic = () => {
    const audio = localTracksRef.current?.audio;
    if (!audio) return;
    audio.setEnabled(!micOn);
    setMicOn(!micOn);
  };

  const toggleCam = () => {
    const video = localTracksRef.current?.video;
    if (!video) return;
    video.setEnabled(!camOn);
    setCamOn(!camOn);
  };

  const leave = () => {
    localTracksRef.current?.audio.close();
    localTracksRef.current?.video.close();
    clientRef.current?.leave();
    router.push(leaveHref);
  };

  const accentText = accent === "teal" ? "text-teal-300" : "text-blue-300";

  if (status === "error") {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-slate-400 text-center px-6">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-900">
      <div className="relative flex-1 overflow-hidden">
        <div ref={remoteRef} className="w-full h-full [&>div]:!w-full [&>div]:!h-full" />
        {status !== "connected" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300">
            <Loader2 className={cn("w-6 h-6 animate-spin", accentText)} />
            <p className="text-sm">{status === "connecting" ? "Connecting…" : "Waiting for the other participant to join…"}</p>
          </div>
        )}
        <div
          ref={localRef}
          className="absolute bottom-4 right-4 w-28 h-40 sm:w-36 sm:h-48 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg [&>div]:!w-full [&>div]:!h-full"
        />
      </div>

      <div className="flex items-center justify-center gap-3 py-4 bg-slate-950">
        <button
          onClick={toggleMic}
          className={cn(
            "w-11 h-11 rounded-full flex items-center justify-center text-white transition-colors",
            micOn ? "bg-slate-700 hover:bg-slate-600" : "bg-red-500 hover:bg-red-600"
          )}
        >
          {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
        </button>
        <button
          onClick={toggleCam}
          className={cn(
            "w-11 h-11 rounded-full flex items-center justify-center text-white transition-colors",
            camOn ? "bg-slate-700 hover:bg-slate-600" : "bg-red-500 hover:bg-red-600"
          )}
        >
          {camOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
        </button>
        <button
          onClick={leave}
          className="w-11 h-11 rounded-full flex items-center justify-center text-white bg-red-600 hover:bg-red-700"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
