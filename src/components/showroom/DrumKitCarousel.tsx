import React, { useRef, useCallback, useState, useEffect } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);

  // Live Drag State
  const [dragOffset, setDragOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartX = useRef<number | null>(null);
  const dragVelocity = useRef<number>(0);
  const lastX = useRef<number>(0);
  const lastTime = useRef<number>(0);

  // Pointer Down (Mouse or Touch)
  const handlePointerDown = (clientX: number) => {
    dragStartX.current = clientX;
    lastX.current = clientX;
    lastTime.current = performance.now();
    dragVelocity.current = 0;
    setIsDragging(true);
  };

  // Pointer Move
  const handlePointerMove = (clientX: number) => {
    if (!isDragging || dragStartX.current === null) return;
    const now = performance.now();
    const dt = now - lastTime.current;
    const dx = clientX - lastX.current;

    if (dt > 0) {
      dragVelocity.current = dx / dt; // pixels per ms
    }
    lastX.current = clientX;
    lastTime.current = now;

    const deltaX = clientX - dragStartX.current;
    // Apply slight resistance if dragging very far
    const dampedDeltaX = deltaX * 0.9;
    setDragOffset(dampedDeltaX);
  };

  // Pointer Up / End
  const handlePointerUp = () => {
    if (!isDragging || dragStartX.current === null) return;

    const currentOffset = dragOffset;
    const velocity = dragVelocity.current;
    const threshold = 70; // Drag snap threshold in pixels

    setIsDragging(false);
    setDragOffset(0);
    dragStartX.current = null;

    // Evaluate snap decision based on distance and throw velocity
    if (currentOffset > threshold || velocity > 0.35) {
      onPrev();
    } else if (currentOffset < -threshold || velocity < -0.35) {
      onNext();
    }
  };

  // Mouse Events
  const onMouseDown = (e: React.MouseEvent) => {
    handlePointerDown(e.clientX);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    handlePointerMove(e.clientX);
  };

  const onMouseUp = () => {
    handlePointerUp();
  };

  // Touch Events
  const onTouchStart = (e: React.TouchEvent) => {
    handlePointerDown(e.touches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    handlePointerMove(e.touches[0].clientX);
  };

  const onTouchEnd = () => {
    handlePointerUp();
  };

  // Trackpad Horizontal Wheel Handler
  const lastWheelTime = useRef(0);
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 25) {
        const now = performance.now();
        if (now - lastWheelTime.current > 420) {
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

  // Global mouseup safety to prevent sticky drag
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handlePointerUp();
      }
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [isDragging]);

  const total = kits.length;

  return (
    <div
      ref={containerRef}
      className={`showroom-carousel-wrapper ${isDragging ? "is-dragging" : ""}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
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
        title="Previous kit (Left arrow)"
      >
        <ChevronLeft size={36} strokeWidth={1.5} />
      </button>

      {/* Spatial 3D Stage Track */}
      <div className="showroom-stage-track">
        {kits.map((kit, idx) => {
          // Circular relative offset: -2, -1, 0, 1, 2
          let relIndex = idx - activeIndex;
          while (relIndex > total / 2) relIndex -= total;
          while (relIndex < -total / 2) relIndex += total;

          // Normalized visual position with continuous live dragOffset
          const trackWidth = containerRef.current?.clientWidth || 900;
          const slotSpacing = Math.max(380, trackWidth * 0.44);
          const dragFraction = dragOffset / slotSpacing;
          const pos = relIndex + dragFraction;

          const isCenter = Math.abs(pos) < 0.45;
          const isPrev = pos < -0.45 && pos >= -1.45;
          const isNext = pos > 0.45 && pos <= 1.45;
          const isVisible = Math.abs(pos) <= 1.45;

          // Spatial 3D Calculations
          // Current kit: scale 1, opacity 1, rotateY 0deg
          // Adjacent kits: scale 0.72, opacity 0.22, rotateY ±8deg
          const scale = Math.max(0.55, 1.0 - Math.abs(pos) * 0.28);
          const opacity = Math.max(0, 1.0 - Math.abs(pos) * 0.78);
          const rotY = Math.max(-14, Math.min(14, -pos * 8.0));
          const translateX = pos * slotSpacing;
          const zIndex = isCenter ? 10 : isVisible ? 5 : 0;

          const slotStyle: React.CSSProperties = {
            transform: `translate3d(${translateX}px, 0, 0) scale(${scale}) rotateY(${rotY}deg)`,
            opacity: isVisible ? opacity : 0,
            zIndex,
            pointerEvents: isCenter ? "auto" : isVisible ? "auto" : "none",
            transition: isDragging
              ? "none"
              : "transform 0.65s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.65s cubic-bezier(0.16, 1, 0.3, 1)",
          };

          return (
            <div
              key={kit.id}
              className={`showroom-kit-slot ${isCenter ? "slot-active" : isPrev ? "slot-prev" : isNext ? "slot-next" : "slot-hidden"}`}
              style={slotStyle}
              onClick={() => {
                if (isPrev) onPrev();
                else if (isNext) onNext();
              }}
            >
              <DrumKitVisual
                kit={kit}
                isActive={isCenter && !isDragging}
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
        title="Next kit (Right arrow)"
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
