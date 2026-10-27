import * as THREE from 'three';
import { createConcertStage } from './concertStage';
import { createCloudConcert } from './cloudConcert';

interface Environment {
  group: THREE.Group;
  update: (seconds: number) => void;
  dispose: () => void;
}
function createStudio(scene: THREE.Scene): Environment {
  const group = new THREE.Group();
  group.name = 'dark-studio-environment';
  scene.add(group);
  return { group, update() {}, dispose() { group.removeFromParent(); } };
}
// Extend this registry to add future environments. No kit/camera/audio ownership.
export const DRUM_ENVIRONMENTS = [
  { id: 'concert', name: 'Concert Arena', description: 'White spotlights · dark audience', create: createConcertStage },
  { id: 'cloud', name: 'Cloud Concert', description: 'Floating stages · twilight sky', create: createCloudConcert },
  { id: 'studio', name: 'Dark Studio', description: 'Original minimal dark background', create: createStudio },
] as const;
export type DrumEnvironmentId = typeof DRUM_ENVIRONMENTS[number]['id'];
export function getSavedDrumEnvironment(): DrumEnvironmentId {
  try {
    const id = localStorage.getItem('drumup_vr_environment');
    if (DRUM_ENVIRONMENTS.some(item => item.id === id)) return id as DrumEnvironmentId;
  } catch { /* Preview remains usable without storage. */ }
  return 'concert';
}
export function createDrumEnvironments(scene: THREE.Scene, initial: DrumEnvironmentId) {
  // Build once, then swap visibility. Switching cannot recreate gameplay objects
  // or restart clocks, and requires no downloads or geometry allocation.
  const environments = new Map<DrumEnvironmentId, Environment>(DRUM_ENVIRONMENTS.map(item => [item.id, item.create(scene)]));
  let selected = initial;
  let visible = true;
  const refreshVisibility = () => {
    environments.forEach((environment, key) => { environment.group.visible = visible && key === selected; });
  };
  const select = (id: DrumEnvironmentId) => {
    selected = id;
    refreshVisibility();
    try { localStorage.setItem('drumup_vr_environment', id); } catch { /* Optional preference. */ }
  };
  select(initial);
  return {
    select,
    setVisible(value: boolean) { visible = value; refreshVisibility(); },
    update(seconds: number) { if (visible) environments.get(selected)?.update(seconds); },
    dispose() { environments.forEach(environment => environment.dispose()); },
  };
}
