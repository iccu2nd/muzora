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

function parseSynced(synced: string | null): { t: number; text: string }[] {
  if (!synced) return [];
  const lines: { t: number; text: string }[] = [];
  for (const line of synced.split("\n")) {
    const m = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
    if (m) {
      const t = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
      const text = m[3].trim();
      if (text) lines.push({ t, text });
    }
  }
  return lines;
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
  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const lyricsScrollRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [liked, setLiked] = useState(false);
  const [sleepLeft, setSleepLeft] = useState<number | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsPlain, setLyricsPlain] = useState<string | null>(null);
  const [lyricsSynced, setLyricsSynced] = useState<{ t: number; text: string }[]>([]);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const useEmbed = !!(track && !track.audioUrl);

  // Browser back closes full player instead of leaving site
  useEffect(() => {
    if (!expanded) return;
    const state = { muzoraPlayer: true };
    window.history.pushState(state, "");
    const onPop = () => {
      setExpanded(false);
      setShowLyrics(false);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, [expanded, setExpanded]);

  // Load YT API
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.YT?.Player) return;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  }, []);

  // Fetch lyrics when track changes
  useEffect(() => {
    if (!track) return;
    setLyricsPlain(null);
    setLyricsSynced([]);
    setLyricsLoading(true);
    const title = track.title && track.title !== "YouTube Track" ? track.title : "";
    const artist = track.uploader || "";
    if (!title) {
      setLyricsLoading(false);
      return;
    }
    fetch(
      `/api/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`
    )
      .then((r) => r.json())
      .then((data) => {
        setLyricsPlain(data.lyrics || null);
        setLyricsSynced(parseSynced(data.synced || null));
      })
      .catch(() => {
        setLyricsPlain(null);
        setLyricsSynced([]);
      })
      .finally(() => setLyricsLoading(false));
  }, [track?.id, track?.title, track?.uploader]);

  // Track change → audio / embed
  useEffect(() => {
    if (!track) return;
    setLiked(isLiked(track.id));
    setProgress(0);
    setLoading(true);
    addToHistory(track);
    setDuration(track.duration || 0);

    const destroyYt = () => {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.stopVideo?.();
          ytPlayerRef.current.destroy?.();
        } catch {}
        ytPlayerRef.current = null;
      }
      if (ytHostRef.current) ytHostRef.current.innerHTML = "";
    };

    if (track.audioUrl && audioRef.current) {
      destroyYt();
      const audio = audioRef.current;
      audio.src = track.audioUrl;
      audio.load();
      audio
        .play()
        .then(() => {
          setPlaying(true);
          setLoading(false);
        })
        .catch(() => {
          setPlaying(false);
          setLoading(false);
        });
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }

    const mountPlayer = () => {
      if (!window.YT?.Player || !ytHostRef.current) {
        setTimeout(mountPlayer, 300);
        return;
      }
      destroyYt();
      const holder = document.createElement("div");
      ytHostRef.current.appendChild(holder);
      ytPlayerRef.current = new window.YT.Player(holder, {
        videoId: track.id,
        width: "1",
        height: "1",
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
        },
        events: {
          onReady: (e: any) => {
            try {
              e.target.setVolume(muted ? 0 : Math.round(volume * 100));
              e.target.playVideo();
              const d = e.target.getDuration();
              if (d) setDuration(d);
            } catch {}
            setLoading(false);
            setPlaying(true);
          },
          onStateChange: (e: any) => {
            if (e.data === 1) setPlaying(true);
            if (e.data === 2) setPlaying(false);
            if (e.data === 0) {
              if (repeat === "one") {
                try {
                  e.target.seekTo(0);
                  e.target.playVideo();
                } catch {}
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

    if (window.YT?.Player) mountPlayer();
    else window.onYouTubeIframeAPIReady = mountPlayer;
  }, [track?.id, track?.audioUrl]);

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

  useEffect(() => {
    if (!useEmbed) {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      return;
    }
    progressIntervalRef.current = setInterval(() => {
      try {
        if (ytPlayerRef.current?.getCurrentTime) {
          setProgress(ytPlayerRef.current.getCurrentTime() || 0);
          const d = ytPlayerRef.current.getDuration?.();
          if (d && d > 0) setDuration(d);
        }
      } catch {}
    }, 400);
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [useEmbed, track?.id]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
    try {
      ytPlayerRef.current?.setVolume?.(muted ? 0 : Math.round(volume * 100));
    } catch {}
  }, [volume, muted]);

  // Auto-scroll synced lyrics
  useEffect(() => {
    if (!showLyrics || !lyricsSynced.length || !lyricsScrollRef.current) return;
    let active = 0;
    for (let i = 0; i < lyricsSynced.length; i++) {
      if (lyricsSynced[i].t <= progress + 0.15) active = i;
      else break;
    }
    const el = lyricsScrollRef.current.querySelector(`[data-line="${active}"]`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [progress, showLyrics, lyricsSynced]);

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
      try {
        ytPlayerRef.current?.seekTo(t, true);
      } catch {}
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
        try {
          ytPlayerRef.current?.pauseVideo();
        } catch {}
      } else audioRef.current?.pause();
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

  const closePlayer = () => {
    setExpanded(false);
    setShowLyrics(false);
    // If we pushed history for player, go back one without leaving site
    if (window.history.state?.muzoraPlayer) {
      window.history.back();
    }
  };

  if (!track) return null;

  const formatSleep = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const displayTitle =
    track.title && track.title !== "YouTube Track" ? track.title : track.title || "Unknown";

  const mediaHosts = (
    <>
      <audio ref={audioRef} preload="auto" className="hidden" />
      <div
        ref={ytHostRef}
        aria-hidden
        style={{
          position: "fixed",
          left: "-9999px",
          top: 0,
          width: 1,
          height: 1,
          overflow: "hidden",
          opacity: 0,
          pointerEvents: "none",
          zIndex: -1,
        }}
      />
    </>
  );

  // Active synced line index
  let activeLine = 0;
  if (lyricsSynced.length) {
    for (let i = 0; i < lyricsSynced.length; i++) {
      if (lyricsSynced[i].t <= progress + 0.15) activeLine = i;
      else break;
    }
  }

  if (expanded) {
    return (
      <>
        {mediaHosts}
        <div className="fixed inset-0 z-[100] flex flex-col bg-black">
          <div
            className="absolute inset-0 scale-125"
            style={{
              backgroundImage: `url(${track.thumbnail})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(48px) brightness(0.28)",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/92" />

          <div className="relative z-10 flex flex-col h-full px-5 pt-10 pb-5">
            {/* Top bar */}
            <div className="flex items-center justify-between mb-2">
              <button onClick={closePlayer} className="p-2.5 rounded-full glass" aria-label="Close">
                <MinimizeIcon size={20} />
              </button>
              <p className="text-[11px] text-white/40 uppercase tracking-[0.2em]">
                {showLyrics ? "Lyrics" : "Now Playing"}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowLyrics((v) => !v)}
                  className={`p-2.5 rounded-full glass text-[12px] font-semibold ${
                    showLyrics ? "text-[var(--primary)]" : "text-white/70"
                  }`}
                  title="Lyrics"
                >
                  🎤
                </button>
                {onAddToPlaylist && (
                  <button onClick={onAddToPlaylist} className="p-2.5 rounded-full glass">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                )}
                <button onClick={handleLike} className="p-2.5 rounded-full glass">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill={liked ? "#1ed760" : "none"}
                    stroke={liked ? "#1ed760" : "currentColor"}
                    strokeWidth="2"
                  >
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Main content: cover OR lyrics */}
            {showLyrics ? (
              <div
                ref={lyricsScrollRef}
                className="flex-1 overflow-y-auto no-scrollbar py-6 px-2"
              >
                {lyricsLoading ? (
                  <div className="flex justify-center py-16 text-white/40 text-sm">Loading lyrics...</div>
                ) : lyricsSynced.length > 0 ? (
                  <div className="space-y-5 pb-20">
                    {lyricsSynced.map((line, i) => (
                      <p
                        key={i}
                        data-line={i}
                        className={`text-center text-[18px] leading-relaxed transition-all duration-300 ${
                          i === activeLine
                            ? "text-white font-semibold scale-105"
                            : i < activeLine
                            ? "text-white/35"
                            : "text-white/50"
                        }`}
                      >
                        {line.text}
                      </p>
                    ))}
                  </div>
                ) : lyricsPlain ? (
                  <div className="whitespace-pre-wrap text-center text-[16px] leading-8 text-white/80 pb-16">
                    {lyricsPlain}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-white/40 text-sm gap-2">
                    <span>🎤</span>
                    <p>Lyrics not found</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex-1 flex items-center justify-center py-4">
                  <img
                    src={track.thumbnail}
                    alt={displayTitle}
                    className="w-[70vw] max-w-[280px] aspect-square rounded-2xl object-cover shadow-2xl"
                  />
                </div>
                <div className="text-center mb-4 px-2">
                  <h1 className="text-[20px] font-bold truncate">{displayTitle}</h1>
                  <p className="text-white/55 mt-1 text-[14px] truncate">{track.uploader || ""}</p>
                </div>
              </>
            )}

            {/* Progress + controls (always visible) */}
            <div className="space-y-1.5 mb-4">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={Math.min(progress, duration || 100)}
                onChange={seek}
                className="w-full"
              />
              <div className="flex justify-between text-[11px] text-white/45">
                <span>{formatDuration(progress)}</span>
                <span>{formatDuration(duration)}</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-8 mb-4">
              <button
                onClick={() => setShuffle(!shuffle)}
                className={shuffle ? "text-[var(--primary)]" : "text-white/45"}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="16 3 21 3 21 8" />
                  <line x1="4" y1="20" x2="21" y2="3" />
                  <polyline points="21 16 21 21 16 21" />
                  <line x1="15" y1="15" x2="21" y2="21" />
                  <line x1="4" y1="4" x2="9" y2="9" />
                </svg>
              </button>
              <button onClick={onPrev} className="text-white/90">
                <SkipBackIcon size={28} />
              </button>
              <button
                onClick={togglePlay}
                className="w-[60px] h-[60px] rounded-full bg-white text-black flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                disabled={loading}
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : playing ? (
                  <PauseIcon size={28} />
                ) : (
                  <PlayIcon size={28} className="ml-0.5" />
                )}
              </button>
              <button onClick={onNext} className="text-white/90">
                <SkipForwardIcon size={28} />
              </button>
              <button
                onClick={cycleRepeat}
                className={repeat !== "off" ? "text-[var(--primary)]" : "text-white/45"}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 1l4 4-4 4" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <path d="M7 23l-4-4 4-4" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
              </button>
            </div>

            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <button onClick={() => setMuted(!muted)} className="text-white/45">
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
                  className="w-16"
                />
              </div>
              <div className="flex items-center gap-1">
                {sleepLeft !== null ? (
                  <button
                    onClick={cancelSleep}
                    className="text-[11px] text-[var(--primary)] px-2 py-1 rounded-full glass"
                  >
                    ⏱ {formatSleep(sleepLeft)}
                  </button>
                ) : (
                  <div className="flex gap-1">
                    {[15, 30, 45, 60].map((m) => (
                      <button
                        key={m}
                        onClick={() => startSleep(m)}
                        className="text-[10px] text-white/40 hover:text-white px-1.5 py-1 rounded glass"
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {onToggleQueue && (
                <button onClick={onToggleQueue} className="text-white/45 p-1">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {mediaHosts}
      <div
        className="fixed bottom-[78px] left-2 right-2 z-50 rounded-xl overflow-hidden glass-strong shadow-2xl"
        onClick={() => setExpanded(true)}
      >
        <div className="flex items-center gap-3 p-2.5">
          <img src={track.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium truncate">{displayTitle}</p>
            <p className="text-[11px] text-white/50 truncate">{track.uploader}</p>
          </div>
          <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
            {sleepLeft !== null && (
              <span className="text-[10px] text-[var(--primary)] mr-1">{formatSleep(sleepLeft)}</span>
            )}
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10"
            >
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
        <div className="h-[2px] bg-white/10">
          <div
            className="h-full bg-[var(--primary)] transition-all duration-200"
            style={{ width: `${duration ? Math.min(100, (progress / duration) * 100) : 0}%` }}
          />
        </div>
      </div>
    </>
  );
}
