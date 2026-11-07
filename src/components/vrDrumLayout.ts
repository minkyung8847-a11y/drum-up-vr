import * as THREE from 'three';

export const DRUM_POSITION_STORAGE = 'drumup.vr.drum-layout.v1';
interface LayoutKit {
  group: THREE.Group;
  layoutSupports: Map<string, THREE.Object3D[]>;
}
interface Placement { position: number[]; quaternion: number[] }

// Existing instrument groups remain the roots. Reparent static supports with
// exact matrices: Object3D.attach/TRS decomposition would discard their shear.
export function createVRDrumLayout(kit: LayoutKit, storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
  const roots = new Map<string, THREE.Object3D>();
  for (const child of kit.group.children) {
    if (typeof child.userData.drumType === 'string') roots.set(child.userData.drumType, child);
  }
  kit.group.updateWorldMatrix(true, true);
  for (const [id, root] of roots) {
    root.updateMatrix();
    const inverse = root.matrix.clone().invert();
    const supports = [...(kit.layoutSupports.get(id) ?? [])];
    if (id === 'kick') {
      // The common post belongs to the bass assembly. Each tom's own arm is
      // moved with that tom; no drum is parented to another drum or its rack.
      supports.push(...(kit.layoutSupports.get('rackPost') ?? []));
      for (const name of ['kick-pedal', 'kick-beater']) {
        const object = kit.group.getObjectByName(name);
        if (object?.parent === kit.group) supports.push(object);
      }
    }
    if (id === 'hihat') {
      const pedal = kit.group.getObjectByName('hihat-pedal');
      if (pedal) supports.push(pedal);
    }
    const supportFrame = new THREE.Group();
    supportFrame.name = `${id}-assembly-support-frame`;
    supportFrame.matrix.copy(inverse); supportFrame.matrixAutoUpdate = false;
    root.add(supportFrame);
    for (const support of new Set(supports)) {
      if (support.parent !== kit.group) continue;
      // Keep original local matrices and animation pivots unchanged beneath
      // the exact inverse frame, including the kick's animated beater.
      supportFrame.add(support);
    }
    root.userData.positionEditRoot = id;
  }
  kit.group.updateWorldMatrix(true, true);
  const snapshot = () => Object.fromEntries([...roots].map(([id, root]) => [id, {
    position: root.position.toArray(), quaternion: root.quaternion.toArray(),
  }]));
  const defaults = snapshot();
  const apply = (placements: Record<string, Placement>) => {
    for (const [id, root] of roots) {
      root.position.fromArray(placements[id].position);
      root.quaternion.fromArray(placements[id].quaternion).normalize();
    }
    kit.group.updateWorldMatrix(true, true);
  };
  const valid = (value: unknown): value is Record<string, Placement> => {
    if (!value || typeof value !== 'object') return false;
    return [...roots.keys()].every(id => {
      const pose = (value as Record<string, Placement>)[id];
      return pose && Array.isArray(pose.position) && pose.position.length === 3
        && pose.position.every(number => Number.isFinite(number) && Math.abs(number) <= 100)
        && Array.isArray(pose.quaternion) && pose.quaternion.length === 4
        && pose.quaternion.every(number => Number.isFinite(number))
        && Math.abs(Math.hypot(...pose.quaternion) - 1) < 0.01;
    });
  };
  return {
    roots, snapshot,
    load() {
      try {
        const saved = JSON.parse((storage ?? localStorage).getItem(DRUM_POSITION_STORAGE) ?? 'null');
        if (saved?.version !== 1 || !valid(saved.instruments)) return false;
        apply(saved.instruments); return true;
      } catch { return false; }
    },
    save() {
      try {
        (storage ?? localStorage).setItem(DRUM_POSITION_STORAGE, JSON.stringify({ version: 1, instruments: snapshot() }));
        return true;
      } catch { return false; }
    },
    reset() {
      apply(defaults);
      try { (storage ?? localStorage).removeItem(DRUM_POSITION_STORAGE); } catch { /* Current session still resets. */ }
    },
  };
}
