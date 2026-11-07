import type { DrumPadId, MidiMap, NoteEvent } from '../types';
import { GM_DRUM_PADS, PAD_TO_INSTRUMENT } from './songDrumMapping';

type Tempo = { beat: number; bpm: number };
type Meter = { beat: number; numerator: number; denominator: number };
type Attack = { beat: number; padId: DrumPadId; velocity?: number; measure?: number; measureBeat?: number };

function buildChart(attacks: Attack[], tempos: Tempo[], meters: Meter[], endBeat: number, skipped: number, fallbackBpm: number) {
  const sortedChanges = <T extends { beat: number }>(initial: T, changes: T[]) =>
    [...new Map([initial, ...changes].map(change => [change.beat, change])).values()].sort((a, b) => a.beat - b.beat);
  const tempoMap = sortedChanges({ beat: 0, bpm: fallbackBpm }, tempos);
  const meterMap = sortedChanges({ beat: 0, numerator: 4, denominator: 4 }, meters);
  let tempo = 0, seconds = 0, meter = 0, firstMeasure = 1;
  const secondsAt = (beat: number) => {
    while (tempo + 1 < tempoMap.length && tempoMap[tempo + 1].beat <= beat) {
      seconds += (tempoMap[tempo + 1].beat - tempoMap[tempo].beat) * 60 / tempoMap[tempo].bpm;
      tempo++;
    }
    return seconds + (beat - tempoMap[tempo].beat) * 60 / tempoMap[tempo].bpm;
  };
  const measureLength = (signature: Meter) => signature.numerator * 4 / signature.denominator;
  const notes: NoteEvent[] = attacks.sort((a, b) => a.beat - b.beat).map(attack => {
    while (meter + 1 < meterMap.length && meterMap[meter + 1].beat <= attack.beat) {
      firstMeasure += Math.ceil((meterMap[meter + 1].beat - meterMap[meter].beat) / measureLength(meterMap[meter]) - 1e-9);
      meter++;
    }
    const signature = meterMap[meter];
    const position = attack.beat - signature.beat;
    const bars = Math.floor(position / measureLength(signature) + 1e-9);
    const time = secondsAt(attack.beat);
    return { ...attack, time, hitTime: time, instrument: PAD_TO_INSTRUMENT[attack.padId],
      measure: attack.measure ?? firstMeasure + bars,
      measureBeat: attack.measureBeat ?? 1 + Math.max(0, position - bars * measureLength(signature)) * signature.denominator / 4 };
  });
  const last = notes.at(-1);
  const duration = Math.max(secondsAt(Math.max(endBeat, last?.beat ?? 0)), (last?.time ?? 0) + 0.25);
  if (!notes.length) throw Error('악보에서 매핑 가능한 드럼 타격을 찾지 못했습니다.');
  if (!Number.isFinite(duration) || duration > 3600) throw Error('연습 악보는 최대 60분까지 지원합니다.');
  return { notes, tempoMap, meterMap, bpm: tempoMap[0].bpm, duration, skipped };
}

export function parseDrumMidi(buffer: ArrayBuffer, overrides: MidiMap = {}) {
  const data = new DataView(buffer);
  if (data.byteLength < 14 || data.getUint32(0) !== 0x4d546864 || data.getUint32(4) < 6) throw Error('올바른 MIDI 헤더가 없습니다.');
  const format = data.getUint16(8), tracks = data.getUint16(10), division = data.getUint16(12);
  if (format > 1 || !division || division & 0x8000) throw Error('PPQ 기반 MIDI 형식 0과 1을 지원합니다.');
  let cursor = 8 + data.getUint32(4), end = data.byteLength, maxTick = 0, skipped = 0;
  const attacks: Attack[] = [], tempos: Tempo[] = [], meters: Meter[] = [];
  const pads = { ...GM_DRUM_PADS, ...overrides };
  const byte = () => {
    if (cursor >= end) throw Error('MIDI 트랙이 중간에 잘렸습니다.');
    return data.getUint8(cursor++);
  };
  const varLength = () => {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const part = byte();
      value = (value << 7) | (part & 127);
      if (part < 128) return value;
    }
    throw Error('잘못된 MIDI 가변 길이 값입니다.');
  };
  for (let track = 0; track < tracks; track++) {
    if (cursor + 8 > data.byteLength || data.getUint32(cursor) !== 0x4d54726b) throw Error('MIDI 트랙 헤더가 없습니다.');
    end = cursor + 8 + data.getUint32(cursor + 4);
    if (end > data.byteLength) throw Error('MIDI 트랙 길이가 잘못되었습니다.');
    cursor += 8;
    let tick = 0, running = 0;
    while (cursor < end) {
      tick += varLength();
      const beat = tick / division;
      let status = byte();
      if (status < 128) { cursor--; status = running; }
      if (status === 255 || status === 240 || status === 247) {
        running = 0;
        const kind = status === 255 ? byte() : -1;
        const length = varLength();
        const next = cursor + length;
        if (next > end) throw Error('MIDI 메타 이벤트가 잘렸습니다.');
        if (kind === 0x51 && length === 3) {
          const micros = (byte() << 16) | (byte() << 8) | byte();
          if (micros) tempos.push({ beat, bpm: 60_000_000 / micros });
        } else if (kind === 0x58 && length === 4) {
          const numerator = byte(), power = byte();
          if (numerator && power <= 7) meters.push({ beat, numerator, denominator: 2 ** power });
        }
        cursor = next;
        if (kind === 0x2f) break;
      } else {
        if (status < 128 || status >= 240) throw Error('지원하지 않는 MIDI 이벤트입니다.');
        running = status;
        const kind = status >> 4, key = byte(), velocity = kind === 12 || kind === 13 ? 0 : byte();
        if (key > 127 || velocity > 127) throw Error('MIDI 데이터 바이트가 잘못되었습니다.');
        if (status === 0x99 && velocity > 0) {
          const padId = pads[key];
          if (padId) attacks.push({ beat, padId, velocity: velocity / 127 });
          else skipped++;
        }
      }
    }
    maxTick = Math.max(maxTick, tick);
    cursor = end;
  }
  return buildChart(attacks, tempos, meters, maxTick / division, skipped, 120);
}

const METRONOME_UNITS: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25, '32nd': 0.125 };
const child = (node: Element, name: string) => [...node.children].find(item => item.localName === name);
const value = (node: Element, name: string) => child(node, name)?.textContent?.trim();

export function parseDrumMusicXML(xml: string, fallbackBpm: number, overrides: MidiMap = {}, fallbackMeter = '4/4') {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'score-partwise') throw Error('MusicXML score-partwise 파일이 필요합니다.');
  if (doc.querySelector('repeat, ending, sound[dacapo], sound[dalsegno], sound[tocoda]')) {
    throw Error('반복·점프를 펼친 MusicXML 또는 MIDI로 내보낸 뒤 다시 업로드해 주세요.');
  }
  const pads = { ...GM_DRUM_PADS, ...overrides };
  const instruments = new Map<string, DrumPadId | undefined>();
  for (const instrument of doc.querySelectorAll('midi-instrument[id]')) {
    const key = Number(value(instrument, 'midi-unpitched')) - 1; // MusicXML uses 1–128.
    const legacy = Number(value(instrument, 'midi-note'));
    instruments.set(instrument.id, pads[Number.isNaN(key) ? legacy : key]);
  }
  const [initialNumerator, initialDenominator] = fallbackMeter.split('/').map(Number);
  const attacks: Attack[] = [], tempos: Tempo[] = [];
  const meters: Meter[] = [{ beat: 0, numerator: initialNumerator || 4, denominator: initialDenominator || 4 }];
  let endBeat = 0, skipped = 0;
  for (const part of [...doc.documentElement.children].filter(element => element.localName === 'part')) {
    let divisions = 1, numerator = meters[0].numerator, denominator = meters[0].denominator, start = 0;
    const definition = [...doc.querySelectorAll('score-part')].find(item => item.id === part.id);
    const partInstruments = [...(definition?.querySelectorAll('midi-instrument[id]') ?? [])].map(item => item.id);
    const measures = [...part.children].filter(element => element.localName === 'measure');
    for (const [index, measure] of measures.entries()) {
      let cursor = 0, previous = 0, extent = 0;
      for (const event of measure.children) {
        const duration = Number(value(event, 'duration') ?? 0) / divisions;
        switch (event.localName) {
          case 'attributes': {
            const next = Number(value(event, 'divisions'));
            if (next > 0) divisions = next;
            const meter = child(event, 'time');
            if (meter) {
              const beats = value(meter, 'beats')?.split('+').map(Number).reduce((a, b) => a + b, 0);
              const unit = Number(value(meter, 'beat-type'));
              if (beats && unit > 0) { numerator = beats; denominator = unit; meters.push({ beat: start + cursor, numerator, denominator }); }
            }
            break;
          }
          case 'direction':
          case 'sound': {
            const sound = event.localName === 'sound' ? event : child(event, 'sound');
            const metronome = event.querySelector('metronome');
            const unit = metronome && METRONOME_UNITS[value(metronome, 'beat-unit') ?? ''];
            const bpm = Number(sound?.getAttribute('tempo')) || (metronome && unit
              ? Number(value(metronome, 'per-minute')) * unit * (2 - 2 ** -metronome.querySelectorAll('beat-unit-dot').length) : 0);
            const offset = Number((sound && value(sound, 'offset')) ?? value(event, 'offset') ?? 0) / divisions;
            if (bpm > 0 && Number.isFinite(bpm)) tempos.push({ beat: Math.max(0, start + cursor + offset), bpm });
            break;
          }
          case 'backup': cursor = Math.max(0, cursor - duration); break;
          case 'forward': cursor += duration; break;
          case 'note': {
            if (child(event, 'grace')) { if (child(event, 'unpitched')) skipped++; break; }
            const chord = !!child(event, 'chord');
            const beat = chord ? previous : cursor;
            if (!chord) { previous = cursor; cursor += duration; }
            extent = Math.max(extent, beat + duration);
            if (child(event, 'rest') || event.querySelector('tie[type="stop"]')) break;
            const id = child(event, 'instrument')?.id ?? (partInstruments.length === 1 && child(event, 'unpitched') ? partInstruments[0] : '');
            const explicit = value(event, 'midi-note');
            const padId = explicit === undefined ? instruments.get(id) : pads[Number(explicit)];
            if (!padId) { if (id || explicit !== undefined || child(event, 'unpitched')) skipped++; break; }
            const dynamics = event.getAttribute('dynamics');
            const number = measure.getAttribute('number');
            attacks.push({ beat: start + beat, padId, measure: number && /^\d+$/.test(number) ? Number(number) : index + 1, measureBeat: 1 + beat * denominator / 4,
              velocity: dynamics !== null && Number.isFinite(Number(dynamics)) ? Math.max(0, Math.min(1, Number(dynamics) * 0.9 / 127)) : undefined });
            break;
          }
        }
        extent = Math.max(extent, cursor);
      }
      start += measure.getAttribute('implicit') === 'yes' ? extent : Math.max(extent, numerator * 4 / denominator);
    }
    endBeat = Math.max(endBeat, start);
  }
  return buildChart(attacks, tempos, meters, endBeat, skipped, fallbackBpm > 0 ? fallbackBpm : 120);
}
