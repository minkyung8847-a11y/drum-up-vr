import * as THREE from 'three';
import type { DrumPadId } from '../types';
import { drumSynth } from '../utils/synth';

const SOUND_IDS: Record<string, DrumPadId> = {
  kick: 'kick', snare: 'snare', hihat: 'hihat-closed',
  smallTom: 'tom-high', middleTom: 'tom-mid', floorTom: 'tom-floor',
  crash: 'crash', ride: 'ride',
};

interface DrumKitScene {
  group: THREE.Group;
  raycastTargets: THREE.Object3D[];
}

// Input-independent hit handling. Mouse rays and future collision events use hit().
export function createVRDrumInteraction(kit: DrumKitScene) {
  const parts = kit.group.children.filter(part => SOUND_IDS[part.userData.drumType]);
  const states = new Map(parts.map(part => [part.userData.drumType as string, {
    part, position: part.position.clone(), rotation: part.rotation.clone(),
    age: Infinity, velocity: 1, materials: [] as THREE.MeshStandardMaterial[],
  }]));
  const originals: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = [];
  for (const target of kit.raycastTargets) {
    if (!(target instanceof THREE.Mesh)) continue;
    const state = states.get(target.userData.drumType);
    if (!state) continue;
    originals.push({ mesh: target, material: target.material });
    const clone = (material: THREE.Material) => {
      const copy = material.clone();
      if (copy instanceof THREE.MeshStandardMaterial) state.materials.push(copy);
      return copy;
    };
    target.material = Array.isArray(target.material) ? target.material.map(clone) : clone(target.material);
  }

  function hit(partId: string, velocity = 1) {
    const state = states.get(partId);
    if (!state) return false;
    // No debounce, timers, or awaiting animation: each hit starts its own audio voice.
    drumSynth.trigger(SOUND_IDS[partId], velocity);
    state.age = 0;
    state.velocity = THREE.MathUtils.clamp(velocity, 0, 1);
    return true;
  }

  function update(delta: number) {
    for (const [id, state] of states) {
      if (state.age === Infinity) continue;
      state.age += delta;
      const { part, age, velocity } = state;
      part.position.copy(state.position);
      part.rotation.copy(state.rotation);
      if (age < 0.4) {
        const response = Math.sin(age * 38) * Math.exp(-age * 12) * velocity;
        if (id === 'crash' || id === 'ride' || id === 'hihat') part.rotation.x += response * 0.035;
        else part.position.y -= Math.max(0, response) * 0.008;
      }
      for (const material of state.materials) {
        material.emissive.setHex(age < 0.10 ? 0xffad68 : 0x000000);
        material.emissiveIntensity = Math.max(0, 1 - age / 0.10) * 0.28 * velocity;
      }
      if (age >= 0.4) state.age = Infinity;
    }
  }

  return {
    hit, update,
    dispose() {
      update(1);
      for (const { mesh, material } of originals) {
        for (const copy of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) copy.dispose();
        mesh.material = material;
      }
    },
  };
}
