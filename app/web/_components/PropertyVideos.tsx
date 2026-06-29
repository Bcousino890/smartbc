"use client";

import { Play } from "lucide-react";

interface PropertyVideosProps {
  videos: Array<{ url: string; title: string }>;
}

export function PropertyVideos({ videos }: PropertyVideosProps) {
  if (!videos || videos.length === 0) return null;

  return (
    <section className="mt-16">
      <h2 className="font-display text-3xl text-navy">Vídeos</h2>
      <div className="mt-6 grid sm:grid-cols-2 gap-6">
        {videos.map((video, idx) => (
          <div key={idx} className="relative group overflow-hidden rounded-lg aspect-video bg-navy/10">
            <iframe
              src={video.url}
              title={video.title}
              className="w-full h-full"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Play size={48} className="text-white drop-shadow-lg" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
