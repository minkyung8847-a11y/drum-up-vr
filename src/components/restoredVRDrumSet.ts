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
// Baseline diameter/depth ratios and placements come from the initial Git
// model. Existing geometry, textures and materials are never regenerated.
export const RESTORED_VR_SCALE = VR_DRUM_LAYOUT.kick.diameter / original.instruments.kick.diameter;

// Small adjustments on top of the restored kit. Offsets are world metres;
// +Z is toward the existing seated player. Instrument scales stay untouched.
export const VR_LAYOUT_ADJUSTMENTS: Record<string, { offset: [number, number, number]; tiltDegrees: number }> = {
  smallTom: { offset: [0, 0.14, 0], tiltDegrees: 5 },
  middleTom: { offset: [0, 0.14, 0], tiltDegrees: 5 },
  snare: { offset: [0, 0, 0.04], tiltDegrees: 0 },
  floorTom: { offset: [-0.02, 0, 0.04], tiltDegrees: 0 },
  hihat: { offset: [0, 0, 0], tiltDegrees: 4 },
  crash: { offset: [0, 0, 0], tiltDegrees: 4 },
  ride: { offset: [0, 0, 0], tiltDegrees: 4 },
};

export function createRestoredVRDrumSet(scene: THREE.Scene) {
  const kit = createVirtualDrumSet(scene, { layout: VR_DRUM_LAYOUT });
  const restored = applyOriginalDrumTransforms(kit);
  applyCurrentDrumLayout(restored);
  return restored;
}

export function applyCurrentDrumLayout(kit: ReturnType<typeof createVirtualDrumSet>) {
  const before = new THREE.Matrix4(), change = new THREE.Matrix4();
  for (const [id, adjustment] of Object.entries(VR_LAYOUT_ADJUSTMENTS)) {
    const part = kit.group.children.find((child: THREE.Object3D) => child.userData.drumType === id)!;
    part.updateMatrix(); before.copy(part.matrix).invert();
    part.position.add(new THREE.Vector3(...adjustment.offset).divideScalar(RESTORED_VR_SCALE));
    part.rotation.x += THREE.MathUtils.degToRad(adjustment.tiltDegrees);
    part.updateMatrix();
    // Snare stand and rack mounts follow their drums as rigid assemblies.
    // Preserve exact support matrices, including any existing shear.
    if (id === 'snare' || id === 'smallTom' || id === 'middleTom') {
      change.multiplyMatrices(part.matrix, before);
      for (const support of kit.layoutSupports.get(id) ?? []) transformSupport(support, change);
    }
  }
  // Keep the centre post between the unchanged left/right tom X positions.
  // Extend the existing hardware to the raised mounts without moving the kit.
  const post = kit.layoutSupports.get('rackPost') ?? [];
  const bottom = VR_DRUM_LAYOUT.kick.position[1] + VR_DRUM_LAYOUT.kick.diameter / 2;
  const oldTop = Math.min(VR_DRUM_LAYOUT.smallTom.position[1], VR_DRUM_LAYOUT.middleTom.position[1]) - 0.1;
  const newTop = ((kit.layoutSupports.get('smallTom')![0] as THREE.Object3D).position.y
    + (kit.layoutSupports.get('middleTom')![0] as THREE.Object3D).position.y) / 2;
  const centreX = (original.instruments.smallTom.position[0] + original.instruments.middleTom.position[0]) / 2;
  post.forEach((support: THREE.Object3D, index: number) => {
    if (index === 0) {
      const extend = (newTop - bottom) / (oldTop - bottom);
      change.makeScale(1, extend, 1);
      change.setPosition(centreX - VR_DRUM_LAYOUT.kick.position[0], bottom * (1 - extend), 0);
    } else change.makeTranslation(centreX - VR_DRUM_LAYOUT.kick.position[0], index === 2 ? newTop - oldTop : 0, 0);
    transformSupport(support, change);
  });
  // Finalise before assisted-hit/feedback/instancing caches are constructed.
  kit.group.updateWorldMatrix(true, true);
}

function transformSupport(object: THREE.Object3D, change: THREE.Matrix4) {
  if (object.matrixAutoUpdate) object.updateMatrix();
  object.matrix.premultiply(change);
  object.matrix.decompose(object.position, object.quaternion, object.scale);
  object.matrixAutoUpdate = false;
  object.matrixWorldNeedsUpdate = true;
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
