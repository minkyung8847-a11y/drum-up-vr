export const FOOT_PEDAL_KEY = 'drumup.vr.foot-pedal.v1';
export const FOOT_PEDAL_PULSE_MS = 120;
export interface FootPedalState {
  code: string; label: string; enabled: boolean; detecting: boolean; testing: boolean; pressed: boolean;
  status: 'UNKNOWN' | 'WAITING FOR INPUT' | 'INPUT DETECTED'; message: string;
  eventCode: string; eventKey: string; down: number; up: number; repeat: boolean; ignoredRepeats: number;
  immersive: boolean; lastInput: number | null; played: boolean | null; saved: boolean;
}
export function createFootPedal(target: Window, options: {
  kick: () => boolean | Promise<boolean>; active: () => boolean; changed: (state: FootPedalState) => void;
}) {
  let binding = 'Space', enabled = true;
  try { const saved = JSON.parse(target.localStorage.getItem(FOOT_PEDAL_KEY) ?? 'null');
    if (saved?.version === 1 && typeof saved.code === 'string' && saved.code.length > 0 && saved.code.length < 80 && saved.code !== 'Escape') {
      binding = saved.code; enabled = saved.enabled !== false;
    }
  } catch { /* Use Space if storage is unavailable. */ }
  const label = (code: string) => code === 'Space' ? 'SPACE' : code;
  const state: FootPedalState = { code: binding, label: label(binding), enabled, detecting: false, testing: false,
    pressed: false, status: 'UNKNOWN', message: 'USB 연결 여부는 브라우저에서 확인할 수 없습니다.',
    eventCode: '', eventKey: '', down: 0, up: 0, repeat: false, ignoredRepeats: 0, immersive: false, lastInput: null, played: null, saved: true };
  const held = new Set<string>();
  let lastHit = -Infinity, waitingSince = 0, pulseUntil = 0, generation = 0;
  const publish = () => options.changed({ ...state });
  const save = () => {
    try { target.localStorage.setItem(FOOT_PEDAL_KEY, JSON.stringify({ version: 1, code: state.code, enabled: state.enabled })); state.saved = true; }
    catch { state.saved = false; }
  };
  const reset = () => { held.clear(); pulseUntil = 0; state.pressed = false; generation++; publish(); };
  const pulse = () => { state.pressed = true; pulseUntil = performance.now() + FOOT_PEDAL_PULSE_MS; };
  const consume = (event: KeyboardEvent) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const editable = (event: KeyboardEvent) => event.composedPath().some(node => node instanceof HTMLElement
    && (node.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName)));
  const codeFor = (event: KeyboardEvent) => event.code || (event.key === ' ' ? 'Space' : event.key);
  const record = (event: KeyboardEvent) => {
    state.eventCode = event.code; state.eventKey = event.key; state.repeat = event.repeat; state.lastInput = Date.now();
    state.status = 'INPUT DETECTED';
  };
  const keydown = (event: KeyboardEvent) => {
    const code = codeFor(event);
    if (!state.enabled) return;
    // Holding the hardware key is NOT another strike or another UI update.
    // Keep a separate physical latch even after the short indicator pulse ends.
    if (held.has(code)) {
      consume(event); state.down++; state.repeat = event.repeat; state.ignoredRepeats++; return;
    }
    if (!options.active()) return;
    if (event.repeat && (state.detecting || (code === state.code && !editable(event)))) {
      consume(event); state.down++; state.repeat = true; state.ignoredRepeats++; return;
    }
    if (state.detecting) {
      consume(event); record(event); state.down++;
      if (code === 'Escape') { cancel(); return; }
      if (!code || code === 'Unidentified' || event.repeat || event.isComposing) { publish(); return; }
      held.add(code); state.code = code; state.label = label(code); state.detecting = false; pulse();
      save();
      state.message = state.saved ? '키 할당 저장됨 · 페달을 놓은 뒤 다시 밟아 테스트하세요.' : '키 할당됨 · 저장 불가 (이번 세션만 적용)';
      publish(); return;
    }
    if (code !== state.code || editable(event) || event.isComposing
      || (event.ctrlKey && !code.startsWith('Control')) || (event.altKey && !code.startsWith('Alt'))
      || (event.metaKey && !code.startsWith('Meta'))) return;
    consume(event); record(event); state.down++;
    state.message = '키 입력 수신 · USB 장치 신원/연결 여부는 확인할 수 없습니다.';
    held.add(code); pulse();
    const now = performance.now();
    if (now - lastHit >= 35) {
      lastHit = now; const current = generation;
      try {
        const played = options.kick();
        // An already unlocked kit plays synchronously: publish the edge/result
        // together, without another microtask and UI invalidation per kick.
        if (typeof played === 'boolean') state.played = played;
        else played.then(result => { if (generation === current) { state.played = result; publish(); } })
          .catch(() => { if (generation === current) { state.played = false; publish(); } });
      } catch { state.played = false; }
    }
    publish();
  };
  const keyup = (event: KeyboardEvent) => {
    if (!state.enabled) return;
    const code = codeFor(event);
    if (!held.has(code) && !(options.active() && !editable(event) && code === state.code) && !state.detecting) return;
    consume(event); held.delete(code); record(event); state.up++; pulseUntil = 0; state.pressed = false; publish();
  };
  function cancel() { state.detecting = false; state.testing = false; state.message = '입력 대기 취소됨'; reset(); }
  function wait(detecting: boolean) {
    if (!state.enabled) { state.message = 'ENABLE FOOT PEDAL을 먼저 켜세요.'; publish(); return; }
    reset(); state.detecting = detecting; state.testing = !detecting; state.status = 'WAITING FOR INPUT'; state.played = null;
    state.message = detecting ? 'PRESS YOUR FOOT PEDAL' : '페달을 밟아 킥드럼 입력을 테스트하세요.';
    waitingSince = performance.now(); publish();
  }
  const blur = () => { if (!state.immersive || !options.active()) reset(); };
  target.addEventListener('keydown', keydown, true); target.addEventListener('keyup', keyup, true);
  target.addEventListener('blur', blur);
  publish();
  return {
    state, detect: () => wait(true), test: () => wait(false), cancel,
    setEnabled(value: boolean) {
      state.enabled = value; state.detecting = false; state.testing = false; state.played = null;
      state.status = 'WAITING FOR INPUT'; save();
      state.message = value ? '페달 활성화 · 입력을 기다립니다.' : '페달 비활성화 · 오른쪽 Grip은 계속 사용할 수 있습니다.';
      if (!state.saved) state.message += ' (저장 불가: 이번 세션만 적용)';
      reset();
    },
    setImmersive(value: boolean) {
      state.immersive = value; state.detecting = false; state.testing = false; state.status = 'WAITING FOR INPUT';
      state.lastInput = null; state.eventCode = ''; state.eventKey = ''; state.down = 0; state.up = 0; state.ignoredRepeats = 0; state.played = null;
      state.message = '이 모드에서 페달을 밟아 입력을 확인하세요.'; waitingSince = performance.now(); reset();
    },
    tick(now: number) {
      if (state.pressed && now >= pulseUntil) {
        // Release the visual pulse, never the physical latch. Only a real keyup
        // rearms the next kick, so a held key cannot retrigger after this timeout.
        pulseUntil = 0; state.pressed = false; publish();
      }
      if ((state.detecting || state.testing) && now - waitingSince > 12000 && state.status === 'WAITING FOR INPUT') {
        waitingSince = Infinity;
        state.message = '입력 미감지 · 브라우저 포커스/USB 연결 확인. WebXR에서 키 전달이 제한될 수 있습니다.'; publish();
      }
    },
    dispose() { target.removeEventListener('keydown', keydown, true); target.removeEventListener('keyup', keyup, true); target.removeEventListener('blur', blur); generation++; },
  };
}
export type FootPedalController = ReturnType<typeof createFootPedal>;

// Gate only the two added/button input paths; existing stick and note logic is untouched.
export function createPedalGripGate(now = () => performance.now()) {
  let previous: 'pedal' | 'grip' | null = null, at = -Infinity;
  return (source: 'pedal' | 'grip', hit: () => boolean) => {
    const time = now();
    if (source !== previous && time - at < 45) return false;
    const played = hit();
    if (played) { previous = source; at = time; }
    return played;
  };
}
