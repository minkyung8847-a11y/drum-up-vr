import type { NoteEvent } from '../types';
import type { RhythmAudio } from './vrNoteHighway';

export const LOVE_SONG = { title: '사랑으로 (love.)', artist: 'wave to earth', difficulty: 'Easy', stars: 1,
  genres: ['Band'], art: 8, bpm: 62, signature: '4/4', playable: true } as const;
export const LOVE_ROOT = `${import.meta.env.BASE_URL}songs/love/`;
export const LOVE_COUNT_IN = 4 * 60 / 62;
const OFFSET_KEY = 'drumup.vr.love.chart-offset.v1';
export function savedLoveOffset(): number | null {
  try { const raw = localStorage.getItem(OFFSET_KEY); const n = Number(raw);
    return raw !== null && Number.isFinite(n) && n >= 0 && n <= 120 ? n : null;
  } catch { return null; }
}
export function saveLoveOffset(value: number) { try { localStorage.setItem(OFFSET_KEY, String(value)); } catch { /* Optional persistence. */ } }

export function parseLoveChart(data: unknown): NoteEvent[] {
  const chart = data as { bpm?: number; bars?: number; notes?: { time: number; instrument: string; bar: number; beat: number; velocity?: number }[] };
  if (chart?.bpm !== 62 || chart.bars !== 4 || !Array.isArray(chart.notes)) throw Error('Invalid love. chart');
  return chart.notes.map(note => {
    if (!['ride', 'kick', 'snare'].includes(note.instrument) || !Number.isFinite(note.time) || note.time < 0 || note.time >= 16 * 60 / 62)
      throw Error('Invalid love. note');
    const instrument = note.instrument as 'ride' | 'kick' | 'snare';
    return { time: note.time, hitTime: note.time, padId: instrument, instrument,
      measure: note.bar, measureBeat: note.beat, velocity: note.velocity ?? 1 };
  }).sort((a, b) => a.time - b.time);
}

// Its timeline includes the four silent count-in beats. Both note judgments and
// the scheduled MP3 read this AudioContext clock, never accumulated XR frames.
export class VRMusicTransport extends EventTarget implements RhythmAudio {
  private source: AudioBufferSourceNode | null = null;
  private clicks: OscillatorNode[] = [];
  private position = 0;
  private epoch = 0;
  private request = 0;
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
  get currentTime() { return this.paused ? this.position : this.position + Math.max(0, this.context.currentTime - this.epoch); }
  set currentTime(value: number) { const playing = !this.paused; this.pause(); this.position = Math.max(0, value); if (playing) void this.play(); }
  async play() {
    if (!this.paused) return;
    const request = ++this.request;
    await this.context.resume();
    if (request !== this.request) return;
    this.epoch = this.context.currentTime + .035; this.paused = false;
    const source = this.context.createBufferSource(); this.source = source; source.buffer = this.buffer; source.connect(this.gain);
    const wait = Math.max(0, this.preroll - this.position), offset = Math.max(0, this.position - this.preroll);
    if (offset >= this.buffer.duration) { this.paused = true; return; }
    source.start(this.epoch + wait, offset);
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
