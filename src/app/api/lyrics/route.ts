import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title") || "";
  const artist = req.nextUrl.searchParams.get("artist") || "";
  if (!title.trim()) {
    return NextResponse.json({ lyrics: null, error: "Missing title" }, { status: 400 });
  }

  try {
    // Prefer exact get
    const params = new URLSearchParams({
      track_name: title.trim(),
      artist_name: artist.trim() || " ",
    });
    let res = await fetch(`https://lrclib.net/api/get?${params}`, {
      headers: { "User-Agent": "Muzora/1.0" },
      cache: "no-store",
    });

    if (!res.ok) {
      // fallback search
      const q = encodeURIComponent(`${artist} ${title}`.trim());
      res = await fetch(`https://lrclib.net/api/search?q=${q}`, {
        headers: { "User-Agent": "Muzora/1.0" },
        cache: "no-store",
      });
      if (!res.ok) {
        return NextResponse.json({ lyrics: null, synced: null });
      }
      const list = await res.json();
      const best = Array.isArray(list) && list.length ? list[0] : null;
      if (!best) return NextResponse.json({ lyrics: null, synced: null });
      return NextResponse.json({
        lyrics: best.plainLyrics || null,
        synced: best.syncedLyrics || null,
        source: "lrclib",
      });
    }

    const data = await res.json();
    return NextResponse.json({
      lyrics: data.plainLyrics || null,
      synced: data.syncedLyrics || null,
      source: "lrclib",
    });
  } catch (e: any) {
    console.error("lyrics error", e);
    return NextResponse.json({ lyrics: null, synced: null, error: e.message });
  }
}
