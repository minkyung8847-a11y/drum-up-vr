import * as THREE from 'three';

// The kit's snare is about 0.56 m in front of its origin. Putting the origin
// one metre from the seated viewer leaves the snare within playing reach.
const KIT_DISTANCE = 1.0;
const SEATED_EYE_ABOVE_KIT_FLOOR = 1.2;

export function placeARKitInFront(
  kit: THREE.Object3D,
  position: THREE.Vector3,
  orientation: THREE.Quaternion,
) {
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(orientation);
  forward.y = 0;
  if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
  forward.normalize();

  kit.position.copy(position).addScaledVector(forward, KIT_DISTANCE);
  kit.position.y = position.y - SEATED_EYE_ABOVE_KIT_FLOOR;
  // The kit's playing side points along its local +Z axis.
  kit.rotation.y = Math.atan2(-forward.x, -forward.z);
  kit.updateWorldMatrix(true, true);
}
