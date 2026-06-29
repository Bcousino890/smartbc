"use client";

import { useState, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface PropertyGalleryProps {
  cover: string;
  gallery: string[];
  title: string;
}

export function PropertyGallery({ cover, gallery, title }: PropertyGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const allImages = [cover, ...gallery];
  const currentImage = allImages[currentIndex];

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? allImages.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === allImages.length - 1 ? 0 : prev + 1));
  };

  // Swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0].screenX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].screenX;
    detectSwipe();
  };

  const detectSwipe = () => {
    const swipeThreshold = 50;
    const diff = touchStartX.current - touchEndX.current;

    if (Math.abs(diff) > swipeThreshold) {
      if (diff > 0) {
        goToNext();
      } else {
        goToPrevious();
      }
    }
  };

  // Copy-paste protection
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleCopy = (e: React.ClipboardEvent) => {
    e.preventDefault();
  };

  return (
    <>
      <section className="bg-cream-deep">
        <div className="container-luxe py-6 grid md:grid-cols-3 gap-2 h-[70vh]">
          {/* Main carousel */}
          <div
            className="md:col-span-2 relative overflow-hidden group cursor-pointer user-select-none"
            onClick={() => setIsFullscreen(true)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <img
              src={currentImage}
              alt={title}
              className="h-full w-full object-cover pointer-events-none"
              onContextMenu={handleContextMenu}
              onDragStart={handleDragStart}
              onCopy={handleCopy}
            />

            {/* Navigation buttons */}
            {allImages.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    goToPrevious();
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-cream/90 hover:bg-cream text-navy p-2 transition-colors opacity-0 group-hover:opacity-100"
                  aria-label="Foto anterior"
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    goToNext();
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-cream/90 hover:bg-cream text-navy p-2 transition-colors opacity-0 group-hover:opacity-100"
                  aria-label="Foto siguiente"
                >
                  <ChevronRight size={24} />
                </button>
              </>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsFullscreen(true);
              }}
              className="absolute bottom-6 left-6 bg-cream/95 text-navy px-5 py-2 text-[11px] tracking-[0.24em] uppercase hover:bg-cream transition-colors"
            >
              ↗ Ver galería
            </button>

            {/* Counter */}
            {allImages.length > 1 && (
              <div className="absolute bottom-6 right-6 bg-navy/80 text-cream px-3 py-2 text-[11px] tracking-wider uppercase">
                {currentIndex + 1} / {allImages.length}
              </div>
            )}
          </div>

          {/* Thumbnails */}
          <div className="hidden md:grid grid-rows-2 gap-2 user-select-none">
            {allImages.slice(0, 2).map((img, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`overflow-hidden relative transition-opacity ${
                  currentIndex === i ? "ring-2 ring-gold" : ""
                }`}
              >
                <img
                  src={img}
                  alt=""
                  className="h-full w-full object-cover pointer-events-none"
                  loading="lazy"
                  onContextMenu={handleContextMenu}
                  onDragStart={handleDragStart}
                  onCopy={handleCopy}
                />
                {i === 1 && allImages.length > 2 && (
                  <span className="absolute bottom-4 right-4 bg-navy/80 text-cream px-3 py-1 text-[11px] tracking-wider uppercase">
                    +{allImages.length - 2}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Fullscreen modal */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col user-select-none">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="flex-1" />
            <div className="text-center text-white text-sm">
              {currentIndex + 1} / {allImages.length}
            </div>
            <div className="flex-1 flex justify-end">
              <button
                onClick={() => setIsFullscreen(false)}
                className="text-white hover:bg-white/10 p-2 transition-colors"
                aria-label="Cerrar"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Image */}
          <div
            className="flex-1 flex items-center justify-center overflow-auto"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <img
              src={currentImage}
              alt={title}
              className="max-w-full max-h-full object-contain pointer-events-none"
              onContextMenu={handleContextMenu}
              onDragStart={handleDragStart}
              onCopy={handleCopy}
            />
          </div>

          {/* Navigation */}
          {allImages.length > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-white/10">
              <button
                onClick={goToPrevious}
                className="text-white hover:bg-white/10 p-2 transition-colors"
                aria-label="Anterior"
              >
                <ChevronLeft size={24} />
              </button>
              <div className="flex gap-2 flex-wrap justify-center">
                {allImages.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentIndex(i)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      currentIndex === i ? "bg-gold" : "bg-white/30 hover:bg-white/50"
                    }`}
                    aria-label={`Foto ${i + 1}`}
                  />
                ))}
              </div>
              <button
                onClick={goToNext}
                className="text-white hover:bg-white/10 p-2 transition-colors"
                aria-label="Siguiente"
              >
                <ChevronRight size={24} />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
