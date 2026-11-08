import {readDrumHeight,clampDrumHeight} from './vrDrumHeight';
import * as THREE from 'three';

// Keep the existing seated rig calibration. The VR kit now also has one
// explicit, non-accumulating vertical offset before collision/note capture.
export const VR_SEATING = { playerZ: 1.0, eyeLift: 0.08, kitForward: 0, kitHeightOffset: 0 } as const;

// Absolute offset from the authored base; safe for live changes and XR re-entry.
export function applySeatedKitHeight(kit: THREE.Group, height = readDrumHeight()) {
  kit.userData.seatedBaseY ??= kit.position.y;
  kit.position.y = kit.userData.seatedBaseY + VR_SEATING.kitHeightOffset + clampDrumHeight(height);
  kit.updateWorldMatrix(true,true);
}

export function createVRSeating(rig: THREE.Group, kit: THREE.Group, refreshHits: () => void) {
  const desktopRig = rig.position.clone();
  let awaitingHead = false;
  let active = false;
  return {
    enter() {
      if (active) return;
      active = true;
      awaitingHead = true;
      desktopRig.copy(rig.position);
      rig.position.set(0, VR_SEATING.eyeLift, VR_SEATING.playerZ);
      kit.updateWorldMatrix(true, true);
      refreshHits();
    },
    update(frame: XRFrame, reference: XRReferenceSpace) {
      if (!active || !awaitingHead) return;
      const pose = frame.getViewerPose(reference);
      if (!pose) return;
      const { x, z } = pose.transform.position;
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      rig.position.x = -x;
      rig.position.z = VR_SEATING.playerZ - z;
      awaitingHead = false;
    },
    exit() {
      if (!active) return;
      active = false;
      awaitingHead = false;
      rig.position.copy(desktopRig);
      refreshHits();
    },
  };
}
