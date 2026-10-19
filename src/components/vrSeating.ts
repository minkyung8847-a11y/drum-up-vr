import * as THREE from 'three';

// Metres. Preserve physical floor height; add only a small eye-level lift.
export const VR_SEATING = { playerZ: 1.25, eyeLift: 0.08, kitForward: 0.35 } as const;

export function createVRSeating(rig: THREE.Group, kit: THREE.Group, refreshHits: () => void) {
  const kitRest = kit.position.clone();
  const desktopRig = rig.position.clone();
  let awaitingHead = false;
  let active = false;
  return {
    enter() {
      if (active) return;
      active = true;
      awaitingHead = true;
      desktopRig.copy(rig.position);
      // Translate the whole kit; every instrument keeps its local transform.
      kit.position.copy(kitRest);
      kit.position.z += VR_SEATING.kitForward;
      rig.position.set(0, VR_SEATING.eyeLift, VR_SEATING.playerZ);
      refreshHits();
    },
    update(frame: XRFrame, reference: XRReferenceSpace) {
      if (!active || !awaitingHead) return;
      const pose = frame.getViewerPose(reference);
      if (!pose) return;
      const { x, z } = pose.transform.position;
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      // Anchor once to the user's starting head location, not the room origin.
      // From this point on, all head translation and rotation remain tracked.
      rig.position.x = -x;
      rig.position.z = VR_SEATING.playerZ - z;
      awaitingHead = false;
    },
    exit() {
      if (!active) return;
      active = false;
      awaitingHead = false;
      kit.position.copy(kitRest);
      rig.position.copy(desktopRig);
      refreshHits();
    },
  };
}
