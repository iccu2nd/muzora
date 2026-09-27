"use client";

import { PlayIcon } from "./Icons";
import { formatDuration, formatViews } from "@/lib/piped";

interface SongCardProps {
  title: string;
  uploader: string;
  thumbnail: string;
  duration?: number;
  views?: number;
  onClick: () => void;
  active?: boolean;
}

export default function SongCard({
  title,
  uploader,
  thumbnail,
  duration,
  views,
  onClick,
  active,
}: SongCardProps) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col text-left rounded-xl overflow-hidden bg-[var(--card)] hover:bg-[var(--card-hover)] transition-all ${
        active ? "ring-2 ring-[var(--primary)]" : ""
      }`}
    >
      <div className="relative aspect-square overflow-hidden">
        <img
          src={thumbnail}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-[var(--primary)] flex items-center justify-center shadow-lg">
            <PlayIcon size={22} className="text-white ml-0.5" />
          </div>
        </div>
        {duration ? (
          <span className="absolute bottom-2 right-2 text-[10px] font-medium bg-black/70 px-1.5 py-0.5 rounded">
            {formatDuration(duration)}
          </span>
        ) : null}
      </div>
      <div className="p-3">
        <p className="font-medium text-sm line-clamp-2 leading-snug">{title}</p>
        <p className="text-xs text-[var(--muted)] mt-1 truncate">{uploader}</p>
        {views ? (
          <p className="text-[10px] text-[var(--muted)] mt-0.5">{formatViews(views)} plays</p>
        ) : null}
      </div>
    </button>
  );
}
