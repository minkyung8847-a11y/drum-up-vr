import type { DrumPadId, NoteEvent } from "../types";

// Seconds from the top of the existing highway to its hit line.
export const NOTE_TRAVEL_TIME = 2.0;
export const TEST_TRACK_DURATION = 30;

export type DrumChartType = "kick" | "snare" | "hihat" | "tom1" | "tom2" | "floorTom" | "crash" | "ride";
export interface DrumChartNote {
  readonly time: number; // Absolute audio time in seconds at the HIT LINE.
  readonly type: DrumChartType;
}

// Authored synchronization fixture, not a transcription of an uploaded song.
// Includes simultaneous hits, rests, all eight instruments, and the 10s snare.
export const drumChart: readonly DrumChartNote[] = [
  { time: 2.000, type: "kick" }, { time: 2.000, type: "hihat" },
  { time: 2.500, type: "hihat" }, { time: 3.000, type: "snare" },
  { time: 3.500, type: "hihat" }, { time: 4.000, type: "kick" },
  { time: 4.000, type: "crash" }, { time: 4.500, type: "hihat" },
  { time: 5.000, type: "snare" }, { time: 5.500, type: "hihat" },
  { time: 6.000, type: "tom1" }, { time: 6.250, type: "tom2" },
  { time: 6.500, type: "floorTom" }, { time: 7.000, type: "ride" },
  { time: 7.500, type: "kick" },
  { time: 10.000, type: "snare" },
  { time: 11.000, type: "kick" }, { time: 11.000, type: "crash" },
  { time: 11.500, type: "hihat" }, { time: 12.000, type: "snare" },
  { time: 12.500, type: "hihat" }, { time: 13.000, type: "kick" },
  { time: 13.500, type: "ride" }, { time: 14.000, type: "snare" },
  { time: 14.500, type: "tom1" }, { time: 14.750, type: "tom2" },
  { time: 15.000, type: "floorTom" }, { time: 15.500, type: "crash" },
  { time: 18.000, type: "kick" }, { time: 18.500, type: "hihat" },
  { time: 19.000, type: "snare" }, { time: 19.500, type: "hihat" },
  { time: 20.000, type: "kick" }, { time: 20.000, type: "ride" },
  { time: 21.000, type: "snare" }, { time: 22.000, type: "tom1" },
  { time: 22.250, type: "tom2" }, { time: 22.500, type: "floorTom" },
  { time: 23.000, type: "crash" }, { time: 24.000, type: "kick" },
  { time: 25.000, type: "snare" }, { time: 26.000, type: "ride" },
  { time: 27.000, type: "kick" }, { time: 28.000, type: "crash" },
];

export const DRUM_CHART_PADS: Record<DrumChartType, DrumPadId> = {
  kick: "kick", snare: "snare", hihat: "hihat-closed", tom1: "tom-high",
  tom2: "tom-mid", floorTom: "tom-floor", crash: "crash", ride: "ride",
};

export function toNoteEvents(chart: readonly DrumChartNote[]): NoteEvent[] {
  return chart.map(({ time, type }) => ({ time, padId: DRUM_CHART_PADS[type] }));
}

export function getNoteProgress(noteTime: number, audioTime: number): number {
  const timeUntilHit = noteTime - audioTime;
  return 1 - timeUntilHit / NOTE_TRAVEL_TIME;
}

export function formatAudioTime(seconds: number): string {
  return seconds.toFixed(3).padStart(6, "0");
}

// There is no backing-song file in the current page. Render a quiet, audible
// timing fixture once to PCM WAV. Each tone starts at its chart timestamp.
// Playback uses a normal HTMLAudioElement; this generator is never a clock.
export function createTimingTrack(notes: readonly NoteEvent[], duration: number): Blob {
  const sampleRate = 22050;
  const samples = new Float32Array(Math.ceil(duration * sampleRate));
  const frequencies: Record<DrumPadId, number> = {
    kick: 90, snare: 220, "hihat-closed": 1400, "hihat-open": 1500,
    "hihat-pedal": 1200, "tom-high": 440, "tom-mid": 330,
    "tom-floor": 165, crash: 1760, ride: 880,
  };
  for (const note of notes) {
    if (!Number.isFinite(note.time) || note.time < 0 || note.time >= duration) continue;
    const start = Math.round(note.time * sampleRate);
    const length = Math.min(Math.round(0.12 * sampleRate), samples.length - start);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      samples[start + i] += 0.12 * Math.sin(2 * Math.PI * frequencies[note.padId] * t)
        * Math.exp(-t * 45) * Math.min(1, i / 16);
    }
  }
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const data = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) data.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF"); data.setUint32(4, buffer.byteLength - 8, true);
  text(8, "WAVE"); text(12, "fmt "); data.setUint32(16, 16, true);
  data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, sampleRate, true); data.setUint32(28, sampleRate * 2, true);
  data.setUint16(32, 2, true); data.setUint16(34, 16, true);
  text(36, "data"); data.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => data.setInt16(44 + i * 2,
    Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true));
  return new Blob([buffer], { type: "audio/wav" });
}
