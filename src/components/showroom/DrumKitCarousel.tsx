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
  const platformRef = useRef<HTMLDivElement>(null);
  const platformAnimation = useRef<Animation | null>(null);
  const previousKitIndex = useRef(activeIndex);

  useEffect(() => {
    if (previousKitIndex.current === activeIndex) return;
    previousKitIndex.current = activeIndex;
    const platform = platformRef.current;
    if (!platform) return;
    const { transform, opacity } = getComputedStyle(platform);
    platformAnimation.current?.cancel();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Contract in 200ms, then expand in 260ms as the 880ms slide approaches center.
    platformAnimation.current = platform.animate([
      { transform: transform === "none" ? "scaleX(1)" : transform, opacity, offset: 0, easing: "ease-in-out" },
      { transform: "scaleX(.82)", opacity: .84, offset: 200 / 700, easing: "ease-in-out" },
      { transform: "scaleX(.82)", opacity: .84, offset: 440 / 700, easing: "ease-in-out" },
      { transform: "scaleX(1)", opacity: 1, offset: 1 },
    ], { duration: 700 });
  }, [activeIndex]);

  useEffect(() => () => platformAnimation.current?.cancel(), []);

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

      {/* Continuous horizontal track: center kit plus partial prev/next peeking at the edges. */}
      <div className="showroom-stage-track">
        <div ref={platformRef} className="showroom-platform" aria-hidden="true" />
        {kits.map((kit, idx) => {
          const total = kits.length;
          let delta = idx - activeIndex;
          delta = (((delta + total / 2) % total) + total) % total - total / 2;
          const isCenter = delta === 0;
          const isPeek = Math.abs(delta) === 1;
          const distance = Math.min(Math.abs(delta + dragOffset / 320), 1);
          // Desktop retains the existing product/info composition; mobile uses symmetric peeks.
          const step = delta < 0 ? "var(--carousel-prev-step)" : "var(--carousel-next-step)";
          const slotStyle: React.CSSProperties = {
            // Side kits sit further back: small (0.55 scale, both sides identical), lifted 15% of the track height so they stay above the
            // horizon line, with ~1px soft focus, 65% opacity and slightly lower brightness/contrast; depth comes mostly from size and height.
            transform: `translateX(calc(${step} * ${delta} + ${dragOffset}px)) translateY(${-distance * 2}%) scale(${1 - distance * 0.45})`,
            opacity: isCenter || isPeek ? 1 - distance * 0.35 : 0,
            filter: `blur(${distance * 1}px) brightness(${1 - distance * 0.1}) contrast(${1 - distance * 0.08})`,
            zIndex: isCenter ? 2 : isPeek ? 1 : 0,
            pointerEvents: isCenter ? "auto" : "none",
          };
          return (
            <div
              key={kit.id}
              className={`showroom-kit-slot ${isCenter ? "slot-active" : "slot-hidden"} ${isDragging ? "is-dragging" : ""}`}
              style={slotStyle}
              aria-hidden={!isCenter}
              inert={!isCenter}
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
