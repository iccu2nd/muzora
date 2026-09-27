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
  audioUrl?: string | null;
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

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
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
  const ytPlayerRef = useRef<any>(null);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [liked, setLiked] = useState(false);
  const [sleepLeft, setSleepLeft] = useState<number | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const useEmbed = !!(track && !track.audioUrl);

  // Load YouTube IFrame API once
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.YT?.Player) return;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  }, []);

  // Handle track change
  useEffect(() => {
    if (!track) return;
    setLiked(isLiked(track.id));
    setProgress(0);
    setLoading(true);
    addToHistory(track);

    if (track.audioUrl && audioRef.current) {
      // Direct audio stream
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch {}
        ytPlayerRef.current = null;
      }
      const audio = audioRef.current;
      audio.src = track.audioUrl;
      audio.load();
      audio.play()
        .then(() => { setPlaying(true); setLoading(false); })
        .catch(() => { setPlaying(false); setLoading(false); });
    } else {
      // YouTube embed fallback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      const startYt = () => {
        if (!ytContainerRef.current) {
          setLoading(false);
          return;
        }
        if (ytPlayerRef.current) {
          try {
            ytPlayerRef.current.loadVideoById(track.id);
            ytPlayerRef.current.playVideo();
          } catch {
            createYtPlayer();
          }
        } else {
          createYtPlayer();
        }
      };
      const createYtPlayer = () => {
        if (!window.YT?.Player || !ytContainerRef.current) {
          // wait a bit for API
          setTimeout(startYt, 400);
          return;
        }
        ytPlayerRef.current = new window.YT.Player(ytContainerRef.current, {
          videoId: track.id,
          height: "100%",
          width: "100%",
          playerVars: {
            autoplay: 1,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            origin: typeof window !== "undefined" ? window.location.origin : "",
          },
          events: {
            onReady: (e: any) => {
              e.target.setVolume(muted ? 0 : volume * 100);
              e.target.playVideo();
              setLoading(false);
              setPlaying(true);
              setDuration(e.target.getDuration() || track.duration || 0);
            },
            onStateChange: (e: any) => {
              if (e.data === 1) setPlaying(true); // playing
              if (e.data === 2) setPlaying(false); // paused
              if (e.data === 0) {
                // ended
                if (repeat === "one") {
                  e.target.seekTo(0);
                  e.target.playVideo();
                } else {
                  setPlaying(false);
                  onNext();
                }
              }
            },
            onError: () => {
              setLoading(false);
              setPlaying(false);
            },
          },
        });
      };
      if (window.YT?.Player) startYt();
      else window.onYouTubeIframeAPIReady = startYt;
    }
  }, [track?.id, track?.audioUrl]);

  // Audio element events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || useEmbed) return;
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
  }, [onNext, track?.duration, repeat, useEmbed]);

  // Progress poll for YT embed
  useEffect(() => {
    if (!useEmbed) {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      return;
    }
    progressIntervalRef.current = setInterval(() => {
      try {
        if (ytPlayerRef.current?.getCurrentTime) {
          setProgress(ytPlayerRef.current.getCurrentTime() || 0);
          const d = ytPlayerRef.current.getDuration();
          if (d) setDuration(d);
        }
      } catch {}
    }, 500);
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [useEmbed, track?.id]);

  // Volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
    try {
      if (ytPlayerRef.current?.setVolume) {
        ytPlayerRef.current.setVolume(muted ? 0 : volume * 100);
      }
    } catch {}
  }, [volume, muted]);

  const togglePlay = useCallback(() => {
    if (!track) return;
    if (useEmbed) {
      try {
        if (playing) ytPlayerRef.current?.pauseVideo();
        else ytPlayerRef.current?.playVideo();
      } catch {}
    } else if (audioRef.current) {
      if (playing) audioRef.current.pause();
      else audioRef.current.play().catch(() => {});
    }
  }, [playing, track, useEmbed]);

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    setProgress(t);
    if (useEmbed) {
      try { ytPlayerRef.current?.seekTo(t, true); } catch {}
    } else if (audioRef.current) {
      audioRef.current.currentTime = t;
    }
  };

  const startSleep = (mins: number) => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
    setSleepLeft(mins * 60);
    sleepIntervalRef.current = setInterval(() => {
      setSleepLeft((prev) => (prev === null || prev <= 1 ? 0 : prev - 1));
    }, 1000);
    sleepTimerRef.current = setTimeout(() => {
      if (useEmbed) {
        try { ytPlayerRef.current?.pauseVideo(); } catch {}
      } else {
        audioRef.current?.pause();
      }
      setPlaying(false);
      setSleepLeft(null);
      if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
    }, mins * 60 * 1000);
  };

  const cancelSleep = () => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
    setSleepLeft(null);
  };

  const cycleRepeat = () => {
    setRepeat(repeat === "off" ? "all" : repeat === "all" ? "one" : "off");
  };

  const handleLike = () => {
    if (!track) return;
    setLiked(toggleLike(track));
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

          {/* Hidden YT container for embed mode */}
          <div className="absolute opacity-0 pointer-events-none w-px h-px overflow-hidden">
            <div ref={ytContainerRef} />
          </div>

          <div className="relative z-10 flex flex-col h-full px-5 pt-10 pb-6">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setExpanded(false)} className="p-2.5 rounded-full glass">
                <MinimizeIcon size={20} />
              </button>
              <p className="text-xs text-white/50 uppercase tracking-widest">
                {useEmbed ? "YouTube · Embed" : "Now Playing"}
              </p>
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

            <div className="flex-1 flex items-center justify-center py-4">
              <img
                src={track.thumbnail}
                alt={track.title}
                className="w-[75vw] max-w-[320px] aspect-square rounded-2xl object-cover shadow-2xl"
              />
            </div>

            <div className="text-center mb-5">
              <h1 className="text-xl font-bold truncate px-4">{track.title}</h1>
              <p className="text-white/60 mt-1 text-sm">{track.uploader}</p>
            </div>

            <div className="space-y-1.5 mb-5">
              <input type="range" min={0} max={duration || 100} value={progress} onChange={seek} className="w-full" />
              <div className="flex justify-between text-xs text-white/50">
                <span>{formatDuration(progress)}</span>
                <span>{formatDuration(duration)}</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-8 mb-6">
              <button onClick={() => setShuffle(!shuffle)} className={shuffle ? "text-[var(--primary)]" : "text-white/50"}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
                  <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />
                  <line x1="4" y1="4" x2="9" y2="9" />
                </svg>
              </button>
              <button onClick={onPrev} className="text-white/90"><SkipBackIcon size={30} /></button>
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
              <button onClick={onNext} className="text-white/90"><SkipForwardIcon size={30} /></button>
              <button onClick={cycleRepeat} className={repeat !== "off" ? "text-[var(--primary)]" : "text-white/50"}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
              </button>
            </div>

            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <button onClick={() => setMuted(!muted)} className="text-white/50">
                  {muted || volume === 0 ? <VolumeXIcon size={18} /> : <VolumeIcon size={18} />}
                </button>
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(e) => { setVolume(parseFloat(e.target.value)); setMuted(false); }}
                  className="w-20"
                />
              </div>
              <div className="flex items-center gap-1">
                {sleepLeft !== null ? (
                  <button onClick={cancelSleep} className="text-xs text-[var(--primary)] px-2 py-1 rounded-full glass">
                    ⏱ {formatSleep(sleepLeft)}
                  </button>
                ) : (
                  <div className="flex gap-1">
                    {[15, 30, 45, 60].map((m) => (
                      <button key={m} onClick={() => startSleep(m)} className="text-[10px] text-white/50 hover:text-white px-1.5 py-1 rounded glass">
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
      {/* Hidden YT for mini mode too */}
      <div className="fixed opacity-0 pointer-events-none w-px h-px overflow-hidden bottom-0">
        <div ref={ytContainerRef} />
      </div>
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
