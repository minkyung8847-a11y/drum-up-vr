import {
  DRUM_KITS,
  DRUM_KITS_MAP,
  DEFAULT_DRUM_KIT_ID,
  type DrumKitPreset,
} from "../config/drumKits";

const SAMPLE_URL = `${import.meta.env.BASE_URL}samples/MusicHobbyDrum.wav`;
// MusicHobbyDrum.wav is 44.1 kHz, mono, 32-bit float PCM; audio data starts at byte 54.
const SAMPLE_DATA_OFFSET = 54;
const SAMPLE_BYTES_PER_FRAME = 4;
const SAMPLE_RATE = 44100;

// Map drum part IDs to HOSIMI default key numbers
const PAD_TO_KEY: Record<string, number> = {
  kick: 36,
  snare: 38,
  "hihat-closed": 42,
  "hihat-pedal": 44,
  "hihat-open": 46,
  "tom-high": 41,  // maps to Hoshimi smallTom sample (41)
  "tom-mid": 45,   // maps to Hoshimi middleTom sample (45)
  "tom-floor": 43, // maps to Hoshimi floorTom sample (43)
  crash: 49,
  ride: 51,
};

class DrumSynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume = 0.8;
  private currentKitId: string = DEFAULT_DRUM_KIT_ID;
  private masterAudioBuffer: AudioBuffer | null = null;
  private kitBuffers = new Map<string, Map<number, AudioBuffer>>();
  private loading: Promise<AudioBuffer | null> | null = null;
  private loadingRegions = new Map<string, Promise<AudioBuffer | null>>();
  private rangeSupported: Promise<boolean> | null = null;
  private preloadingKits = new Set<string>();
  private openHiHatSource: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private listeners: Set<(kitId: string) => void> = new Set();

  constructor() {
    try {
      const saved = localStorage.getItem("drumup_selected_kit");
      if (saved && DRUM_KITS_MAP[saved]) {
        this.currentKitId = saved;
      }
    } catch {
      // Ignore localStorage read errors
    }
  }

  public init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        console.warn("Web Audio API is not supported in this browser.");
        return;
      }

      // Optimize for interactive low latency
      this.ctx = new AudioContextClass({ latencyHint: "interactive" });
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }

    void this.preloadKit(this.currentKitId);
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  public getCurrentKitId(): string {
    return this.currentKitId;
  }

  public getCurrentKit(): DrumKitPreset {
    return DRUM_KITS_MAP[this.currentKitId] || DRUM_KITS[0];
  }

  public setKit(kitId: string) {
    if (!DRUM_KITS_MAP[kitId]) {
      console.warn(`Unknown drum kit ID: ${kitId}`);
      return;
    }

    this.currentKitId = kitId;
    try {
      localStorage.setItem("drumup_selected_kit", kitId);
    } catch {
      // Ignore localStorage errors
    }

    this.init();
    void this.preloadKit(kitId);

    this.listeners.forEach((listener) => {
      try {
        listener(kitId);
      } catch (err) {
        console.error("Error in drum kit change listener:", err);
      }
    });
  }

  public onKitChange(listener: (kitId: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Let interactive views finish loading before accepting timing-sensitive hits.
  public async prepareKit(): Promise<boolean> {
    this.init();
    if (!this.ctx) return false;
    const kitId = this.currentKitId;
    const buffers = await Promise.all(
      Object.keys(DRUM_KITS_MAP[kitId].regions).map(key => this.loadRegion(kitId, Number(key)))
    );
    return buffers.length > 0 && buffers.every(buffer => buffer !== null);
  }

  public trigger(padId: string | number, velocity = 1.0) {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }

    let key: number | undefined;
    if (typeof padId === "number") {
      key = padId;
    } else {
      key = PAD_TO_KEY[padId];
      if (!key) {
        const num = parseInt(padId, 10);
        if (!isNaN(num)) key = num;
      }
    }

    if (!key) {
      console.warn(`Unknown pad trigger: ${padId}`);
      return;
    }

    if (padId === "hihat-closed" || padId === "hihat-pedal" || key === 42 || key === 44) {
      this.chokeOpenHiHat();
    }

    const isOpenHiHat = padId === "hihat-open" || key === 46;

    const currentMap = this.kitBuffers.get(this.currentKitId);
    const buffer = currentMap?.get(key);

    if (!buffer) {
      void this.loadRegion(this.currentKitId, key).then((loaded) => {
        if (loaded) this.playBuffer(loaded, velocity, isOpenHiHat);
      });
      return;
    }

    this.playBuffer(buffer, velocity, isOpenHiHat);
  }

  private async preloadKit(kitId: string) {
    if (this.preloadingKits.has(kitId)) return;
    this.preloadingKits.add(kitId);
    const keys = Object.keys(DRUM_KITS_MAP[kitId]?.regions ?? {}).map(Number);
    // Make the two most common hits available first, then fill the cache.
    for (const key of [38, 36, ...keys.filter((key) => key !== 38 && key !== 36)]) {
      await this.loadRegion(kitId, key);
    }
    if (this.kitBuffers.get(kitId)?.size !== keys.length) this.preloadingKits.delete(kitId);
  }

  private async supportsRanges(): Promise<boolean> {
    if (!this.rangeSupported) {
      this.rangeSupported = fetch(SAMPLE_URL, { cache: "no-store", headers: { Range: "bytes=0-53" } })
        .then((response) => {
          if (response.status === 206) {
            void response.body?.cancel();
            return true;
          }
          if (!response.ok) throw new Error(`Failed to load drum sample: ${response.status}`);
          this.loading = this.decodeMasterSample(response);
          return false;
        }).catch((error) => {
          this.rangeSupported = null;
          throw error;
        });
    }
    return this.rangeSupported;
  }

  private loadRegion(kitId: string, key: number): Promise<AudioBuffer | null> {
    const existing = this.kitBuffers.get(kitId)?.get(key);
    if (existing) return Promise.resolve(existing);
    const region = DRUM_KITS_MAP[kitId]?.regions[key];
    if (!region || !this.ctx) return Promise.resolve(null);

    const id = `${kitId}:${key}`;
    const pending = this.loadingRegions.get(id);
    if (pending) return pending;

    const loading = (async () => {
      if (!(await this.supportsRanges())) {
        const master = await this.loadMasterSample();
        return master ? this.ensureKitBuffers(kitId, master).get(key) ?? null : null;
      }

      const start = SAMPLE_DATA_OFFSET + region.offset * SAMPLE_BYTES_PER_FRAME;
      const end = SAMPLE_DATA_OFFSET + (region.end + 1) * SAMPLE_BYTES_PER_FRAME - 1;
      const response = await fetch(SAMPLE_URL, { cache: "no-store", headers: { Range: `bytes=${start}-${end}` } });
      if (response.status !== 206) throw new Error(`Failed to load drum region: ${response.status}`);
      const bytes = await response.arrayBuffer();
      const frames = region.end - region.offset + 1;
      if (bytes.byteLength !== frames * SAMPLE_BYTES_PER_FRAME) {
        throw new Error(`Incomplete drum region ${kitId}:${key}: ${bytes.byteLength}/${frames * SAMPLE_BYTES_PER_FRAME} bytes`);
      }
      const buffer = this.ctx!.createBuffer(1, frames, SAMPLE_RATE);
      const output = buffer.getChannelData(0);
      const source = new DataView(bytes);
      for (let i = 0; i < frames; i += 1) output[i] = source.getFloat32(i * SAMPLE_BYTES_PER_FRAME, true);
      const kit = this.kitBuffers.get(kitId) ?? new Map<number, AudioBuffer>();
      kit.set(key, buffer);
      this.kitBuffers.set(kitId, kit);
      return buffer;
    })().catch((error) => {
      console.error("Failed to load drum region:", error);
      return null;
    }).finally(() => this.loadingRegions.delete(id));

    this.loadingRegions.set(id, loading);
    return loading;
  }

  private async loadMasterSample(): Promise<AudioBuffer | null> {
    if (this.masterAudioBuffer) return this.masterAudioBuffer;
    if (this.loading) return this.loading;
    if (!this.ctx) return null;

    this.loading = this.decodeMasterSample(await fetch(SAMPLE_URL));
    return this.loading;
  }

  private decodeMasterSample(response: Response): Promise<AudioBuffer | null> {
    return (async () => {
      if (!response.ok) {
        throw new Error(`Failed to load master drum sample: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      if (!this.ctx) return null;

      const decoded = await this.ctx.decodeAudioData(arrayBuffer);
      this.masterAudioBuffer = decoded;

      // Preload current kit
      this.ensureKitBuffers(this.currentKitId, decoded);
      return decoded;
    })().catch((error) => {
      console.error("Failed to decode master drum sample:", error);
      this.loading = null;
      return null;
    });

  }

  private ensureKitBuffers(kitId: string, sourceBuffer: AudioBuffer): Map<number, AudioBuffer> {
    const preset = DRUM_KITS_MAP[kitId] || DRUM_KITS_MAP[DEFAULT_DRUM_KIT_ID] || DRUM_KITS[0];
    const existing = this.kitBuffers.get(kitId);
    if (existing && existing.size === Object.keys(preset.regions).length) return existing;
    const kitMap = new Map<number, AudioBuffer>();

    Object.values(preset.regions).forEach((region) => {
      kitMap.set(region.key, this.sliceBuffer(sourceBuffer, region.offset, region.end));
    });

    this.kitBuffers.set(kitId, kitMap);
    return kitMap;
  }

  private sliceBuffer(source: AudioBuffer, offset: number, end: number) {
    if (!this.ctx) throw new Error("AudioContext not initialized");

    // Scale frame offsets relative to source sampleRate vs original 44100Hz sample rate
    // to correct resampling latency shifts (typically 48kHz system output)
    const scale = source.sampleRate / 44100;
    const startFrame = Math.max(0, Math.round(offset * scale));
    const endFrame = Math.min(source.length - 1, Math.round(end * scale));
    const frameCount = Math.max(1, endFrame - startFrame + 1);

    const output = this.ctx.createBuffer(source.numberOfChannels, frameCount, source.sampleRate);

    for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
      const channelData = source.getChannelData(channel).subarray(startFrame, startFrame + frameCount);
      output.copyToChannel(channelData, channel);
    }

    return output;
  }

  private playBuffer(buffer: AudioBuffer, velocity: number, isOpenHiHat: boolean) {
    if (!this.ctx || !this.masterGain) return;

    const vel = velocity > 1 ? velocity / 127 : velocity;
    const gainScale = Math.max(0.08, Math.min(1, vel));
    const time = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();

    source.buffer = buffer;
    gain.gain.setValueAtTime(gainScale, time);

    source.connect(gain);
    gain.connect(this.masterGain);
    source.start(time);

    if (isOpenHiHat) {
      this.openHiHatSource = { source, gain };
    }

    source.onended = () => {
      if (this.openHiHatSource?.source === source) {
        this.openHiHatSource = null;
      }
      source.disconnect();
      gain.disconnect();
    };
  }

  private chokeOpenHiHat() {
    if (!this.ctx || !this.openHiHatSource) return;

    const time = this.ctx.currentTime;
    const { source, gain } = this.openHiHatSource;
    gain.gain.cancelScheduledValues(time);
    gain.gain.setTargetAtTime(0, time, 0.018);
    source.stop(time + 0.08);
    this.openHiHatSource = null;
  }

  public playMetronomeClick(accented = false) {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.frequency.setValueAtTime(accented ? 1000 : 650, time);

    gain.gain.setValueAtTime(accented ? 0.35 : 0.22, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

    osc.start(time);
    osc.stop(time + 0.1);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}

export const drumSynth = new DrumSynth();
