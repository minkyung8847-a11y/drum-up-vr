import { drumSynth } from '../utils/synth';

export const VR_ENTRANCE_SESSION_KEY = 'drumup.vr.entrance-seen';

let fullscreenWanted = false;
let ownsFullscreen = false;
let sharedSessionAvailable = false;
let immersiveSessionAvailable: boolean | undefined;
let pendingSession: { mode: XRSessionMode; request: Promise<XRSession> } | null = null;

export function prepareVREntrance() {
  if (window.isSecureContext && navigator.xr) {
    const xr = navigator.xr;
    void Promise.all([
      xr.isSessionSupported('immersive-ar').catch(() => false),
      xr.isSessionSupported('immersive-vr').catch(() => false),
    ]).then(([ar, vr]) => {
      sharedSessionAvailable = ar;
      immersiveSessionAvailable = ar || vr;
    });
  }
}

export function takeVREntranceSession() {
  const pending = pendingSession;
  pendingSession = null;
  return pending;
}

export function openVREntrance() {
  try { sessionStorage.removeItem(VR_ENTRANCE_SESSION_KEY); } catch { /* Storage may be disabled. */ }
  void drumSynth.unlock();
  if (window.isSecureContext && navigator.xr && immersiveSessionAvailable !== false) {
    const mode = sharedSessionAvailable ? 'immersive-ar' : 'immersive-vr';
    const request = navigator.xr.requestSession(mode, { requiredFeatures: ['local-floor'] });
    void request.catch(() => {});
    pendingSession = { mode, request };
    window.location.hash = '/vr';
    return;
  }
  const root = document.documentElement;
  fullscreenWanted = true;
  if (!document.fullscreenElement) {
    try {
      void root.requestFullscreen?.().then(() => {
        ownsFullscreen = true;
        if (!fullscreenWanted) leaveVREntranceFullscreen();
      }).catch(() => {});
    } catch { /* The entrance also works in a browser tab. */ }
  }
  window.location.hash = '/vr';
}

export function leaveVREntranceFullscreen() {
  const pending = takeVREntranceSession();
  if (pending) void pending.request.then(session => session.end()).catch(() => {});
  fullscreenWanted = false;
  if (ownsFullscreen && document.fullscreenElement === document.documentElement) {
    void document.exitFullscreen().catch(() => {});
  }
  ownsFullscreen = false;
}
