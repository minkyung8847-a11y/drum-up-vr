export type DrumPadId =
  | "kick"
  | "snare"
  | "hihat-closed"
  | "hihat-open"
  | "hihat-pedal"
  | "tom-high"
  | "tom-mid"
  | "tom-floor"
  | "crash"
  | "ride";

export interface DrumPadConfig {
  id: DrumPadId;
  name: string;
  key: string; // Keyboard shortcut
  defaultMidiNote: number;
  color: string; // Theme color (hex/rgb)
  label: string; // Display label
}

export type MidiMap = Record<number, DrumPadId>;

export interface NoteEvent {
  time: number; // Time in seconds when the note should be hit
  padId: DrumPadId;
  duration?: number;
  instrument?: import('../components/songDrumMapping').SongDrumInstrument;
  beat?: number; // Zero-based quarter-note offset from score start.
  hitTime?: number; // Seconds on the score timeline, before media offset.
  measure?: number;
  measureBeat?: number;
  velocity?: number; // Normalized 0–1 when supplied by the score.
}

export interface SongChart {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  difficulty: "Easy" | "Medium" | "Hard";
  duration: number; // in seconds
  notes: NoteEvent[];
  tempoMap?: { beat: number; bpm: number }[];
  meterMap?: { beat: number; numerator: number; denominator: number }[];
}

export interface GameScore {
  score: number;
  combo: number;
  maxCombo: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  accuracy: number; // percentage
}

export interface RudimentPattern {
  id: string;
  name: string;
  description: string;
  sticking: ("L" | "R")[]; // Sticking pattern, e.g., L R L R
  subdivision: 4 | 8 | 16; // quarter, eighth, sixteenth notes
}
