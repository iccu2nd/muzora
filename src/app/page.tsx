"use client";

import { useState, useCallback, useEffect } from "react";
import {
  SearchIcon,
  MusicIcon,
  HomeIcon,
  LibraryIcon,
  LoaderIcon,
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

const MOOD_CHIPS = [
  { id: "all", label: "Semua" },
  { id: "relax", label: "Santai", q: "chill relax music" },
  { id: "sleep", label: "Tidur", q: "sleep music" },
  { id: "energy", label: "Energik", q: "energetic workout music" },
  { id: "sad", label: "Sedih", q: "sad songs" },
  { id: "romance", label: "Romantis", q: "romantic love songs" },
];

const CATEGORIES = [
  { title: "Bepergian", color: "linear-gradient(135deg,#1de9b6,#00bcd4)", q: "travel music" },
  { title: "Fokus", color: "linear-gradient(135deg,#7c4dff,#536dfe)", q: "focus study music" },
  { title: "Gaming", color: "linear-gradient(135deg,#76ff03,#00e676)", q: "gaming music" },
  { title: "Merasa senang", color: "linear-gradient(135deg,#ff7043,#ff5252)", q: "happy upbeat music" },
  { title: "Olah Raga", color: "linear-gradient(135deg,#c6ff00,#76ff03)", q: "workout music" },
  { title: "Pesta", color: "linear-gradient(135deg,#ff4081,#f50057)", q: "party music" },
  { title: "Romantis", color: "linear-gradient(135deg,#7c4dff,#e040fb)", q: "romantic songs" },
  { title: "Santai", color: "linear-gradient(135deg,#e040fb,#ff4081)", q: "chill music" },
  { title: "Sedih", color: "linear-gradient(135deg,#ff80ab,#f48fb1)", q: "sad songs" },
  { title: "Semangat!", color: "linear-gradient(135deg,#b2ff59,#69f0ae)", q: "motivational music" },
  { title: "Tidur", color: "linear-gradient(135deg,#69f0ae,#00e5ff)", q: "sleep music" },
];

type Tab = "home" | "search" | "library";
type RepeatMode = "off" | "one" | "all";
type LibraryView = "main" | "playlist";

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("home");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [homeResults, setHomeResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [greeting, setGreeting] = useState("Selamat malam");
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
  const [mood, setMood] = useState("all");
  const [libTab, setLibTab] = useState(0);

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 11) setGreeting("Selamat pagi");
    else if (h < 15) setGreeting("Selamat siang");
    else if (h < 18) setGreeting("Selamat sore");
    else setGreeting("Selamat malam");
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

  const doSearch = useCallback(async (q: string, forHome = false) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    if (!forHome) setTab("search");
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&filter=music_songs`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const items = data.items || [];
      if (forHome) setHomeResults(items);
      else setResults(items);
    } catch (e: any) {
      setError(e.message || "Gagal mencari");
      if (!forHome) setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    doSearch("trending indonesia music", true);
  }, [doSearch]);

  const playTrack = useCallback(
    async (item: SearchResult | Track, customQueue?: Track[]) => {
      const id = "url" in item ? extractVideoId(item.url) || item.url : item.id;
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/stream?id=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (data.error && !data.videoId) throw new Error(data.error || "Gagal memutar");
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
          const source = tab === "home" ? homeResults : results;
          const q = source.map((r) => ({
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
        setError(e.message || "Gagal memutar");
      } finally {
        setLoading(false);
      }
    },
    [results, homeResults, tab]
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
          title: data.title && data.title !== "YouTube Track" ? data.title : next.title,
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
          title: data.title && data.title !== "YouTube Track" ? data.title : prev.title,
          uploader: data.uploader || prev.uploader,
          thumbnail: data.thumbnail || prev.thumbnail,
          duration: data.duration || prev.duration,
          audioUrl: data.audioUrl || null,
        });
      });
  }, [queue, getNextIndex]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query);
  };

  const playFromList = (list: Track[], index: number) => {
    if (list[index]) playTrack(list[index], list);
  };

  const openAddToPlaylist = (track: Track) => {
    setTrackToAdd(track);
    setShowAddToPl(true);
    refreshLibrary();
  };

  return (
    <div className="min-h-screen bg-black pb-36">
      {/* ========== HOME ========== */}
      {tab === "home" && (
        <>
          <header className="sticky top-0 z-40 bg-black/90 backdrop-blur-md px-4 pt-3 pb-2">
            <div className="max-w-lg mx-auto">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-[22px] font-bold tracking-tight leading-none">Muzora</h1>
                  <p className="text-[13px] text-[#aaa] mt-1">{greeting}</p>
                </div>
                <div className="flex items-center gap-1 text-[#ccc]">
                  <button className="p-2 opacity-70" aria-label="Notifikasi">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                    </svg>
                  </button>
                  <button className="p-2 opacity-70" aria-label="Riwayat">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                  </button>
                  <button className="p-2 opacity-70" aria-label="Pengaturan">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Mood chips */}
              <div className="flex gap-2 overflow-x-auto no-scrollbar mt-3 -mx-1 px-1 pb-1">
                {MOOD_CHIPS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setMood(c.id);
                      if (c.id === "all") doSearch("trending indonesia music", true);
                      else if (c.q) doSearch(c.q, true);
                    }}
                    className={`chip ${mood === c.id ? "chip-on" : "chip-off"}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </header>

          <main className="max-w-lg mx-auto px-4 page-enter">
            {error && (
              <div className="mt-3 p-3 rounded-xl bg-red-500/10 text-red-300 text-[13px]">{error}</div>
            )}

            <p className="text-[14px] text-[#aaa] mt-4">Selamat datang kembali,</p>

            <section className="mt-5">
              <h2 className="text-[20px] font-bold tracking-tight mb-3">Pilihan cepat</h2>
              {loading && homeResults.length === 0 ? (
                <div className="flex gap-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="w-[48%] shrink-0">
                      <div className="skeleton aspect-square mb-2" />
                      <div className="skeleton h-3 w-full mb-1" />
                      <div className="skeleton h-2.5 w-2/3" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {homeResults.slice(0, 4).map((item) => {
                    const id = extractVideoId(item.url) || item.url;
                    return (
                      <button
                        key={id}
                        onClick={() => playTrack(item)}
                        className="album-card text-left"
                      >
                        <div className="aspect-square rounded-xl overflow-hidden bg-[#1a1a1a] mb-2">
                          <img src={item.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
                        </div>
                        <p className="text-[13px] font-semibold line-clamp-2 leading-snug">{item.title}</p>
                        <p className="text-[11px] text-[#8a8a8a] mt-0.5 truncate">{item.uploaderName}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="mt-7">
              <h2 className="text-[20px] font-bold tracking-tight mb-3">Playlist trending</h2>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                {homeResults.slice(4, 12).map((item) => {
                  const id = extractVideoId(item.url) || item.url;
                  return (
                    <button
                      key={id}
                      onClick={() => playTrack(item)}
                      className="album-card flex-shrink-0 w-[120px] text-left"
                    >
                      <div className="aspect-square rounded-xl overflow-hidden bg-[#1a1a1a] mb-2">
                        <img src={item.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
                      </div>
                      <p className="text-[12px] font-medium line-clamp-2 leading-snug">{item.title}</p>
                      <p className="text-[11px] text-[#8a8a8a] mt-0.5 truncate">{item.uploaderName}</p>
                    </button>
                  );
                })}
              </div>
            </section>

            {history.length > 0 && (
              <section className="mt-7 mb-4">
                <h2 className="text-[20px] font-bold tracking-tight mb-3">Baru diputar</h2>
                <div className="space-y-1">
                  {history.slice(0, 6).map((t, i) => (
                    <button
                      key={t.id + i}
                      onClick={() => playFromList(history, i)}
                      className="w-full flex items-center gap-3 p-1.5 rounded-lg text-left active:bg-white/5"
                    >
                      <img src={t.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className={`text-[13px] font-medium truncate ${current?.id === t.id ? "text-[var(--accent)]" : ""}`}>
                          {t.title}
                        </p>
                        <p className="text-[11px] text-[#8a8a8a] truncate">{t.uploader}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </main>
        </>
      )}

      {/* ========== SEARCH ========== */}
      {tab === "search" && (
        <main className="max-w-lg mx-auto px-4 pt-4 page-enter">
          <form onSubmit={handleSubmit} className="mb-6">
            <div className="relative">
              <SearchIcon size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#888]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for artis..."
                className="w-full bg-[#1c1c1c] rounded-full py-3 pl-11 pr-4 text-[14px] placeholder:text-[#777] focus:outline-none focus:ring-1 focus:ring-white/15"
              />
            </div>
          </form>

          {!query && results.length === 0 && !loading ? (
            <>
              <div className="text-center mb-5">
                <h2 className="text-[18px] font-bold">Semua yang anda butuhkan</h2>
                <p className="text-[13px] text-[#888] mt-1">
                  Cari untuk lagu, artis, album, daftar putar, dan lainnya
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.title}
                    onClick={() => {
                      setQuery(c.title);
                      doSearch(c.q);
                    }}
                    className="relative h-[88px] rounded-xl overflow-hidden text-left px-3.5 pt-3 active:scale-[0.98] transition-transform"
                    style={{ background: c.color }}
                  >
                    <span className="font-bold text-[15px] text-white drop-shadow">{c.title}</span>
                    <div className="absolute right-2 bottom-2 w-10 h-10 rounded-md bg-black/20 rotate-12" />
                  </button>
                ))}
              </div>
            </>
          ) : loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-3 p-2">
                  <div className="skeleton w-12 h-12 rounded-md" />
                  <div className="flex-1">
                    <div className="skeleton h-3 w-3/4 mb-2" />
                    <div className="skeleton h-2.5 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <h2 className="text-[16px] font-semibold mb-3">
                Hasil untuk <span className="text-[var(--accent)]">&quot;{query}&quot;</span>
              </h2>
              <div className="space-y-0.5">
                {results.map((item) => {
                  const id = extractVideoId(item.url) || item.url;
                  const active = current?.id === id;
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <button
                        onClick={() => playTrack(item)}
                        className={`flex-1 flex items-center gap-3 p-2 rounded-lg text-left ${active ? "bg-[var(--accent-soft)]" : "active:bg-white/5"}`}
                      >
                        <img src={item.thumbnail} alt="" className="w-12 h-12 rounded-md object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className={`text-[13px] font-medium truncate ${active ? "text-[var(--accent)]" : ""}`}>
                            {item.title}
                          </p>
                          <p className="text-[11px] text-[#8a8a8a] truncate">
                            {item.uploaderName}
                            {item.duration ? ` · ${formatDuration(item.duration)}` : ""}
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={() =>
                          openAddToPlaylist({
                            id,
                            title: item.title,
                            uploader: item.uploaderName,
                            thumbnail: item.thumbnail,
                            duration: item.duration,
                          })
                        }
                        className="p-2 text-[#777]"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </main>
      )}

      {/* ========== LIBRARY / KOLEKSI ========== */}
      {tab === "library" && libraryView === "main" && (
        <main className="max-w-lg mx-auto px-4 pt-4 page-enter">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-[#ff9800] flex items-center justify-center text-[12px] font-bold text-black">
              M
            </div>
            <h1 className="text-[22px] font-bold">Koleksi</h1>
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar mb-5">
            {["Daftar Playlist Anda", "Daftar Putar Lokal", "Daftar Favorit"].map((label, i) => (
              <button
                key={label}
                onClick={() => setLibTab(i)}
                className={`chip ${libTab === i ? "chip-on" : "chip-off"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {libTab === 0 && (
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setShowCreatePl(true)}
                className="aspect-square rounded-xl bg-gradient-to-br from-[#cfd8dc] to-[#90a4ae] flex flex-col items-center justify-center text-black/70"
              >
                <span className="text-[36px] leading-none font-light">+</span>
                <span className="text-[12px] mt-1 font-medium">Membuat</span>
              </button>
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => {
                    setActivePlaylist(pl);
                    setLibraryView("playlist");
                  }}
                  className="text-left"
                >
                  <div className="aspect-square rounded-xl overflow-hidden bg-[#1a1a1a] mb-1.5">
                    {pl.tracks[0] ? (
                      <img src={pl.tracks[0].thumbnail} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <MusicIcon size={24} className="text-[#555]" />
                      </div>
                    )}
                  </div>
                  <p className="text-[12px] font-medium truncate">{pl.name}</p>
                  <p className="text-[11px] text-[#888]">Kamu</p>
                </button>
              ))}
            </div>
          )}

          {libTab === 1 && (
            <div className="space-y-1">
              {history.length === 0 ? (
                <p className="text-[13px] text-[#888] py-8 text-center">Belum ada riwayat</p>
              ) : (
                history.map((t, i) => (
                  <button
                    key={t.id + i}
                    onClick={() => playFromList(history, i)}
                    className="w-full flex items-center gap-3 p-2 text-left rounded-lg active:bg-white/5"
                  >
                    <img src={t.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate">{t.title}</p>
                      <p className="text-[11px] text-[#888] truncate">{t.uploader}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {libTab === 2 && (
            <div className="space-y-1">
              {liked.length === 0 ? (
                <p className="text-[13px] text-[#888] py-8 text-center">Belum ada favorit</p>
              ) : (
                liked.map((t, i) => (
                  <button
                    key={t.id}
                    onClick={() => playFromList(liked, i)}
                    className="w-full flex items-center gap-3 p-2 text-left rounded-lg active:bg-white/5"
                  >
                    <img src={t.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate">{t.title}</p>
                      <p className="text-[11px] text-[#888] truncate">{t.uploader}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </main>
      )}

      {tab === "library" && libraryView === "playlist" && activePlaylist && (
        <main className="max-w-lg mx-auto px-4 pt-4 page-enter">
          <button
            onClick={() => {
              setLibraryView("main");
              setActivePlaylist(null);
            }}
            className="text-[13px] text-[#aaa] mb-4"
          >
            ← Kembali
          </button>
          <div className="flex gap-4 mb-5">
            <div className="w-24 h-24 rounded-xl overflow-hidden bg-[#1a1a1a] shrink-0">
              {activePlaylist.tracks[0] ? (
                <img src={activePlaylist.tracks[0].thumbnail} alt="" className="w-full h-full object-cover" />
              ) : null}
            </div>
            <div>
              <h1 className="text-[18px] font-bold">{activePlaylist.name}</h1>
              <p className="text-[12px] text-[#888] mt-1">{activePlaylist.tracks.length} lagu</p>
              {activePlaylist.tracks.length > 0 && (
                <button
                  onClick={() => playFromList(activePlaylist.tracks, 0)}
                  className="mt-2 px-4 py-1.5 rounded-full bg-[var(--accent)] text-black text-[13px] font-semibold"
                >
                  Putar semua
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1">
            {activePlaylist.tracks.map((t, i) => (
              <div key={t.id} className="flex items-center gap-1">
                <button
                  onClick={() => playFromList(activePlaylist.tracks, i)}
                  className="flex-1 flex items-center gap-3 p-2 text-left"
                >
                  <span className="text-[11px] text-[#666] w-4">{i + 1}</span>
                  <img src={t.thumbnail} alt="" className="w-10 h-10 rounded object-cover" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium truncate">{t.title}</p>
                    <p className="text-[11px] text-[#888] truncate">{t.uploader}</p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    removeFromPlaylist(activePlaylist.id, t.id);
                    const u = getPlaylists().find((p) => p.id === activePlaylist.id);
                    if (u) setActivePlaylist(u);
                    refreshLibrary();
                  }}
                  className="p-2 text-[#666]"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              if (confirm("Hapus playlist?")) {
                deletePlaylist(activePlaylist.id);
                setLibraryView("main");
                setActivePlaylist(null);
                refreshLibrary();
              }
            }}
            className="mt-6 text-[13px] text-red-400"
          >
            Hapus playlist
          </button>
        </main>
      )}

      {/* Modals */}
      {showCreatePl && (
        <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4" onClick={() => setShowCreatePl(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-[#1a1a1a] p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-[16px] mb-4">Playlist baru</h3>
            <input
              autoFocus
              value={newPlName}
              onChange={(e) => setNewPlName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newPlName.trim()) {
                  createPlaylist(newPlName.trim());
                  setNewPlName("");
                  setShowCreatePl(false);
                  refreshLibrary();
                }
              }}
              placeholder="Nama playlist"
              className="w-full bg-[#2a2a2a] rounded-xl px-4 py-3 text-[14px] mb-4 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreatePl(false)} className="px-4 py-2 text-[13px] text-[#888]">
                Batal
              </button>
              <button
                onClick={() => {
                  if (!newPlName.trim()) return;
                  createPlaylist(newPlName.trim());
                  setNewPlName("");
                  setShowCreatePl(false);
                  refreshLibrary();
                }}
                className="px-5 py-2 rounded-full bg-[var(--accent)] text-black text-[13px] font-semibold"
              >
                Buat
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddToPl && trackToAdd && (
        <div className="fixed inset-0 z-[110] bg-black/80 flex items-end justify-center" onClick={() => setShowAddToPl(false)}>
          <div className="w-full max-w-lg rounded-t-2xl bg-[#1a1a1a] max-h-[70vh]" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-white/5">
              <h3 className="font-semibold">Tambah ke playlist</h3>
              <p className="text-[12px] text-[#888] truncate">{trackToAdd.title}</p>
            </div>
            <div className="overflow-y-auto max-h-[45vh] p-2">
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => {
                    addToPlaylist(pl.id, trackToAdd);
                    setShowAddToPl(false);
                    setTrackToAdd(null);
                    refreshLibrary();
                  }}
                  className="w-full flex items-center gap-3 p-3 text-left rounded-lg active:bg-white/5"
                >
                  <div className="w-11 h-11 rounded-md bg-[#2a2a2a] overflow-hidden">
                    {pl.tracks[0] && <img src={pl.tracks[0].thumbnail} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div>
                    <p className="text-[13px] font-medium">{pl.name}</p>
                    <p className="text-[11px] text-[#888]">{pl.tracks.length} lagu</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showQueue && (
        <div className="fixed inset-0 z-[90] bg-black/70" onClick={() => setShowQueue(false)}>
          <div className="absolute bottom-0 left-0 right-0 max-h-[70vh] rounded-t-2xl bg-[#1a1a1a]" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-white/5 flex justify-between">
              <h3 className="font-semibold">Antrian · {queue.length}</h3>
              <button onClick={() => setShowQueue(false)} className="text-[13px] text-[#888]">
                Tutup
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
                  className={`w-full flex items-center gap-3 p-2.5 text-left rounded-lg ${i === queueIndex ? "bg-[var(--accent-soft)]" : ""}`}
                >
                  <img src={t.thumbnail} alt="" className="w-10 h-10 rounded object-cover" />
                  <div className="min-w-0">
                    <p className={`text-[13px] truncate ${i === queueIndex ? "text-[var(--accent)]" : ""}`}>{t.title}</p>
                    <p className="text-[11px] text-[#888] truncate">{t.uploader}</p>
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

      {/* Bottom nav — SimpMusic style floating + expanding */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 safe-bottom pointer-events-none">
        <div className="max-w-lg mx-auto px-3 pb-2.5 pt-1 pointer-events-auto">
          <div className="flex items-center h-[56px] px-1.5 rounded-[28px] bg-[#1c1c1e]/95 backdrop-blur-xl border border-white/[0.06] shadow-2xl">
            {(
              [
                { id: "home" as Tab, label: "Beranda", Icon: HomeIcon },
                { id: "library" as Tab, label: "Koleksi", Icon: LibraryIcon },
                { id: "search" as Tab, label: "Cari", Icon: SearchIcon },
              ] as const
            ).map(({ id, label, Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => {
                    setTab(id);
                    setLibraryView("main");
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 h-[42px] rounded-full mx-0.5 transition-all duration-300 ${
                    active
                      ? "bg-[#2c2c2e] text-[var(--accent)] px-3"
                      : "text-[#888]"
                  }`}
                >
                  <Icon size={22} filled={active} />
                  {active && (
                    <span className="text-[12px] font-semibold">{label}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}
