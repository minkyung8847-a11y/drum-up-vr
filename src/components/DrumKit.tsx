import React from "react";
import type { DrumPadId } from "../types";

interface DrumKitProps {
  activePads: Record<DrumPadId, boolean>;
  onPadHit: (padId: DrumPadId, velocity: number) => void;
}

export const DRUM_PADS_CONFIG: { id: DrumPadId; name: string; key: string; color: string; label: string }[] = [
  { id: "kick", name: "Bass Drum", key: "Space", color: "var(--color-kick)", label: "KICK" },
  { id: "snare", name: "Snare Drum", key: "A", color: "var(--color-snare)", label: "SNARE" },
  { id: "hihat-closed", name: "Closed Hi-Hat", key: "D", color: "var(--color-hihat)", label: "HH CLOSED" },
  { id: "hihat-open", name: "Open Hi-Hat", key: "W", color: "var(--color-hihat)", label: "HH OPEN" },
  { id: "hihat-pedal", name: "Hi-Hat Pedal", key: "C", color: "var(--color-hihat)", label: "HH PEDAL" },
  { id: "tom-high", name: "High Tom", key: "F", color: "var(--color-tom-high)", label: "TOM 1" },
  { id: "tom-mid", name: "Mid Tom", key: "G", color: "var(--color-tom-mid)", label: "TOM 2" },
  { id: "tom-floor", name: "Floor Tom", key: "H", color: "var(--color-tom-floor)", label: "FLOOR TOM" },
  { id: "crash", name: "Crash Cymbal", key: "Q", color: "var(--color-crash)", label: "CRASH" },
  { id: "ride", name: "Ride Cymbal", key: "E", color: "var(--color-ride)", label: "RIDE" },
];

export const DrumKit: React.FC<DrumKitProps> = ({ activePads, onPadHit }) => {
  const handleHit = (padId: DrumPadId) => {
    // Standard trigger on click (velocity = 1.0)
    onPadHit(padId, 1.0);
  };

  return (
    <div className="drum-kit-container">
      {/* 1. Crash Cymbal (Left) */}
      <div
        className={`drum-element ${activePads["crash"] ? "hit" : ""}`}
        style={{ left: "12%", top: "40px", width: "130px", height: "130px" }}
        onClick={() => handleHit("crash")}
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%" className="drum-pad-vector">
          {/* Stand */}
          <line x1="50" y1="50" x2="50" y2="150" stroke="#8e8e93" strokeWidth="3" />
          {/* Cymbal Outer */}
          <ellipse cx="50" cy="50" rx="45" ry="12" fill="#ffd60a" stroke="#d4af37" strokeWidth="2" />
          <ellipse cx="50" cy="50" rx="43" ry="10" fill="url(#goldGrad)" />
          {/* Cymbal Bell */}
          <ellipse cx="50" cy="50" rx="12" ry="5" fill="#d4af37" />
          {/* Center Nut */}
          <circle cx="50" cy="50" r="2" fill="#3a3a3c" />
          {/* Hit effect ring */}
          <ellipse
            cx="50"
            cy="50"
            rx="46"
            ry="13"
            fill="none"
            stroke="var(--color-crash)"
            strokeWidth={activePads["crash"] ? "3" : "0"}
            opacity={activePads["crash"] ? "0.8" : "0"}
            style={{ transition: "stroke-width 0.05s" }}
          />
          {/* Helper Gradient */}
          <defs>
            <radialGradient id="goldGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff176" />
              <stop offset="60%" stopColor="#ffb300" />
              <stop offset="100%" stopColor="#b78103" />
            </radialGradient>
          </defs>
        </svg>
        <span style={{ fontSize: "10px", fontWeight: "bold", position: "absolute", top: "10px", left: "40%", background: "#fff", padding: "2px 4px", borderRadius: "4px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", pointerEvents: "none" }}>CRASH [Q]</span>
      </div>

      {/* 2. Ride Cymbal (Right) */}
      <div
        className={`drum-element ${activePads["ride"] ? "hit" : ""}`}
        style={{ right: "12%", top: "45px", width: "140px", height: "140px" }}
        onClick={() => handleHit("ride")}
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%" className="drum-pad-vector">
          {/* Stand */}
          <line x1="50" y1="50" x2="50" y2="150" stroke="#8e8e93" strokeWidth="3" />
          {/* Cymbal Outer */}
          <ellipse cx="50" cy="50" rx="48" ry="14" fill="#FF6D2D" stroke="#d4af37" strokeWidth="2" />
          <ellipse cx="50" cy="50" rx="46" ry="12" fill="url(#goldGrad)" />
          {/* Cymbal Bell */}
          <ellipse cx="50" cy="50" rx="14" ry="6" fill="#d4af37" />
          {/* Center Nut */}
          <circle cx="50" cy="50" r="2" fill="#3a3a3c" />
          {/* Hit effect ring */}
          <ellipse
            cx="50"
            cy="50"
            rx="49"
            ry="15"
            fill="none"
            stroke="var(--color-ride)"
            strokeWidth={activePads["ride"] ? "3" : "0"}
            opacity={activePads["ride"] ? "0.8" : "0"}
          />
        </svg>
        <span style={{ fontSize: "10px", fontWeight: "bold", position: "absolute", top: "10px", left: "40%", background: "#fff", padding: "2px 4px", borderRadius: "4px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", pointerEvents: "none" }}>RIDE [E]</span>
      </div>

      {/* 3. Hi-Hat (Left, under crash) */}
      <div
        className={`drum-element ${activePads["hihat-closed"] || activePads["hihat-open"] ? "hit" : ""}`}
        style={{ left: "20%", bottom: "140px", width: "110px", height: "110px" }}
        onClick={() => handleHit(activePads["hihat-open"] ? "hihat-open" : "hihat-closed")}
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%" className="drum-pad-vector">
          {/* Stand */}
          <line x1="50" y1="55" x2="50" y2="150" stroke="#8e8e93" strokeWidth="3" />
          {/* Bottom Cymbal */}
          <ellipse cx="50" cy="53" rx="38" ry="9" fill="#cca625" opacity="0.8" />
          {/* Top Cymbal */}
          <ellipse cx="50" cy="50" rx="40" ry="10" fill="url(#goldGrad)" stroke="#c6a300" strokeWidth="1.5" />
          {/* Bell */}
          <ellipse cx="50" cy="50" rx="10" ry="4" fill="#a88400" />
          {/* Clutch Nut */}
          <rect x="48" y="44" width="4" height="6" fill="#555" rx="1" />
          {/* Active ring indicator */}
          <ellipse
            cx="50"
            cy="50"
            rx="42"
            ry="11"
            fill="none"
            stroke="var(--color-hihat)"
            strokeWidth={activePads["hihat-closed"] || activePads["hihat-open"] ? "3" : "0"}
            opacity="0.8"
          />
        </svg>
        <span style={{ fontSize: "9px", fontWeight: "bold", position: "absolute", top: "5px", left: "20%", background: "#fff", padding: "2px 4px", borderRadius: "4px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", pointerEvents: "none" }}>HH [D/W]</span>
      </div>

      {/* 4. Snare Drum (Left Center) */}
      <div
        className={`drum-element ${activePads["snare"] ? "hit" : ""}`}
        style={{ left: "27%", bottom: "40px", width: "140px", height: "110px" }}
        onClick={() => handleHit("snare")}
      >
        <svg viewBox="0 0 120 100" width="100%" height="100%" className="drum-pad-vector">
          {/* Stand */}
          <path d="M 60 70 L 40 130 M 60 70 L 80 130 M 60 70 L 60 130" stroke="#8e8e93" strokeWidth="3" />
          {/* Snare Body */}
          <ellipse cx="60" cy="65" rx="48" ry="25" fill="#3a3a3c" />
          <rect x="12" y="45" width="96" height="20" fill="url(#snareBodyGrad)" />
          {/* Snare Head (Visual Top) */}
          <ellipse cx="60" cy="45" rx="48" ry="20" fill="#ffffff" stroke="#c7c7cc" strokeWidth="1" />
          {/* Snare Rim */}
          <ellipse cx="60" cy="43" rx="50" ry="21" fill="none" stroke="var(--color-snare)" strokeWidth="3" />
          <ellipse cx="60" cy="43" rx="50" ry="21" fill="none" stroke="#e5e5ea" strokeWidth="1" />
          {/* Trigger glow */}
          <ellipse
            cx="60"
            cy="43"
            rx="51"
            ry="22"
            fill="none"
            stroke="var(--color-snare)"
            strokeWidth={activePads["snare"] ? "4" : "0"}
            opacity="0.8"
          />
          <defs>
            <linearGradient id="snareBodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2c2c2e" />
              <stop offset="50%" stopColor="#48484a" />
              <stop offset="100%" stopColor="#2c2c2e" />
            </linearGradient>
          </defs>
        </svg>
        <span style={{ fontSize: "10px", fontWeight: "bold", position: "absolute", top: "5px", left: "35%", background: "#fff", padding: "2px 4px", borderRadius: "4px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", pointerEvents: "none" }}>SNARE [A]</span>
      </div>

      {/* 5. High Tom (Center Left) */}
      <div
        className={`drum-element ${activePads["tom-high"] ? "hit" : ""}`}
        style={{ left: "37%", bottom: "155px", width: "115px", height: "95px" }}
        onClick={() => handleHit("tom-high")}
      >
        <svg viewBox="0 0 100 80" width="100%" height="100%" className="drum-pad-vector">
          {/* Mount */}
          <path d="M 50 55 L 60 110" stroke="#8e8e93" strokeWidth="4" />
          {/* Tom Body */}
          <ellipse cx="50" cy="50" rx="38" ry="18" fill="#2c2c2e" />
          <rect x="12" y="32" width="76" height="18" fill="url(#tomBodyGrad)" />
          {/* Head */}
          <ellipse cx="50" cy="32" rx="38" ry="15" fill="#ffffff" stroke="#e5e5ea" strokeWidth="1" />
          {/* Rim */}
          <ellipse cx="50" cy="30" rx="40" ry="16" fill="none" stroke="var(--color-tom-high)" strokeWidth="3" />
          <ellipse cx="50" cy="30" rx="40" ry="16" fill="none" stroke="#ffffff" strokeWidth="1" />
        </svg>
        <span style={{ fontSize: "9px", fontWeight: "bold", position: "absolute", top: "5px", left: "32%", background: "#fff", padding: "2px 4px", borderRadius: "4px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", pointerEvents: "none" }}>TOM 1 [F]</span>
      </div>

      {/* 6. Mid Tom (Center Right) */}
      <div
        className={`drum-element ${activePads["tom-mid"] ? "hit" : ""}`}
        style={{ right: "37%", bottom: "155px", width: "115px", height: "95px" }}
        onClick={() => handleHit("tom-mid")}
      >
        <svg viewBox="0 0 100 80" width="100%" height="100%" className="drum-pad-vector">
          {/* Mount */}
          <path d="M 50 55 L 40 110" stroke="#8e8e93" strokeWidth="4" />
          {/* Tom Body */}
          <ellipse cx="50" cy="50" rx="38" ry="18" fill="#2c2c2e" />
          <rect x="12" y="32" width="76" height="18" fill="url(#tomBodyGrad)" />
          {/* Head */}
          <ellipse cx="50" cy="32" rx="38" ry="15" fill="#ffffff" stroke="#e5e5ea" strokeWidth="1" />
          {/* Rim */}
          <ellipse cx="50" cy="30" rx="40" ry="16" fill="none" stroke="var(--color-tom-mid)" strokeWidth="3" />
          <ellipse cx="50" cy="30" rx="40" ry="16" fill="none" stroke="#ffffff" strokeWidth="1" />
          <defs>
            <linearGradient id="tomBodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#1c1c1e" />
              <stop offset="50%" stopColor="#3a3a3c" />
              <stop offset="100%" stopColor="#1c1c1e" />
            </linearGradient>
          </defs>
        </svg>
        <span style={{ fontSize: "9px", fontWeight: "bold", position: "absolute", top: "5px", left: "32%", background: "#fff", padding: "2px 4px", borderRadius: "4px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", pointerEvents: "none" }}>TOM 2 [G]</span>
      </div>

      {/* 7. Floor Tom (Right Center) */}
      <div
        className={`drum-element ${activePads["tom-floor"] ? "hit" : ""}`}
        style={{ right: "25%", bottom: "35px", width: "150px", height: "120px" }}
        onClick={() => handleHit("tom-floor")}
      >
        <svg viewBox="0 0 120 100" width="100%" height="100%" className="drum-pad-vector">
          {/* Legs */}
          <line x1="20" y1="60" x2="10" y2="130" stroke="#8e8e93" strokeWidth="2.5" />
          <line x1="100" y1="60" x2="110" y2="130" stroke="#8e8e93" strokeWidth="2.5" />
          <line x1="60" y1="70" x2="60" y2="135" stroke="#8e8e93" strokeWidth="2.5" />
          {/* Tom Body */}
          <ellipse cx="60" cy="65" rx="48" ry="25" fill="#2c2c2e" />
          <rect x="12" y="38" width="96" height="27" fill="url(#tomBodyGrad)" />
          {/* Head */}
          <ellipse cx="60" cy="38" rx="48" ry="20" fill="#ffffff" stroke="#e5e5ea" strokeWidth="1" />
          {/* Rim */}
          <ellipse cx="60" cy="36" rx="50" ry="21" fill="none" stroke="var(--color-tom-floor)" strokeWidth="3" />
          <ellipse cx="60" cy="36" rx="50" ry="21" fill="none" stroke="#ffffff" strokeWidth="1" />
        </svg>
        <span style={{ fontSize: "10px", fontWeight: "bold", position: "absolute", top: "5px", left: "30%", background: "#fff", padding: "2px 4px", borderRadius: "4px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", pointerEvents: "none" }}>FLOOR TOM [H]</span>
      </div>

      {/* 8. Bass Drum / Kick (Bottom Center Back) */}
      <div
        className={`drum-element ${activePads["kick"] ? "hit" : ""}`}
        style={{ left: "50%", bottom: "25px", transform: "translateX(-50%)", width: "170px", height: "165px", zIndex: 1 }}
        onClick={() => handleHit("kick")}
      >
        <svg viewBox="0 0 140 140" width="100%" height="100%" className="drum-pad-vector">
          {/* Legs */}
          <path d="M 20 100 L 5 125 M 120 100 L 135 125" stroke="#8e8e93" strokeWidth="5" strokeLinecap="round" />
          {/* Drum Body */}
          <circle cx="70" cy="70" r="56" fill="url(#kickBodyGrad)" />
          {/* Front Head */}
          <circle cx="70" cy="70" r="54" fill="#ffffff" stroke="#aeaeb2" strokeWidth="1" />
          {/* Center Brand Area */}
          <ellipse cx="70" cy="70" rx="20" ry="10" fill="none" stroke="#aeaeb2" strokeWidth="0.5" />
          <text x="70" y="73" textAnchor="middle" fill="#8e8e93" fontSize="10" fontWeight="bold" fontFamily="var(--font-display)">DRUMUP</text>
          {/* Outer Rim */}
          <circle cx="70" cy="70" r="58" fill="none" stroke="var(--color-kick)" strokeWidth="4" />
          <circle cx="70" cy="70" r="58" fill="none" stroke="#2c2c2e" strokeWidth="1.5" />
          <defs>
            <radialGradient id="kickBodyGrad" cx="50%" cy="50%" r="50%">
              <stop offset="70%" stopColor="#2c2c2e" />
              <stop offset="100%" stopColor="#1c1c1e" />
            </radialGradient>
          </defs>
        </svg>
      </div>

      {/* 9. Bass Drum Pedal (Center Bottom Front) */}
      <div
        className="drum-element"
        style={{ left: "50%", bottom: "5px", transform: "translateX(-50%) scaleX(0.8)", width: "40px", height: "70px", zIndex: 2, pointerEvents: "none" }}
      >
        <svg viewBox="0 0 40 80" width="100%" height="100%">
          {/* Pedal Base */}
          <rect x="8" y="10" width="24" height="60" fill="#555" rx="3" />
          {/* Pedal Plate (active movement) */}
          <rect
            x="10"
            y={activePads["kick"] ? "16" : "12"}
            width="20"
            height={activePads["kick"] ? "50" : "56"}
            fill={activePads["kick"] ? "#c7c7cc" : "#8e8e93"}
            rx="2"
            style={{ transition: "all 0.05s" }}
          />
          {/* Chain */}
          <rect x="18" y="2" width="4" height="10" fill="#111" />
          {/* Beater Rod (only visible when not hit or animating) */}
          <line x1="20" y1="5" x2="20" y2="-20" stroke="#8e8e93" strokeWidth="3" />
          {/* Beater Head */}
          <circle cx="20" cy="-20" r="5" fill="#eaeaea" />
        </svg>
      </div>

      {/* 10. Hi-Hat Pedal (Bottom Left Front) */}
      <div
        className="drum-element"
        style={{ left: "26%", bottom: "5px", width: "40px", height: "70px", zIndex: 2, pointerEvents: "none" }}
      >
        <svg viewBox="0 0 40 80" width="100%" height="100%">
          {/* Pedal Base */}
          <rect x="8" y="10" width="24" height="60" fill="#555" rx="3" />
          {/* Pedal Plate */}
          <rect
            x="10"
            y={activePads["hihat-closed"] || activePads["hihat-pedal"] ? "16" : "12"}
            width="20"
            height={activePads["hihat-closed"] || activePads["hihat-pedal"] ? "50" : "56"}
            fill={activePads["hihat-closed"] || activePads["hihat-pedal"] ? "#c7c7cc" : "#8e8e93"}
            rx="2"
            style={{ transition: "all 0.05s" }}
          />
        </svg>
      </div>
    </div>
  );
};
