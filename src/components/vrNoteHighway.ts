import * as THREE from 'three';
import type { DrumHitSurface } from './vrStickCollision';

export const RHYTHM_BPM = 100;
const TRAVEL_MS = 3000;
const PERFECT_MS = 50;
const GREAT_MS = 120;
const FLASH_MS = 420;
const RIPPLE_MS = 360;
const RING_DIAMETER_RATIO = 0.675; // Peak diameter as a fraction of the textured quad.

const COLORS: Record<string, number> = {
  crash: 0xffa35c, hihat: 0x52ffae, snare: 0xff4fad, kick: 0xff803b,
  smallTom: 0x35e4ff, middleTom: 0x43ffda, floorTom: 0xf967e5, ride: 0x6db9ff,
};
const PATTERN = [
  ['kick', 'crash'], ['hihat'], ['snare', 'hihat'], ['hihat'],
  ['kick', 'hihat'], ['hihat'], ['snare', 'hihat'], ['hihat'],
  ['smallTom'], ['middleTom'], ['floorTom'], ['ride'],
  ['kick', 'crash'], ['ride'], ['snare', 'ride'], ['ride'],
  ['kick'], ['ride'], ['snare'], ['hihat'],
  ['kick', 'hihat'], ['hihat'], ['snare'], ['smallTom'],
  ['middleTom'], ['floorTom'], ['kick', 'crash'], ['ride'],
];

export type RhythmState = 'idle' | 'playing' | 'paused' | 'finished';
export type RhythmJudgment = 'Perfect' | 'Great' | 'Miss';
export type RhythmAction = 'toggle' | 'restart';

type RhythmSurface = DrumHitSurface & { world: THREE.Matrix4 };

export function captureRhythmSurfaces(surfaces: DrumHitSurface[]): RhythmSurface[] {
  return surfaces.map(surface => ({ ...surface, world: surface.mesh.matrixWorld.clone() }));
}

function surfaceNormal(world: THREE.Matrix4) {
  return new THREE.Vector3(0, 1, 0).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(world));
}

function laneTarget({ world, radius, height, cymbal }: RhythmSurface, normal: THREE.Vector3) {
  return new THREE.Vector3(0, cymbal ? 0.008 : height, cymbal ? radius * 0.35 : 0)
    .applyMatrix4(world).addScaledVector(normal, 0.012);
}

export function createVRNoteLanes(surfaces: RhythmSurface[], eye: THREE.Vector3) {
  const positions: THREE.Vector3[] = [];
  const farDepth = 10;
  const vanishingPoint = new THREE.Vector3(eye.x, eye.y + 0.18 * farDepth, eye.z - farDepth);
  const paths = new Map(surfaces.map(surface => {
    const target = laneTarget(surface, surfaceNormal(surface.world));
    const nearDepth = eye.z - target.z;
    function positionAt(progress: number, out: THREE.Vector3) {
      // Convert projected progress to distance along the straight world-space
      // segment so the note keeps its existing apparent speed in the seated view.
      const distance = progress * nearDepth / THREE.MathUtils.lerp(farDepth, nearDepth, progress);
      return out.lerpVectors(target, vanishingPoint, distance);
    }
    positions.push(target, vanishingPoint);
    return [surface.id, positionAt] as const;
  }));
  const geometry = new THREE.BufferGeometry().setFromPoints(positions);
  const material = new THREE.LineBasicMaterial({
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  function setPassthrough(enabled: boolean) {
    material.color.setHex(enabled ? 0x466782 : 0xe3efff);
    material.opacity = enabled ? 0.94 : 0.84;
  }
  setPassthrough(false);
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = 'vr-note-lanes';
  lines.renderOrder = 1;
  return {
    lines, paths, setPassthrough,
    dispose() {
      lines.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}

export function createVRNoteHighway(scene: THREE.Scene, surfaces: RhythmSurface[],
  paths: ReturnType<typeof createVRNoteLanes>['paths'],
  onStatus: (state: RhythmState, judgment?: RhythmJudgment) => void) {
  const anchor = new THREE.Group();
  anchor.name = 'note-highway-anchor';
  scene.add(anchor);

  // One shared alpha texture supplies both the thin ring and its soft halo.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const halo = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [stop, alpha] of [[0, 0], [0.50, 0], [0.56, 0.08], [0.62, 0.32],
    [0.65, 1], [0.70, 1], [0.74, 0.32], [0.83, 0.08], [1, 0]]) {
    halo.addColorStop(stop, `rgba(255,255,255,${alpha})`);
  }
  context.fillStyle = halo;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  const noteCanvas = document.createElement('canvas');
  noteCanvas.width = noteCanvas.height = 128;
  const noteContext = noteCanvas.getContext('2d')!;
  const outline = noteContext.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [stop, color] of [[0.52, '#0000'], [0.61, '#000e'], [0.65, '#fff'],
    [0.71, '#fff'], [0.75, '#000e'], [0.85, '#0000']] as const) outline.addColorStop(stop, color);
  noteContext.fillStyle = outline;
  noteContext.fillRect(0, 0, 128, 128);
  const noteTexture = new THREE.CanvasTexture(noteCanvas);
  const ringGeometry = new THREE.PlaneGeometry(1, 1);
  const material = (color: number) => new THREE.MeshBasicMaterial({
    color, map: texture, transparent: true,
    depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  });

  const lanes = new Map(surfaces.map(({ id, mesh, world, radius, height, cymbal }) => {
    const normal = surfaceNormal(world);
    const ripple = new THREE.Mesh(ringGeometry, material(COLORS[id]));
    ripple.name = `rhythm-ripple-${id}`;
    const rim = new THREE.Mesh(ringGeometry, material(COLORS[id]));
    rim.name = `rhythm-rim-${id}`;
    const success = new THREE.Mesh(ringGeometry, material(COLORS[id]));
    success.name = `rhythm-success-${id}`;
    const noteMaterial = material(COLORS[id]);
    noteMaterial.map = noteTexture;
    // An opaque colored ring core and dark edges stay legible over passthrough.
    noteMaterial.depthTest = false;
    // The same ring texture traces the actual rim in the playing surface's plane.
    const rimHeight = cymbal || id === 'kick' ? height : 0.024;
    rim.position.set(0, rimHeight, 0).applyMatrix4(world).addScaledVector(normal, 0.006);
    rim.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    ripple.quaternion.copy(rim.quaternion);
    rim.scale.set(2 * radius * new THREE.Vector3().setFromMatrixColumn(world, 0).length() / RING_DIAMETER_RATIO,
      2 * radius * new THREE.Vector3().setFromMatrixColumn(world, 2).length() / RING_DIAMETER_RATIO, 1);
    rim.visible = ripple.visible = success.visible = false;
    anchor.add(rim, ripple, success);
    const lane = { positionAt: paths.get(id)!, noteMaterial, mesh, world, normal, height, cymbal,
      ripple, rim, success, flashAt: -Infinity, boost: 0 };
    return [id, lane] as const;
  }));

  const notes = PATTERN.flatMap((parts, beat) => parts.map(id => {
    const lane = lanes.get(id)!;
    const arrival = TRAVEL_MS + beat * (60_000 / RHYTHM_BPM);
    const mesh = new THREE.Mesh(ringGeometry, lane.noteMaterial);
    mesh.name = `note-${id}-${arrival}`;
    mesh.renderOrder = 2;
    mesh.visible = false;
    anchor.add(mesh);
    return { id, lane, arrival, mesh, resolved: false };
  }));
  let state: RhythmState = 'idle';
  let epoch = 0;
  let pauseAt = 0;
  const lastArrival = notes[notes.length - 1].arrival;
  const face = new THREE.Vector3(0, 0, 1);
  const normalMatrix = new THREE.Matrix3();

  function updateFlash(lane: typeof notes[number]['lane'], now: number) {
    const age = now - lane.flashAt;
    lane.rim.visible = age >= 0 && age < FLASH_MS;
    lane.ripple.visible = age >= 0 && age < RIPPLE_MS;
    lane.success.visible = lane.boost > 0 && age >= 0 && age < RIPPLE_MS;
    if (!lane.rim.visible) return;
    let world = lane.world;
    if (lane.cymbal) {
      // Follow the existing cymbal wobble without touching the cymbal or its material.
      lane.mesh.updateWorldMatrix(true, false);
      world = lane.mesh.matrixWorld;
      lane.normal.set(0, 1, 0).applyNormalMatrix(normalMatrix.getNormalMatrix(world));
      lane.rim.position.set(0, 0, 0).applyMatrix4(world).addScaledVector(lane.normal, 0.006);
      lane.rim.quaternion.setFromUnitVectors(face, lane.normal);
      lane.ripple.quaternion.copy(lane.rim.quaternion);
    }
    lane.rim.material.opacity = (0.62 + lane.boost * 0.17) * (1 - age / FLASH_MS) ** 2;
    if (!lane.ripple.visible) return;
    const phase = age / RIPPLE_MS;
    const radius = THREE.MathUtils.lerp(0.17, 0.86 + lane.boost * 0.07, 1 - (1 - phase) ** 2);
    // Match the lathed cymbal's bell and bow at the wavefront radius.
    const height = lane.cymbal
      ? 0.049 * Math.exp(-((radius / 0.2) ** 3)) + 0.019 * (1 - radius) ** 2
      : lane.height;
    lane.ripple.position.set(0, height, 0).applyMatrix4(world).addScaledVector(lane.normal, 0.008);
    lane.ripple.scale.set(lane.rim.scale.x * radius, lane.rim.scale.y * radius, 1);
    lane.ripple.material.opacity = (0.54 + lane.boost * 0.10) * (1 - phase) ** 2;
    if (lane.success.visible) {
      lane.success.position.copy(lane.ripple.position).addScaledVector(lane.normal, 0.002);
      lane.success.quaternion.copy(lane.ripple.quaternion);
      lane.success.scale.copy(lane.ripple.scale).multiplyScalar(0.72);
      lane.success.material.opacity = (0.26 + lane.boost * 0.13) * (1 - phase) ** 2;
    }
  }

  function setState(next: RhythmState) {
    state = next;
    onStatus(state);
  }

  function clear() {
    for (const note of notes) {
      note.resolved = false;
      note.mesh.visible = false;
    }
  }

  function restart(now: number) {
    clear();
    epoch = now;
    setState('playing');
  }

  function pause(now: number) {
    if (state !== 'playing') return false;
    pauseAt = now;
    setState('paused');
    return true;
  }

  function judge(id: string, now: number): RhythmJudgment | undefined {
    if (state !== 'playing') return;
    const elapsed = now - epoch;
    let closest: typeof notes[number] | undefined;
    let distance = Infinity;
    for (const note of notes) {
      if (note.resolved || note.id !== id) continue;
      const offset = Math.abs(elapsed - note.arrival);
      if (offset < distance) { closest = note; distance = offset; }
    }
    if (!closest || distance > GREAT_MS) return 'Miss';
    closest.resolved = true;
    closest.mesh.visible = false;
    return distance <= PERFECT_MS ? 'Perfect' : 'Great';
  }

  return {
    restart,
    toggle(now: number) {
      if (state === 'playing') pause(now);
      else if (state === 'paused') {
        epoch += now - pauseAt;
        setState('playing');
      } else restart(now);
    },
    pause,
    stop() {
      clear();
      setState('idle');
    },
    strike(id: string, now: number) {
      const lane = lanes.get(id);
      if (!lane) return;
      const judgment = judge(id, now);
      lane.flashAt = now;
      lane.boost = judgment === 'Perfect' ? 2 : judgment === 'Great' ? 1 : 0;
      updateFlash(lane, now);
      if (judgment) onStatus(state, judgment);
      return judgment;
    },
    update(now: number, viewer: THREE.Vector3) {
      for (const lane of lanes.values()) updateFlash(lane, now);
      if (state !== 'playing' && state !== 'paused') return;
      const elapsed = (state === 'paused' ? pauseAt : now) - epoch;
      if (state === 'playing' && elapsed > lastArrival + GREAT_MS + FLASH_MS) {
        clear();
        setState('finished');
        return;
      }
      for (const note of notes) {
        const remaining = note.arrival - elapsed;
        if (!note.resolved && remaining < -GREAT_MS) {
          note.resolved = true;
          onStatus(state, 'Miss');
        }
        note.mesh.visible = !note.resolved && remaining <= TRAVEL_MS;
        if (!note.mesh.visible) continue;
        const progress = remaining / TRAVEL_MS;
        note.lane.positionAt(progress, note.mesh.position);
        const approach = 1 - THREE.MathUtils.smoothstep(progress, 0, 1);
        note.mesh.scale.setScalar(THREE.MathUtils.lerp(0.13, 0.16, approach));
        note.mesh.lookAt(viewer);
      }
    },
    dispose() {
      anchor.removeFromParent();
      ringGeometry.dispose();
      texture.dispose();
      noteTexture.dispose();
      for (const lane of lanes.values()) {
        lane.noteMaterial.dispose();
        lane.ripple.material.dispose();
        lane.rim.material.dispose();
        lane.success.material.dispose();
      }
    },
  };
}
