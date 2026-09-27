// Piped instances for YouTube proxy (public, no API key needed)
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.tokhmi.xyz",
  "https://api.piped.private.coffee",
  "https://pipedapi.adminforge.de",
  "https://piped-api.garudalinux.org",
];

let currentInstance = 0;

async function fetchWithFallback(path: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    const base = PIPED_INSTANCES[(currentInstance + i) % PIPED_INSTANCES.length];
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 60 },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      currentInstance = (currentInstance + i) % PIPED_INSTANCES.length;
      return await res.json();
    } catch (e) {
      console.warn(`Piped instance ${base} failed:`, e);
    }
  }
  throw new Error("All Piped instances failed");
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

export interface StreamInfo {
  title: string;
  description: string;
  uploadDate: string;
  uploader: string;
  uploaderUrl: string;
  uploaderAvatar: string;
  thumbnailUrl: string;
  hls: string | null;
  dash: string | null;
  duration: number;
  views: number;
  likes: number;
  category: string;
  relatedStreams: SearchItem[];
  audioStreams: {
    url: string;
    format: string;
    quality: string;
    mimeType: string;
    codec: string;
    bitrate: number;
    contentLength: number;
  }[];
  videoStreams: any[];
  subtitles: any[];
  livestream: boolean;
}

export async function search(query: string, filter = "music_songs"): Promise<SearchItem[]> {
  const data = await fetchWithFallback(
    `/search?q=${encodeURIComponent(query)}&filter=${filter}`
  );
  return (data.items || []).filter((i: any) => i.type === "stream" || i.url?.includes("/watch"));
}

export async function getStream(videoId: string): Promise<StreamInfo> {
  return fetchWithFallback(`/streams/${videoId}`);
}

export function extractVideoId(url: string): string | null {
  // Handles /watch?v=ID or just ID
  if (!url) return null;
  if (url.length === 11 && !url.includes("/")) return url;
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
