import React from "react";

export type Drum2DPartId = "kick" | "snare" | "hihat" | "tom1" | "tom2" | "tom3" | "crash" | "ride";

interface Drum2DProps {
  activePads?: Record<Drum2DPartId, boolean>;
  onPartClick: (partId: Drum2DPartId) => void;
}

interface PadLayout {
  id: Drum2DPartId;
  left: string;
  top: string;
  width: string;
  height: string;
}

// Precise percentage layouts overlaying the cymbals and drum heads of the static image
const PADS_LAYOUT: PadLayout[] = [
  { id: "crash", left: "2.8%", top: "7.5%", width: "21%", height: "26%" },
  { id: "hihat", left: "16.2%", top: "28.5%", width: "13.8%", height: "15%" },
  { id: "snare", left: "22.8%", top: "43.5%", width: "16.8%", height: "28%" },
  { id: "kick", left: "40.5%", top: "43%", width: "19%", height: "35%" },
  { id: "tom1", left: "33.8%", top: "18%", width: "13.8%", height: "29%" },
  { id: "tom2", left: "52.4%", top: "18%", width: "13.8%", height: "29%" },
  { id: "tom3", left: "63%", top: "41.5%", width: "18.4%", height: "29%" },
  { id: "ride", left: "77%", top: "7.5%", width: "21%", height: "26%" },
];

export const Drum2D: React.FC<Drum2DProps> = ({ onPartClick }) => {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: "920px",
        margin: "0 auto",
        position: "relative",
        userSelect: "none",
      }}
    >
      {/* 1. Raw cropped mockup drum image (Now with fully transparent background) */}
      <img
        src="/drum_kit.png"
        alt="Drum Kit Mockup"
        style={{
          width: "100%",
          display: "block",
          pointerEvents: "none",
          borderRadius: "16px"
        }}
      />

      {/* 2. Interactive Transparent Hitboxes Overlay (NO visual feedback, pure transparent interactive regions) */}
      {PADS_LAYOUT.map((pad) => (
        <div
          key={pad.id}
          onClick={() => onPartClick(pad.id)}
          style={{
            position: "absolute",
            left: pad.left,
            top: pad.top,
            width: pad.width,
            height: pad.height,
            cursor: "pointer",
            borderRadius: "50%",
            zIndex: 10,
            background: "transparent",
            outline: "none",
            border: "none",
          }}
        />
      ))}
    </div>
  );
};
