export const VR_ENTRANCE_SESSION_KEY = 'drumup.vr.entrance-seen';

let fullscreenWanted = false;
let ownsFullscreen = false;

export function openVREntrance() {
  try { sessionStorage.removeItem(VR_ENTRANCE_SESSION_KEY); } catch { /* Storage may be disabled. */ }
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
  fullscreenWanted = false;
  if (ownsFullscreen && document.fullscreenElement === document.documentElement) {
    void document.exitFullscreen().catch(() => {});
  }
  ownsFullscreen = false;
}
