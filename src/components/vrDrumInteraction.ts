import * as THREE from 'three';
import type { DrumPadId } from '../types';
import type { DrumHitSurface } from './vrStickCollision';
import { drumSynth } from '../utils/synth';

export const VR_SOUND_IDS: Record<string, DrumPadId> = {
  kick: 'kick', snare: 'snare', hihat: 'hihat-closed',
  smallTom: 'tom-high', middleTom: 'tom-mid', floorTom: 'tom-floor',
  crash: 'crash', ride: 'ride',
};

interface DrumKitScene {
  hitSurfaces: DrumHitSurface[];
  tomVisuals?: Map<string, { group: THREE.Group; head: THREE.Mesh }>;
}

// Shared by real controller collisions and existing desktop clicks.
export function createVRDrumInteraction(kit: DrumKitScene) {
  const silver = new THREE.Color(0xeef4ff);
  const states = kit.hitSurfaces.map(surface => {
    const tom = kit.tomVisuals?.get(surface.id);
    const meshes = tom ? [tom.head] : surface.cymbal
      ? surface.mesh.parent!.children.filter((object): object is THREE.Mesh =>
        object instanceof THREE.Mesh && (object.userData.drumType === surface.id || object.geometry.type === 'TorusGeometry'))
      : [surface.mesh];
    const targets = meshes.map(mesh => {
      const original = mesh.material;
      const materials: { material: THREE.MeshStandardMaterial; color: THREE.Color; emissive: THREE.Color; intensity: number }[] = [];
      const clone = (source: THREE.Material) => {
        const material = source.clone();
        if (material instanceof THREE.MeshStandardMaterial) materials.push({ material,
          color: material.color.clone(), emissive: material.emissive.clone(), intensity: material.emissiveIntensity });
        return material;
      };
      mesh.material = Array.isArray(original) ? original.map(clone) : clone(original);
      return { mesh, original, materials, position: mesh.position.clone(), rotation: mesh.rotation.clone() };
    });
    return { id: surface.id, cymbal: surface.cymbal, tom, targets, age: Infinity, velocity: 1, startScale: 1 };
  });

  function hit(partId: string, velocity = 1) {
    const state = states.find(item => item.id === partId);
    if (!state || !VR_SOUND_IDS[partId]) return false;
    // Each trigger creates an overlapping Web Audio voice from preloaded samples.
    drumSynth.trigger(VR_SOUND_IDS[partId], velocity);
    if (state.tom) state.startScale = state.tom.group.scale.x;
    state.age = 0;
    state.velocity = THREE.MathUtils.clamp(velocity, 0, 1);
    return true;
  }

  function update(delta: number) {
    for (const state of states) {
      if (state.age === Infinity) continue;
      state.age += delta;
      const { age, velocity, cymbal } = state;
      const duration = cymbal ? 0.55 : 0.22;
      const response = age < duration ? Math.sin(age * (cymbal ? 34 : 95)) * Math.exp(-age * (cymbal ? 10 : 23)) * velocity : 0;
      if (state.tom) {
        const rise = 0.035;
        const end = 0.18;
        let scale = 1;
        if (age < rise) {
          const t = age / rise;
          scale = state.startScale + (1.08 - state.startScale) * (1 - (1 - t) ** 3);
        } else if (age < end) {
          const t = (age - rise) / (end - rise);
          scale += 0.08 * (1 - t) ** 2 * Math.cos(t * Math.PI * 2.25);
        }
        state.tom.group.scale.setScalar(scale);
      }
      for (const target of state.targets) {
        target.mesh.position.copy(target.position);
        target.mesh.rotation.copy(target.rotation);
        if (cymbal) {
          target.mesh.rotation.x += response * 0.025;
          target.mesh.rotation.z += response * 0.012;
        } else target.mesh.position.y -= response * 0.0025;
        for (const { material, color, emissive, intensity } of target.materials) {
          const glow = cymbal ? Math.max(0, 1 - age / 0.085) * velocity : 0;
          if (state.tom) {
            const highlight = Math.max(0, 1 - age / 0.15) ** 2 * 0.32;
            material.color.copy(color).lerp(silver, highlight);
          }
          material.emissive.copy(emissive).lerp(silver, glow);
          material.emissiveIntensity = intensity + glow * 0.18;
        }
      }
      if (age >= duration) state.age = Infinity;
    }
  }

  return {
    hit, update,
    dispose() {
      update(1);
      for (const state of states) for (const target of state.targets) {
        for (const material of Array.isArray(target.mesh.material) ? target.mesh.material : [target.mesh.material]) material.dispose();
        target.mesh.material = target.original;
      }
    },
  };
}
