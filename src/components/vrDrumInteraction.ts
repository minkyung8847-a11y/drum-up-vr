import { createVRCymbalMotion } from './vrCymbalMotion';
import { createVRDrumFeedback, DRUM_ACCENTS } from './vrDrumFeedback';
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
  hiHatLower?: THREE.Mesh | null;
  kickMechanism?: { board: THREE.Object3D | null; beater: THREE.Object3D | null };
}

// Shared by real controller collisions and existing desktop clicks.
export function createVRDrumInteraction(kit: DrumKitScene) {
  const cymbalMotion = createVRCymbalMotion(kit.hitSurfaces,kit.hiHatLower);
  const feedbackVisuals = new Map([...(kit.tomVisuals ?? []), ...cymbalMotion.visuals]);
  const feedback = createVRDrumFeedback(kit.hitSurfaces,feedbackVisuals);
  // Animate only the existing local mechanism; snapshot the restored resting
  // transforms instead of calling the old full-kit deformation update().
  const mechanism = [kit.kickMechanism?.board, kit.kickMechanism?.beater]
    .map((object, index) => object ? { object, rotation: object.rotation.clone(), quaternion: object.quaternion.clone(), amount: index === 0 ? -0.06 : -0.12 } : null)
    .filter(target => target !== null);
  let kickAge = Infinity, kickVelocity = 1;
  let hiHatClosed = true;
  const states = kit.hitSurfaces.map(surface => {
    const tom = kit.tomVisuals?.get(surface.id);
    const movingCymbal = cymbalMotion.visuals.get(surface.id);
    const meshes = movingCymbal ? [movingCymbal.head] : tom ? [tom.head] : surface.cymbal
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
    return { accent: new THREE.Color(DRUM_ACCENTS[surface.id]), id: surface.id, cymbal: surface.cymbal, tom, targets, age: Infinity, velocity: 1, startScale: 1 };
  });

  function hit(partId: string, velocity = 1) {
    const state = states.find(item => item.id === partId);
    if (!state || !VR_SOUND_IDS[partId]) return false;
    // Each trigger creates an overlapping Web Audio voice from preloaded samples.
    drumSynth.trigger(partId === 'hihat' && !hiHatClosed ? 'hihat-open' : VR_SOUND_IDS[partId], velocity);
    if (state.tom) state.startScale = state.tom.group.scale.x;
    feedback.hit(partId, velocity);
    cymbalMotion.hit(partId, THREE.MathUtils.clamp(velocity,0,1));
    state.age = 0;
    state.velocity = THREE.MathUtils.clamp(velocity, 0, 1);
    if (partId === 'kick') { kickAge = 0; kickVelocity = state.velocity; }
    return true;
  }

  function update(delta: number) {
    feedback.update(delta);
    if (kickAge !== Infinity) {
      kickAge += delta;
      const amount = kickAge < 0.16 ? Math.sin(Math.PI * kickAge / 0.16) * kickVelocity : 0;
      for (const target of mechanism) {
        if (amount === 0) target.object.quaternion.copy(target.quaternion);
        else { target.object.rotation.copy(target.rotation); target.object.rotation.x += target.amount * amount; }
      }
      if (kickAge >= 0.16) kickAge = Infinity;
    }
    for (const state of states) {
      if (state.age === Infinity) continue;
      state.age += delta;
      const { age, velocity, cymbal } = state;
      const crash = state.id === 'crash';
      const duration = crash ? 0.8 : cymbal ? 0.55 : 0.22;
      const response = age < duration
        ? Math.sin(age * (crash ? 26 : cymbal ? 34 : 95)) * Math.exp(-age * (crash ? 6 : cymbal ? 10 : 23)) * velocity
        : 0;
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
        if (cymbal && !cymbalMotion.visuals.has(state.id)) {
          target.mesh.rotation.x += response * (crash ? 0.09 : 0.025);
          target.mesh.rotation.z += response * (crash ? 0.045 : 0.012);
        } else if (!cymbal) target.mesh.position.y -= response * 0.0025;
        for (const { material, color, emissive, intensity } of target.materials) {
          const glow = cymbal ? Math.max(0, 1 - age / 0.085) * velocity : 0;
          {
            const highlight = Math.max(0, 1 - age / 0.15) ** 2 * 0.46;
            material.color.copy(color).lerp(state.accent, highlight);
          }
          material.emissive.copy(emissive).lerp(state.accent, glow);
          material.emissiveIntensity = intensity + glow * 0.45;
        }
      }
      if (age >= duration) state.age = Infinity;
    }
    cymbalMotion.update(delta);
  }

  return {
    hit, update,
    setHiHatClosed(pressed: boolean, pedalSound = true) {
      if (hiHatClosed === pressed) return true;
      hiHatClosed = pressed;
      cymbalMotion.setClosed(pressed);
      if (pressed) {
        if (pedalSound && drumSynth.isAudioRunning()) drumSynth.trigger('hihat-pedal');
        else drumSynth.chokeOpenHiHat();
      }
      return true;
    },
    isHiHatClosed: () => hiHatClosed,
    dispose() {
      update(1); feedback.dispose();
      for (const state of states) for (const target of state.targets) {
        for (const material of Array.isArray(target.mesh.material) ? target.mesh.material : [target.mesh.material]) material.dispose();
        target.mesh.material = target.original;
      }
      cymbalMotion.dispose();
    },
  };
}
