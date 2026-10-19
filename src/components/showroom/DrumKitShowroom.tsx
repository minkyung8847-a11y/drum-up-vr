import React, { useState, useEffect, useCallback } from "react";
import { SHOWROOM_DRUM_KITS, type ShowroomDrumKit } from "../../config/showroomKits";
import { ShowroomHeader } from "./ShowroomHeader";
import { DrumKitInfo } from "./DrumKitInfo";
import { DrumKitCarousel } from "./DrumKitCarousel";
import { DrumKitThumbnails } from "./DrumKitThumbnails";
import { drumSynth } from "../../utils/synth";
import "./drumKitShowroom.css";

interface DrumKitShowroomProps {
  onEnterPlay: (selectedKitId: string) => void;
  initialKitId?: string;
  onNavigate: (tab: "FREE PLAY" | "RUDIMENT" | "RHYTHM GAME") => void;
  onOpenSettings: () => void;
  onHome: () => void;
}

export const DrumKitShowroom: React.FC<DrumKitShowroomProps> = ({
  onEnterPlay,
  initialKitId = "001",
  onNavigate,
  onOpenSettings,
  onHome,
}) => {
  // Find initial kit index based on audioPresetId or id
  const getInitialIndex = () => {
    const foundIdx = SHOWROOM_DRUM_KITS.findIndex(
      (k) => k.audioPresetId === initialKitId || k.id === initialKitId
    );
    return foundIdx !== -1 ? foundIdx : 0;
  };

  const [activeIndex, setActiveIndex] = useState<number>(getInitialIndex);
  const activeKit = SHOWROOM_DRUM_KITS[activeIndex];

  const handlePrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + SHOWROOM_DRUM_KITS.length) % SHOWROOM_DRUM_KITS.length);
  }, []);

  const handleNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % SHOWROOM_DRUM_KITS.length);
  }, []);

  // Audio auditioning on drum click or kit switch
  const handleAuditionKit = useCallback((kit: ShowroomDrumKit) => {
    try {
      drumSynth.init();
      // Ensure kit buffers are loaded and trigger snare or kick preview
      drumSynth.setKit(kit.audioPresetId);
      drumSynth.trigger("snare", 0.9);
    } catch {
      // AudioContext might be waiting for user gesture
    }
  }, []);

  // When SELECT KIT is confirmed
  const handleSelectKit = useCallback(
    (kit: ShowroomDrumKit) => {
      try {
        drumSynth.init();
        drumSynth.setKit(kit.audioPresetId);
        drumSynth.trigger("kick", 1.0);
      } catch {
        // Continue
      }
      onEnterPlay(kit.audioPresetId);
    },
    [onEnterPlay]
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey ||
          (e.target instanceof HTMLElement && e.target.closest('[inert], input, textarea, select, [contenteditable="true"]'))) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "Enter") {
        if (e.target instanceof HTMLElement && e.target.closest('button, a')) return;
        e.preventDefault();
        handleSelectKit(activeKit);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePrev, handleNext, activeKit, handleSelectKit]);

  return (
    <div className="showroom-container">
      <ShowroomHeader onNavigate={onNavigate} onOpenSettings={onOpenSettings} onHome={onHome} />
      <div className="showroom-background-title" aria-hidden="true">{activeKit.name}</div>
      {/* Center Stage Area */}
      <main className="showroom-stage">
        {/* 3D-Feel Carousel */}
        <DrumKitCarousel
          kits={SHOWROOM_DRUM_KITS}
          activeIndex={activeIndex}
          onPrev={handlePrev}
          onNext={handleNext}
          onAuditionKit={handleAuditionKit}
        />

        {/* Kit Name & Tagline below the drum */}
        <div className="showroom-details">
        <DrumKitInfo kit={activeKit} />

        {/* Primary Action Button: SELECT KIT */}
        <button
          type="button"
          className="showroom-select-btn"
          onClick={() => handleSelectKit(activeKit)}
        >
          <span className="showroom-play-trace" aria-hidden="true">
            <span className="showroom-play-sparkle">
            <svg viewBox="0 0 14 14" focusable="false">
              <path className="showroom-play-trace-bloom" d="M7 1 8.4 5.6 13 7 8.4 8.4 7 13 5.6 8.4 1 7 5.6 5.6Z" />
              <path className="showroom-play-trace-rays" d="M7 0V14M0 7H14" />
              <path className="showroom-play-trace-light" d="M7 2 8.1 5.9 12 7 8.1 8.1 7 12 5.9 8.1 2 7 5.9 5.9Z" />
            </svg>
            </span>
          </span>
          <span>PLAY</span>
        </button>
        </div>
      </main>

      {/* Bottom Section: Thumbnails */}
      <div className="showroom-bottom-section">
        <DrumKitThumbnails
          kits={SHOWROOM_DRUM_KITS}
          activeIndex={activeIndex}
          onSelectKit={(idx) => {
            setActiveIndex(idx);
            handleAuditionKit(SHOWROOM_DRUM_KITS[idx]);
          }}
        />
      </div>
    </div>
  );
};
