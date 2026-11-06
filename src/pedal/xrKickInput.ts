import type { StickHand } from '../components/virtualDrumsticks';

// WebXR emits one squeezestart per press; holding a grip never repeats a kick.
// Opt-in, and independent of controller indices / drumstick tracking.
export function attachXRKickInput(session: XRSession, enabled: () => boolean,
  trigger: (velocity: number) => boolean, pulse: (hand: StickHand, velocity: number) => void) {
  const press = (event: XRInputSourceEvent) => {
    const source = event.inputSource;
    if (!enabled() || source.hand || !source.gripSpace || source.targetRayMode !== 'tracked-pointer'
      || session.visibilityState !== 'visible' || (source.handedness !== 'left' && source.handedness !== 'right')) return;
    if (trigger(1)) pulse(source.handedness, 1);
  };
  session.addEventListener('squeezestart', press);
  return () => session.removeEventListener('squeezestart', press);
}
