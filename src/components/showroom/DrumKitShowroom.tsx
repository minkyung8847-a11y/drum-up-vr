import React, { useState, useEffect, useCallback } from "react";
import { SHOWROOM_DRUM_KITS, type ShowroomDrumKit } from "../../config/showroomKits";
import { DrumKitNav } from "./DrumKitNav";
import { DrumKitInfo } from "./DrumKitInfo";
import { DrumKitCarousel } from "./DrumKitCarousel";
import { DrumKitThumbnails } from "./DrumKitThumbnails";
import { KitIndicator } from "./KitIndicator";
import { drumSynth } from "../../utils/synth";
import "./drumKitShowroom.css";

interface DrumKitShowroomProps {
  onEnterPlay: (selectedKitId: string) => void;
  initialKitId?: string;
}

export const DrumKitShowroom: React.FC<DrumKitShowroomProps> = ({
  onEnterPlay,
  initialKitId = "001",
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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSelectKit(activeKit);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePrev, handleNext, activeKit]);

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

  const handleNav = (tab: "HOME" | "DRUM KITS" | "PLAY" | "SESSIONS" | "SETTINGS") => {
    if (tab === "PLAY") {
      handleSelectKit(activeKit);
    } else if (tab === "HOME") {
      setActiveIndex(0);
    }
  };

  return (
    <div className="showroom-container">
      {/* Top Navigation */}
      <DrumKitNav activeNav="DRUM KITS" onNavigate={handleNav} />

      {/* Left Sub-heading: Play / Feel / Go Higher */}
      <div className="showroom-side-slogan">
        <span>Play</span>
        <span>Feel</span>
        <span>Go Higher</span>
        <div className="slogan-bar" />
      </div>

      {/* Center Stage Area */}
      <main className="showroom-stage">
        {/* Minimal Typography Header */}
        <DrumKitInfo kit={activeKit} />

        {/* 3D-Feel Carousel */}
        <DrumKitCarousel
          kits={SHOWROOM_DRUM_KITS}
          activeIndex={activeIndex}
          onPrev={handlePrev}
          onNext={handleNext}
          onSelectKit={handleSelectKit}
          onAuditionKit={handleAuditionKit}
        />
      </main>

      {/* Bottom Section: Thumbnails & Progress Indicator */}
      <div className="showroom-bottom-section">
        <DrumKitThumbnails
          kits={SHOWROOM_DRUM_KITS}
          activeIndex={activeIndex}
          onSelectKit={(idx) => setActiveIndex(idx)}
        />

        <KitIndicator
          currentIndex={activeIndex}
          totalKits={SHOWROOM_DRUM_KITS.length}
          onSelectIndex={(idx) => setActiveIndex(idx)}
        />
      </div>
    </div>
  );
};
