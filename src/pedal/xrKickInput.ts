import type { StickHand } from '../components/virtualDrumsticks';

// Primary squeeze is the physical Grip (xr-standard buttons[1]). Use XR events,
// not a second gamepad poller, so each press has one input path.
export function attachXRKickInput(session: XRSession, enabled: () => boolean,
  trigger: (velocity: number, hand?: StickHand) => boolean, pulse: (hand: StickHand, velocity: number) => void,
  setHiHatClosed: (closed: boolean) => void = () => {}) {
  const held = new Set<XRInputSource>();
  setHiHatClosed(false);
  const press = (event: XRInputSourceEvent) => {
    const source = event.inputSource;
    if (!enabled() || source.hand || !source.gripSpace || source.targetRayMode !== 'tracked-pointer'
      || session.visibilityState !== 'visible' || (source.handedness !== 'left' && source.handedness !== 'right')) return;
    if (held.has(source)) return;
    held.add(source);
    if (source.handedness === 'left') setHiHatClosed(true);
    else if (trigger(1, 'right')) pulse('right', 1);
  };
  const release = (event: XRInputSourceEvent) => {
    if (held.delete(event.inputSource) && event.inputSource.handedness === 'left') setHiHatClosed(false);
  };
  const reset = () => { held.clear(); setHiHatClosed(false); };
  const visibility = () => { if (session.visibilityState !== 'visible') reset(); };
  const sourcesChanged = (event: XRInputSourcesChangeEvent) => {
    for (const source of event.removed) {
      if (held.delete(source) && source.handedness === 'left') setHiHatClosed(false);
    }
  };
  session.addEventListener('squeezestart', press);
  session.addEventListener('squeezeend', release);
  session.addEventListener('visibilitychange', visibility);
  session.addEventListener('inputsourceschange', sourcesChanged);
  session.addEventListener('end', reset);
  return () => {
    session.removeEventListener('squeezestart', press);
    session.removeEventListener('squeezeend', release);
    session.removeEventListener('visibilitychange', visibility);
    session.removeEventListener('inputsourceschange', sourcesChanged);
    session.removeEventListener('end', reset);
    reset();
  };
}
