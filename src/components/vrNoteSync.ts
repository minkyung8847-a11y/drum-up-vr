// Recording-specific first full bar, measured from the supplied decoded MP3.
// The JSON remains relative to this bar; count-in and travel are separate.
export const LOVE_CHART_OFFSET_SECONDS = 2.90;
export const NOTE_SYNC_KEY = 'drumup.vr.note-sync-ms.v1';
export function getNoteSyncMs() {
  try { const value = Number(localStorage.getItem(NOTE_SYNC_KEY)); return Number.isFinite(value) ? Math.max(-5000, Math.min(5000, Math.round(value / 10) * 10)) : 0; }
  catch { return 0; }
}
export function setNoteSyncMs(value: number) {
  const next = Math.max(-5000, Math.min(5000, Math.round(value / 10) * 10));
  try { localStorage.setItem(NOTE_SYNC_KEY, String(next)); } catch { /* Current session still works. */ }
  return next;
}
// AudioContext.currentTime is ahead of physical output. Use the browser's
// output timestamp bridge; outputLatency is only a fallback, never both.
export function outputAudioTime(context: AudioContext) {
  const renderTime = context.currentTime;
  const stamp = context.getOutputTimestamp?.();
  if (stamp && Number.isFinite(stamp.contextTime) && Number.isFinite(stamp.performanceTime)
    && stamp.performanceTime! > 0 && stamp.contextTime! > 0) {
    const age = (performance.now() - stamp.performanceTime!) / 1000;
    if (age >= -.05 && age <= .5 && stamp.contextTime! <= renderTime + .01)
      return Math.min(renderTime, Math.max(0, stamp.contextTime! + Math.max(0, age)));
  }
  const latency = context.outputLatency;
  return Math.max(0, renderTime - (Number.isFinite(latency) && latency > 0 ? latency : 0));
}
