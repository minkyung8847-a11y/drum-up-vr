import React, { useEffect, useRef, useState } from "react";
import type { DrumPadId, NoteEvent } from "../types";

interface GameCanvasProps {
  isPlaying: boolean;
  songTime: number;
  notes: NoteEvent[];
  onNoteJudgement: (judgement: "perfect" | "great" | "good" | "miss", padId: DrumPadId) => void;
  lastHitEvent: { padId: DrumPadId; time: number } | null;
}

interface RenderNote {
  time: number;
  padId: DrumPadId;
  hit: boolean;
  id: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  size: number;
}

// Maps drum pad to specific color and lane coordinate percent (0 to 1)
const LANE_CONFIGS: Record<
  DrumPadId,
  { name: string; color: string; bottomX: number; topX: number }
> = {
  crash: { name: "Crash", color: "#ff9500", bottomX: 0.185, topX: 0.35 },
  "hihat-closed": { name: "Hi-Hat", color: "#ff2d55", bottomX: 0.27, topX: 0.40 },
  "hihat-open": { name: "Hi-Hat", color: "#ff2d55", bottomX: 0.27, topX: 0.40 },
  snare: { name: "Snare", color: "#34c759", bottomX: 0.37, topX: 0.45 },
  kick: { name: "Kick", color: "#00c781", bottomX: 0.50, topX: 0.50 },
  "tom-high": { name: "Tom 1", color: "#af52de", bottomX: 0.60, topX: 0.55 },
  "tom-mid": { name: "Tom 2", color: "#5856d6", bottomX: 0.60, topX: 0.55 }, // group mid/high tom in same path visual
  "tom-floor": { name: "Floor Tom", color: "#007aff", bottomX: 0.73, topX: 0.60 },
  ride: { name: "Ride", color: "#ffcc00", bottomX: 0.815, topX: 0.65 },
  "hihat-pedal": { name: "HH Pedal", color: "#ff2d55", bottomX: 0.27, topX: 0.40 },
};

// Timing windows in seconds
const TIMING_PERFECT = 0.05; // +/- 50ms
const TIMING_GREAT = 0.10;   // +/- 100ms
const TIMING_GOOD = 0.16;    // +/- 160ms
const TIMING_MISS = 0.22;    // Beyond 160ms is a Miss

export const GameCanvas: React.FC<GameCanvasProps> = ({
  isPlaying,
  songTime,
  notes,
  onNoteJudgement,
  lastHitEvent,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number | null>(null);
  
  // Track visual notes locally to handle hits and misses
  const [, setActiveNotes] = useState<RenderNote[]>([]);
  const activeNotesRef = useRef<RenderNote[]>([]);
  
  // Particle explosion pool
  const particlesRef = useRef<Particle[]>([]);
  const songTimeRef = useRef(0);
  
  // Last hit judgements for floating visual feedback
  const [judgementText, setJudgementText] = useState<{ text: string; color: string; id: number } | null>(null);

  // Sync refs to avoid canvas redraw closure stale states
  useEffect(() => {
    songTimeRef.current = songTime;
  }, [songTime]);

  // Load notes when the song selection or game state restarts
  useEffect(() => {
    const formatted: RenderNote[] = notes.map((n, idx) => ({
      time: n.time,
      padId: n.padId,
      hit: false,
      id: `${n.padId}-${n.time}-${idx}`,
    }));
    setActiveNotes(formatted);
    activeNotesRef.current = formatted;
  }, [notes, isPlaying]);

  // Listen for hits from keyboard/MIDI to evaluate timing windows
  useEffect(() => {
    if (!isPlaying || !lastHitEvent) return;
    const { padId } = lastHitEvent;

    // Normalise pad ID from App.tsx/MIDI input to GameCanvas keys
    let inputPadId = padId as string;
    if (inputPadId === "hihat") inputPadId = "hihat-closed";
    else if (inputPadId === "tom1") inputPadId = "tom-high";
    else if (inputPadId === "tom2") inputPadId = "tom-mid";
    else if (inputPadId === "tom3") inputPadId = "tom-floor";

    // Snare hits can count for snare, Hi-Hat hits for closed/open, etc.
    const targetPads: DrumPadId[] = [inputPadId as DrumPadId];
    if (inputPadId === "hihat-closed" || inputPadId === "hihat-open") {
      targetPads.push("hihat-closed", "hihat-open", "hihat-pedal");
    }

    // Find the closest unhit note in activeNotes for the targeted lanes
    let closestNote: RenderNote | null = null;
    let closestIndex = -1;
    let minDiff = Infinity;

    const currentNotes = activeNotesRef.current;
    for (let i = 0; i < currentNotes.length; i++) {
      const note = currentNotes[i];
      if (note.hit) continue;
      
      if (targetPads.includes(note.padId)) {
        const diff = Math.abs(songTimeRef.current - note.time);
        if (diff < minDiff && diff <= TIMING_MISS) {
          minDiff = diff;
          closestNote = note;
          closestIndex = i;
        }
      }
    }

    if (closestNote && closestIndex !== -1) {
      // Determine judgement category
      let scoreLabel: "perfect" | "great" | "good" | "miss";
      let displayColor = "#00c781";
      let displayText = "PERFECT";

      if (minDiff <= TIMING_PERFECT) {
        scoreLabel = "perfect";
        displayText = "PERFECT";
        displayColor = "#00c781";
      } else if (minDiff <= TIMING_GREAT) {
        scoreLabel = "great";
        displayText = "GREAT";
        displayColor = "#34c759";
      } else if (minDiff <= TIMING_GOOD) {
        scoreLabel = "good";
        displayText = "GOOD";
        displayColor = "#007aff";
      } else {
        scoreLabel = "miss";
        displayText = "MISS";
        displayColor = "#ff3b30";
      }

      // Mark the note as hit in the array
      const updated = [...currentNotes];
      updated[closestIndex] = { ...closestNote, hit: true };
      setActiveNotes(updated);
      activeNotesRef.current = updated;

      // Notify parent to update score / combo
      onNoteJudgement(scoreLabel, closestNote.padId);

      // Trigger floating text
      setJudgementText({ text: displayText, color: displayColor, id: Math.random() });

      // Spawn particles
      const canvas = canvasRef.current;
      if (canvas) {
        const laneCfg = LANE_CONFIGS[closestNote.padId];
        const hitX = canvas.width * laneCfg.bottomX;
        const hitY = canvas.height - 70;
        spawnParticles(hitX, hitY, laneCfg.color);
      }
    }
  }, [lastHitEvent, isPlaying]);

  const spawnParticles = (x: number, y: number, color: string) => {
    const arr: Particle[] = [];
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      arr.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1, // slight upward bias
        color,
        alpha: 1.0,
        size: 2 + Math.random() * 4,
      });
    }
    particlesRef.current.push(...arr);
  };

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const noteFallDuration = 2.0; // Seconds a note takes to reach the target line from top

    const render = () => {
      // 1. Resize canvas if layout container size changed
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }

      const w = canvas.width;
      const h = canvas.height;
      const hitLineY = h - 70; // 70px from bottom is the hit timing target

      // Clear canvas with subtle radial backdrop look
      ctx.clearRect(0, 0, w, h);
      
      // Draw grid lines
      ctx.strokeStyle = "rgba(0, 0, 0, 0.04)";
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
        ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(bottomX, hitLineY, 15, 0, Math.PI * 2);
        ctx.stroke();

        // Restore dashed lines
        ctx.setLineDash([4, 6]);
      });

      ctx.setLineDash([]); // Reset line dash

      if (isPlaying) {
        const currTime = songTimeRef.current;
        const currentNotes = activeNotesRef.current;
        const updatedNotes = [...currentNotes];
        let stateChanged = false;

        // Render falling notes
        currentNotes.forEach((note, index) => {
          // If note is far in the future, don't render it yet
          if (note.time > currTime + noteFallDuration) return;

          // If note is past the miss timing threshold and was not hit, mark as miss
          if (!note.hit && currTime - note.time > TIMING_MISS) {
            updatedNotes[index] = { ...note, hit: true }; // mark true so we don't score it again
            stateChanged = true;
            onNoteJudgement("miss", note.padId);
            setJudgementText({ text: "MISS", color: "#ff3b30", id: Math.random() });
            return;
          }

          // Don't render notes that have been successfully struck
          if (note.hit) return;

          const lane = LANE_CONFIGS[note.padId];
          const topX = w * lane.topX;
          const bottomX = w * lane.bottomX;

          // Calculate fall progress (0.0 at top, 1.0 at hit line)
          // timeRemaining: note.time is when it should be hit.
          // note enters screen at note.time - noteFallDuration.
          const progress = 1.0 - (note.time - currTime) / noteFallDuration;

          if (progress >= 0 && progress <= 1.3) {
            // Interpolate position along the fanning lane
            const noteX = topX + (bottomX - topX) * progress;
            const noteY = progress * hitLineY;

            // Draw note (colored ring matching pad theme color)
            ctx.beginPath();
            ctx.arc(noteX, noteY, 12 + progress * 6, 0, Math.PI * 2); // gets slightly larger as it approaches screen bottom
            
            // Outer glow or filled circle
            ctx.fillStyle = lane.color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = lane.color;
            ctx.fill();
            ctx.shadowBlur = 0; // reset shadow

            // White center inner circle for better visibility
            ctx.beginPath();
            ctx.arc(noteX, noteY, 4 + progress * 2, 0, Math.PI * 2);
            ctx.fillStyle = "#ffffff";
            ctx.fill();
          }
        });

        if (stateChanged) {
          setActiveNotes(updatedNotes);
          activeNotesRef.current = updatedNotes;
        }
      }

      // Update and draw particles
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.03;
        
        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
      }
      ctx.globalAlpha = 1.0; // reset alpha

      requestRef.current = requestAnimationFrame(render);
    };

    requestRef.current = requestAnimationFrame(render);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isPlaying]);

  return (
    <div className="rhythm-game-container">
      {/* Floating Judgement text overlay */}
      {judgementText && (
        <div
          key={judgementText.id}
          className="judgement-overlay"
          style={{ color: judgementText.color }}
        >
          {judgementText.text}
        </div>
      )}
      <canvas ref={canvasRef} className="canvas-element" />
    </div>
  );
};
