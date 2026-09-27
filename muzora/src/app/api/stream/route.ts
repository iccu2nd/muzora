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
    return NextResponse.json({
      title: info.title,
      uploader: info.uploader,
      thumbnail: info.thumbnail,
      duration: info.duration,
      audioUrl: info.audioUrl, // can be null → client uses YouTube embed
      videoId: info.videoId,
      related: info.related || [],
    });
  } catch (e: any) {
    console.error(e);
    // Even on total failure, return videoId so embed can still work
    return NextResponse.json({
      title: "YouTube Track",
      uploader: "",
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: 0,
      audioUrl: null,
      videoId,
      related: [],
    });
  }
}
