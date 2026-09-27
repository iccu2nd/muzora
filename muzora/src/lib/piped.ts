// Piped instances (public YouTube API proxies)
// Updated with currently working instances
const PIPED_INSTANCES = [
  "https://api.piped.private.coffee",
  "https://pipedapi.ducks.party",
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.reallyaweso.me",
  "https://pipedapi.nosebs.ru",
  "https://api.piped.yt",
];

let currentInstance = 0;

async function fetchWithFallback(path: string, retries = 6): Promise<any> {
  const errors: string[] = [];
  const start = currentInstance;

  for (let i = 0; i < Math.min(retries, PIPED_INSTANCES.length); i++) {
    const idx = (start + i) % PIPED_INSTANCES.length;
    const base = PIPED_INSTANCES[idx];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${base}${path}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Muzora/1.0",
        },
        signal: controller.signal,
        next: { revalidate: 30 },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        errors.push(`${base}: HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      // success — remember this instance for next time
      currentInstance = idx;
      return data;
    } catch (e: any) {
      errors.push(`${base}: ${e.name === "AbortError" ? "timeout" : e.message}`);
    }
  }

  console.error("All Piped instances failed:", errors);
  throw new Error("All Piped instances failed. Coba lagi nanti.");
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
  return (data.items || []).filter(
    (i: any) => i.type === "stream" || (i.url && i.url.includes("/watch"))
  );
}

export async function getStream(videoId: string): Promise<StreamInfo> {
  return fetchWithFallback(`/streams/${videoId}`);
}

export function extractVideoId(url: string): string | null {
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
