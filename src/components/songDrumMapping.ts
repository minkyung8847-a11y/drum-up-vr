import type { DrumPadId, MidiMap } from '../types';

// MIDI articulations can share a physical instrument without sharing a sound.
export const PAD_TO_INSTRUMENT = {
  kick: 'kick', snare: 'snare', 'hihat-closed': 'hihat', 'hihat-open': 'hihat',
  'hihat-pedal': 'hihat', 'tom-high': 'smallTom', 'tom-mid': 'middleTom',
  'tom-floor': 'floorTom', crash: 'crash', ride: 'ride',
} as const satisfies Record<DrumPadId, string>;
export type SongDrumInstrument = (typeof PAD_TO_INSTRUMENT)[DrumPadId];
const DESKTOP_PADS = { hihat: 'hihat', tom1: 'smallTom', tom2: 'middleTom', tom3: 'floorTom' } as const;
export type SongHitPad = DrumPadId | keyof typeof DESKTOP_PADS;
const HIT_TO_INSTRUMENT: Record<SongHitPad, SongDrumInstrument> = { ...PAD_TO_INSTRUMENT, ...DESKTOP_PADS };
export const songHitInstrument = (pad: SongHitPad) => HIT_TO_INSTRUMENT[pad];

export const GM_DRUM_PADS: Readonly<MidiMap> = {
  35: 'kick', 36: 'kick', 37: 'snare', 38: 'snare', 40: 'snare',
  42: 'hihat-closed', 44: 'hihat-pedal', 46: 'hihat-open',
  41: 'tom-floor', 43: 'tom-floor', 45: 'tom-mid', 47: 'tom-mid',
  48: 'tom-high', 50: 'tom-high', 49: 'crash', 57: 'crash',
  51: 'ride', 53: 'ride', 59: 'ride',
};

export function parseDrumMapping(text: string): MidiMap {
  if (!text.trim()) return {};
  const overrides: unknown = JSON.parse(text);
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw Error('드럼 매핑은 JSON 객체여야 합니다.');
  const mapping: MidiMap = {};
  for (const [key, pad] of Object.entries(overrides)) {
    if (!/^(0|[1-9]\d{0,2})$/.test(key) || Number(key) > 127 || typeof pad !== 'string'
      || !Object.hasOwn(PAD_TO_INSTRUMENT, pad)) throw Error(`지원하지 않는 드럼 매핑: ${key}`);
    mapping[Number(key)] = pad as DrumPadId;
  }
  return mapping;
}
