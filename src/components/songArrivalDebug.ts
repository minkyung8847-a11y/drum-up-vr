import type { NoteEvent } from '../types';

// Records the first drawn media frame at or after each scheduled arrival.
// The error is render-frame lateness, not a change to the note or scoring clock.
export function createSongArrivalDebug(notes: readonly NoteEvent[], offset: number) {
  const ordered = [...notes].sort((a, b) => a.time - b.time);
  let cursor = 0;
  let previous = -Infinity;
  let last = '';
  return {
    reset(mediaTime: number) {
      cursor = ordered.findIndex(note => note.time + offset >= mediaTime);
      if (cursor < 0) cursor = ordered.length;
      previous = mediaTime;
      last = '';
    },
    sample(mediaTime: number, playing: boolean) {
      if (!playing) return last;
      if (mediaTime < previous) this.reset(mediaTime);
      previous = mediaTime;
      const arrivals: string[] = [];
      let scheduled = 0;
      while (cursor < ordered.length && ordered[cursor].time + offset <= mediaTime) {
        const note = ordered[cursor++];
        const next = note.time + offset;
        if (next !== scheduled) arrivals.length = 0;
        scheduled = next;
        arrivals.push(note.instrument ?? note.padId);
      }
      if (arrivals.length) last = `${arrivals.join(' + ')}  scheduled ${scheduled.toFixed(3)}s  frame ${mediaTime.toFixed(3)}s  +${((mediaTime - scheduled) * 1000).toFixed(1)}ms`;
      return last;
    },
  };
}
