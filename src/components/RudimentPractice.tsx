import React, { useEffect, useRef, useState } from "react";
import type { GameScore } from "../types";

type DrumPadId = "kick" | "snare" | "hihat" | "tom1" | "tom2" | "tom3" | "crash" | "ride";
type RudimentDifficulty = "EASY" | "NORMAL" | "HARD";
type Judgement = "perfect" | "good" | "miss";

interface RudimentPracticeProps {
  difficulty: RudimentDifficulty;
  bpm: number;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  lastHitEvent: { padId: DrumPadId; time: number } | null;
  score: GameScore;
  setScore: React.Dispatch<React.SetStateAction<GameScore>>;
  onChangeDifficulty: () => void;
  drumScreenPositions: Record<DrumPadId, { x: number; y: number }> | null;
  setMetronomeOn?: (on: boolean) => void;
}

interface RudimentStep {
  hand: "L" | "R";
  padId: DrumPadId;
}

interface FallingNote extends RudimentStep {
  id: string;
  time: number;
  hit: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  color: string;
}

const LANE_CONFIG: Record<DrumPadId, { x: number; color: string; label: string }> = {
  crash: { x: 0.18, color: "#FF6D2D", label: "CRASH" },
  hihat: { x: 0.30, color: "#FF6D2D", label: "HI-HAT" },
  snare: { x: 0.42, color: "#FF6D2D", label: "SNARE" },
  tom1: { x: 0.50, color: "#FF6D2D", label: "TOM 1" },
  kick: { x: 0.56, color: "#FF6D2D", label: "KICK" },
  tom2: { x: 0.64, color: "#FF6D2D", label: "TOM 2" },
  tom3: { x: 0.74, color: "#FF6D2D", label: "FLOOR" },
  ride: { x: 0.86, color: "#FF6D2D", label: "RIDE" },
};

const RUDIMENTS: Record<RudimentDifficulty, {
  title: string;
  subtitle: string;
  subdivision: 4 | 8 | 16;
  fallDuration: number;
  pattern: RudimentStep[];
}> = {
  EASY: {
    title: "EASY Pattern",
    subtitle: "Snare x2 -> Tom 1 x2 -> Tom 2 x2 -> Floor Tom x2 -> Kick x2",
    subdivision: 4,
    fallDuration: 5.5,
    pattern: [
      { hand: "R", padId: "snare" },
      { hand: "L", padId: "snare" },
      { hand: "R", padId: "tom1" },
      { hand: "L", padId: "tom1" },
      { hand: "R", padId: "tom2" },
      { hand: "L", padId: "tom2" },
      { hand: "R", padId: "tom3" },
      { hand: "L", padId: "tom3" },
      { hand: "R", padId: "kick" },
      { hand: "L", padId: "kick" },
    ],
  },
  NORMAL: {
    title: "Basic Cycle (Normal)",
    subtitle: "Snare -> Tom 1 -> Tom 2 -> Floor Tom",
    subdivision: 4,
    fallDuration: 5.0,
    pattern: [
      { hand: "R", padId: "snare" },
      { hand: "L", padId: "tom1" },
      { hand: "R", padId: "tom2" },
      { hand: "L", padId: "tom3" },
    ],
  },
  HARD: {
    title: "Basic Cycle (Hard)",
    subtitle: "Snare -> Tom 1 -> Tom 2 -> Floor Tom",
    subdivision: 4,
    fallDuration: 4.5,
    pattern: [
      { hand: "R", padId: "snare" },
      { hand: "L", padId: "tom1" },
      { hand: "R", padId: "tom2" },
      { hand: "L", padId: "tom3" },
    ],
  },
};

const PERFECT_WINDOW = 0.09;
const GOOD_WINDOW = 0.22;
const MISS_WINDOW = 0.30;
const TOTAL_NOTES = 40;

const PAD_RADII: Record<DrumPadId, number> = {
  kick: 45,
  snare: 44,
  tom1: 34,
  tom2: 36,
  tom3: 42,
  hihat: 32,
  crash: 44,
  ride: 46,
};

const PART_COLORS: Record<DrumPadId, string> = {
  crash: "#FF6D2D", // Pastel Sand Gold
  ride: "#FF6D2D",  // Same as Crash
  hihat: "#FF6D2D", // Pastel Rose Pink
  snare: "#FF6D2D", // Pastel Sky Blue
  kick: "#FF6D2D",  // Pastel Mint Green
  tom1: "#FF6D2D",  // Stronger Pastel Lilac Lavender
  tom2: "#FF6D2D",  // Stronger Pastel Periwinkle Blue
  tom3: "#FF6D2D",  // Stronger Pastel Salmon Coral
};

const hexToRgba = (hex: string, alpha: number) => {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const playCheeringAudio = () => {
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();

  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(120, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(750, ctx.currentTime + 1.4);
  oscGain.gain.setValueAtTime(0.001, ctx.currentTime);
  oscGain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.3);
  oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.4);
  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 1.4);

  const bufferSize = ctx.sampleRate * 3.5;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = buffer;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.setValueAtTime(950, ctx.currentTime);
  bandpass.Q.setValueAtTime(1.0, ctx.currentTime);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.001, ctx.currentTime);
  noiseGain.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.5);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3.5);

  noiseSource.connect(bandpass);
  bandpass.connect(noiseGain);
  noiseGain.connect(ctx.destination);

  noiseSource.start();
  noiseSource.stop(ctx.currentTime + 3.5);

  for (let i = 0; i < 12; i++) {
    const clapTime = ctx.currentTime + 0.4 + Math.random() * 2.2;
    const oscClap = ctx.createOscillator();
    const clapGain = ctx.createGain();
    
    oscClap.type = "triangle";
    oscClap.frequency.value = 180 + Math.random() * 100;
    
    clapGain.gain.setValueAtTime(0.001, clapTime);
    clapGain.gain.linearRampToValueAtTime(0.1, clapTime + 0.015);
    clapGain.gain.exponentialRampToValueAtTime(0.001, clapTime + 0.12);
    
    oscClap.connect(clapGain);
    clapGain.connect(ctx.destination);
    oscClap.start(clapTime);
    oscClap.stop(clapTime + 0.15);
  }
};

export const RudimentPractice: React.FC<RudimentPracticeProps> = ({
  difficulty,
  bpm,
  isPlaying,
  setIsPlaying,
  lastHitEvent,
  score,
  setScore,
  onChangeDifficulty,
  drumScreenPositions,
  setMetronomeOn,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const notesRef = useRef<FallingNote[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const lastScheduledIndexRef = useRef<number>(-1);
  const judgementTimeoutRef = useRef<number | null>(null);
  const lastConsumedHitTimeRef = useRef<number>(0);

  const [judgement, setJudgement] = useState<{ text: string; color: string; id: number } | null>(null);
  const [countdown, setCountdown] = useState<number | string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const countdownRef = useRef<number | string | null>(null);
  countdownRef.current = countdown;

  const judgementsRef = useRef<{
    id: string;
    text: string;
    color: string;
    x: number;
    y: number;
    life: number;
    maxLife: number;
  }[]>([]);

  const hitWavesRef = useRef<{
    id: string;
    x: number;
    y: number;
    color: string;
    life: number;
    maxLife: number;
    maxRadius: number;
  }[]>([]);

  const [isBoosterActive, setIsBoosterActive] = useState(false);
  const isBoosterActiveRef = useRef(false);
  isBoosterActiveRef.current = isBoosterActive;
  const boosterStartTimeRef = useRef<number>(0);

  useEffect(() => {
    setCountdown(3);
    const t1 = setTimeout(() => setCountdown(2), 1000);
    const t2 = setTimeout(() => setCountdown(1), 2000);
    const t3 = setTimeout(() => {
      setCountdown("GO!");
      startTimeRef.current = performance.now();
      lastScheduledIndexRef.current = -1;
      notesRef.current = [];
    }, 3000);
    const t4 = setTimeout(() => setCountdown(null), 4000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [difficulty, retryCount]);
  useEffect(() => {
    if (score.combo === 10) {
      setIsBoosterActive(true);
      boosterStartTimeRef.current = performance.now();
      playCheeringAudio();

      setScore((prev) => ({
        ...prev,
        combo: 0,
      }));

      const timer = setTimeout(() => {
        setIsBoosterActive(false);
      }, 3500);

      return () => clearTimeout(timer);
    }
  }, [score.combo, setScore]);
  const rudiment = RUDIMENTS[difficulty];

  const updateScore = (result: Judgement) => {
    setScore((prev) => {
      const nextPerfect = prev.perfect + (result === "perfect" ? 1 : 0);
      const nextGood = prev.good + (result === "good" ? 1 : 0);
      const nextMiss = prev.miss + (result === "miss" ? 1 : 0);
      const nextCombo = result === "perfect" ? prev.combo + 1 : 0;
      const totalNotes = nextPerfect + prev.great + nextGood + nextMiss;

      const nextScore = Number(((nextPerfect * 100 + nextGood * 70) / TOTAL_NOTES).toFixed(1));
      const accuracy = totalNotes > 0 ? Math.round(((nextPerfect + nextGood * 0.7) / totalNotes) * 100) : 0;

      return {
        score: nextScore,
        combo: nextCombo,
        maxCombo: Math.max(prev.maxCombo, nextCombo),
        perfect: nextPerfect,
        great: prev.great,
        good: nextGood,
        miss: nextMiss,
        accuracy,
      };
    });
  };

  const showJudgement = (result: Judgement) => {
    const config = {
      perfect: { text: "PERFECT", color: "#FF6D2D" },
      good: { text: "GOOD", color: "#FF6D2D" },
      miss: { text: "MISS", color: "#FF6D2D" },
    }[result];

    setJudgement({ ...config, id: Math.random() });
    if (judgementTimeoutRef.current) window.clearTimeout(judgementTimeoutRef.current);
    judgementTimeoutRef.current = window.setTimeout(() => setJudgement(null), 520);
  };

  const spawnParticles = (x: number, y: number, color: string) => {
    const count = isBoosterActiveRef.current ? 35 : 18;
    const speedMultiplier = isBoosterActiveRef.current ? 1.8 : 1.0;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (1.3 + Math.random() * 3.6) * speedMultiplier;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1,
        color,
      });
    }
  };

  const currentTime = () => (performance.now() - startTimeRef.current) / 1000;

  useEffect(() => {
    notesRef.current = [];
    particlesRef.current = [];
    lastScheduledIndexRef.current = -1;
    startTimeRef.current = performance.now();
  }, [difficulty]);

  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    startTimeRef.current = performance.now();
    notesRef.current = [];
    particlesRef.current = [];
    lastScheduledIndexRef.current = -1;

    const render = () => {
      if (!canvasRef.current || !isPlaying) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const nextWidth = Math.max(1, Math.floor(rect.width * dpr));
      const nextHeight = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = rect.width;
      const h = rect.height;
      const hitLineY = h - 32;
      const isCountingDown = countdownRef.current !== null && countdownRef.current !== "GO!";
      const elapsed = isCountingDown ? 0 : currentTime();

      ctx.clearRect(0, 0, w, h);

      if (isBoosterActiveRef.current) {
        ctx.fillStyle = "rgba(10, 10, 15, 0.68)";
        ctx.fillRect(0, 0, w, h);

        const time = (performance.now() - boosterStartTimeRef.current) / 1000;

        const spotlightColors = ["rgba(255, 109, 45, 0.22)", "rgba(255, 109, 45, 0.22)", "rgba(255, 109, 45, 0.22)", "rgba(255, 109, 45, 0.22)"];
        const startPoints = [
          { x: 0, y: 0, targetX: w * 0.35, targetY: h * 0.85 },
          { x: w, y: 0, targetX: w * 0.65, targetY: h * 0.85 },
          { x: w * 0.18, y: 0, targetX: w * 0.5, targetY: h * 0.8 },
          { x: w * 0.82, y: 0, targetX: w * 0.5, targetY: h * 0.8 }
        ];
        
        startPoints.forEach((pt, index) => {
          const timePhase = time * 2.5 + index * 1.2;
          const sweepOffset = Math.sin(timePhase) * 60;
          const targetX = pt.targetX + sweepOffset;
          const targetY = pt.targetY;
          
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
          
          const dx = targetX - pt.x;
          const dy = targetY - pt.y;
          const angle = Math.atan2(dy, dx);
          
          const leftX = targetX - 55 * Math.sin(angle);
          const leftY = targetY + 55 * Math.cos(angle);
          const rightX = targetX + 55 * Math.sin(angle);
          const rightY = targetY - 55 * Math.cos(angle);
          
          ctx.lineTo(leftX, leftY);
          ctx.lineTo(rightX, rightY);
          ctx.closePath();
          
          ctx.fillStyle = spotlightColors[index];
          ctx.fill();
          ctx.restore();
        });

        ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
        ctx.lineWidth = 1.5;
        for (let k = 0; k < 6; k++) {
          ctx.beginPath();
          ctx.moveTo(w / 2, h * 0.35);
          ctx.lineTo(w * (k - 0.5) * 0.4, h);
          ctx.stroke();
        }

        ctx.fillStyle = "rgba(6, 6, 8, 0.95)";
        ctx.beginPath();
        ctx.moveTo(0, h);
        const leftCrowdCount = 6;
        const leftSpacing = (w * 0.28) / (leftCrowdCount - 1);
        for (let i = 0; i < leftCrowdCount; i++) {
          const headX = i * leftSpacing;
          const headY = h - 25 - (i * 20) - Math.sin(i * 1.7) * 8;
          ctx.quadraticCurveTo(headX - leftSpacing / 2, headY - 10, headX, headY);
        }
        ctx.lineTo(w * 0.28, h);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(w * 0.72, h);
        const rightCrowdCount = 6;
        const rightSpacing = (w * 0.28) / (rightCrowdCount - 1);
        for (let i = 0; i < rightCrowdCount; i++) {
          const headX = w * 0.72 + i * rightSpacing;
          const headY = h - 25 - ((rightCrowdCount - 1 - i) * 20) - Math.sin(i * 1.7) * 8;
          ctx.quadraticCurveTo(headX - rightSpacing / 2, headY - 10, headX, headY);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();

        const stickColors = ["#FF6D2D", "#FF6D2D", "#FF6D2D", "#FF6D2D", "#FF6D2D"];
        for (let i = 0; i < leftCrowdCount; i++) {
          if (i % 2 === 0) {
            const headX = i * leftSpacing;
            const headY = h - 25 - (i * 20) - Math.sin(i * 1.7) * 8;
            const stickColor = stickColors[i % stickColors.length];
            const oscStick = Math.sin(time * 5.0 + i) * 0.5 + 0.3;
            
            ctx.save();
            ctx.strokeStyle = stickColor;
            ctx.lineWidth = 4.5;
            ctx.lineCap = "round";
            ctx.shadowColor = stickColor;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(headX, headY);
            ctx.lineTo(headX + 24 * Math.sin(oscStick), headY - 24 * Math.cos(oscStick));
            ctx.stroke();
            ctx.restore();
          }
        }

        for (let i = 0; i < rightCrowdCount; i++) {
          if (i % 2 === 0) {
            const headX = w * 0.72 + i * rightSpacing;
            const headY = h - 25 - ((rightCrowdCount - 1 - i) * 20) - Math.sin(i * 1.7) * 8;
            const stickColor = stickColors[i % stickColors.length];
            const oscStick = Math.sin(time * 5.0 + i) * 0.5 - 0.3;
            
            ctx.save();
            ctx.strokeStyle = stickColor;
            ctx.lineWidth = 4.5;
            ctx.lineCap = "round";
            ctx.shadowColor = stickColor;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(headX, headY);
            ctx.lineTo(headX + 24 * Math.sin(oscStick), headY - 24 * Math.cos(oscStick));
            ctx.stroke();
            ctx.restore();
          }
        }

        ctx.save();
        ctx.font = "900 24px Outfit, Inter, sans-serif";
        ctx.fillStyle = "rgba(255, 109, 45, 0.92)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "#FF6D2D";
        ctx.shadowBlur = 10;
        ctx.fillText("POWER UP BOOSTER!", w / 2, h * 0.45);
        ctx.restore();
      }

      const secondsPerBeat = 60 / bpm;
      const baseSecondsPerNote = secondsPerBeat * (4 / rudiment.subdivision);
      const secondsPerNote = baseSecondsPerNote * 2.0;
      const lookahead = rudiment.fallDuration + 1.0;
      const targetIndex = Math.min(
        TOTAL_NOTES - 1,
        Math.floor((elapsed + lookahead) / secondsPerNote)
      );

      if (isCountingDown) {
        notesRef.current = [];
        lastScheduledIndexRef.current = -1;
      } else {
        for (let i = lastScheduledIndexRef.current + 1; i <= targetIndex; i++) {
          const step = rudiment.pattern[i % rudiment.pattern.length];
          notesRef.current.push({
            id: `${difficulty}-${i}`,
            time: i * secondsPerNote + rudiment.fallDuration + 1.0,
            hit: false,
            ...step,
          });
          lastScheduledIndexRef.current = i;
        }
      }

      const vanishingX = w / 2;
      const vanishingY = 80;

      const getProjectedCoords = (tX: number, tY: number, rawProgress: number) => {
        const p = Math.max(0, Math.min(1.18, rawProgress));
        const depth = 1.0 - p;
        const focus = 0.22;
        const k = focus / (focus + depth);
        const kMin = focus / (focus + 1.0);
        const projectedProgress = (k - kMin) / (1.0 - kMin);
        return {
          x: vanishingX + projectedProgress * (tX - vanishingX),
          y: vanishingY + projectedProgress * (tY - vanishingY),
          projectedProgress,
        };
      };

      ctx.lineWidth = 1;
      Object.entries(LANE_CONFIG).forEach(([padId, lane]) => {
        let x = lane.x * w;
        let y = hitLineY;
        if (drumScreenPositions && drumScreenPositions[padId as DrumPadId]) {
          x = drumScreenPositions[padId as DrumPadId].x;
          y = drumScreenPositions[padId as DrumPadId].y;
        }

        const isActiveLane = notesRef.current.some((note) => !note.hit && note.padId === padId);
        ctx.strokeStyle = isActiveLane ? "rgba(255, 109, 45, 0.16)" : "rgba(255, 255, 255, 0.05)";
        ctx.setLineDash([4, 7]);
        ctx.beginPath();
        ctx.moveTo(vanishingX, vanishingY);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.setLineDash([]);

        const padRadius = PAD_RADII[padId as DrumPadId] || 19;
        const color = PART_COLORS[padId as DrumPadId];
        const isCymbal = padId === "crash" || padId === "ride" || padId === "hihat";

        const radiusX = padRadius;
        const radiusY = padRadius * (
          padId === "snare" ? 0.72 :
          padId === "tom1" || padId === "tom2" ? 0.62 :
          padId === "tom3" ? 0.70 :
          padId === "kick" ? 0.75 :
          padId === "hihat" ? 0.48 :
          padId === "crash" ? 0.44 : 0.42 // ride
        );
        const rotation = (
          padId === "snare" ? -0.15 :
          padId === "tom1" ? 0.2 :
          padId === "tom2" ? -0.2 :
          padId === "tom3" ? 0.1 :
          padId === "hihat" ? 0.12 :
          padId === "crash" ? -0.32 :
          padId === "ride" ? 0.32 : 0
        );

        ctx.save();
        ctx.beginPath();
        ctx.ellipse(x, y, radiusX, radiusY, rotation, 0, Math.PI * 2);

        if (isCymbal) {
          ctx.fillStyle = hexToRgba(color, 0.08);
          ctx.fill();

          ctx.strokeStyle = hexToRgba(color, 0.5);
          ctx.lineWidth = 1.5;
          ctx.shadowColor = color;
          ctx.shadowBlur = 8;
          ctx.stroke();
        } else {
          ctx.fillStyle = hexToRgba(color, 0.12);
          ctx.fill();

          ctx.strokeStyle = hexToRgba(color, 0.6);
          ctx.lineWidth = 2.0;
          ctx.shadowColor = color;
          ctx.shadowBlur = 10;
          ctx.stroke();
        }
        ctx.restore();

        ctx.font = "700 9px Inter, sans-serif";
        ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
        ctx.textAlign = "center";
        ctx.fillText(lane.label, x, y + radiusY + 14);
      });

      for (let i = hitWavesRef.current.length - 1; i >= 0; i--) {
        const wave = hitWavesRef.current[i];
        wave.life -= 0.016;
        if (wave.life <= 0) {
          hitWavesRef.current.splice(i, 1);
          continue;
        }
        const progress = 1.0 - (wave.life / wave.maxLife);
        const radius = wave.maxRadius * progress;
        const alpha = 1.0 - progress;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.strokeStyle = wave.color;
        ctx.shadowColor = wave.color;
        ctx.shadowBlur = 12;
        ctx.lineWidth = 3.0;
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, radius * 0.72, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      for (let i = notesRef.current.length - 1; i >= 0; i--) {
        const note = notesRef.current[i];
        const lateBy = elapsed - note.time;

        if (!note.hit && lateBy > MISS_WINDOW) {
          notesRef.current.splice(i, 1);

          const lane = LANE_CONFIG[note.padId];
          let targetX = lane.x * w;
          let targetY = hitLineY;
          if (drumScreenPositions && drumScreenPositions[note.padId]) {
            targetX = drumScreenPositions[note.padId].x;
            targetY = drumScreenPositions[note.padId].y;
          }

          judgementsRef.current.push({
            id: Math.random().toString(),
            text: "MISS",
            color: "#FF6D2D",
            x: targetX,
            y: targetY - 25,
            life: 0.8,
            maxLife: 0.8,
          });

          showJudgement("miss");
          updateScore("miss");
          continue;
        }

        if (note.hit) {
          notesRef.current.splice(i, 1);
          continue;
        }

        const progress = 1 - (note.time - elapsed) / rudiment.fallDuration;
        if (progress < -0.1 || progress > 1.18) continue;

        const lane = LANE_CONFIG[note.padId];
        let targetX = lane.x * w;
        let targetY = hitLineY;
        if (drumScreenPositions && drumScreenPositions[note.padId]) {
          targetX = drumScreenPositions[note.padId].x;
          targetY = drumScreenPositions[note.padId].y;
        }

        const proj = getProjectedCoords(targetX, targetY, progress);
        const x = proj.x;
        const y = proj.y;
        const targetRadius = PAD_RADII[note.padId] || 35;
        const radius = targetRadius * (0.22 + 0.78 * proj.projectedProgress);
        const opacity = 0.1 + 0.9 * proj.projectedProgress;

        const color = PART_COLORS[note.padId];
        ctx.save();
        ctx.globalAlpha = opacity;

        const radiusX = radius;
        const radiusY = radius * (
          note.padId === "snare" ? 0.72 :
          note.padId === "tom1" || note.padId === "tom2" ? 0.62 :
          note.padId === "tom3" ? 0.70 :
          note.padId === "kick" ? 0.75 :
          note.padId === "hihat" ? 0.48 :
          note.padId === "crash" ? 0.44 : 0.42 // ride
        );
        const rotation = (
          note.padId === "snare" ? -0.15 :
          note.padId === "tom1" ? 0.2 :
          note.padId === "tom2" ? -0.2 :
          note.padId === "tom3" ? 0.1 :
          note.padId === "hihat" ? 0.12 :
          note.padId === "crash" ? -0.32 :
          note.padId === "ride" ? 0.32 : 0
        );

        ctx.shadowColor = color;
        ctx.shadowBlur = 0;

        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.scale(1, radiusY / radiusX);

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, radiusX, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = hexToRgba(color, 0.85);
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.restore();
      }

      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const particle = particlesRef.current[i];
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.alpha -= 0.035;
        particle.vy += 0.04;

        if (particle.alpha <= 0) {
          particlesRef.current.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(particle.color, particle.alpha);
        ctx.fill();
      }

      const dt = 0.016;
      for (let i = judgementsRef.current.length - 1; i >= 0; i--) {
        const j = judgementsRef.current[i];
        j.life -= dt;

        if (j.life <= 0) {
          judgementsRef.current.splice(i, 1);
          continue;
        }

        const progress = j.life / j.maxLife;
        let alpha = 1.0;
        if (progress > 0.85) {
          alpha = (1.0 - progress) / 0.15;
        } else {
          alpha = progress / 0.85;
        }

        const yOffset = -22 * (1.0 - progress);

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.font = "800 13px Outfit, Inter, sans-serif";
        ctx.fillStyle = j.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.shadowColor = "rgba(0, 0, 0, 0.16)";
        ctx.shadowBlur = 4;

        ctx.fillText(j.text, j.x, j.y + yOffset);
        ctx.restore();
      }

      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [bpm, difficulty, isPlaying, rudiment, setScore, drumScreenPositions]);

  useEffect(() => {
    if (!isPlaying || !lastHitEvent || lastHitEvent.time === lastConsumedHitTimeRef.current) return;
    if (countdownRef.current !== null && countdownRef.current !== "GO!") return;
    lastConsumedHitTimeRef.current = lastHitEvent.time;

    const elapsed = currentTime();
    let closestIndex = -1;
    let closestDiff = Infinity;

    notesRef.current.forEach((note, index) => {
      if (note.hit || note.padId !== lastHitEvent.padId) return;
      const diff = Math.abs(elapsed - note.time);
      if (diff < closestDiff && diff <= GOOD_WINDOW) {
        closestDiff = diff;
        closestIndex = index;
      }
    });

    if (closestIndex === -1) return;

    const note = notesRef.current[closestIndex];
    const lane = LANE_CONFIG[note.padId];
    notesRef.current[closestIndex] = { ...note, hit: true };

    const result: Judgement = closestDiff <= PERFECT_WINDOW ? "perfect" : "good";
    showJudgement(result);
    updateScore(result);

    const canvas = canvasRef.current;
    if (canvas) {
      let x = lane.x * canvas.width; // rough fallback setup
      let y = canvas.height - 32;     // rough fallback setup
      if (drumScreenPositions && drumScreenPositions[note.padId]) {
        x = drumScreenPositions[note.padId].x;
        y = drumScreenPositions[note.padId].y;
      } else {
        const rect = canvas.getBoundingClientRect();
        x = lane.x * rect.width;
        y = rect.height - 32;
      }

      judgementsRef.current.push({
        id: Math.random().toString(),
        text: result.toUpperCase(),
        color: result === "perfect" ? "#FF6D2D" : "#FF6D2D",
        x,
        y: y - 25,
        life: 0.8,
        maxLife: 0.8,
      });

      hitWavesRef.current.push({
        id: Math.random().toString(),
        x,
        y,
        color: lane.color,
        life: 0.35,
        maxLife: 0.35,
        maxRadius: isBoosterActiveRef.current ? 110 : 55,
      });

      spawnParticles(x, y, lane.color);
    }
  }, [isPlaying, lastHitEvent, drumScreenPositions]);

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (judgementTimeoutRef.current) window.clearTimeout(judgementTimeoutRef.current);
    };
  }, []);

  const processedCount = score.perfect + score.great + score.good + score.miss;
  const progressPercent = Math.min(100, Math.floor((processedCount / TOTAL_NOTES) * 100));
  const isCompleted = processedCount >= TOTAL_NOTES;

  useEffect(() => {
    if (isCompleted && isPlaying) {
      setIsPlaying(false);
      if (setMetronomeOn) {
        setMetronomeOn(false);
      }
    }
  }, [isCompleted, isPlaying, setIsPlaying, setMetronomeOn]);

  const handleRetry = () => {
    setScore({
      score: 0,
      combo: 0,
      maxCombo: 0,
      perfect: 0,
      great: 0,
      good: 0,
      miss: 0,
      accuracy: 0,
    });
    notesRef.current = [];
    judgementsRef.current = [];
    lastScheduledIndexRef.current = -1;
    setRetryCount((prev) => prev + 1);
    setIsPlaying(true);
  };

  const handleExit = () => {
    if (setMetronomeOn) {
      setMetronomeOn(false);
    }
    onChangeDifficulty();
  };

  return (
    <div className={`rudiment-practice ${isBoosterActive ? "booster-active" : ""}`}>
      {!isCompleted && (
        <div className="rudiment-progress-container">
          <div className="rudiment-progress-bar-bg">
            <div className="rudiment-progress-bar-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <span className="rudiment-progress-text">{progressPercent}%</span>
        </div>
      )}

      {!isCompleted && (
        <div className="rudiment-live-stats">
          <div className="live-stat-item perfect">
            <span>PERFECT</span>
            <strong>{String(score.perfect).padStart(2, '0')}</strong>
          </div>
          <div className="live-stat-item good">
            <span>GOOD</span>
            <strong>{String(score.good).padStart(2, '0')}</strong>
          </div>
          <div className="live-stat-item miss">
            <span>MISS</span>
            <strong>{String(score.miss).padStart(2, '0')}</strong>
          </div>
        </div>
      )}

      {countdown !== null && (
        <div key={countdown} className="countdown-overlay">
          {countdown}
        </div>
      )}

      {countdown !== null && (
        <div className={`countdown-dim-overlay ${countdown === "GO!" ? "fade-out" : ""}`} />
      )}

      {judgement && (
        <div key={judgement.id} className="judgement-overlay rudiment-judgement" style={{ color: judgement.color }}>
          <div>{judgement.text}</div>
          {judgement.text === "PERFECT" && score.combo > 0 && (
            <div className="judgement-combo">COMBO ×{score.combo}</div>
          )}
        </div>
      )}

      {isCompleted && (
        <div className="rudiment-result-overlay">
          <div className="rudiment-result-card">
            <h2>COMPLETE!</h2>
            
            <div className="result-stats-grid">
              <div className="stat-row">
                <span>PERFECT</span>
                <strong>{score.perfect}</strong>
              </div>
              <div className="stat-row">
                <span>GOOD</span>
                <strong>{score.good}</strong>
              </div>
              <div className="stat-row">
                <span>MISS</span>
                <strong>{score.miss}</strong>
              </div>
            </div>

            <div className="result-divider" />

            <div className="result-large-stats">
              <div className="large-stat-block">
                <span>TOTAL SCORE</span>
                <strong>{score.score}</strong>
              </div>
              <div className="large-stat-block">
                <span>ACCURACY</span>
                <strong>{score.accuracy}%</strong>
              </div>
            </div>

            <div className="result-actions-row">
              <button className="result-btn primary-btn" onClick={handleRetry}>
                RETRY
              </button>
              <button className="result-btn secondary-btn" onClick={handleExit}>
                EXIT
              </button>
            </div>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="rudiment-note-canvas" />
    </div>
  );
};
