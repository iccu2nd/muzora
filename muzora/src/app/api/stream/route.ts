import { NextRequest, NextResponse } from "next/server";
import { getStream, extractVideoId } from "@/lib/piped";

export async function GET(req: NextRequest) {
  const idOrUrl = req.nextUrl.searchParams.get("id");
  if (!idOrUrl) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  const videoId = extractVideoId(idOrUrl) || idOrUrl;
  try {
    const info = await getStream(videoId);
    // Prefer highest bitrate audio that is m4a or webm
    const audio = (info.audioStreams || [])
      .filter((s) => s.mimeType?.includes("audio"))
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

    return NextResponse.json({
      title: info.title,
      uploader: info.uploader,
      thumbnail: info.thumbnailUrl,
      duration: info.duration,
      audioUrl: audio?.url || null,
      related: (info.relatedStreams || []).slice(0, 12),
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Stream failed" }, { status: 500 });
  }
}
