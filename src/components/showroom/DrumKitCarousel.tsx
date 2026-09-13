import React, { useRef, useCallback, useState } from "react";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import type { ShowroomDrumKit } from "../../config/showroomKits";
import { DrumKitVisual } from "./DrumKitVisual";

interface DrumKitCarouselProps {
  kits: ShowroomDrumKit[];
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onSelectKit: (kit: ShowroomDrumKit) => void;
  onAuditionKit?: (kit: ShowroomDrumKit) => void;
}

export const DrumKitCarousel: React.FC<DrumKitCarouselProps> = ({
  kits,
  activeIndex,
  onPrev,
  onNext,
  onSelectKit,
  onAuditionKit,
}) => {
  const activeKit = kits[activeIndex];
  const dragStartX = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Mouse Drag / Swipe Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    dragStartX.current = e.clientX;
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || dragStartX.current === null) return;
    const deltaX = e.clientX - dragStartX.current;
    if (Math.abs(deltaX) > 65) {
      if (deltaX > 0) {
        onPrev();
      } else {
        onNext();
      }
      dragStartX.current = null;
      setIsDragging(false);
    }
  };

  const handleMouseUp = () => {
    dragStartX.current = null;
    setIsDragging(false);
  };

  // Touch Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    dragStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragStartX.current === null) return;
    const deltaX = e.touches[0].clientX - dragStartX.current;
    if (Math.abs(deltaX) > 50) {
      if (deltaX > 0) {
        onPrev();
      } else {
        onNext();
      }
      dragStartX.current = null;
    }
  };

  const handleTouchEnd = () => {
    dragStartX.current = null;
  };

  // Trackpad Horizontal Wheel Handler
  const lastWheelTime = useRef(0);
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 30) {
        const now = performance.now();
        if (now - lastWheelTime.current > 450) {
          lastWheelTime.current = now;
          if (e.deltaX > 0) {
            onNext();
          } else {
            onPrev();
          }
        }
      }
    },
    [onNext, onPrev]
  );

  return (
    <div
      className="showroom-carousel-wrapper"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      {/* Left Chevron Arrow */}
      <button
        type="button"
        className="showroom-arrow-btn prev"
        onClick={(e) => {
          e.stopPropagation();
          onPrev();
        }}
        aria-label="Previous drum kit"
        title="Previous kit"
      >
        <ChevronLeft size={36} strokeWidth={1.5} />
      </button>

      {/* Stage Track with Peeking Kits */}
      <div className="showroom-stage-track">
        {kits.map((kit, idx) => {
          let slotClass = "slot-hidden";
          const diff = (idx - activeIndex + kits.length) % kits.length;

          if (diff === 0) {
            slotClass = "slot-active";
          } else if (diff === 1 || (activeIndex === kits.length - 1 && idx === 0)) {
            slotClass = "slot-next";
          } else if (diff === kits.length - 1 || (activeIndex === 0 && idx === kits.length - 1)) {
            slotClass = "slot-prev";
          }

          return (
            <div
              key={kit.id}
              className={`showroom-kit-slot ${slotClass}`}
              onClick={() => {
                if (slotClass === "slot-prev") onPrev();
                else if (slotClass === "slot-next") onNext();
              }}
            >
              <DrumKitVisual
                kit={kit}
                isActive={idx === activeIndex}
                onAudition={() => onAuditionKit?.(kit)}
              />
            </div>
          );
        })}
      </div>

      {/* Right Chevron Arrow */}
      <button
        type="button"
        className="showroom-arrow-btn next"
        onClick={(e) => {
          e.stopPropagation();
          onNext();
        }}
        aria-label="Next drum kit"
        title="Next kit"
      >
        <ChevronRight size={36} strokeWidth={1.5} />
      </button>

      {/* Primary Action Button: SELECT KIT */}
      <button
        type="button"
        className="showroom-select-btn"
        onClick={() => onSelectKit(activeKit)}
      >
        <span>SELECT KIT</span>
        <ArrowRight size={14} className="btn-arrow" />
      </button>
    </div>
  );
};
