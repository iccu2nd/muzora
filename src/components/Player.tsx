"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  PlayIcon,
  PauseIcon,
  SkipBackIcon,
  SkipForwardIcon,
  VolumeIcon,
  VolumeXIcon,
  MinimizeIcon,
} from "./Icons";
import { formatDuration } from "@/lib/piped";
import { addToHistory, toggleLike, isLiked } from "@/lib/storage";

export interface Track {
  id: string;
  title: string;
  uploader: string;
  thumbnail: string;
  duration?: number;
  audioUrl?: string;
}

type RepeatMode = "off" | "one" | "all";

interface PlayerProps {
  track: Track | null;
  queue: Track[];
  onNext: () => void;
  onPrev: () => void;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  shuffle: boolean;
  setShuffle: (v: boolean) => void;
  repeat: RepeatMode;
  setRepeat: (v: RepeatMode) => void;
  onToggleQueue?: () => void;
  onAddToPlaylist?: () => void;
}

export default function Player({
  track,
  onNext,
  onPrev,
  expanded,
  setExpanded,
  shuffle,
  setShuffle,
  repeat,
  setRepeat,
  onToggleQueue,
  onAddToPlaylist,
}: PlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [liked, setLiked] = useState(false);
  const [sleepMinutes, setSleepMinutes] = useState<number | null>(null);
  const [sleepLeft, setSleepLeft] = useState<number | null>(null);
  const sleepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sleepIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load track
  useEffect(() => {
    if (!track?.audioUrl || !audioRef.current) return;
    const audio = audioRef.current;
    setLoading(true);
    setProgress(0);
    setLiked(isLiked(track.id));
    audio.src = track.audioUrl;
    audio.load();
    audio.play()
      .then(() => {
        setPlaying(true);
        setLoading(false);
        addToHistory(track);
      })
      .catch(() => {
        setPlaying(false);
        setLoading(false);
      });
  }, [track?.id, track?.audioUrl]);

  // Audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setProgress(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || track?.duration || 0);
    const onEnd = () => {
      if (repeat === "one") {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        setPlaying(false);
        onNext();
      }
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("play", () => setPlaying(true));
    audio.addEventListener("pause", () => setPlaying(false));
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
    };
  }, [onNext, track?.duration, repeat]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = muted ? 0 : volume;
    }
  }, [volume, muted]);

  // Sleep timer
  const startSleep = (mins: number) => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
    setSleepMinutes(mins);
    setSleepLeft(mins * 60);
    sleepIntervalRef.current = setInterval(() => {
      setSleepLeft((prev) => {
        if (prev === null || prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    sleepTimerRef.current = setTimeout(() => {
      audioRef.current?.pause();
      setPlaying(false);
      setSleepMinutes(null);
      setSleepLeft(null);
      if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
    }, mins * 60 * 1000);
  };

  const cancelSleep = () => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
    setSleepMinutes(null);
    setSleepLeft(null);
  };

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    if (playing) audio.pause();
    else audio.play().catch(() => {});
  }, [playing, track]);

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = t;
      setProgress(t);
    }
  };

  const cycleRepeat = () => {
    setRepeat(repeat === "off" ? "all" : repeat === "all" ? "one" : "off");
  };

  const handleLike = () => {
    if (!track) return;
    const nowLiked = toggleLike(track);
    setLiked(nowLiked);
  };

  if (!track) return null;

  const formatSleep = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // ========== FULL SCREEN ==========
  if (expanded) {
    return (
      <>
        <audio ref={audioRef} preload="auto" />
        <div className="fixed inset-0 z-[100] flex flex-col bg-black">
          <div
            className="absolute inset-0 scale-125"
            style={{
              backgroundImage: `url(${track.thumbnail})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(50px) brightness(0.35)",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/90" />

          <div className="relative z-10 flex flex-col h-full px-5 pt-10 pb-6">
            {/* Top */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setExpanded(false)} className="p-2.5 rounded-full glass">
                <MinimizeIcon size={20} />
              </button>
              <p className="text-xs text-white/50 uppercase tracking-widest">Now Playing</p>
              <div className="flex items-center gap-1">
                {onAddToPlaylist && (
                  <button onClick={onAddToPlaylist} className="p-2.5 rounded-full glass" title="Add to playlist">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                )}
                <button onClick={handleLike} className="p-2.5 rounded-full glass">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill={liked ? "#1ed760" : "none"} stroke={liked ? "#1ed760" : "currentColor"} strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Art */}
            <div className="flex-1 flex items-center justify-center py-4">
              <img
                src={track.thumbnail}
                alt={track.title}
                className="w-[75vw] max-w-[320px] aspect-square rounded-2xl object-cover shadow-2xl"
              />
            </div>

            {/* Info */}
            <div className="text-center mb-5">
              <h1 className="text-xl font-bold truncate px-4">{track.title}</h1>
              <p className="text-white/60 mt-1 text-sm">{track.uploader}</p>
            </div>

            {/* Progress */}
            <div className="space-y-1.5 mb-5">
              <input type="range" min={0} max={duration || 100} value={progress} onChange={seek} className="w-full" />
              <div className="flex justify-between text-xs text-white/50">
                <span>{formatDuration(progress)}</span>
                <span>{formatDuration(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-8 mb-6">
              <button onClick={() => setShuffle(!shuffle)} className={shuffle ? "text-[var(--primary)]" : "text-white/50"}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
                  <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />
                  <line x1="4" y1="4" x2="9" y2="9" />
                </svg>
              </button>
              <button onClick={onPrev} className="text-white/90">
                <SkipBackIcon size={30} />
              </button>
              <button
                onClick={togglePlay}
                className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-lg active:scale-95"
                disabled={loading}
              >
                {loading ? (
                  <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : playing ? (
                  <PauseIcon size={32} />
                ) : (
                  <PlayIcon size={32} className="ml-1" />
                )}
              </button>
              <button onClick={onNext} className="text-white/90">
                <SkipForwardIcon size={30} />
              </button>
              <button onClick={cycleRepeat} className={repeat !== "off" ? "text-[var(--primary)]" : "text-white/50"}>
                {repeat === "one" ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                    <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                    <text x="12" y="15" fontSize="8" fill="currentColor" textAnchor="middle">1</text>
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                    <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                  </svg>
                )}
              </button>
            </div>

            {/* Extra row: volume + sleep + queue */}
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <button onClick={() => setMuted(!muted)} className="text-white/50">
                  {muted || volume === 0 ? <VolumeXIcon size={18} /> : <VolumeIcon size={18} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    setVolume(parseFloat(e.target.value));
                    setMuted(false);
                  }}
                  className="w-20"
                />
              </div>

              {/* Sleep timer */}
              <div className="flex items-center gap-1">
                {sleepLeft !== null ? (
                  <button onClick={cancelSleep} className="text-xs text-[var(--primary)] px-2 py-1 rounded-full glass">
                    ⏱ {formatSleep(sleepLeft)}
                  </button>
                ) : (
                  <div className="flex gap-1">
                    {[15, 30, 45, 60].map((m) => (
                      <button
                        key={m}
                        onClick={() => startSleep(m)}
                        className="text-[10px] text-white/50 hover:text-white px-1.5 py-1 rounded glass"
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {onToggleQueue && (
                <button onClick={onToggleQueue} className="text-white/50 p-1">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ========== MINI PLAYER ==========
  return (
    <>
      <audio ref={audioRef} preload="auto" />
      <div
        className="fixed bottom-[64px] left-2 right-2 z-50 rounded-xl overflow-hidden glass-strong border border-white/10 shadow-2xl"
        onClick={() => setExpanded(true)}
      >
        <div className="flex items-center gap-3 p-2.5">
          <img src={track.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{track.title}</p>
            <p className="text-xs text-white/55 truncate">{track.uploader}</p>
          </div>
          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            {sleepLeft !== null && (
              <span className="text-[10px] text-[var(--primary)] mr-1">{formatSleep(sleepLeft)}</span>
            )}
            <button onClick={togglePlay} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10">
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : playing ? (
                <PauseIcon size={22} />
              ) : (
                <PlayIcon size={22} className="ml-0.5" />
              )}
            </button>
          </div>
        </div>
        <div className="h-0.5 bg-white/10">
          <div
            className="h-full bg-[var(--primary)] transition-all duration-200"
            style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
          />
        </div>
      </div>
    </>
  );
}
