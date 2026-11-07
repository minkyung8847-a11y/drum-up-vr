import type { NoteEvent, SongChart } from '../types';
import { PAD_TO_INSTRUMENT } from './songDrumMapping';

export const BASIC_DRUM_BEAT_ID = 'basic-drum-beat';
export const BASIC_DRUM_PREROLL = 2;

const notes: NoteEvent[] = [];
for (let bar = 0; bar < 4; bar++) {
  for (let eighth = 0; eighth < 8; eighth++) {
    const time = bar * 2 + eighth * 0.25;
    const pads: NoteEvent['padId'][] = ['hihat-closed'];
    if (eighth % 2 === 0) pads.push(eighth % 4 === 0 ? 'kick' : 'snare');
    for (const padId of pads) notes.push({
      time, hitTime: time, beat: time * 2, padId, instrument: PAD_TO_INSTRUMENT[padId],
      measure: bar + 1, measureBeat: eighth / 2 + 1, velocity: padId === 'hihat-closed' ? 0.65 : 0.85,
    });
  }
}

export const BASIC_DRUM_BEAT: SongChart = {
  id: BASIC_DRUM_BEAT_ID, title: 'BASIC DRUM BEAT', artist: 'DRUM UP', bpm: 120,
  difficulty: 'Easy', duration: 8, notes,
  tempoMap: [{ beat: 0, bpm: 120 }],
  meterMap: [{ beat: 0, numerator: 4, denominator: 4 }],
};
