import * as THREE from 'three';
import { createVirtualDrumsticks } from './virtualDrumsticks';
import type { StickHand } from './virtualDrumsticks';
import { applyStickPose } from './xrDrumstickControllers';
import type { StickPose } from './xrDrumstickControllers';

export interface HandStickCalibration extends StickPose {
  length: number; // Full stick length in metres.
}

const HANDS = ['left', 'right'] as const;
const MODEL_LENGTH = 0.41;
export const DEFAULT_HAND_STICK: HandStickCalibration = {
  position: [0, 0, 0], rotation: [0, 0, 0], length: MODEL_LENGTH,
};

export function createXRHandDrumsticks(rig: THREE.Group) {
  const sticks = createVirtualDrumsticks(rig, false);
  const makeSample = () => ({ valid: false, previous: new THREE.Vector3(), current: new THREE.Vector3() });
  const samples = { left: makeSample(), right: makeSample() };
  const activeHands: Record<StickHand, XRHand | undefined> = { left: undefined, right: undefined };
  const index = new THREE.Vector3(), pinky = new THREE.Vector3(), wrist = new THREE.Vector3();
  const x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  for (const hand of HANDS) {
    sticks.grips[hand].name = `tracked-hand-stick-${hand}`;
    sticks.grips[hand].visible = false;
  }

  function readJoint(frame: XRFrame, reference: XRReferenceSpace, hand: XRHand, name: XRHandJoint, out: THREE.Vector3) {
    const joint = hand.get(name);
    const pose = joint && frame.getJointPose?.(joint, reference);
    if (!pose || pose.emulatedPosition) return false;
    const { x, y, z } = pose.transform.position;
    out.set(x, y, z);
    return Number.isFinite(out.lengthSq());
  }

  function updatePose(frame: XRFrame, reference: XRReferenceSpace, hand: XRHand, grip: THREE.Group) {
    if (!readJoint(frame, reference, hand, 'wrist', wrist)
      || !readJoint(frame, reference, hand, 'index-finger-phalanx-proximal', index)
      || !readJoint(frame, reference, hand, 'pinky-finger-phalanx-proximal', pinky)) return false;
    // The shaft crosses the grip from the little finger toward the index finger.
    // Build the other axes from the wrist so pitch and roll follow the hand.
    z.subVectors(pinky, index);
    if (z.lengthSq() < 0.0001) return false;
    z.normalize();
    grip.position.addVectors(index, pinky).multiplyScalar(0.5);
    x.subVectors(grip.position, wrist).addScaledVector(z, -x.dot(z));
    if (x.lengthSq() < 0.0001) return false;
    x.normalize();
    y.crossVectors(z, x);
    grip.quaternion.setFromRotationMatrix(basis.makeBasis(x, y, z));
    return true;
  }

  return {
    samples,
    setCalibration(hand: StickHand, calibration: HandStickCalibration) {
      applyStickPose(sticks.offsets[hand], calibration);
      sticks.offsets[hand].scale.z = calibration.length / MODEL_LENGTH;
      samples[hand].valid = false;
    },
    reset() {
      for (const hand of HANDS) {
        activeHands[hand] = undefined;
        sticks.grips[hand].visible = samples[hand].valid = false;
      }
    },
    update(frame: XRFrame, reference: XRReferenceSpace) {
      const previousLeft = activeHands.left, previousRight = activeHands.right;
      activeHands.left = activeHands.right = undefined;
      if (frame.session.visibilityState === 'visible') {
        for (const { hand, handedness } of frame.session.inputSources) {
          if (hand && (handedness === 'left' || handedness === 'right')) activeHands[handedness] = hand;
        }
      }
      for (const side of HANDS) {
        const hand = activeHands[side];
        const sample = samples[side];
        const grip = sticks.grips[side];
        grip.visible = !!hand && updatePose(frame, reference, hand, grip);
        if (!grip.visible) { sample.valid = false; continue; }
        sample.previous.copy(sample.current);
        sticks.tips[side].getWorldPosition(sample.current);
        if (!sample.valid || hand !== (side === 'left' ? previousLeft : previousRight)) sample.previous.copy(sample.current);
        sample.valid = true;
      }
    },
    dispose: sticks.dispose,
  };
}
