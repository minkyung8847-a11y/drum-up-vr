import * as THREE from 'three';
import { createVirtualDrumsticks } from './virtualDrumsticks';
import type { StickHand } from './virtualDrumsticks';

export interface StickPose {
  position: [number, number, number]; // metres, relative to grip (XR) or camera (preview)
  rotation: [number, number, number]; // degrees, XYZ
}
export const DEFAULT_GRIP_OFFSETS: Record<StickHand, StickPose> = {
  left: { position: [0, 0, 0], rotation: [0, 0, 0] },
  right: { position: [0, 0, 0], rotation: [0, 0, 0] },
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
    left: { valid: false, previous: new THREE.Vector3(), current: new THREE.Vector3() },
    right: { valid: false, previous: new THREE.Vector3(), current: new THREE.Vector3() },
  };
  const slots = [0, 1].map(index => {
    const grip = xr.getControllerGrip(index);
    const calibration = new THREE.Group();
    calibration.name = `controller-${index}-stick-offset`;
    grip.add(calibration);
    rig.add(grip);
    return { grip, calibration, hand: null as StickHand | null };
  });
  function disconnect(slot: typeof slots[number]) {
    if (!slot.hand) return;
    const hand = slot.hand;
    parking.add(sticks.grips[hand]);
    sticks.grips[hand].visible = false;
    tipSamples[hand].valid = false;
    slot.hand = null;
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
      for (const slot of slots) {
        if (!value) disconnect(slot);
        else if (slot.hand) sticks.grips[slot.hand].visible = true;
      }
    },
    setOffset(hand: StickHand, pose: StickPose) {
      offsets[hand] = structuredClone(pose);
      const slot = slots.find(item => item.hand === hand);
      if (slot) applyStickPose(slot.calibration, pose);
    },
    update() {
      rig.updateWorldMatrix(true, true);
      for (const hand of ['left', 'right'] as const) {
        const slot = slots.find(item => item.hand === hand);
        const sample = tipSamples[hand];
        if (!active || !slot || !slot.grip.visible) { sample.valid = false; continue; }
        sample.previous.copy(sample.current);
        sticks.tips[hand].getWorldPosition(sample.current);
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
