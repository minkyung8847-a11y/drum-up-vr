import * as THREE from 'three';
import type { DrumHitSurface } from './vrStickCollision';

export const RHYTHM_BPM = 100;
const TRAVEL_MS = 3000;
const PERFECT_MS = 50;
const GOOD_MS = 120;
const FLASH_MS = 420;
const RIPPLE_MS = 360;
const RING_DIAMETER_RATIO = 0.675; // Peak diameter as a fraction of the textured quad.

const COLORS: Record<string, number> = {
  crash: 0xffa570, hihat: 0x8fffc9, snare: 0xff78be, kick: 0xff8d58,
  smallTom: 0x73e8ff, middleTom: 0x7fffe1, floorTom: 0xf49de9, ride: 0x9bccff,
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
export type RhythmJudgment = 'Perfect' | 'Good' | 'Miss';
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
  const colors: number[] = [];
  const segments = 48;
  const farDepth = 10;
  const vanishingY = 0.18;
  const paths = new Map(surfaces.map(surface => {
    const target = laneTarget(surface, surfaceNormal(surface.world));
    const nearDepth = eye.z - target.z;
    const nearX = (target.x - eye.x) / nearDepth;
    const nearY = (target.y - eye.y) / nearDepth;
    function positionAt(progress: number, out: THREE.Vector3) {
      // The pedal-side kick head must be approached from in front of its shell.
      const clearance = surface.id === 'kick' ? 0.20 * Math.sin(Math.PI * progress) : 0;
      const depth = THREE.MathUtils.lerp(nearDepth, farDepth, progress ** 4) - clearance;
      return out.set(eye.x + THREE.MathUtils.lerp(nearX, 0, progress) * depth,
        eye.y + THREE.MathUtils.lerp(nearY, vanishingY, progress) * depth, eye.z - depth);
    }
    for (let i = 0; i < segments; i++) {
      for (const progress of [i / segments, (i + 1) / segments]) {
        positions.push(positionAt(progress, new THREE.Vector3()));
        const alpha = 1 - THREE.MathUtils.smoothstep(progress, 0.2, 1);
        colors.push(1, 1, 1, alpha);
      }
    }
    return [surface.id, positionAt] as const;
  }));
  const geometry = new THREE.BufferGeometry().setFromPoints(positions);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  const material = new THREE.LineBasicMaterial({ color: 0xd7dfec, vertexColors: true,
    transparent: true, opacity: 0.40, depthWrite: false, toneMapped: false });
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = 'vr-note-lanes';
  return {
    lines, paths,
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
  anchor.visible = false;
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
  const ringGeometry = new THREE.PlaneGeometry(1, 1);
  const material = (color: number) => new THREE.MeshBasicMaterial({
    color, map: texture, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  });

  const lanes = new Map(surfaces.map(({ id, mesh, world, radius, height, cymbal }) => {
    const normal = surfaceNormal(world);
    const ripple = new THREE.Mesh(ringGeometry, material(COLORS[id]));
    ripple.name = `rhythm-ripple-${id}`;
    const rim = new THREE.Mesh(ringGeometry, material(COLORS[id]));
    rim.name = `rhythm-rim-${id}`;
    // The same ring texture traces the actual rim in the playing surface's plane.
    const rimHeight = cymbal || id === 'kick' ? height : 0.024;
    rim.position.set(0, rimHeight, 0).applyMatrix4(world).addScaledVector(normal, 0.006);
    rim.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    ripple.quaternion.copy(rim.quaternion);
    rim.scale.set(2 * radius * new THREE.Vector3().setFromMatrixColumn(world, 0).length() / RING_DIAMETER_RATIO,
      2 * radius * new THREE.Vector3().setFromMatrixColumn(world, 2).length() / RING_DIAMETER_RATIO, 1);
    rim.visible = ripple.visible = false;
    anchor.add(rim, ripple);
    const lane = { positionAt: paths.get(id)!, color: new THREE.Color(COLORS[id]), mesh, world, normal, height, cymbal,
      ripple, rim, flashAt: -Infinity, perfect: false };
    return [id, lane] as const;
  }));

  const notes = PATTERN.flatMap((parts, beat) => parts.map(id => {
    const lane = lanes.get(id)!;
    const arrival = TRAVEL_MS + beat * (60_000 / RHYTHM_BPM);
    // Each note has its own fade, while all share geometry, texture and shader.
    const mesh = new THREE.Mesh(ringGeometry, material(COLORS[id]));
    mesh.name = `note-${id}-${arrival}`;
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

  function updateFlash(lane: typeof notes[number]['lane'], elapsed: number) {
    const age = elapsed - lane.flashAt;
    lane.rim.visible = age >= 0 && age < FLASH_MS;
    lane.ripple.visible = age >= 0 && age < RIPPLE_MS;
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
    const strength = lane.perfect ? 1 : 0.58;
    lane.rim.material.opacity = 0.88 * strength * (1 - age / FLASH_MS) ** 2;
    if (!lane.ripple.visible) return;
    const phase = age / RIPPLE_MS;
    const radius = THREE.MathUtils.lerp(0.17, lane.perfect ? 1 : 0.76, 1 - (1 - phase) ** 2);
    // Match the lathed cymbal's bell and bow at the wavefront radius.
    const height = lane.cymbal
      ? 0.049 * Math.exp(-((radius / 0.2) ** 3)) + 0.019 * (1 - radius) ** 2
      : lane.height;
    lane.ripple.position.set(0, height, 0).applyMatrix4(world).addScaledVector(lane.normal, 0.008);
    lane.ripple.scale.set(lane.rim.scale.x * radius, lane.rim.scale.y * radius, 1);
    lane.ripple.material.opacity = 0.76 * strength * (1 - phase) ** 2;
  }

  function setState(next: RhythmState) {
    state = next;
    anchor.visible = state === 'playing' || state === 'paused';
    onStatus(state);
  }

  function clear() {
    for (const note of notes) {
      note.resolved = false;
      note.mesh.visible = false;
    }
    for (const lane of lanes.values()) {
      lane.flashAt = -Infinity;
      lane.rim.visible = lane.ripple.visible = false;
    }
  }

  function restart(now: number) {
    clear();
    epoch = now;
    setState('playing');
  }

  function pause(now: number) {
    if (state !== 'playing') return;
    pauseAt = now;
    setState('paused');
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
      if (state !== 'playing' || !lanes.has(id)) return;
      const elapsed = now - epoch;
      let closest: typeof notes[number] | undefined;
      let distance = Infinity;
      for (const note of notes) {
        if (note.resolved || note.id !== id) continue;
        const offset = Math.abs(elapsed - note.arrival);
        if (offset < distance) { closest = note; distance = offset; }
      }
      if (!closest || distance > GOOD_MS) {
        onStatus(state, 'Miss');
        return;
      }
      closest.resolved = true;
      closest.mesh.visible = false;
      const lane = closest.lane;
      lane.flashAt = elapsed;
      lane.perfect = distance <= PERFECT_MS;
      updateFlash(lane, elapsed);
      onStatus(state, lane.perfect ? 'Perfect' : 'Good');
    },
    update(now: number, viewer: THREE.Vector3) {
      if (!anchor.visible) return;
      const elapsed = (state === 'paused' ? pauseAt : now) - epoch;
      if (state === 'playing' && elapsed > lastArrival + GOOD_MS + FLASH_MS) {
        setState('finished');
        return;
      }
      for (const note of notes) {
        const remaining = note.arrival - elapsed;
        if (!note.resolved && remaining < -GOOD_MS) {
          note.resolved = true;
          onStatus(state, 'Miss');
        }
        note.mesh.visible = !note.resolved && remaining <= TRAVEL_MS;
        if (!note.mesh.visible) continue;
        const progress = remaining / TRAVEL_MS;
        note.lane.positionAt(progress, note.mesh.position);
        const approach = 1 - THREE.MathUtils.smoothstep(progress, 0, 1);
        note.mesh.scale.setScalar(THREE.MathUtils.lerp(0.085, 0.16, approach));
        note.mesh.material.opacity = approach;
        note.mesh.material.color.copy(note.lane.color).multiplyScalar(THREE.MathUtils.lerp(0.30, 1.2, approach));
        note.mesh.lookAt(viewer);
      }
      for (const lane of lanes.values()) updateFlash(lane, elapsed);
    },
    dispose() {
      anchor.removeFromParent();
      ringGeometry.dispose();
      texture.dispose();
      for (const note of notes) note.mesh.material.dispose();
      for (const lane of lanes.values()) {
        lane.ripple.material.dispose();
        lane.rim.material.dispose();
      }
    },
  };
}
