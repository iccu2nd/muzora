import { Track } from "@/components/Player";

const HISTORY_KEY = "muzora_history";
const LIKED_KEY = "muzora_liked";
const PLAYLISTS_KEY = "muzora_playlists";

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
}

export function getHistory(): Track[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addToHistory(track: Track) {
  if (typeof window === "undefined") return;
  const hist = getHistory().filter((t) => t.id !== track.id);
  hist.unshift({
    id: track.id,
    title: track.title,
    uploader: track.uploader,
    thumbnail: track.thumbnail,
    duration: track.duration,
  });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(0, 50)));
}

export function getLiked(): Track[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LIKED_KEY) || "[]");
  } catch {
    return [];
  }
}

export function toggleLike(track: Track): boolean {
  if (typeof window === "undefined") return false;
  const liked = getLiked();
  const exists = liked.some((t) => t.id === track.id);
  let next: Track[];
  if (exists) {
    next = liked.filter((t) => t.id !== track.id);
  } else {
    next = [
      {
        id: track.id,
        title: track.title,
        uploader: track.uploader,
        thumbnail: track.thumbnail,
        duration: track.duration,
      },
      ...liked,
    ].slice(0, 100);
  }
  localStorage.setItem(LIKED_KEY, JSON.stringify(next));
  return !exists;
}

export function isLiked(id: string): boolean {
  return getLiked().some((t) => t.id === id);
}

// ========== PLAYLISTS ==========
export function getPlaylists(): Playlist[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(PLAYLISTS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function savePlaylists(list: Playlist[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(list));
}

export function createPlaylist(name: string): Playlist {
  const pl: Playlist = {
    id: "pl_" + Date.now().toString(36),
    name: name.trim() || "My Playlist",
    tracks: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const all = getPlaylists();
  all.unshift(pl);
  savePlaylists(all);
  return pl;
}

export function deletePlaylist(id: string) {
  const all = getPlaylists().filter((p) => p.id !== id);
  savePlaylists(all);
}

export function renamePlaylist(id: string, name: string) {
  const all = getPlaylists().map((p) =>
    p.id === id ? { ...p, name: name.trim() || p.name, updatedAt: Date.now() } : p
  );
  savePlaylists(all);
}

export function addToPlaylist(playlistId: string, track: Track): boolean {
  const all = getPlaylists();
  const idx = all.findIndex((p) => p.id === playlistId);
  if (idx === -1) return false;
  const pl = all[idx];
  if (pl.tracks.some((t) => t.id === track.id)) return false; // already exists
  pl.tracks.push({
    id: track.id,
    title: track.title,
    uploader: track.uploader,
    thumbnail: track.thumbnail,
    duration: track.duration,
  });
  pl.updatedAt = Date.now();
  all[idx] = pl;
  savePlaylists(all);
  return true;
}

export function removeFromPlaylist(playlistId: string, trackId: string) {
  const all = getPlaylists().map((p) => {
    if (p.id !== playlistId) return p;
    return {
      ...p,
      tracks: p.tracks.filter((t) => t.id !== trackId),
      updatedAt: Date.now(),
    };
  });
  savePlaylists(all);
}

export function getPlaylist(id: string): Playlist | undefined {
  return getPlaylists().find((p) => p.id === id);
}
