import React from "react";

export type TimeSignature = "4/4" | "3/4" | "6/8";

interface BeatIndicatorProps {
  currentBeat: number; // 0-indexed, or -1 when inactive
  beatsPerBar: number; // 3, 4, or 6
  visible: boolean;
}

export const BeatIndicator: React.FC<BeatIndicatorProps> = ({
  currentBeat,
  beatsPerBar,
  visible,
}) => {
  if (!visible && currentBeat === -1) return null;

  return (
    <div
      className={`beat-indicator-container ${visible ? "visible" : "hidden"}`}
      aria-label="Metronome Beat Indicator"
    >
      {Array.from({ length: beatsPerBar }).map((_, index) => {
        const isActive = visible && currentBeat === index;
        const isDownbeat = index === 0;

        return (
          <div
            key={index}
            className={`beat-dot ${isDownbeat ? "downbeat" : ""} ${
              isActive ? "active" : ""
            }`}
            title={`Beat ${index + 1}`}
          >
            <div className="beat-dot-inner" />
          </div>
        );
      })}
    </div>
  );
};
