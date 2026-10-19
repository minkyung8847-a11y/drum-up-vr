import React, { useEffect, useMemo, useRef } from "react";
import type { DrumPadId, NoteEvent } from "../types";
import { formatAudioTime, getNoteProgress } from "./songPracticeTiming";

interface GameCanvasProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  notes: readonly NoteEvent[];
  onTimeUpdate: (audioTime: number) => void;
}

// Maps drum pad to specific color and lane coordinate percent (0 to 1)
const LANE_CONFIGS: Record<
  DrumPadId,
  { name: string; color: string; bottomX: number; topX: number }
> = {
  crash: { name: "Crash", color: "#FF6D2D", bottomX: 0.185, topX: 0.35 },
  "hihat-closed": { name: "Hi-Hat", color: "#FF6D2D", bottomX: 0.27, topX: 0.40 },
  "hihat-open": { name: "Hi-Hat", color: "#FF6D2D", bottomX: 0.27, topX: 0.40 },
  snare: { name: "Snare", color: "#FF6D2D", bottomX: 0.37, topX: 0.45 },
  kick: { name: "Kick", color: "#FF6D2D", bottomX: 0.50, topX: 0.50 },
  "tom-high": { name: "Tom 1", color: "#FF6D2D", bottomX: 0.60, topX: 0.55 },
  "tom-mid": { name: "Tom 2", color: "#FF6D2D", bottomX: 0.60, topX: 0.55 }, // group mid/high tom in same path visual
  "tom-floor": { name: "Floor Tom", color: "#FF6D2D", bottomX: 0.73, topX: 0.60 },
  ride: { name: "Ride", color: "#FF6D2D", bottomX: 0.815, topX: 0.65 },
  "hihat-pedal": { name: "HH Pedal", color: "#FF6D2D", bottomX: 0.27, topX: 0.40 },
};


export const GameCanvas: React.FC<GameCanvasProps> = ({ audioRef, notes, onTimeUpdate }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const debugRef = useRef<HTMLOutputElement | null>(null);
  const sortedNotes = useMemo(() => [...notes].sort((a, b) => a.time - b.time), [notes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let frameId = 0;

    const render = () => {
      // Read the media clock directly in the same frame that draws the notes.
      // No frame-delta integration, hit state, or React-state timing offsets.
      const audioTime = audioRef.current?.currentTime ?? 0;
      const rect = canvas.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const w = canvas.width;
      const h = canvas.height;
      const hitLineY = h - 70;
      // Clear canvas with subtle radial backdrop look
      ctx.clearRect(0, 0, w, h);
      
      // Draw grid lines
      ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);

      // Draw horizontal target line
      ctx.beginPath();
      ctx.moveTo(30, hitLineY);
      ctx.lineTo(w - 30, hitLineY);
      ctx.stroke();

      // Render the fanning lane lines
      const laneIds = Object.keys(LANE_CONFIGS) as DrumPadId[];
      
      // Filter duplicates for hihat (open/closed/pedal share closed position)
      const uniqueLanes = laneIds.filter(
        (id, index, self) =>
          self.findIndex((t) => LANE_CONFIGS[t].bottomX === LANE_CONFIGS[id].bottomX) === index
      );

      uniqueLanes.forEach((laneId) => {
        const lane = LANE_CONFIGS[laneId];
        const topX = w * lane.topX;
        const bottomX = w * lane.bottomX;

        ctx.beginPath();
        ctx.moveTo(topX, 0);
        ctx.lineTo(bottomX, hitLineY + 20);
        ctx.stroke();

        // Draw small target ring at hit position
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(bottomX, hitLineY, 15, 0, Math.PI * 2);
        ctx.stroke();

        // Restore dashed lines
        ctx.setLineDash([4, 6]);
      });

      ctx.setLineDash([]); // Reset line dash


      for (const note of sortedNotes) {
        const progress = getNoteProgress(note.time, audioTime);
        if (progress < 0) break;
        const noteY = progress * hitLineY;
        const radius = 12 + progress * 6;
        // Keep passed notes only until they leave the canvas; never consume them.
        // Seeking backward restores the same notes without rebuilding state.
        if (noteY - radius > h) continue;
        const lane = LANE_CONFIGS[note.padId];
        const topX = w * lane.topX;
        const bottomX = w * lane.bottomX;
        const noteX = topX + (bottomX - topX) * progress;

        ctx.beginPath();
        ctx.arc(noteX, noteY, radius, 0, Math.PI * 2);
        ctx.fillStyle = lane.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = lane.color;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(noteX, noteY, 4 + progress * 2, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }

      const nextNote = sortedNotes.find(note => note.time >= audioTime);
      if (debugRef.current) {
        debugRef.current.textContent = [
          "SYNC TEST · authored chart / test tones",
          `Audio Time: ${formatAudioTime(audioTime)}`,
          `Next Note: ${nextNote ? formatAudioTime(nextNote.time) : "--.---"}`,
          `Difference: ${nextNote ? formatAudioTime(nextNote.time - audioTime) : "--.---"}`,
        ].join("\n");
      }
      onTimeUpdate(audioTime);
      // Keep rendering while paused so seeks and resizes are reflected immediately.
      frameId = requestAnimationFrame(render);
    };
    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [audioRef, sortedNotes, onTimeUpdate]);

  return (
    <div className="rhythm-game-container">
      <output
        ref={debugRef}
        aria-label="Audio synchronization debug"
        aria-live="off"
        style={{ position: "absolute", top: 8, right: 12, zIndex: 1,
          pointerEvents: "none", whiteSpace: "pre", fontSize: 11,
          lineHeight: 1.5, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}
      />
      <canvas ref={canvasRef} className="canvas-element" />
    </div>
  );
};
