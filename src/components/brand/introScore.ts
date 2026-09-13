export type IntroVoice = "kick" | "snare" | "hat" | "crash";
export const INTRO_SCORE: { time: number; voice: IntroVoice; progress?: number }[] = [
  { time: 0.12, voice: "kick" }, { time: 0.5, voice: "kick" },
  { time: 0.85, voice: "kick" }, { time: 1.15, voice: "snare" },
  { time: 1.45, voice: "hat" }, { time: 1.75, voice: "kick" },
  { time: 2, voice: "kick", progress: 0.12 }, { time: 2.1875, voice: "hat", progress: 0.23 },
  { time: 2.375, voice: "snare", progress: 0.39 }, { time: 2.5625, voice: "hat", progress: 0.47 },
  { time: 2.75, voice: "kick", progress: 0.63 }, { time: 2.9375, voice: "hat", progress: 0.72 },
  { time: 3.125, voice: "snare", progress: 0.86 }, { time: 3.3125, voice: "hat", progress: 0.92 },
  { time: 3.5, voice: "kick", progress: 1 }, { time: 3.6875, voice: "hat" },
  { time: 3.875, voice: "snare" }, { time: 4.0625, voice: "hat" },
  { time: 4.25, voice: "kick" }, { time: 4.4375, voice: "hat" },
  { time: 4.6, voice: "snare" }, { time: 4.775, voice: "hat" },
  { time: 4.925, voice: "hat" },
  { time: 5.2, voice: "kick" }, { time: 5.2, voice: "crash" },
];

/** A disposable intro-only audio bus. Never touches the app's synth, volume or MIDI. */
export class IntroAudio {
  readonly context = new AudioContext({ latencyHint: "interactive" });
  private output = this.context.createGain();
  private noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
  private scheduled = new Set<number>();
  private disposed = false;
  constructor() {
    this.output.gain.value = 0.28;
    this.output.connect(this.context.destination);
    const samples = this.noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  }
  schedule(elapsed: number, audioNow: number) {
    if (this.disposed || this.context.state !== "running") return;
    INTRO_SCORE.forEach((beat, index) => {
      if (beat.time < elapsed - 0.025 || beat.time > elapsed + 0.13 || this.scheduled.has(index)) return;
      this.scheduled.add(index);
      const when = audioNow + Math.max(0, beat.time - elapsed);
      const envelope = this.context.createGain(); envelope.connect(this.output);
      if (beat.voice === "kick") {
        const tone = this.context.createOscillator(); tone.connect(envelope);
        tone.frequency.setValueAtTime(145, when); tone.frequency.exponentialRampToValueAtTime(43, when + 0.13);
        envelope.gain.setValueAtTime(0.9, when); envelope.gain.exponentialRampToValueAtTime(0.001, when + 0.26);
        tone.start(when); tone.stop(when + 0.28);
        tone.onended = () => { tone.disconnect(); envelope.disconnect(); };
      } else {
        const source = this.context.createBufferSource(); source.buffer = this.noise;
        const filter = this.context.createBiquadFilter(); filter.type = "highpass";
        filter.frequency.value = beat.voice === "snare" ? 1100 : 6500;
        source.connect(filter); filter.connect(envelope);
        const duration = beat.voice === "crash" ? 0.42 : beat.voice === "snare" ? 0.13 : 0.035;
        envelope.gain.setValueAtTime(beat.voice === "hat" ? 0.17 : 0.42, when);
        envelope.gain.exponentialRampToValueAtTime(0.001, when + duration);
        source.start(when); source.stop(when + duration + 0.01);
        source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
      }
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.output.disconnect();
    void this.context.close().catch(() => {});
  }
}
