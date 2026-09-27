import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/piped";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  const filter = req.nextUrl.searchParams.get("filter") || "music_songs";
  if (!q || q.trim().length < 1) {
    return NextResponse.json({ items: [] });
  }
  try {
    const items = await search(q.trim(), filter);
    return NextResponse.json({ items });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Search failed" }, { status: 500 });
  }
}
