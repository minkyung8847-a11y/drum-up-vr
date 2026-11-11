import type { NoteEvent } from '../types';
import type { RhythmAudio } from './vrNoteHighway';
import { LOVE_CHART_OFFSET_SECONDS, outputAudioTime } from './vrNoteSync';
import { PAD_TO_INSTRUMENT } from './songDrumMapping';
import type { DrumPadId } from '../types';

export const LOVE_ROOT = `${import.meta.env.BASE_URL}songs/love/`;
const ANTIFREEZE_ROOT = `${import.meta.env.BASE_URL}songs/antifreeze/`;
export const LOVE_SONG = { key: 'love', title: '사랑으로 (love.)', artist: 'wave to earth', difficulty: 'Easy', stars: 1,
  genres: ['Band'], art: 8, bpm: 62, signature: '4/4', audio: `${LOVE_ROOT}love.mp3`, cover: `${LOVE_ROOT}cover.jpg`,
  chart: `${LOVE_ROOT}love_full_75_bars_DRAFT.json`, review: 'FULL SCORE · PARTIAL SHEET REVIEW' } as const;
export const ANTIFREEZE_SONG = { key: 'antifreeze', title: 'Antifreeze', artist: '검정치마 (The Black Skirts)', difficulty: 'Normal',
  stars: 2, genres: ['Rock', 'Band'], art: 9, bpm: 128, signature: '4/4', audio: `${ANTIFREEZE_ROOT}audio.mp3`,
  cover: `${ANTIFREEZE_ROOT}cover.jpg`, chart: `${ANTIFREEZE_ROOT}Antifreeze_opening_8_bars.json`,
  review: 'OPENING 8 BARS', practiceBars: 8 } as const;
export type PlayableVRSong = typeof LOVE_SONG | typeof ANTIFREEZE_SONG;
export type VRSongEntry = PlayableVRSong | { title: string; artist: string; difficulty: string };
export const LOVE_COUNT_IN = 4 * 60 / 62;
const OFFSET_KEY = 'drumup.vr.love.chart-offset.v2';
export function savedLoveOffset(): number | null {
  try { let raw = localStorage.getItem(OFFSET_KEY);
    if (raw === null) { const legacy = Number(localStorage.getItem('drumup.vr.love.chart-offset.v1')); if (legacy > 0) raw = String(legacy); }
    const n = Number(raw);
    return raw !== null && Number.isFinite(n) && n >= 0 && n <= 120 ? n : null;
  } catch { return null; }
}
export function saveLoveOffset(value: number) { try { localStorage.setItem(OFFSET_KEY, String(value)); } catch { /* Optional persistence. */ } }
export const loveChartOffset = () => savedLoveOffset() ?? LOVE_CHART_OFFSET_SECONDS;

export function songChartOffset(song: PlayableVRSong) {
  if (song.key === 'love') return loveChartOffset();
  try {
    const saved = localStorage.getItem('drumup.vr.antifreeze.chart-offset.v1');
    const offset = Number(saved);
    if (saved !== null && Number.isFinite(offset) && offset >= 0 && offset <= 120) return offset;
  } catch { /* Optional persistence. */ }
  // First downbeat measured against the supplied recording's kick attacks.
  return .74;
}

export function saveSongChartOffset(song: PlayableVRSong, value: number) {
  if (song.key === 'love') return saveLoveOffset(value);
  try { localStorage.setItem('drumup.vr.antifreeze.chart-offset.v1', String(value)); } catch { /* Optional persistence. */ }
}

export async function loadVRMusicChart(song: PlayableVRSong): Promise<NoteEvent[]> {
  const response = await fetch(song.chart);
  if (!response.ok) throw Error(`Chart HTTP ${response.status}`);
  const chart = await response.json();
  if (song.key === 'love') {
    const opening = await fetch(`${LOVE_ROOT}love_first_4_bars.json`);
    if (!opening.ok) throw Error(`Opening chart HTTP ${opening.status}`);
    return validateLoveFullChart(chart, await opening.json());
  }
  const bars = song.practiceBars;
  if (chart?.bpm !== song.bpm || chart.timeSignature !== song.signature || !Array.isArray(chart.notes) || !chart.notes.length)
    throw Error('Invalid Antifreeze chart');
  return parseChartNotes(chart.notes.map((note: { timeSec: number; instrument: string; bar: number; beat: number; velocity: number }) => ({
    time: note.timeSec, instrument: note.instrument === 'closed_hihat' ? 'hihat-closed'
      : note.instrument === 'open_hihat' ? 'hihat-open' : note.instrument,
    bar: note.bar, beat: note.beat, velocity: note.velocity / 127,
  })), bars, song.bpm);
}

export function parseLoveChart(data: unknown): NoteEvent[] {
  const chart = data as { bpm?: number; bars?: number; notes?: { time: number; instrument: string; bar: number; beat: number; velocity?: number }[] };
  if (chart?.bpm !== 62 || !Number.isInteger(chart.bars) || ![4, 75, 77].includes(chart.bars!) || !Array.isArray(chart.notes)) throw Error('Invalid love. chart');
  return parseChartNotes(chart.notes, chart.bars!, 62);
}

function parseChartNotes(notes: { time: number; instrument: string; bar: number; beat: number; velocity?: number }[], bars: number, bpm: number): NoteEvent[] {
  const pads: Record<string, DrumPadId> = { kick: 'kick', snare: 'snare', ride: 'ride', hihat: 'hihat-closed',
    'hihat-closed': 'hihat-closed', 'hihat-open': 'hihat-open', 'hihat-pedal': 'hihat-pedal',
    smallTom: 'tom-high', middleTom: 'tom-mid', floorTom: 'tom-floor', crash: 'crash' };
  return notes.map(note => {
    const padId = pads[note.instrument];
    if (!padId || !Number.isFinite(note.time) || note.time < 0 || note.time >= bars * 4 * 60 / bpm)
      throw Error('Invalid chart note');
    if (!Number.isInteger(note.bar) || note.bar < 1 || note.bar > bars || !Number.isFinite(note.beat) || note.beat < 1 || note.beat >= 5)
      throw Error('Invalid chart measure position');
    const instrument = PAD_TO_INSTRUMENT[padId];
    return { time: note.time, hitTime: note.time, padId, instrument,
      measure: note.bar, measureBeat: note.beat, velocity: note.velocity ?? 1 };
  }).sort((a, b) => a.time - b.time);
}

// A full chart must retain the exact authored opening. This checks note data,
// not the music clock, and deliberately never applies a new chart offset/BPM.
export function validateLoveFullChart(data: unknown, opening: unknown) {
  if (![75, 77].includes((data as { bars?: number })?.bars ?? 0)) throw Error('Expected full love. chart');
  const notes = parseLoveChart(data), baseline = parseLoveChart(opening);
  const firstFour = notes.filter(note => note.time < 16 * 60 / 62);
  if (firstFour.length !== baseline.length || firstFour.some((note, index) => {
    const original = baseline[index];
    return note.time !== original.time || note.padId !== original.padId || note.velocity !== original.velocity
      || note.measure !== original.measure || note.measureBeat !== original.measureBeat;
  })) throw Error('Full chart changes the synchronized first four bars');
  return notes;
}

// Its timeline includes the four silent count-in beats. Both note judgments and
// the scheduled MP3 read this AudioContext clock, never accumulated XR frames.
export class VRMusicTransport extends EventTarget implements RhythmAudio {
  private source: AudioBufferSourceNode | null = null;
  private clicks: OscillatorNode[] = [];
  private position = 0;
  private epoch = 0;
  private request = 0;
  private reportedMP3Start = false;
  private lastOutputPosition = 0;
  mp3StartContextTime = 0;
  paused = true;
  readonly seeking = false;
  readonly gain: GainNode;
  readonly context: AudioContext;
  readonly buffer: AudioBuffer;
  readonly preroll: number;
  readonly song: PlayableVRSong;
  constructor(context: AudioContext, buffer: AudioBuffer, preroll = LOVE_COUNT_IN,
    song: PlayableVRSong = LOVE_SONG) {
    super(); this.context = context; this.buffer = buffer; this.preroll = preroll;
    this.song = song;
    this.gain = context.createGain(); this.gain.gain.value = .65; this.gain.connect(context.destination);
  }
  get duration() { return this.buffer.duration; }
  get currentTime() {
    if (this.paused) return this.position;
    const outputTime = outputAudioTime(this.context);
    this.lastOutputPosition = Math.max(this.lastOutputPosition, this.position + Math.max(0, outputTime - this.epoch));
    if (!this.reportedMP3Start && outputTime >= this.mp3StartContextTime) {
      this.reportedMP3Start = true;
      console.info('[DRUM UP SYNC] MP3 output start observed', { scheduledContextSeconds: this.mp3StartContextTime,
        observedOutputContextSeconds: outputTime, observationLateMs: (outputTime - this.mp3StartContextTime) * 1000 });
    }
    return this.lastOutputPosition;
  }
  set currentTime(value: number) { const playing = !this.paused; this.pause(); this.position = Math.max(0, value); if (playing) void this.play(); }
  contextTimeAt(timelineSeconds: number) { return this.epoch + timelineSeconds - this.position; }
  outputTime() { return outputAudioTime(this.context); }
  async play() {
    if (!this.paused) return;
    const request = ++this.request;
    await this.context.resume();
    if (request !== this.request) return;
    this.epoch = this.context.currentTime + .035; this.paused = false;
    this.lastOutputPosition = this.position; this.reportedMP3Start = false;
    const source = this.context.createBufferSource(); this.source = source; source.buffer = this.buffer; source.connect(this.gain);
    const wait = Math.max(0, this.preroll - this.position), offset = Math.max(0, this.position - this.preroll);
    if (offset >= this.duration) { this.paused = true; return; }
    this.mp3StartContextTime = this.epoch + wait;
    source.start(this.mp3StartContextTime, offset);
    console.info('[DRUM UP SYNC] MP3 scheduled', { contextSeconds: this.mp3StartContextTime, bufferOffsetSeconds: offset,
      countdownEndContextSeconds: this.epoch + this.preroll - this.position,
      countInSeconds: this.preroll, outputLatencySeconds: this.context.outputLatency ?? 0 });
    source.onended = () => {
      if (this.source !== source) return;
      this.position = this.preroll + this.duration; this.paused = true; this.source = null;
      source.disconnect(); this.dispatchEvent(new Event('ended'));
    };
    for (let beat = 0; beat < 4; beat++) {
      const at = beat * this.preroll / 4;
      if (at < this.position - .001) continue;
      const osc = this.context.createOscillator(), envelope = this.context.createGain();
      const start = this.epoch + at - this.position;
      osc.frequency.value = beat === 3 ? 1046.5 : 783.99;
      envelope.gain.setValueAtTime(.0001, start); envelope.gain.exponentialRampToValueAtTime(.06, start + .003);
      envelope.gain.exponentialRampToValueAtTime(.0001, start + .075);
      osc.connect(envelope); envelope.connect(this.gain); osc.start(start); osc.stop(start + .08);
      this.clicks.push(osc); osc.onended = () => { osc.disconnect(); envelope.disconnect(); this.clicks = this.clicks.filter(item => item !== osc); };
    }
  }
  pause() {
    this.request++;
    if (!this.paused) this.position = this.currentTime;
    this.paused = true;
    const source = this.source; this.source = null;
    if (source) { source.onended = null; source.stop(); source.disconnect(); }
    for (const click of this.clicks) click.stop();
    this.clicks = [];
  }
  dispose() { this.pause(); this.gain.disconnect(); }
}

export function createVRMusicAudio() {
  let context: AudioContext | null = null;
  const buffers = new Map<string, Promise<AudioBuffer>>();
  let preview: AudioBufferSourceNode | null = null, previewGain: GainNode | null = null;
  let previewAt = 0, previewPosition = 0, previewRequest = 0, alive = true;
  const getContext = () => context ??= new AudioContext({ latencyHint: 'interactive' });
  function unlock() { return getContext().resume(); }
  function load(song: PlayableVRSong) {
    const cached = buffers.get(song.key);
    if (cached) return cached;
    const pending = (async () => {
      const response = await fetch(song.audio);
      if (!response.ok) throw Error(`MP3 HTTP ${response.status}`);
      const decoded = await getContext().decodeAudioData(await response.arrayBuffer());
      console.info('[DRUM UP VR MUSIC] MP3 decoded', { duration: decoded.duration, sampleRate: decoded.sampleRate, channels: decoded.numberOfChannels });
      if (!alive) throw Error('Audio disposed');
      return decoded;
    })().catch(error => { buffers.delete(song.key); throw error; });
    buffers.set(song.key, pending);
    return pending;
  }
  function stopPreview(reset = true) {
    previewRequest++;
    if (preview && context) { previewPosition = Math.min(20, previewPosition + context.currentTime - previewAt); preview.onended = null; preview.stop(); preview.disconnect(); preview = null; }
    previewGain?.disconnect(); previewGain = null;
    if (reset) previewPosition = 0;
  }
  return {
    unlock,
    async togglePreview(song: PlayableVRSong) {
      if (preview) { stopPreview(false); return; }
      const request = ++previewRequest;
      await unlock(); const audio = await load(song); if (!alive || request !== previewRequest) return;
      if (previewPosition >= 20) previewPosition = 0;
      const ctx = getContext(), source = ctx.createBufferSource(); preview = source; source.buffer = audio;
      const gain = ctx.createGain(); previewGain = gain; gain.gain.value = .5; source.connect(gain); gain.connect(ctx.destination);
      previewAt = ctx.currentTime; source.start(0, previewPosition, Math.min(20 - previewPosition, audio.duration - previewPosition));
      source.onended = () => { if (preview === source) { preview = null; previewPosition = 0; } source.disconnect(); gain.disconnect(); };
    },
    stopPreview,
    previewStatus: () => ({ playing: !!preview, progress: Math.min(1, (previewPosition + (preview && context ? context.currentTime - previewAt : 0)) / 20) }),
    async transport(song: PlayableVRSong) {
      const buffer = await load(song);
      return new VRMusicTransport(getContext(), buffer, 4 * 60 / song.bpm, song);
    },
    dispose() { alive = false; stopPreview(); buffers.clear(); if (context) void context.close(); },
  };
}
