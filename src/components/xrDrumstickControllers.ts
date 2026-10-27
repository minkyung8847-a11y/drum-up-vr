import * as THREE from 'three';
import { createVirtualDrumsticks } from './virtualDrumsticks';
import type { StickHand } from './virtualDrumsticks';

export interface StickPose {
  position: [number, number, number]; // metres, relative to grip (XR) or camera (preview)
  rotation: [number, number, number]; // degrees, XYZ
}
export const DEFAULT_GRIP_OFFSETS: Record<StickHand, StickPose> = {
  // A modest upward stick angle from the physical grip; each hand can still
  // be calibrated in Stick setup for the controller model and playing grip.
  left: { position: [0, 0, 0], rotation: [12, 0, 0] },
  right: { position: [0, 0, 0], rotation: [12, 0, 0] },
};
export function applyStickPose(object: THREE.Object3D, pose: StickPose) {
  object.position.fromArray(pose.position);
  object.rotation.set(...pose.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]);
}

// Three.js owns the grip transforms each XR frame. Only calibration transforms
// below those grips are ours; desktop preview poses never enter this hierarchy.
export function createXRDrumstickControllers(xr: THREE.WebXRManager, rig: THREE.Group) {
  const parking = new THREE.Group();
  const sticks = createVirtualDrumsticks(parking, false);
  const offsets = structuredClone(DEFAULT_GRIP_OFFSETS);
  let active = false;
  const tipSamples = {
    left: { valid: false, previous: new THREE.Vector3(), current: new THREE.Vector3(), grip: new THREE.Vector3() },
    right: { valid: false, previous: new THREE.Vector3(), current: new THREE.Vector3(), grip: new THREE.Vector3() },
  };
  // Gaze/transient/hand inputs may occupy earlier Three.js source slots.
  // Reserve room for them without assigning handedness from the slot index.
  const slots = [0, 1, 2, 3].map(index => {
    const grip = xr.getControllerGrip(index);
    const calibration = new THREE.Group();
    calibration.name = `controller-${index}-stick-offset`;
    grip.add(calibration);
    rig.add(grip);
    return { grip, calibration, hand: null as StickHand | null, source: null as XRInputSource | null };
  });
  function disconnect(slot: typeof slots[number]) {
    if (!slot.hand) return;
    const hand = slot.hand;
    parking.add(sticks.grips[hand]);
    sticks.grips[hand].visible = false;
    tipSamples[hand].valid = false;
    slot.hand = null;
    slot.source = null;
  }
  const listeners = slots.map(slot => {
    const connected = (event: { data: XRInputSource }) => {
      disconnect(slot);
      const source = event.data;
      if (source.hand || !source.gripSpace || source.targetRayMode !== 'tracked-pointer') return;
      if (source.handedness !== 'left' && source.handedness !== 'right') return;
      const hand = source.handedness;
      for (const other of slots) if (other.hand === hand) disconnect(other);
      slot.hand = hand;
      slot.source = source;
      tipSamples[hand].valid = false;
      applyStickPose(slot.calibration, offsets[hand]);
      slot.calibration.add(sticks.grips[hand]);
      sticks.grips[hand].visible = active;
    };
    const disconnected = () => disconnect(slot);
    slot.grip.addEventListener('connected', connected);
    slot.grip.addEventListener('disconnected', disconnected);
    return { connected, disconnected };
  });
  for (const hand of ['left', 'right'] as const) sticks.grips[hand].visible = false;
  return {
    tips: sticks.tips,
    tipSamples,
    setActive(value: boolean) {
      active = value;
      tipSamples.left.valid = tipSamples.right.valid = false;
      for (const slot of slots) {
        // Keep a still-connected source bound across deactivation/reactivation.
        // Only the actual disconnected event releases its handedness binding.
        if (slot.hand) sticks.grips[slot.hand].visible = value;
      }
    },
    setOffset(hand: StickHand, pose: StickPose) {
      offsets[hand] = structuredClone(pose);
      tipSamples[hand].valid = false;
      const slot = slots.find(item => item.hand === hand);
      if (slot) applyStickPose(slot.calibration, pose);
    },
    pulse(hand: StickHand, velocity: number) {
      const source = slots.find(slot => slot.hand === hand)?.source;
      if (!active || !source?.gamepad) return;
      // XR gamepads normally expose pulse(); some expose dual-rumble instead.
      // Neither unsupported actuators nor rejected promises can stop playback.
      const pad = source.gamepad;
      const strength = THREE.MathUtils.clamp(0.12 + velocity * 0.18, 0.12, 0.3);
      try {
        const actuator = pad.hapticActuators?.[0];
        if (actuator?.pulse) void Promise.resolve(actuator.pulse(strength, 18)).catch(() => {});
        else if (pad.vibrationActuator?.playEffect) {
          void Promise.resolve(pad.vibrationActuator.playEffect('dual-rumble', {
            duration: 18, startDelay: 0, weakMagnitude: strength, strongMagnitude: strength * 0.5,
          })).catch(() => {});
        }
      } catch { /* Haptics are optional. */ }
    },
    resetSamples() { tipSamples.left.valid = tipSamples.right.valid = false; },
    setRightPointerActive(enabled: boolean) {
      if (enabled) {
        sticks.grips.right.visible = false;
        tipSamples.right.valid = false;
      }
    },
    update(frame?: XRFrame) {
      rig.updateWorldMatrix(true, true);
      const reference = xr.getReferenceSpace?.();
      for (const hand of ['left', 'right'] as const) {
        const slot = slots.find(item => item.hand === hand);
        const sample = tipSamples[hand];
        const pose = frame && reference && slot?.source?.gripSpace
          ? frame.getPose(slot.source.gripSpace, reference) : null;
        if (!active || !slot || !slot.grip.visible
          || (frame && (frame.session.visibilityState !== 'visible' || !pose || pose.emulatedPosition))) {
          sample.valid = false;
          sticks.grips[hand].visible = false;
          continue;
        }
        sticks.grips[hand].visible = true;
        sample.previous.copy(sample.current);
        sample.grip.setFromMatrixPosition(slot.grip.matrixWorld);
        sample.current.setFromMatrixPosition(sticks.tips[hand].matrixWorld);
        if (!sample.valid) sample.previous.copy(sample.current);
        sample.valid = true;
      }
    },
    dispose() {
      slots.forEach((slot, index) => {
        disconnect(slot);
        slot.grip.removeEventListener('connected', listeners[index].connected);
        slot.grip.removeEventListener('disconnected', listeners[index].disconnected);
        slot.calibration.removeFromParent();
        slot.grip.removeFromParent();
      });
      sticks.dispose();
    },
  };
}
