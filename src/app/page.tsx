"use client";

import { useState, useCallback, useEffect } from "react";
import {
  SearchIcon,
  MusicIcon,
  LoaderIcon,
  HomeIcon,
  CompassIcon,
} from "@/components/Icons";
import Player, { Track } from "@/components/Player";
import { extractVideoId, formatDuration } from "@/lib/piped";
import {
  getHistory,
  getLiked,
  getPlaylists,
  createPlaylist,
  deletePlaylist,
  addToPlaylist,
  removeFromPlaylist,
  Playlist,
} from "@/lib/storage";

interface SearchResult {
  url: string;
  title: string;
  thumbnail: string;
  uploaderName: string;
  duration?: number;
  views?: number;
}

const CHIPS = ["Relax", "Sleep", "Focus", "Sad", "Party", "Workout", "Chill", "Jazz"];

const QUICK_MOODS = [
  { title: "Commute", color: "#E91E63" },
  { title: "Party", color: "#FF9800" },
  { title: "K-Pop", color: "#9C27B0" },
  { title: "Focus", color: "#00BCD4" },
  { title: "1990s", color: "#FF5722" },
  { title: "Chill", color: "#E91E8C" },
];

type Tab = "home" | "search" | "library";
type RepeatMode = "off" | "one" | "all";
type LibraryView = "main" | "playlist";

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("home");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [greeting, setGreeting] = useState("Good evening");
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [history, setHistory] = useState<Track[]>([]);
  const [liked, setLiked] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [libraryView, setLibraryView] = useState<LibraryView>("main");
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);
  const [showCreatePl, setShowCreatePl] = useState(false);
  const [newPlName, setNewPlName] = useState("");
  const [showAddToPl, setShowAddToPl] = useState(false);
  const [trackToAdd, setTrackToAdd] = useState<Track | null>(null);
  const [activeChip, setActiveChip] = useState<string | null>(null);

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreeting("Good morning");
    else if (h < 18) setGreeting("Good afternoon");
    else setGreeting("Good evening");
    refreshLibrary();
  }, []);

  const refreshLibrary = () => {
    setHistory(getHistory());
    setLiked(getLiked());
    setPlaylists(getPlaylists());
  };

  useEffect(() => {
    if (tab === "library") refreshLibrary();
  }, [tab]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setTab("search");
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&filter=music_songs`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.items || []);
    } catch (e: any) {
      setError(e.message || "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const playTrack = useCallback(
    async (item: SearchResult | Track, customQueue?: Track[]) => {
      const id = "url" in item ? extractVideoId(item.url) || item.url : item.id;
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/stream?id=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (data.error && !data.videoId) throw new Error(data.error || "Playback failed");
        const itemTitle = "title" in item ? item.title : (item as Track).title;
        const itemUploader = "uploaderName" in item ? item.uploaderName : (item as Track).uploader;
        const apiTitle = data.title && data.title !== "YouTube Track" ? data.title : null;
        const track: Track = {
          id: data.videoId || id,
          title: apiTitle || itemTitle || "Unknown",
          uploader: data.uploader || itemUploader || "",
          thumbnail: data.thumbnail || item.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          duration: data.duration || item.duration,
          audioUrl: data.audioUrl || null,
        };
        setCurrent(track);

        if (customQueue) {
          setQueue(customQueue);
          setQueueIndex(Math.max(0, customQueue.findIndex((t) => t.id === id)));
        } else if ("url" in item) {
          const q = results.map((r) => ({
            id: extractVideoId(r.url) || r.url,
            title: r.title,
            uploader: r.uploaderName,
            thumbnail: r.thumbnail,
            duration: r.duration,
          }));
          setQueue(q.length ? q : [track]);
          setQueueIndex(Math.max(0, q.findIndex((t) => t.id === id)));
        }
      } catch (e: any) {
        setError(e.message || "Playback failed");
      } finally {
        setLoading(false);
      }
    },
    [results]
  );

  const getNextIndex = useCallback(
    (dir: 1 | -1) => {
      if (!queue.length) return 0;
      if (shuffle) {
        let idx = Math.floor(Math.random() * queue.length);
        if (queue.length > 1 && idx === queueIndex) idx = (idx + 1) % queue.length;
        return idx;
      }
      if (dir === 1) {
        if (queueIndex + 1 >= queue.length) return repeat === "all" ? 0 : queueIndex;
        return queueIndex + 1;
      }
      return queueIndex === 0 ? (repeat === "all" ? queue.length - 1 : 0) : queueIndex - 1;
    },
    [queue, queueIndex, shuffle, repeat]
  );

  const playNext = useCallback(() => {
    const nextIdx = getNextIndex(1);
    const next = queue[nextIdx];
    if (!next || (nextIdx === queueIndex && repeat !== "all")) return;
    setQueueIndex(nextIdx);
    fetch(`/api/stream?id=${encodeURIComponent(next.id)}`)
      .then((r) => r.json())
      .then((data) => {
        setCurrent({
          ...next,
          title: data.title || next.title,
          uploader: data.uploader || next.uploader,
          thumbnail: data.thumbnail || next.thumbnail,
          duration: data.duration || next.duration,
          audioUrl: data.audioUrl || null,
        });
      });
  }, [queue, queueIndex, getNextIndex, repeat]);

  const playPrev = useCallback(() => {
    const prevIdx = getNextIndex(-1);
    const prev = queue[prevIdx];
    if (!prev) return;
    setQueueIndex(prevIdx);
    fetch(`/api/stream?id=${encodeURIComponent(prev.id)}`)
      .then((r) => r.json())
      .then((data) => {
        setCurrent({
          ...prev,
          title: data.title || prev.title,
          uploader: data.uploader || prev.uploader,
          thumbnail: data.thumbnail || prev.thumbnail,
          duration: data.duration || prev.duration,
          audioUrl: data.audioUrl || null,
        });
      });
  }, [queue, getNextIndex]);

  useEffect(() => {
    doSearch("lofi hip hop");
  }, [doSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveChip(null);
    doSearch(query);
  };

  const playFromList = (list: Track[], index: number) => {
    const item = list[index];
    if (item) playTrack(item, list);
  };

  const handleCreatePlaylist = () => {
    if (!newPlName.trim()) return;
    createPlaylist(newPlName.trim());
    setNewPlName("");
    setShowCreatePl(false);
    refreshLibrary();
  };

  const openAddToPlaylist = (track: Track) => {
    setTrackToAdd(track);
    setShowAddToPl(true);
    refreshLibrary();
  };

  const handleAddToPlaylist = (plId: string) => {
    if (!trackToAdd) return;
    addToPlaylist(plId, trackToAdd);
    setShowAddToPl(false);
    setTrackToAdd(null);
    refreshLibrary();
  };

  const openPlaylist = (pl: Playlist) => {
    setActivePlaylist(pl);
    setLibraryView("playlist");
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] pb-44">
      {/* Header */}
      <header className="sticky top-0 z-40 glass-strong">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <span className="font-bold text-[17px] tracking-tight shrink-0 text-white">Muzora</span>
          <form onSubmit={handleSubmit} className="flex-1">
            <div className="relative">
              <SearchIcon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search songs, artists..."
                className="w-full bg-white/[0.06] border border-white/[0.06] rounded-full py-[9px] pl-10 pr-4 text-[13px] placeholder:text-[var(--text3)] focus:outline-none focus:border-white/15 focus:bg-white/[0.08] transition-colors"
              />
            </div>
          </form>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 page-enter">
        {error && (
          <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-[13px]">
            {error}
          </div>
        )}

        {/* ========== HOME ========== */}
        {tab === "home" && (
          <div className="pt-5 space-y-7">
            <div>
              <h1 className="text-[26px] font-bold tracking-tight leading-tight">{greeting}</h1>
              <p className="text-[var(--text3)] text-[13px] mt-1">What do you want to listen to?</p>
            </div>

            {/* Mood chips */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
              {CHIPS.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setActiveChip(c);
                    setQuery(c);
                    doSearch(c + " music");
                  }}
                  className={`chip flex-shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-medium bg-white/[0.07] text-white/90 ${
                    activeChip === c ? "active" : "hover:bg-white/[0.12]"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Quick picks */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[17px] font-semibold tracking-tight">Quick picks</h2>
              </div>
              {loading && results.length === 0 ? (
                <div className="flex gap-3 overflow-hidden">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="w-[130px] shrink-0">
                      <div className="skeleton aspect-square mb-2" />
                      <div className="skeleton h-3 w-full mb-1.5" />
                      <div className="skeleton h-2.5 w-2/3" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 stagger">
                  {results.slice(0, 14).map((item) => {
                    const id = extractVideoId(item.url) || item.url;
                    return (
                      <button
                        key={id}
                        onClick={() => playTrack(item)}
                        className="album-card flex-shrink-0 w-[130px] text-left group"
                      >
                        <div className="relative aspect-square rounded-[var(--radius)] overflow-hidden mb-2 bg-[var(--card)]">
                          <img
                            src={item.thumbnail}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          <div className="play-overlay absolute inset-0 bg-black/45 flex items-center justify-center">
                            <div className="w-10 h-10 rounded-full bg-[var(--primary)] flex items-center justify-center shadow-lg shadow-black/40">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="black">
                                <polygon points="7 4 20 12 7 20 7 4" />
                              </svg>
                            </div>
                          </div>
                        </div>
                        <p className="text-[13px] font-medium line-clamp-2 leading-snug text-white/95">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-[var(--text3)] mt-0.5 truncate">
                          {item.uploaderName}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Moods & moments */}
            <section>
              <h2 className="text-[17px] font-semibold tracking-tight mb-3">Moods & moments</h2>
              <div className="grid grid-cols-2 gap-2.5 stagger">
                {QUICK_MOODS.map((c) => (
                  <button
                    key={c.title}
                    onClick={() => {
                      setQuery(c.title);
                      doSearch(c.title + " music");
                    }}
                    className="relative h-[72px] rounded-[var(--radius)] overflow-hidden text-left px-4 flex items-center active:scale-[0.98] transition-transform"
                    style={{ background: `linear-gradient(135deg, ${c.color}cc, ${c.color}88)` }}
                  >
                    <span className="font-semibold text-[14px] relative z-10 drop-shadow-sm">
                      {c.title}
                    </span>
                    <div
                      className="absolute -right-3 -bottom-4 w-16 h-16 rounded-lg opacity-30 rotate-12"
                      style={{ background: "rgba(255,255,255,0.35)" }}
                    />
                  </button>
                ))}
              </div>
            </section>

            {/* Recently played preview on home */}
            {history.length > 0 && (
              <section>
                <h2 className="text-[17px] font-semibold tracking-tight mb-3">Recently played</h2>
                <div className="space-y-0.5">
                  {history.slice(0, 5).map((t, i) => (
                    <button
                      key={t.id + i}
                      onClick={() => playFromList(history, i)}
                      className={`song-row w-full flex items-center gap-3 p-2 text-left ${
                        current?.id === t.id ? "bg-[var(--primary-soft)]" : ""
                      }`}
                    >
                      <img src={t.thumbnail} alt="" className="w-11 h-11 rounded-md object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className={`text-[13px] font-medium truncate ${current?.id === t.id ? "text-[var(--primary)]" : ""}`}>
                          {t.title}
                        </p>
                        <p className="text-[11px] text-[var(--text3)] truncate">{t.uploader}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* ========== SEARCH ========== */}
        {tab === "search" && (
          <div className="pt-5">
            <h2 className="text-[17px] font-semibold tracking-tight mb-4">
              {query ? (
                <>Results for <span className="text-[var(--primary)]">“{query}”</span></>
              ) : (
                "Search"
              )}
            </h2>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-2">
                    <div className="skeleton w-12 h-12 rounded-md shrink-0" />
                    <div className="flex-1">
                      <div className="skeleton h-3 w-3/4 mb-2" />
                      <div className="skeleton h-2.5 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-[var(--text3)]">
                <SearchIcon size={36} className="mb-3 opacity-40" />
                <p className="text-[14px]">No results</p>
                <p className="text-[12px] mt-1">Try another keyword</p>
              </div>
            ) : (
              <div className="space-y-0.5 stagger">
                {results.map((item) => {
                  const id = extractVideoId(item.url) || item.url;
                  const isActive = current?.id === id;
                  const trackObj: Track = {
                    id,
                    title: item.title,
                    uploader: item.uploaderName,
                    thumbnail: item.thumbnail,
                    duration: item.duration,
                  };
                  return (
                    <div
                      key={id}
                      className={`song-row flex items-center gap-3 p-2 ${
                        isActive ? "bg-[var(--primary-soft)]" : ""
                      }`}
                    >
                      <button
                        onClick={() => playTrack(item)}
                        className="flex items-center gap-3 min-w-0 flex-1 text-left"
                      >
                        <div className="relative shrink-0">
                          <img
                            src={item.thumbnail}
                            alt=""
                            className="w-12 h-12 rounded-md object-cover"
                          />
                          {isActive && (
                            <div className="absolute inset-0 bg-black/40 rounded-md flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-[13px] font-medium truncate ${
                              isActive ? "text-[var(--primary)]" : "text-white/95"
                            }`}
                          >
                            {item.title}
                          </p>
                          <p className="text-[11px] text-[var(--text3)] truncate mt-0.5">
                            {item.uploaderName}
                            {item.duration ? ` · ${formatDuration(item.duration)}` : ""}
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={() => openAddToPlaylist(trackObj)}
                        className="p-2 text-[var(--text3)] hover:text-white shrink-0"
                        title="Add to playlist"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========== LIBRARY ========== */}
        {tab === "library" && libraryView === "main" && (
          <div className="pt-5 space-y-7 page-enter">
            <div className="flex items-center justify-between">
              <h1 className="text-[26px] font-bold tracking-tight">Library</h1>
              <button
                onClick={() => setShowCreatePl(true)}
                className="text-[13px] font-medium text-[var(--primary)] px-3 py-1.5 rounded-full bg-[var(--primary-soft)]"
              >
                + Playlist
              </button>
            </div>

            <section>
              <h2 className="text-[15px] font-semibold mb-2.5 text-white/90">Playlists</h2>
              {playlists.length === 0 ? (
                <p className="text-[13px] text-[var(--text3)]">No playlists yet</p>
              ) : (
                <div className="space-y-1">
                  {playlists.map((pl) => (
                    <button
                      key={pl.id}
                      onClick={() => openPlaylist(pl)}
                      className="song-row w-full flex items-center gap-3 p-2 text-left"
                    >
                      <div className="w-12 h-12 rounded-md bg-[var(--card)] overflow-hidden shrink-0 flex items-center justify-center">
                        {pl.tracks[0] ? (
                          <img src={pl.tracks[0].thumbnail} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <MusicIcon size={20} className="text-[var(--text3)]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium truncate">{pl.name}</p>
                        <p className="text-[11px] text-[var(--text3)]">{pl.tracks.length} songs</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-[15px] font-semibold mb-2.5 flex items-center gap-2 text-white/90">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#1ed760">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                Liked Songs
              </h2>
              {liked.length === 0 ? (
                <p className="text-[13px] text-[var(--text3)]">Songs you like appear here</p>
              ) : (
                <div className="space-y-0.5">
                  {liked.slice(0, 8).map((t, i) => (
                    <button
                      key={t.id}
                      onClick={() => playFromList(liked, i)}
                      className={`song-row w-full flex items-center gap-3 p-2 text-left ${
                        current?.id === t.id ? "bg-[var(--primary-soft)]" : ""
                      }`}
                    >
                      <img src={t.thumbnail} alt="" className="w-11 h-11 rounded-md object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium truncate">{t.title}</p>
                        <p className="text-[11px] text-[var(--text3)] truncate">{t.uploader}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-[15px] font-semibold mb-2.5 text-white/90">Recently played</h2>
              {history.length === 0 ? (
                <p className="text-[13px] text-[var(--text3)]">History will appear here</p>
              ) : (
                <div className="space-y-0.5">
                  {history.slice(0, 12).map((t, i) => (
                    <button
                      key={t.id + i}
                      onClick={() => playFromList(history, i)}
                      className={`song-row w-full flex items-center gap-3 p-2 text-left ${
                        current?.id === t.id ? "bg-[var(--primary-soft)]" : ""
                      }`}
                    >
                      <img src={t.thumbnail} alt="" className="w-11 h-11 rounded-md object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium truncate">{t.title}</p>
                        <p className="text-[11px] text-[var(--text3)] truncate">{t.uploader}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* Playlist detail */}
        {tab === "library" && libraryView === "playlist" && activePlaylist && (
          <div className="pt-5 page-enter">
            <button
              onClick={() => {
                setLibraryView("main");
                setActivePlaylist(null);
              }}
              className="text-[13px] text-[var(--text3)] mb-4 flex items-center gap-1"
            >
              ← Back
            </button>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-24 h-24 rounded-[var(--radius)] bg-[var(--card)] overflow-hidden shrink-0">
                {activePlaylist.tracks[0] ? (
                  <img src={activePlaylist.tracks[0].thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <MusicIcon size={28} className="text-[var(--text3)]" />
                  </div>
                )}
              </div>
              <div>
                <h1 className="text-[20px] font-bold tracking-tight">{activePlaylist.name}</h1>
                <p className="text-[13px] text-[var(--text3)] mt-0.5">{activePlaylist.tracks.length} songs</p>
                {activePlaylist.tracks.length > 0 && (
                  <button
                    onClick={() => playFromList(activePlaylist.tracks, 0)}
                    className="mt-2.5 px-4 py-1.5 rounded-full bg-[var(--primary)] text-black text-[13px] font-semibold"
                  >
                    Play all
                  </button>
                )}
              </div>
            </div>
            {activePlaylist.tracks.length === 0 ? (
              <p className="text-[13px] text-[var(--text3)]">Empty playlist. Add songs from Search.</p>
            ) : (
              <div className="space-y-0.5">
                {activePlaylist.tracks.map((t, i) => (
                  <div key={t.id} className="flex items-center gap-1">
                    <button
                      onClick={() => playFromList(activePlaylist.tracks, i)}
                      className={`song-row flex-1 flex items-center gap-3 p-2 text-left ${
                        current?.id === t.id ? "bg-[var(--primary-soft)]" : ""
                      }`}
                    >
                      <span className="text-[11px] text-[var(--text3)] w-5 text-center">{i + 1}</span>
                      <img src={t.thumbnail} alt="" className="w-10 h-10 rounded-md object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium truncate">{t.title}</p>
                        <p className="text-[11px] text-[var(--text3)] truncate">{t.uploader}</p>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        removeFromPlaylist(activePlaylist.id, t.id);
                        const updated = getPlaylists().find((p) => p.id === activePlaylist.id);
                        if (updated) setActivePlaylist(updated);
                        refreshLibrary();
                      }}
                      className="p-2 text-[var(--text3)] hover:text-red-400"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                if (confirm("Delete this playlist?")) {
                  deletePlaylist(activePlaylist.id);
                  setLibraryView("main");
                  setActivePlaylist(null);
                  refreshLibrary();
                }
              }}
              className="mt-8 text-[13px] text-red-400/80"
            >
              Delete playlist
            </button>
          </div>
        )}
      </main>

      {/* Create playlist modal */}
      {showCreatePl && (
        <div className="fixed inset-0 z-[110] bg-black/75 flex items-center justify-center p-4" onClick={() => setShowCreatePl(false)}>
          <div className="w-full max-w-sm rounded-2xl glass-strong p-5 scale-in" onClick={(e) => e.stopPropagation()} style={{ animation: "scaleIn 0.2s ease" }}>
            <h3 className="font-semibold text-[16px] mb-4">New playlist</h3>
            <input
              autoFocus
              value={newPlName}
              onChange={(e) => setNewPlName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreatePlaylist()}
              placeholder="Playlist name"
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-[14px] mb-4 focus:outline-none focus:border-[var(--primary)]/40"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreatePl(false)} className="px-4 py-2 text-[13px] text-[var(--text3)]">
                Cancel
              </button>
              <button onClick={handleCreatePlaylist} className="px-5 py-2 rounded-full bg-[var(--primary)] text-black text-[13px] font-semibold">
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to playlist */}
      {showAddToPl && trackToAdd && (
        <div className="fixed inset-0 z-[110] bg-black/75 flex items-end sm:items-center justify-center" onClick={() => setShowAddToPl(false)}>
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl glass-strong max-h-[70vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-white/[0.06]">
              <h3 className="font-semibold text-[15px]">Add to playlist</h3>
              <p className="text-[12px] text-[var(--text3)] mt-0.5 truncate">{trackToAdd.title}</p>
            </div>
            <div className="overflow-y-auto max-h-[45vh] p-2">
              {playlists.length === 0 ? (
                <p className="text-center text-[var(--text3)] text-[13px] py-8">No playlists yet</p>
              ) : (
                playlists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => handleAddToPlaylist(pl.id)}
                    className="song-row w-full flex items-center gap-3 p-3 text-left"
                  >
                    <div className="w-11 h-11 rounded-md bg-[var(--card)] overflow-hidden shrink-0">
                      {pl.tracks[0] ? (
                        <img src={pl.tracks[0].thumbnail} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <MusicIcon size={16} className="text-[var(--text3)]" />
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-[13px] font-medium">{pl.name}</p>
                      <p className="text-[11px] text-[var(--text3)]">{pl.tracks.length} songs</p>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="p-3 border-t border-white/[0.06]">
              <button
                onClick={() => {
                  setShowAddToPl(false);
                  setShowCreatePl(true);
                }}
                className="w-full py-2.5 rounded-xl text-[13px] text-[var(--primary)] font-medium"
              >
                + Create new playlist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Queue */}
      {showQueue && (
        <div className="fixed inset-0 z-[90] bg-black/70" onClick={() => setShowQueue(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[70vh] rounded-t-2xl glass-strong overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
              <h3 className="font-semibold text-[15px]">Queue · {queue.length}</h3>
              <button onClick={() => setShowQueue(false)} className="text-[13px] text-[var(--text3)]">
                Close
              </button>
            </div>
            <div className="overflow-y-auto max-h-[55vh] p-2">
              {queue.map((t, i) => (
                <button
                  key={t.id + i}
                  onClick={() => {
                    setQueueIndex(i);
                    playTrack(t, queue);
                    setShowQueue(false);
                  }}
                  className={`song-row w-full flex items-center gap-3 p-2.5 text-left ${
                    i === queueIndex ? "bg-[var(--primary-soft)]" : ""
                  }`}
                >
                  <span className="text-[11px] text-[var(--text3)] w-5">{i + 1}</span>
                  <img src={t.thumbnail} alt="" className="w-10 h-10 rounded-md object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className={`text-[13px] truncate ${i === queueIndex ? "text-[var(--primary)]" : ""}`}>
                      {t.title}
                    </p>
                    <p className="text-[11px] text-[var(--text3)] truncate">{t.uploader}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <Player
        track={current}
        queue={queue}
        onNext={playNext}
        onPrev={playPrev}
        expanded={expanded}
        setExpanded={setExpanded}
        shuffle={shuffle}
        setShuffle={setShuffle}
        repeat={repeat}
        setRepeat={setRepeat}
        onToggleQueue={() => setShowQueue(true)}
        onAddToPlaylist={current ? () => openAddToPlaylist(current) : undefined}
      />

      {/* Bottom nav — expanding pill like SimpMusic */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 safe-bottom pointer-events-none">
        <div className="max-w-lg mx-auto px-4 pb-3 pt-1 pointer-events-auto">
          <div className="flex items-center justify-between h-[58px] px-2 rounded-[28px] glass-strong shadow-[0_-4px_24px_rgba(0,0,0,0.35)] border border-white/[0.06]">
            {(
              [
                { id: "home" as Tab, label: "Home", Icon: HomeIcon },
                { id: "search" as Tab, label: "Search", Icon: SearchIcon },
                { id: "library" as Tab, label: "Library", Icon: CompassIcon },
              ] as const
            ).map(({ id, label, Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => {
                    setTab(id);
                    setLibraryView("main");
                    if (id === "search" && !results.length) doSearch("trending music");
                  }}
                  className={`relative flex items-center justify-center gap-2 h-[42px] rounded-full transition-all duration-300 ease-out ${
                    active
                      ? "bg-[var(--primary)] text-black px-5 min-w-[110px] shadow-lg shadow-[var(--primary)]/25"
                      : "text-[var(--text3)] px-4 min-w-[56px] hover:text-white"
                  }`}
                >
                  <Icon size={22} filled={active} />
                  <span
                    className={`text-[12px] font-semibold whitespace-nowrap overflow-hidden transition-all duration-300 ${
                      active ? "max-w-[60px] opacity-100" : "max-w-0 opacity-0 w-0"
                    }`}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}
