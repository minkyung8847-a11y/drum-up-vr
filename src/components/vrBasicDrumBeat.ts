const BPM = 80;
const BEATS_PER_BAR = 4;
const BARS = 4;
const BEAT_MS = 60_000 / BPM;

const events: { id: 'hihat' | 'kick' | 'snare'; beat: number; hitTimeMs: number }[] = [];
for (let beat = 0; beat < BEATS_PER_BAR * BARS; beat++) {
  events.push({ id: 'hihat', beat, hitTimeMs: beat * BEAT_MS });
  if (beat % BEATS_PER_BAR === 0) events.push({ id: 'kick', beat, hitTimeMs: beat * BEAT_MS });
  if (beat % BEATS_PER_BAR === 2) events.push({ id: 'snare', beat, hitTimeMs: beat * BEAT_MS });
}

export const VR_BASIC_DRUM_BEAT = {
  bpm: BPM, beatsPerBar: BEATS_PER_BAR, bars: BARS,
  beatMs: BEAT_MS, durationMs: BEATS_PER_BAR * BARS * BEAT_MS, events,
};
