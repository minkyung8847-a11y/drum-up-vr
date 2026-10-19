import * as THREE from 'three';

// The VR kit already uses a measured seated layout; no second kit translation or
// artificial eye height is needed. Physical local-floor height stays untouched.
export const VR_SEATING = { playerZ: 1.0, eyeLift: 0, kitForward: 0 } as const;

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
