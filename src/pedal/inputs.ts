export type KickInput = (velocity: number, source: string) => void;

export function attachSpaceInput(target: Window, kick: KickInput) {
  let down = false;
  const keydown = (event: KeyboardEvent) => {
    if (event.code !== 'Space' || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    const element = event.target as HTMLElement | null;
    if (element?.closest('input,select,textarea,[contenteditable="true"]')) return;
    event.preventDefault(); // Includes focused TEST button: no native click double-hit.
    if (down || event.repeat) return;
    down = true; kick(1, 'Space / USB 키보드 페달');
  };
  const keyup = (event: KeyboardEvent) => { if (event.code === 'Space') down = false; };
  const reset = () => { down = false; };
  target.addEventListener('keydown', keydown); target.addEventListener('keyup', keyup); target.addEventListener('blur', reset);
  return () => { target.removeEventListener('keydown', keydown); target.removeEventListener('keyup', keyup); target.removeEventListener('blur', reset); };
}

export function attachHiHatKeyInput(target: Window, change: (pressed: boolean) => void, code = 'KeyZ') {
  let down = false;
  const keydown = (event: KeyboardEvent) => {
    if (event.code !== code || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    const element = event.target as HTMLElement | null;
    if (element?.closest('input,select,textarea,[contenteditable="true"]')) return;
    event.preventDefault();
    if (down || event.repeat) return;
    down = true; change(true);
  };
  const keyup = (event: KeyboardEvent) => {
    if (event.code !== code || !down) return;
    down = false; change(false);
  };
  const reset = () => { if (down) { down = false; change(false); } };
  target.addEventListener('keydown', keydown); target.addEventListener('keyup', keyup); target.addEventListener('blur', reset);
  return () => { reset(); target.removeEventListener('keydown', keydown); target.removeEventListener('keyup', keyup); target.removeEventListener('blur', reset); };
}

// MIDI percussion may legitimately send Note On repeatedly without Note Off.
// Accept positive Note On only, preserve velocity; ignore release/clock/CC.
export function midiKick(data: ArrayLike<number>, notes: number[], channel: number | null) {
  if (data.length < 3 || (data[0] & 0xf0) !== 0x90 || !notes.includes(data[1])
    || data[2] < 1 || data[2] > 127 || (channel !== null && (data[0] & 15) !== channel)) return null;
  return data[2] / 127;
}

export function midiHiHat(data: ArrayLike<number>, control: number, threshold: number,
  closedWhenLow: boolean, channel: number | null) {
  if (!Number.isInteger(control) || control < 0 || control > 127
    || !Number.isInteger(threshold) || threshold < 1 || threshold > 127
    || data.length < 3 || (data[0] & 0xf0) !== 0xb0 || data[1] !== control || data[2] > 127
    || (channel !== null && (data[0] & 15) !== channel)) return null;
  return closedWhenLow ? data[2] < threshold : data[2] >= threshold;
}

export interface HIDMapping { reportId: number; byte: number; mask: number; pressed: number }
export function createHIDEdge(mapping: HIDMapping, kick: KickInput, now = () => performance.now()) {
  if (![mapping.reportId, mapping.byte, mapping.mask, mapping.pressed].every(Number.isInteger)
    || mapping.reportId < 0 || mapping.reportId > 255 || mapping.byte < 0 || mapping.byte > 1023
    || mapping.mask < 1 || mapping.mask > 255 || mapping.pressed < 0 || mapping.pressed > 255
    || (mapping.pressed & mapping.mask) !== mapping.pressed) throw Error('HID 바이트·마스크·눌림 값을 확인하세요.');
  // Start unarmed: the first observed release is required, including reconnect.
  let released = false;
  let lastHit = -Infinity;
  return (reportId: number, data: DataView) => {
    if (reportId !== mapping.reportId || mapping.byte >= data.byteLength) return;
    const pressed = (data.getUint8(mapping.byte) & mapping.mask) === mapping.pressed;
    if (!pressed) released = true;
    else if (released) {
      released = false;
      const time = now();
      // Reject contact bounce, while allowing well over normal foot-roll speed.
      if (time - lastHit >= 20) { lastHit = time; kick(1, 'USB HID'); }
    }
  };
}

export function createHIDState(mapping: HIDMapping, change: (pressed: boolean) => void) {
  if (![mapping.reportId, mapping.byte, mapping.mask, mapping.pressed].every(Number.isInteger)
    || mapping.reportId < 0 || mapping.reportId > 255 || mapping.byte < 0 || mapping.byte > 1023
    || mapping.mask < 1 || mapping.mask > 255 || mapping.pressed < 0 || mapping.pressed > 255
    || (mapping.pressed & mapping.mask) !== mapping.pressed) throw Error('왼쪽 HID 바이트·마스크·눌림 값을 확인하세요.');
  let previous: boolean | null = null;
  return (reportId: number, data: DataView) => {
    if (reportId !== mapping.reportId || mapping.byte >= data.byteLength) return;
    const pressed = (data.getUint8(mapping.byte) & mapping.mask) === mapping.pressed;
    if (pressed !== previous) { previous = pressed; change(pressed); }
  };
}

export interface PedalHIDDevice extends EventTarget {
  productName: string; opened: boolean;
  open(): Promise<void>; close(): Promise<void>;
}
export interface PedalHID extends EventTarget {
  requestDevice(options: { filters: { vendorId: number; productId: number }[] }): Promise<PedalHIDDevice[]>;
}
export interface PedalHIDEvent extends Event { device: PedalHIDDevice; data: DataView; reportId: number }
