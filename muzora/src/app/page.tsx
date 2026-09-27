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

const MOODS = [
  { name: "Relax", color: "from-blue-500/80 to-cyan-600/80" },
  { name: "Sleep", color: "from-indigo-600/80 to-purple-700/80" },
  { name: "Energize", color: "from-orange-500/80 to-red-600/80" },
  { name: "Sad", color: "from-slate-500/80 to-zinc-700/80" },
  { name: "Focus", color: "from-emerald-500/80 to-teal-700/80" },
  { name: "Party", color: "from-pink-500/80 to-rose-600/80" },
];

const MOOD_CARDS = [
  { title: "Commute", gradient: "from-pink-500 to-rose-600" },
  { title: "Party", gradient: "from-yellow-400 to-orange-500" },
  { title: "K-Pop", gradient: "from-violet-500 to-purple-700" },
  { title: "Family", gradient: "from-cyan-400 to-blue-600" },
  { title: "1990s", gradient: "from-amber-400 to-orange-600" },
  { title: "Chill", gradient: "from-rose-400 to-pink-600" },
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
  const [greeting, setGreeting] = useState("Good Evening");
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

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreeting("Good Morning");
    else if (h < 18) setGreeting("Good Afternoon");
    else setGreeting("Good Evening");
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
      try {
        const res = await fetch(`/api/stream?id=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (data.error && !data.videoId) throw new Error(data.error || "Playback failed");
        const track: Track = {
          id,
          title: data.title || ("title" in item ? item.title : ""),
          uploader: data.uploader || ("uploaderName" in item ? item.uploaderName : (item as Track).uploader),
          thumbnail: data.thumbnail || item.thumbnail,
          duration: data.duration || item.duration,
          audioUrl: data.audioUrl,
        };
        setCurrent(track);

        if (customQueue) {
          setQueue(customQueue);
          setQueueIndex(customQueue.findIndex((t) => t.id === id));
        } else if ("url" in item) {
          const q = results.map((r) => ({
            id: extractVideoId(r.url) || r.url,
            title: r.title,
            uploader: r.uploaderName,
            thumbnail: r.thumbnail,
            duration: r.duration,
          }));
          setQueue(q.length ? q : [track]);
          setQueueIndex(q.findIndex((t) => t.id === id));
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
    <div className="min-h-screen bg-[var(--bg)] pb-40">
      <header className="sticky top-0 z-40 glass-strong border-b border-white/5">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--primary)] to-emerald-800 flex items-center justify-center">
              <MusicIcon size={16} className="text-white" />
            </div>
            <span className="font-semibold text-[15px]">Muzora</span>
          </div>
          <form onSubmit={handleSubmit} className="flex-1">
            <div className="relative">
              <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search songs, artists..."
                className="w-full bg-white/8 border border-white/10 rounded-full py-2 pl-9 pr-4 text-sm placeholder:text-white/40 focus:outline-none focus:border-[var(--primary)]/50"
              />
            </div>
          </form>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 page-enter">
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* HOME */}
        {tab === "home" && (
          <div className="pt-5 space-y-8">
            <div>
              <h1 className="text-2xl font-bold">{greeting}</h1>
              <p className="text-white/50 text-sm mt-0.5">What do you want to listen to?</p>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {MOODS.map((m) => (
                <button
                  key={m.name}
                  onClick={() => { setQuery(m.name.toLowerCase() + " music"); doSearch(m.name.toLowerCase() + " music"); }}
                  className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium bg-gradient-to-r ${m.color} border border-white/10`}
                >
                  {m.name}
                </button>
              ))}
            </div>
            <section>
              <h2 className="text-lg font-semibold mb-3">Quick picks</h2>
              {loading && results.length === 0 ? (
                <div className="flex justify-center py-12"><LoaderIcon size={28} /></div>
              ) : (
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                  {results.slice(0, 12).map((item) => {
                    const id = extractVideoId(item.url) || item.url;
                    return (
                      <button key={id} onClick={() => playTrack(item)} className="album-card flex-shrink-0 w-[140px] text-left group">
                        <div className="relative aspect-square rounded-xl overflow-hidden mb-2 bg-[var(--card)]">
                          <img src={item.thumbnail} alt="" className="w-full h-full object-cover transition-transform duration-300" loading="lazy" />
                          <div className="play-overlay absolute inset-0 bg-black/40 opacity-0 transition-opacity flex items-center justify-center">
                            <div className="w-11 h-11 rounded-full bg-[var(--primary)] flex items-center justify-center shadow-lg">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><polygon points="6 3 20 12 6 21 6 3" /></svg>
                            </div>
                          </div>
                        </div>
                        <p className="text-sm font-medium line-clamp-2 leading-snug">{item.title}</p>
                        <p className="text-xs text-white/50 mt-0.5 truncate">{item.uploaderName}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
            <section>
              <h2 className="text-lg font-semibold mb-3">Moods & moments</h2>
              <div className="grid grid-cols-2 gap-3">
                {MOOD_CARDS.map((c) => (
                  <button
                    key={c.title}
                    onClick={() => { setQuery(c.title); doSearch(c.title + " music"); }}
                    className={`relative h-24 rounded-xl overflow-hidden bg-gradient-to-br ${c.gradient} p-4 text-left shadow-lg active:scale-[0.98] transition-transform`}
                  >
                    <span className="font-semibold text-[15px] drop-shadow">{c.title}</span>
                    <div className="absolute -right-2 -bottom-2 w-16 h-16 rounded-lg bg-white/20 rotate-12" />
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* SEARCH */}
        {tab === "search" && (
          <div className="pt-5">
            <h2 className="text-lg font-semibold mb-4">{query ? `Results for “${query}”` : "Search"}</h2>
            {loading ? (
              <div className="flex flex-col items-center py-20 gap-3 text-white/50">
                <LoaderIcon size={32} /><p>Searching...</p>
              </div>
            ) : (
              <div className="space-y-1">
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
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl ${isActive ? "bg-[var(--primary)]/15" : "hover:bg-white/5"}`}
                    >
                      <button onClick={() => playTrack(item)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                        <img src={item.thumbnail} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium truncate ${isActive ? "text-[var(--primary)]" : ""}`}>{item.title}</p>
                          <p className="text-xs text-white/50 truncate">{item.uploaderName}</p>
                        </div>
                      </button>
                      <button
                        onClick={() => openAddToPlaylist(trackObj)}
                        className="p-2 text-white/40 hover:text-white"
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

        {/* LIBRARY */}
        {tab === "library" && libraryView === "main" && (
          <div className="pt-5 space-y-8">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">Your Library</h1>
              <button
                onClick={() => setShowCreatePl(true)}
                className="text-sm text-[var(--primary)] font-medium px-3 py-1.5 rounded-full glass"
              >
                + Playlist
              </button>
            </div>

            {/* Playlists */}
            <section>
              <h2 className="text-lg font-semibold mb-3">Playlists</h2>
              {playlists.length === 0 ? (
                <p className="text-white/40 text-sm">No playlists yet. Create one!</p>
              ) : (
                <div className="space-y-2">
                  {playlists.map((pl) => (
                    <button
                      key={pl.id}
                      onClick={() => openPlaylist(pl)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-left"
                    >
                      <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-[var(--primary)]/40 to-emerald-900/60 flex items-center justify-center flex-shrink-0">
                        {pl.tracks[0] ? (
                          <img src={pl.tracks[0].thumbnail} alt="" className="w-full h-full rounded-lg object-cover" />
                        ) : (
                          <MusicIcon size={22} className="text-white/50" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{pl.name}</p>
                        <p className="text-xs text-white/50">{pl.tracks.length} songs</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Liked */}
            <section>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#1ed760" stroke="#1ed760" strokeWidth="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                Liked Songs
              </h2>
              {liked.length === 0 ? (
                <p className="text-white/40 text-sm">Songs you like will appear here</p>
              ) : (
                <div className="space-y-1">
                  {liked.slice(0, 8).map((t, i) => (
                    <button
                      key={t.id}
                      onClick={() => playFromList(liked, i)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left hover:bg-white/5 ${current?.id === t.id ? "bg-[var(--primary)]/15" : ""}`}
                    >
                      <img src={t.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{t.title}</p>
                        <p className="text-xs text-white/50 truncate">{t.uploader}</p>
                      </div>
                    </button>
                  ))}
                  {liked.length > 8 && (
                    <p className="text-xs text-white/40 pt-1">+{liked.length - 8} more</p>
                  )}
                </div>
              )}
            </section>

            {/* Recently Played */}
            <section>
              <h2 className="text-lg font-semibold mb-3">Recently Played</h2>
              {history.length === 0 ? (
                <p className="text-white/40 text-sm">Your listening history will appear here</p>
              ) : (
                <div className="space-y-1">
                  {history.slice(0, 10).map((t, i) => (
                    <button
                      key={t.id + i}
                      onClick={() => playFromList(history, i)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left hover:bg-white/5 ${current?.id === t.id ? "bg-[var(--primary)]/15" : ""}`}
                    >
                      <img src={t.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{t.title}</p>
                        <p className="text-xs text-white/50 truncate">{t.uploader}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* PLAYLIST DETAIL */}
        {tab === "library" && libraryView === "playlist" && activePlaylist && (
          <div className="pt-5">
            <button
              onClick={() => { setLibraryView("main"); setActivePlaylist(null); }}
              className="text-sm text-white/50 mb-4 flex items-center gap-1"
            >
              ← Back
            </button>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-24 h-24 rounded-xl bg-gradient-to-br from-[var(--primary)]/40 to-emerald-900/60 overflow-hidden flex-shrink-0">
                {activePlaylist.tracks[0] ? (
                  <img src={activePlaylist.tracks[0].thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <MusicIcon size={32} className="text-white/40" />
                  </div>
                )}
              </div>
              <div>
                <h1 className="text-xl font-bold">{activePlaylist.name}</h1>
                <p className="text-sm text-white/50">{activePlaylist.tracks.length} songs</p>
                {activePlaylist.tracks.length > 0 && (
                  <button
                    onClick={() => playFromList(activePlaylist.tracks, 0)}
                    className="mt-2 px-4 py-1.5 rounded-full bg-[var(--primary)] text-black text-sm font-semibold"
                  >
                    Play All
                  </button>
                )}
              </div>
            </div>

            {activePlaylist.tracks.length === 0 ? (
              <p className="text-white/40 text-sm">This playlist is empty. Add songs from Search!</p>
            ) : (
              <div className="space-y-1">
                {activePlaylist.tracks.map((t, i) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <button
                      onClick={() => playFromList(activePlaylist.tracks, i)}
                      className={`flex-1 flex items-center gap-3 p-2.5 rounded-xl text-left hover:bg-white/5 ${current?.id === t.id ? "bg-[var(--primary)]/15" : ""}`}
                    >
                      <span className="text-xs text-white/30 w-5">{i + 1}</span>
                      <img src={t.thumbnail} alt="" className="w-11 h-11 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{t.title}</p>
                        <p className="text-xs text-white/50 truncate">{t.uploader}</p>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        removeFromPlaylist(activePlaylist.id, t.id);
                        const updated = getPlaylists().find((p) => p.id === activePlaylist.id);
                        if (updated) setActivePlaylist(updated);
                        refreshLibrary();
                      }}
                      className="p-2 text-white/30 hover:text-red-400"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
              className="mt-8 text-sm text-red-400/80"
            >
              Delete Playlist
            </button>
          </div>
        )}
      </main>

      {/* Create Playlist Modal */}
      {showCreatePl && (
        <div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center p-4" onClick={() => setShowCreatePl(false)}>
          <div className="w-full max-w-sm rounded-2xl glass-strong border border-white/10 p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">Create Playlist</h3>
            <input
              autoFocus
              value={newPlName}
              onChange={(e) => setNewPlName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreatePlaylist()}
              placeholder="Playlist name"
              className="w-full bg-white/8 border border-white/15 rounded-xl px-4 py-3 text-sm mb-4 focus:outline-none focus:border-[var(--primary)]/50"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreatePl(false)} className="px-4 py-2 text-sm text-white/50">Cancel</button>
              <button onClick={handleCreatePlaylist} className="px-5 py-2 rounded-full bg-[var(--primary)] text-black text-sm font-semibold">
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to Playlist Modal */}
      {showAddToPl && trackToAdd && (
        <div className="fixed inset-0 z-[110] bg-black/70 flex items-end sm:items-center justify-center" onClick={() => setShowAddToPl(false)}>
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl glass-strong border border-white/10 max-h-[70vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-white/10">
              <h3 className="font-semibold">Add to playlist</h3>
              <p className="text-xs text-white/50 mt-0.5 truncate">{trackToAdd.title}</p>
            </div>
            <div className="overflow-y-auto max-h-[50vh] p-2">
              {playlists.length === 0 ? (
                <p className="text-center text-white/40 text-sm py-8">No playlists yet</p>
              ) : (
                playlists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => handleAddToPlaylist(pl.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-left"
                  >
                    <div className="w-12 h-12 rounded-lg bg-white/10 overflow-hidden flex-shrink-0">
                      {pl.tracks[0] ? (
                        <img src={pl.tracks[0].thumbnail} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <MusicIcon size={18} className="text-white/40" />
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{pl.name}</p>
                      <p className="text-xs text-white/50">{pl.tracks.length} songs</p>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="p-3 border-t border-white/10">
              <button
                onClick={() => {
                  setShowAddToPl(false);
                  setShowCreatePl(true);
                }}
                className="w-full py-2.5 rounded-xl text-sm text-[var(--primary)] font-medium"
              >
                + Create new playlist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Queue panel */}
      {showQueue && (
        <div className="fixed inset-0 z-[90] bg-black/70" onClick={() => setShowQueue(false)}>
          <div className="absolute bottom-0 left-0 right-0 max-h-[70vh] rounded-t-2xl glass-strong border-t border-white/10 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-semibold">Queue · {queue.length} songs</h3>
              <button onClick={() => setShowQueue(false)} className="text-white/50 text-sm">Close</button>
            </div>
            <div className="overflow-y-auto max-h-[60vh] p-2">
              {queue.map((t, i) => (
                <button
                  key={t.id + i}
                  onClick={() => { setQueueIndex(i); playTrack(t, queue); setShowQueue(false); }}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left ${i === queueIndex ? "bg-[var(--primary)]/20" : "hover:bg-white/5"}`}
                >
                  <span className="text-xs text-white/40 w-5">{i + 1}</span>
                  <img src={t.thumbnail} alt="" className="w-10 h-10 rounded object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm truncate ${i === queueIndex ? "text-[var(--primary)]" : ""}`}>{t.title}</p>
                    <p className="text-xs text-white/50 truncate">{t.uploader}</p>
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

      <nav className="fixed bottom-0 left-0 right-0 z-40 glass-strong border-t border-white/8 safe-bottom">
        <div className="max-w-3xl mx-auto flex items-center justify-around h-16">
          <button onClick={() => { setTab("home"); setLibraryView("main"); }} className={`flex flex-col items-center gap-0.5 px-4 py-1 ${tab === "home" ? "text-[var(--primary)]" : "text-white/50"}`}>
            <HomeIcon size={22} /><span className="text-[10px] font-medium">Home</span>
          </button>
          <button onClick={() => { setTab("search"); if (!results.length) doSearch("trending music"); }} className={`flex flex-col items-center gap-0.5 px-4 py-1 ${tab === "search" ? "text-[var(--primary)]" : "text-white/50"}`}>
            <SearchIcon size={22} /><span className="text-[10px] font-medium">Search</span>
          </button>
          <button onClick={() => { setTab("library"); setLibraryView("main"); }} className={`flex flex-col items-center gap-0.5 px-4 py-1 ${tab === "library" ? "text-[var(--primary)]" : "text-white/50"}`}>
            <CompassIcon size={22} /><span className="text-[10px] font-medium">Library</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
