import { useState, useEffect, useRef, useCallback } from "react";

export const useMetronome = (bpm: number, onBeat?: (beatCount: number, time: number) => void) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  
  const bpmRef = useRef(bpm);
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  const onBeatRef = useRef(onBeat);
  useEffect(() => {
    onBeatRef.current = onBeat;
  }, [onBeat]);

  const timerIDRef = useRef<number | null>(null);
  const nextNoteTimeRef = useRef(0.0); // When the next note is due
  const beatCountRef = useRef(0); // Current beat in 4/4 time (0, 1, 2, 3)
  
  const scheduleAheadTime = 0.1; // How far ahead to schedule audio (seconds)
  const lookahead = 25.0; // How frequently to call scheduler (ms)

  const playClick = (time: number, isAccent: boolean) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Accent beat 1 (higher frequency)
    osc.frequency.value = isAccent ? 1200 : 800;
    
    gainNode.gain.setValueAtTime(0.3, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    osc.start(time);
    osc.stop(time + 0.06);
  };

  const scheduler = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    while (nextNoteTimeRef.current < ctx.currentTime + scheduleAheadTime) {
      const isAccent = beatCountRef.current % 4 === 0;
      
      // Play audio click
      playClick(nextNoteTimeRef.current, isAccent);
      
      // Trigger UI callback
      if (onBeatRef.current) {
        onBeatRef.current(beatCountRef.current, nextNoteTimeRef.current);
      }

      // Schedule next beat
      const secondsPerBeat = 60.0 / bpmRef.current;
      nextNoteTimeRef.current += secondsPerBeat;
      beatCountRef.current = (beatCountRef.current + 1) % 4;
    }

    timerIDRef.current = window.setTimeout(scheduler, lookahead);
  }, []);

  const start = useCallback(() => {
    if (isPlaying) return;
    
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!audioCtxRef.current && AudioCtx) {
      audioCtxRef.current = new AudioCtx();
    }
    
    const ctx = audioCtxRef.current;
    if (ctx) {
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      setIsPlaying(true);
      beatCountRef.current = 0;
      nextNoteTimeRef.current = ctx.currentTime + 0.05;
      scheduler();
    }
  }, [isPlaying, scheduler]);

  const stop = useCallback(() => {
    if (!isPlaying) return;
    setIsPlaying(false);
    if (timerIDRef.current) {
      clearTimeout(timerIDRef.current);
      timerIDRef.current = null;
    }
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      if (timerIDRef.current) {
        clearTimeout(timerIDRef.current);
      }
    };
  }, []);

  return {
    isPlaying,
    start,
    stop,
  };
};
