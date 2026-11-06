// Shared by remote input, controller buttons and existing kick strikes/clicks.
// No timers/audio system here: the existing VR interaction owns sound + motion.
export function createKickTrigger(ready: () => boolean, hit: (id: string, velocity: number) => boolean) {
  return (velocity = 1) => {
    if (!ready() || !Number.isFinite(velocity) || velocity <= 0 || velocity > 1) return false;
    return hit('kick', velocity);
  };
}
