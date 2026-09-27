// Music data layer — Piped primary, YouTube embed fallback for playback
const PIPED_INSTANCES = [
  "https://api.piped.private.coffee",
  "https://pipedapi.ducks.party",
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.leptons.xyz",
];

let currentInstance = 0;

async function fetchPiped(path: string): Promise<any | null> {
  const errors: string[] = [];
  for (let i = 0; i < PIPED_INSTANCES.length; i++) {
    const idx = (currentInstance + i) % PIPED_INSTANCES.length;
    const base = PIPED_INSTANCES[idx];
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(`${base}${path}`, {
        headers: { Accept: "application/json", "User-Agent": "Muzora/1.0" },
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(t);
      if (!res.ok) {
        errors.push(`${base}→${res.status}`);
        continue;
      }
      const data = await res.json();
      if (data?.message && String(data.message).includes("LOGIN_REQUIRED")) {
        errors.push(`${base}→LOGIN_REQUIRED`);
        continue;
      }
      currentInstance = idx;
      return data;
    } catch (e: any) {
      errors.push(`${base}→${e.name === "AbortError" ? "timeout" : "err"}`);
    }
  }
  console.warn("Piped failed:", errors.join(", "));
  return null;
}

export interface SearchItem {
  url: string;
  type: "stream" | "playlist" | "channel";
  title: string;
  thumbnail: string;
  uploaderName: string;
  uploaderUrl?: string;
  duration?: number;
  views?: number;
  uploadedDate?: string;
  isShort?: boolean;
}

export interface StreamResult {
  title: string;
  uploader: string;
  thumbnail: string;
  duration: number;
  audioUrl: string | null; // null = use YouTube embed fallback
  videoId: string;
  related: SearchItem[];
}

export async function search(query: string, filter = "music_songs"): Promise<SearchItem[]> {
  const data = await fetchPiped(`/search?q=${encodeURIComponent(query)}&filter=${filter}`);
  if (!data) {
    // last resort: try without music filter
    const data2 = await fetchPiped(`/search?q=${encodeURIComponent(query)}&filter=all`);
    if (!data2) throw new Error("Search gagal. Semua server sedang sibuk, coba lagi.");
    return (data2.items || []).filter(
      (i: any) => i.type === "stream" || (i.url && String(i.url).includes("/watch"))
    );
  }
  return (data.items || []).filter(
    (i: any) => i.type === "stream" || (i.url && String(i.url).includes("/watch"))
  );
}

export async function getStream(videoId: string): Promise<StreamResult> {
  const data = await fetchPiped(`/streams/${videoId}`);

  if (data && (data.audioStreams?.length || data.title)) {
    const audio = (data.audioStreams || [])
      .filter((s: any) => s.mimeType?.includes("audio") || s.format?.includes("m4a") || s.format?.includes("webm"))
      .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];

    return {
      title: data.title || "Unknown",
      uploader: data.uploader || "Unknown",
      thumbnail: data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: data.duration || 0,
      audioUrl: audio?.url || null,
      videoId,
      related: (data.relatedStreams || []).slice(0, 12),
    };
  }

  // Fallback: no direct audio stream available (YouTube blocking)
  // Return metadata only — player will use YouTube embed
  return {
    title: data?.title || "YouTube Track",
    uploader: data?.uploader || "",
    thumbnail: data?.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: data?.duration || 0,
    audioUrl: null,
    videoId,
    related: (data?.relatedStreams || []).slice(0, 12),
  };
}

export function extractVideoId(url: string): string | null {
  if (!url) return null;
  if (url.length === 11 && !/[^0-9A-Za-z_-]/.test(url)) return url;
  const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
  return match ? match[1] : null;
}

export function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatViews(n?: number): string {
  if (!n) return "";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
