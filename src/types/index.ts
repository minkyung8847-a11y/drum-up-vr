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
}

export interface SongChart {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  difficulty: "Easy" | "Medium" | "Hard";
  duration: number; // in seconds
  notes: NoteEvent[];
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
