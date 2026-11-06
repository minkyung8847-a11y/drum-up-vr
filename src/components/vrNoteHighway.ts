import * as THREE from 'three';
import type { DrumHitSurface } from './vrStickCollision';

export const RHYTHM_BPM = 100;
const TRAVEL_MS = 3000;
const PERFECT_MS = 50;
const GOOD_MS = 120;
const FLASH_MS = 230;

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

type RhythmSurface = Omit<DrumHitSurface, 'mesh'> & { world: THREE.Matrix4 };

export function captureRhythmSurfaces(surfaces: DrumHitSurface[]): RhythmSurface[] {
  return surfaces.map(({ mesh, ...surface }) => ({ ...surface, world: mesh.matrixWorld.clone() }));
}

function surfaceNormal(world: THREE.Matrix4) {
  return new THREE.Vector3(0, 1, 0).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(world));
}

function laneTarget({ world, radius, height, cymbal }: RhythmSurface, normal: THREE.Vector3) {
  return new THREE.Vector3(0, cymbal ? 0.008 : height, cymbal ? radius * 0.35 : 0)
    .applyMatrix4(world).addScaledVector(normal, 0.012);
}

export function createVRLanePreview(surfaces: RhythmSurface[], eye: THREE.Vector3) {
  const positions: THREE.Vector3[] = [];
  const colors: number[] = [];
  const segments = 24;
  const farDepth = 10;
  // The poster's upper-right convergence is placed closer to the seated
  // view's centre so both eyes can see it without turning away from the kit.
  const vanishingX = 0.26;
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
      return out.set(eye.x + THREE.MathUtils.lerp(nearX, vanishingX, progress) * depth,
        eye.y + THREE.MathUtils.lerp(nearY, vanishingY, progress) * depth, eye.z - depth);
    }
    for (let i = 0; i < segments; i++) {
      for (const progress of [i / segments, (i + 1) / segments]) {
        positions.push(positionAt(progress, new THREE.Vector3()));
        const brightness = THREE.MathUtils.lerp(1, 0.08, progress ** 2);
        colors.push(brightness, brightness, brightness);
      }
    }
    return [surface.id, positionAt] as const;
  }));
  const geometry = new THREE.BufferGeometry().setFromPoints(positions);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({ color: 0xd7dfec, vertexColors: true,
    transparent: true, opacity: 0.40, depthWrite: false, toneMapped: false });
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = 'vr-lane-preview';
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
  eye: THREE.Vector3, onStatus: (state: RhythmState, judgment?: RhythmJudgment) => void) {
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

  const linePoints: THREE.Vector3[] = [];
  const lanes = new Map(surfaces.map(surface => {
    const { id, world, radius, height, cymbal } = surface;
    const normal = surfaceNormal(world);
    const target = laneTarget(surface, normal);
    // Each ray starts on the instrument and points toward a shared vanishing
    // point above the kit in the nominal seated view. It stays world-locked.
    const nearDepth = eye.z - target.z;
    const farDepth = 3.6;
    const nearX = (target.x - eye.x) / nearDepth;
    const nearY = (target.y - eye.y) / nearDepth;
    const farY = 0.13;
    const edgeSpacing = id === 'crash' ? -0.045 : id === 'ride' ? 0.045 : 0;
    const farX = nearX * (0.42 - farY) / (0.42 - nearY) + edgeSpacing;
    function positionAt(progress: number, out: THREE.Vector3) {
      // Keep the last section above the playing surfaces. The vertical kick
      // head is approached from the player side of the bass drum shell.
      const clearance = id === 'kick' ? 0.24 * Math.sin(Math.PI * progress) : 0;
      const depth = nearDepth + (farDepth - nearDepth) * progress ** 3 - clearance;
      return out.set(eye.x + THREE.MathUtils.lerp(nearX, farX, progress) * depth,
        eye.y + THREE.MathUtils.lerp(nearY, farY, progress) * depth, eye.z - depth);
    }
    for (let i = 0; i < 16; i++) {
      linePoints.push(positionAt(i / 16, new THREE.Vector3()), positionAt((i + 1) / 16, new THREE.Vector3()));
    }
    const noteMaterial = material(COLORS[id]);
    const burst = new THREE.Mesh(ringGeometry, material(COLORS[id]));
    burst.name = `rhythm-burst-${id}`;
    const rim = new THREE.Mesh(ringGeometry, material(COLORS[id]));
    rim.name = `rhythm-rim-${id}`;
    // The same ring texture traces the actual rim in the playing surface's plane.
    rim.position.set(0, cymbal ? 0 : height, 0).applyMatrix4(world).addScaledVector(normal, 0.007);
    rim.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    rim.scale.set(2 * radius * new THREE.Vector3().setFromMatrixColumn(world, 0).length() / 0.675,
      2 * radius * new THREE.Vector3().setFromMatrixColumn(world, 2).length() / 0.675, 1);
    rim.visible = burst.visible = false;
    anchor.add(rim, burst);
    const lane = { positionAt, noteMaterial, burst, rim, flashAt: -Infinity };
    return [id, lane] as const;
  }));
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(linePoints),
    new THREE.LineBasicMaterial({ color: 0xc3cbd8, transparent: true, opacity: 0.32, depthWrite: false }));
  lines.name = 'rhythm-lanes';
  anchor.add(lines);

  const notes = PATTERN.flatMap((parts, beat) => parts.map(id => {
    const lane = lanes.get(id)!;
    const arrival = TRAVEL_MS + beat * (60_000 / RHYTHM_BPM);
    const mesh = new THREE.Mesh(ringGeometry, lane.noteMaterial);
    mesh.name = `note-${id}-${arrival}`;
    mesh.visible = false;
    anchor.add(mesh);
    return { id, lane, arrival, mesh, resolved: false };
  }));
  let state: RhythmState = 'idle';
  let epoch = 0;
  let pauseAt = 0;
  const lastArrival = notes[notes.length - 1].arrival;
  const noteScale = (progress: number) => THREE.MathUtils.lerp(0.12, 0.15, 1 - progress);

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
      lane.rim.visible = lane.burst.visible = false;
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
      const progress = (closest.arrival - elapsed) / TRAVEL_MS;
      lane.positionAt(progress, lane.burst.position);
      lane.flashAt = elapsed;
      onStatus(state, distance <= PERFECT_MS ? 'Perfect' : 'Good');
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
        note.mesh.scale.setScalar(noteScale(progress));
        note.mesh.lookAt(viewer);
      }
      for (const lane of lanes.values()) {
        const age = (elapsed - lane.flashAt) / FLASH_MS;
        lane.rim.visible = lane.burst.visible = age >= 0 && age < 1;
        if (!lane.burst.visible) continue;
        const fade = (1 - age) ** 2;
        lane.rim.material.opacity = 0.7 * fade;
        lane.burst.material.opacity = fade;
        lane.burst.scale.setScalar(0.15 + 0.14 * age);
        lane.burst.lookAt(viewer);
      }
    },
    dispose() {
      anchor.removeFromParent();
      lines.geometry.dispose();
      lines.material.dispose();
      ringGeometry.dispose();
      texture.dispose();
      for (const lane of lanes.values()) {
        lane.noteMaterial.dispose();
        lane.burst.material.dispose();
        lane.rim.material.dispose();
      }
    },
  };
}
