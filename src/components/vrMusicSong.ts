import type { NoteEvent } from '../types';
import type { RhythmAudio } from './vrNoteHighway';
import { LOVE_CHART_OFFSET_SECONDS, outputAudioTime } from './vrNoteSync';
import { PAD_TO_INSTRUMENT } from './songDrumMapping';
import type { DrumPadId } from '../types';

export const LOVE_SONG = { title: '사랑으로 (love.)', artist: 'wave to earth', difficulty: 'Easy', stars: 1,
  genres: ['Band'], art: 8, bpm: 62, signature: '4/4', playable: true } as const;
export const LOVE_ROOT = `${import.meta.env.BASE_URL}songs/love/`;
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

export function parseLoveChart(data: unknown): NoteEvent[] {
  const chart = data as { bpm?: number; bars?: number; notes?: { time: number; instrument: string; bar: number; beat: number; velocity?: number }[] };
  if (chart?.bpm !== 62 || !Number.isInteger(chart.bars) || ![4, 75, 77].includes(chart.bars!) || !Array.isArray(chart.notes)) throw Error('Invalid love. chart');
  const pads: Record<string, DrumPadId> = { kick: 'kick', snare: 'snare', ride: 'ride', hihat: 'hihat-closed',
    'hihat-closed': 'hihat-closed', 'hihat-open': 'hihat-open', 'hihat-pedal': 'hihat-pedal',
    smallTom: 'tom-high', middleTom: 'tom-mid', floorTom: 'tom-floor', crash: 'crash' };
  return chart.notes.map(note => {
    const padId = pads[note.instrument];
    if (!padId || !Number.isFinite(note.time) || note.time < 0 || note.time >= chart.bars! * 4 * 60 / 62)
      throw Error('Invalid love. note');
    if (!Number.isInteger(note.bar) || note.bar < 1 || note.bar > chart.bars! || !Number.isFinite(note.beat) || note.beat < 1 || note.beat >= 5)
      throw Error('Invalid love. measure position');
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
  constructor(context: AudioContext, buffer: AudioBuffer, preroll = LOVE_COUNT_IN) {
    super(); this.context = context; this.buffer = buffer; this.preroll = preroll;
    this.gain = context.createGain(); this.gain.gain.value = .65; this.gain.connect(context.destination);
  }
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
    if (offset >= this.buffer.duration) { this.paused = true; return; }
    this.mp3StartContextTime = this.epoch + wait;
    source.start(this.mp3StartContextTime, offset);
    console.info('[DRUM UP SYNC] MP3 scheduled', { contextSeconds: this.mp3StartContextTime, bufferOffsetSeconds: offset,
      countdownEndContextSeconds: this.epoch + this.preroll - this.position,
      countInSeconds: this.preroll, outputLatencySeconds: this.context.outputLatency ?? 0 });
    source.onended = () => {
      if (this.source !== source) return;
      this.position = this.preroll + this.buffer.duration; this.paused = true; this.source = null;
      source.disconnect(); this.dispatchEvent(new Event('ended'));
    };
    for (let beat = 0; beat < 4; beat++) {
      const at = beat * 60 / 62;
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
  let context: AudioContext | null = null, buffer: AudioBuffer | null = null;
  let pending: Promise<AudioBuffer> | null = null, preview: AudioBufferSourceNode | null = null, previewGain: GainNode | null = null;
  let previewAt = 0, previewPosition = 0, previewRequest = 0, alive = true;
  const getContext = () => context ??= new AudioContext({ latencyHint: 'interactive' });
  function unlock() { return getContext().resume(); }
  function load() {
    if (buffer) return Promise.resolve(buffer);
    return pending ??= (async () => {
      const response = await fetch(`${LOVE_ROOT}love.mp3`);
      if (!response.ok) throw Error(`MP3 HTTP ${response.status}`);
      const decoded = await getContext().decodeAudioData(await response.arrayBuffer());
      console.info('[DRUM UP VR MUSIC] MP3 decoded', { duration: decoded.duration, sampleRate: decoded.sampleRate, channels: decoded.numberOfChannels });
      if (!alive) throw Error('Audio disposed');
      buffer = decoded; return decoded;
    })().catch(error => { pending = null; throw error; });
  }
  function stopPreview(reset = true) {
    previewRequest++;
    if (preview && context) { previewPosition = Math.min(20, previewPosition + context.currentTime - previewAt); preview.onended = null; preview.stop(); preview.disconnect(); preview = null; }
    previewGain?.disconnect(); previewGain = null;
    if (reset) previewPosition = 0;
  }
  return {
    unlock, load,
    async togglePreview() {
      if (preview) { stopPreview(false); return; }
      const request = ++previewRequest;
      await unlock(); const audio = await load(); if (!alive || request !== previewRequest) return;
      if (previewPosition >= 20) previewPosition = 0;
      const ctx = getContext(), source = ctx.createBufferSource(); preview = source; source.buffer = audio;
      const gain = ctx.createGain(); previewGain = gain; gain.gain.value = .5; source.connect(gain); gain.connect(ctx.destination);
      previewAt = ctx.currentTime; source.start(0, previewPosition, Math.min(20 - previewPosition, audio.duration - previewPosition));
      source.onended = () => { if (preview === source) { preview = null; previewPosition = 0; } source.disconnect(); gain.disconnect(); };
    },
    stopPreview,
    previewStatus: () => ({ playing: !!preview, progress: Math.min(1, (previewPosition + (preview && context ? context.currentTime - previewAt : 0)) / 20) }),
    async transport() { await unlock(); return new VRMusicTransport(getContext(), await load()); },
    dispose() { alive = false; stopPreview(); buffer = null; if (context) void context.close(); },
  };
}
