import React, { useRef, useCallback, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ShowroomDrumKit } from "../../config/showroomKits";
import { DrumKitVisual } from "./DrumKitVisual";

interface DrumKitCarouselProps {
  kits: ShowroomDrumKit[];
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onAuditionKit?: (kit: ShowroomDrumKit) => void;
}

export const DrumKitCarousel: React.FC<DrumKitCarouselProps> = ({
  kits,
  activeIndex,
  onPrev,
  onNext,
  onAuditionKit,
}) => {
  // Live Drag State
  const [dragOffset, setDragOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartX = useRef<number | null>(null);
  const dragVelocity = useRef<number>(0);
  const lastX = useRef<number>(0);
  const lastTime = useRef<number>(0);
  const gestureMoved = useRef(false);

  // Pointer Down (Mouse or Touch)
  const handlePointerDown = (clientX: number) => {
    gestureMoved.current = false;
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
    if (Math.abs(deltaX) > 8) gestureMoved.current = true;
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
    if (e.button !== 0 || (e.target as HTMLElement).closest(".showroom-arrow-btn, .showroom-select-btn")) return;
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
    if ((e.target as HTMLElement).closest(".showroom-arrow-btn, .showroom-select-btn")) return;
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
  });



  return (
    <div
      className={`showroom-carousel-wrapper ${isDragging ? "is-dragging" : ""}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => { setIsDragging(false); setDragOffset(0); dragStartX.current = null; gestureMoved.current = false; }}
      onWheel={handleWheel}
      onClickCapture={(event) => {
        // A stationary press must reach the existing audition callback.
        // Only a completed drag suppresses the synthetic click that follows it.
        if (gestureMoved.current && (event.target as Element).closest('.showroom-stage-track')) {
          event.preventDefault();
          event.stopPropagation();
          gestureMoved.current = false;
        }
      }}
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

      {/* Layered cutouts crossfade in place; gestures keep their existing navigation. */}
      <div className="showroom-stage-track">
        {kits.map((kit, idx) => {
          const isCenter = idx === activeIndex;
          const slotStyle: React.CSSProperties = {
            transform: `scale(${isCenter ? 1 - Math.min(Math.abs(dragOffset) / 6000, 0.025) : 0.97})`,
            opacity: isCenter ? 1 : 0,
            zIndex: isCenter ? 1 : 0,
            pointerEvents: isCenter ? "auto" : "none",
          };
          return (
            <div
              key={kit.id}
              className={`showroom-kit-slot ${isCenter ? "slot-active" : "slot-hidden"}`}
              style={slotStyle}
              aria-hidden={!isCenter}
            >
              <DrumKitVisual
                kit={kit}
                isActive={isCenter}
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
    </div>
  );
};

