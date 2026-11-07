import type { GameScore, NoteEvent, SongChart } from '../types';
import { PAD_TO_INSTRUMENT, songHitInstrument } from './songDrumMapping';
import type { SongHitPad } from './songDrumMapping';
import { createTimingTrack, NOTE_TRAVEL_TIME } from './songPracticeTiming';
import { BASIC_DRUM_BEAT_ID, BASIC_DRUM_PREROLL } from './basicDrumBeat';

export const DEFAULT_SONG_WINDOWS = { perfect: 50, great: 120 };
export type SongWindows = typeof DEFAULT_SONG_WINDOWS;
export interface SongPlayback {
  chart: SongChart;
  audio?: File;
  offset: number;
  windows: SongWindows;
}

let headsetSong: SongPlayback | undefined;
export const getHeadsetSong = () => headsetSong;
export function openHeadsetSong(song: SongPlayback) {
  headsetSong = song;
  window.location.hash = '#/vr-song';
}

export function createSongMedia(song: Pick<SongPlayback, 'chart' | 'audio' | 'offset'>) {
  if (song.chart.id === BASIC_DRUM_BEAT_ID) return {
    url: URL.createObjectURL(createTimingTrack(song.chart.notes, BASIC_DRUM_PREROLL + song.chart.duration, BASIC_DRUM_PREROLL)),
    offset: BASIC_DRUM_PREROLL,
  };
  const first = song.chart.notes[0]?.time ?? Infinity;
  const offset = song.audio ? song.offset : first < NOTE_TRAVEL_TIME ? NOTE_TRAVEL_TIME : 0;
  const duration = Math.max(song.chart.duration, (song.chart.notes.at(-1)?.time ?? 0) + 0.51);
  const source = song.audio ?? createTimingTrack(song.chart.notes, duration + offset, offset);
  return { url: URL.createObjectURL(source), offset };
}

export function songBpmAt(chart: SongChart, scoreTime: number) {
  let bpm = chart.bpm, beat = 0, time = 0;
  for (const change of chart.tempoMap ?? []) {
    time += (change.beat - beat) * 60 / bpm;
    if (time > scoreTime) break;
    bpm = change.bpm;
    beat = change.beat;
  }
  return Math.round(bpm * 10) / 10;
}

export const emptySongScore = (): GameScore => ({ score: 0, combo: 0, maxCombo: 0, perfect: 0, great: 0, good: 0, miss: 0, accuracy: 0 });

export function createSongScorer(notes: readonly NoteEvent[], windows: SongWindows) {
  const ordered = [...notes].sort((a, b) => a.time - b.time);
  const resolved = new Set<NoteEvent>();
  let cursor = 0;
  let score = emptySongScore();
  function register(result: 'perfect' | 'great' | 'miss') {
    score[result]++;
    score.combo = result === 'miss' ? 0 : score.combo + 1;
    score.maxCombo = Math.max(score.combo, score.maxCombo);
    score.score += result === 'perfect' ? 100 : result === 'great' ? 70 : 0;
    score.accuracy = Math.round(score.score / (score.perfect + score.great + score.miss));
    return { ...score };
  }
  return {
    reset(time: number) {
      resolved.clear();
      cursor = ordered.findIndex(note => note.time >= time - windows.great / 1000);
      if (cursor < 0) cursor = ordered.length;
      score = emptySongScore();
      return { ...score };
    },
    advance(time: number) {
      let changed: GameScore | undefined;
      while (cursor < ordered.length && time - ordered[cursor].time > windows.great / 1000 + 1e-9) {
        const note = ordered[cursor++];
        if (!resolved.delete(note)) changed = register('miss');
      }
      return changed;
    },
    finish() {
      while (cursor < ordered.length) {
        if (!resolved.delete(ordered[cursor++])) register('miss');
      }
      return { ...score };
    },
    hit(padId: SongHitPad, time: number) {
      const instrument = songHitInstrument(padId);
      if (!instrument) return;
      let distance = windows.great / 1000 + 1e-9;
      let closest: NoteEvent | undefined;
      for (let i = cursor; i < ordered.length; i++) {
        const note = ordered[i];
        if (note.time - time > windows.great / 1000 + 1e-9) break;
        const delta = Math.abs(note.time - time);
        if (delta >= distance || resolved.has(note) || (note.instrument ?? PAD_TO_INSTRUMENT[note.padId]) !== instrument) continue;
        distance = delta;
        closest = note;
      }
      if (!closest) return;
      resolved.add(closest);
      const result = distance <= windows.perfect / 1000 + 1e-9 ? 'perfect' : 'great';
      return { result, score: register(result) };
    },
  };
}
