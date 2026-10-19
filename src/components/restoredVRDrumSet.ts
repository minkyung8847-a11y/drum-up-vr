import * as THREE from 'three';
import { createVirtualDrumSet } from './virtualDrumSet';
import { VR_DRUM_LAYOUT } from './vrDrumConfig';
import { ORIGINAL_IMPORTED_KIT } from './originalImportedKit';

interface RecordedTransform {
  position: number[]; quaternion: number[]; scale: number[]; bounds?: number[];
}
interface RecordedInstrument extends RecordedTransform { diameter: number; depth?: number }
const original = ORIGINAL_IMPORTED_KIT as {
  sourceCommit: string; sourcePath: string; sourceBlob: string;
  instruments: Record<string, RecordedInstrument>; supports: Record<string, RecordedTransform[]>;
  floorLegs: RecordedTransform[]; kickPedal: RecordedTransform; hihatPedal: RecordedTransform; beater: RecordedTransform;
};

// Preserve the current 22-inch bass diameter with ONE common world scale.
// Individual diameter/depth ratios and all placements come from the initial
// Git model. Existing geometry, textures and materials are never regenerated.
export const RESTORED_VR_SCALE = VR_DRUM_LAYOUT.kick.diameter / original.instruments.kick.diameter;

export function createRestoredVRDrumSet(scene: THREE.Scene) {
  const kit = createVirtualDrumSet(scene, { layout: VR_DRUM_LAYOUT });
  return applyOriginalDrumTransforms(kit);
}

export function applyOriginalDrumTransforms(kit: ReturnType<typeof createVirtualDrumSet>) {
  const matrix = new THREE.Matrix4(), local = new THREE.Matrix4();
  const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  const size = new THREE.Vector3(), ratio = new THREE.Vector3();
  function restoreObject(object: THREE.Object3D, recorded: RecordedTransform, undoParentScale?: THREE.Matrix4) {
    position.fromArray(recorded.position); rotation.fromArray(recorded.quaternion); scale.fromArray(recorded.scale);
    ratio.set(1, 1, 1);
    if (recorded.bounds && object instanceof THREE.Mesh) {
      object.geometry.computeBoundingBox(); object.geometry.boundingBox!.getSize(size);
      ratio.fromArray(recorded.bounds).divide(size);
    }
    scale.multiply(ratio);
    matrix.compose(position, rotation, scale);
    local.copy(matrix);
    if (undoParentScale) local.premultiply(undoParentScale);
    // Static supports can require shear to compensate a resized parent. Keep
    // their exact matrix, rather than losing it in a TRS decomposition.
    object.matrixAutoUpdate = false; object.matrix.copy(local);
    local.decompose(object.position, object.quaternion, object.scale);
    object.matrixWorldNeedsUpdate = true;
  }
  for (const [id, recorded] of Object.entries(original.instruments)) {
    const part = kit.group.children.find((child: THREE.Object3D) => child.userData.drumType === id);
    if (!part) throw new Error(`Missing original instrument: ${id}`);
    const baseline = VR_DRUM_LAYOUT[id];
    const radial = recorded.diameter / baseline.diameter;
    part.position.fromArray(recorded.position); part.quaternion.fromArray(recorded.quaternion);
    part.scale.set(radial, recorded.depth && baseline.depth ? recorded.depth / baseline.depth : radial, radial);
    const supports = kit.layoutSupports.get(id) ?? [], historical = original.supports[id];
    if (supports.length !== historical.length) throw new Error(`Original support count differs: ${id}`);
    supports.forEach((support: THREE.Object3D, index: number) => restoreObject(support, historical[index]));
    if (id === 'floorTom') {
      const legs = part.children.filter((object: THREE.Object3D) => object instanceof THREE.Mesh
        && ((object.geometry.type === 'CylinderGeometry' && (object.geometry as THREE.CylinderGeometry).parameters.radiusTop === 0.007)
          || (object.geometry.type === 'SphereGeometry' && (object.geometry as THREE.SphereGeometry).parameters.radius === 0.028)));
      if (legs.length !== original.floorLegs.length) throw new Error('Original floor support count differs');
      const inverseScale = new THREE.Matrix4().makeScale(1 / part.scale.x, 1 / part.scale.y, 1 / part.scale.z);
      legs.forEach((leg: THREE.Object3D, index: number) => restoreObject(leg, original.floorLegs[index], inverseScale));
    }
  }
  const kickPedal = kit.group.getObjectByName('kick-pedal')!;
  const hihatPedal = kit.group.getObjectByName('hihat-pedal')!;
  const beater = kit.group.getObjectByName('kick-beater')!;
  // Root/individual transforms only. The current detailed pedal/beater meshes
  // remain intact; the later 0.8 beater shrink is removed.
  for (const [object, recorded] of [[kickPedal, original.kickPedal], [hihatPedal, original.hihatPedal],
    [beater, original.beater]] as const) {
    object.position.fromArray(recorded.position); object.quaternion.fromArray(recorded.quaternion);
    object.scale.fromArray(recorded.scale);
  }
  kit.group.scale.setScalar(RESTORED_VR_SCALE);
  kit.group.updateWorldMatrix(true, true);
  return { ...kit, originalLayout: { sourceCommit: original.sourceCommit, sourcePath: original.sourcePath,
    sourceBlob: original.sourceBlob, scale: RESTORED_VR_SCALE } };
}
