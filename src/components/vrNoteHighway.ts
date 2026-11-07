import * as THREE from 'three';
import type { DrumHitSurface } from './vrStickCollision';
import type { NoteEvent } from '../types';
import { PAD_TO_INSTRUMENT } from './songDrumMapping';
import type { SongWindows } from './songPlayback';
import { NOTE_TRAVEL_TIME } from './songPracticeTiming';
import { VR_BASIC_DRUM_BEAT } from './vrBasicDrumBeat';

export const RHYTHM_BPM = VR_BASIC_DRUM_BEAT.bpm;
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

export type RhythmState = 'idle' | 'playing' | 'paused' | 'finished';
export type RhythmJudgment = 'Perfect' | 'Great' | 'Miss';
export type RhythmAction = 'toggle' | 'restart';

type RhythmSurface = DrumHitSurface & { world: THREE.Matrix4 };
type ProgressCallback = (perfect: number, great: number, miss: number, scoreTime: number) => void;
type ScoreMedia = { notes: readonly NoteEvent[]; audio: HTMLAudioElement; offset: number; windows: SongWindows;
  onResults?: ProgressCallback };

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
    function positionAt(progress: number, out: THREE.Vector3) {
      return out.lerpVectors(target, vanishingPoint, progress);
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
  onStatus: (state: RhythmState, judgment?: RhythmJudgment) => void, media?: ScoreMedia, onProgress?: ProgressCallback) {
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
    const zone = new THREE.Mesh(ringGeometry, material(COLORS[id]));
    zone.name = `rhythm-judgment-zone-${id}`;
    zone.material.opacity = 0.18;
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
    const noteSize = Math.min(rim.scale.x, rim.scale.y) * 0.75;
    zone.position.copy(rim.position);
    zone.quaternion.copy(rim.quaternion);
    zone.scale.copy(rim.scale).multiplyScalar(0.75);
    rim.visible = ripple.visible = success.visible = zone.visible = false;
    anchor.add(rim, ripple, success, zone);
    const lane = { positionAt: paths.get(id)!, noteMaterial, noteSize, mesh, world, normal, height, cymbal,
      ripple, rim, success, zone, flashAt: -Infinity, boost: 0 };
    return [id, lane] as const;
  }));

  const travel = media ? NOTE_TRAVEL_TIME * 1000 : TRAVEL_MS;
  const perfectWindow = media?.windows.perfect ?? PERFECT_MS;
  const greatWindow = media?.windows.great ?? GREAT_MS;
  const earlyWindow = media ? greatWindow : travel * 0.15;
  const events = media ? media.notes.map(note => ({
    id: note.instrument ?? PAD_TO_INSTRUMENT[note.padId], arrival: note.time * 1000,
  })) : VR_BASIC_DRUM_BEAT.events.map(note => ({ id: note.id, arrival: travel + note.hitTimeMs }));
  type NoteMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  const notePool: NoteMesh[] = [];
  const notes = events.filter(event => lanes.has(event.id)).sort((a, b) => a.arrival - b.arrival)
    .map(({ id, arrival }) => ({ id, lane: lanes.get(id)!, arrival, mesh: undefined as NoteMesh | undefined, resolved: false }));
  const showNote = (note: typeof notes[number]) => {
    if (!note.mesh) {
      const mesh = notePool.pop() ?? new THREE.Mesh(ringGeometry, note.lane.noteMaterial);
      mesh.name = `note-${note.id}-${note.arrival}`;
      mesh.material = note.lane.noteMaterial;
      mesh.renderOrder = 2;
      anchor.add(mesh);
      note.mesh = mesh;
    }
    note.mesh.visible = true;
    return note.mesh;
  };
  const hideNote = (note: typeof notes[number]) => {
    if (!note.mesh) return;
    note.mesh.visible = false;
    if (media) {
      note.mesh.removeFromParent();
      notePool.push(note.mesh);
      note.mesh = undefined;
    }
  };
  // The authored demo is small. Uploaded scores only allocate meshes for visible notes.
  if (!media) for (const note of notes) { showNote(note); hideNote(note); }
  let state: RhythmState = 'idle';
  let epoch = 0;
  let pauseAt = 0;
  const elapsedAt = (now: number) => media ? (media.audio.currentTime - media.offset) * 1000
    : (state === 'paused' ? pauseAt : now) - epoch;
  const face = new THREE.Vector3(0, 0, 1);
  const normalMatrix = new THREE.Matrix3();
  let perfect = 0, great = 0, miss = 0;
  const report = (now: number) => (media?.onResults ?? onProgress)?.(perfect, great, miss,
    (elapsedAt(now) - (media ? 0 : travel)) / 1000);

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
    perfect = great = miss = 0;
    for (const note of notes) {
      note.resolved = false;
      hideNote(note);
    }
    for (const lane of lanes.values()) lane.zone.visible = false;
  }

  function restart(now: number) {
    clear();
    epoch = now;
    if (!media) {
      console.info(`[DRUM UP VR] BASIC DRUM BEAT ${RHYTHM_BPM} BPM · beat ${VR_BASIC_DRUM_BEAT.beatMs}ms · travel ${travel}ms · ${notes.length} notes`);
      console.table(VR_BASIC_DRUM_BEAT.events.map(note => ({
        instrument: note.id, bar: Math.floor(note.beat / VR_BASIC_DRUM_BEAT.beatsPerBar) + 1,
        beat: note.beat % VR_BASIC_DRUM_BEAT.beatsPerBar + 1,
        scoreSeconds: note.hitTimeMs / 1000,
        spawnSecondsAfterPlay: note.hitTimeMs / 1000,
        hitSecondsAfterPlay: (travel + note.hitTimeMs) / 1000,
      })));
    }
    if (media) {
      media.audio.currentTime = 0;
      onSeeked();
    }
    play();
  }

  function play() {
    setState('playing');
    if (media) void media.audio.play().catch(() => {
      if (state === 'playing' && media.audio.paused) setState('paused');
    });
  }

  function pause(now: number) {
    if (state !== 'playing') return false;
    pauseAt = now;
    media?.audio.pause();
    setState('paused');
    return true;
  }

  function judge(id: string, now: number): RhythmJudgment | undefined {
    if (state !== 'playing' || (media && (media.audio.paused || media.audio.seeking))) return;
    const elapsed = elapsedAt(now);
    let closest: typeof notes[number] | undefined;
    let distance = Infinity;
    for (const note of notes) {
      if (note.arrival > elapsed + earlyWindow) break;
      if (note.resolved || note.id !== id) continue;
      if (note.arrival < elapsed - greatWindow) continue;
      const offset = Math.abs(elapsed - note.arrival);
      if (offset < distance) { closest = note; distance = offset; }
    }
    if (!closest) return 'Miss';
    closest.resolved = true;
    hideNote(closest);
    closest.lane.zone.visible = false;
    if (distance > greatWindow + 1e-6) {
      miss++;
      report(now);
      return 'Miss';
    }
    const judgment = distance <= perfectWindow + 1e-6 ? 'Perfect' : 'Great';
    if (judgment === 'Perfect') perfect++;
    else great++;
    report(now);
    return judgment;
  }

  const onSeeked = () => {
    clear();
    const elapsed = elapsedAt(0);
    for (const note of notes) note.resolved = note.arrival < elapsed - greatWindow;
  };
  const finish = (now: number) => {
    for (const note of notes) {
      if (!note.resolved) { note.resolved = true; miss++; }
      hideNote(note);
    }
    for (const lane of lanes.values()) lane.zone.visible = false;
    setState('finished');
    report(now);
  };
  const onEnded = () => finish(0);
  media?.audio.addEventListener('seeked', onSeeked);
  media?.audio.addEventListener('ended', onEnded);

  return {
    restart,
    setVisible(visible: boolean) { anchor.visible = visible; },
    refreshSurfaces(next: RhythmSurface[], nextPaths: ReturnType<typeof createVRNoteLanes>['paths']) {
      for (const surface of next) {
        const lane = lanes.get(surface.id);
        if (!lane) continue;
        lane.world.copy(surface.world);
        lane.normal.copy(surfaceNormal(surface.world));
        lane.positionAt = nextPaths.get(surface.id)!;
        const rimHeight = surface.cymbal || surface.id === 'kick' ? surface.height : 0.024;
        lane.rim.position.set(0, rimHeight, 0).applyMatrix4(lane.world).addScaledVector(lane.normal, .006);
        lane.rim.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), lane.normal);
        lane.ripple.quaternion.copy(lane.rim.quaternion);
        lane.rim.scale.set(2 * surface.radius * new THREE.Vector3().setFromMatrixColumn(lane.world, 0).length() / RING_DIAMETER_RATIO,
          2 * surface.radius * new THREE.Vector3().setFromMatrixColumn(lane.world, 2).length() / RING_DIAMETER_RATIO, 1);
        lane.noteSize = Math.min(lane.rim.scale.x, lane.rim.scale.y) * .75;
        lane.zone.position.copy(lane.rim.position); lane.zone.quaternion.copy(lane.rim.quaternion);
        lane.zone.scale.copy(lane.rim.scale).multiplyScalar(.75);
        lane.flashAt = -Infinity;
        lane.rim.visible = lane.ripple.visible = lane.success.visible = lane.zone.visible = false;
      }
    },
    toggle(now: number) {
      if (state === 'playing') pause(now);
      else if (state === 'paused') {
        epoch += now - pauseAt;
        play();
      } else restart(now);
    },
    pause,
    stop() {
      media?.audio.pause();
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
      const elapsed = elapsedAt(now);
      if (!media && state === 'playing' && elapsed >= travel + VR_BASIC_DRUM_BEAT.durationMs) {
        finish(now);
        return;
      }
      for (const lane of lanes.values()) lane.zone.visible = false;
      for (const note of notes) {
        const remaining = note.arrival - elapsed;
        if (!note.resolved && remaining < -greatWindow && state === 'playing' && !media?.audio.seeking) {
          note.resolved = true;
          miss++;
          onStatus(state, 'Miss');
        }
        if (note.resolved || remaining > travel || remaining < -greatWindow) { hideNote(note); continue; }
        const mesh = showNote(note);
        const progress = remaining / travel;
        note.lane.positionAt(progress, mesh.position);
        mesh.scale.setScalar(note.lane.noteSize);
        if (remaining >= 0 && remaining <= travel * 0.15) note.lane.zone.visible = true;
        mesh.lookAt(viewer);
      }
      report(now);
    },
    dispose() {
      media?.audio.removeEventListener('seeked', onSeeked);
      media?.audio.removeEventListener('ended', onEnded);
      media?.audio.pause();
      anchor.removeFromParent();
      ringGeometry.dispose();
      texture.dispose();
      noteTexture.dispose();
      for (const lane of lanes.values()) {
        lane.noteMaterial.dispose();
        lane.ripple.material.dispose();
        lane.rim.material.dispose();
        lane.success.material.dispose();
        lane.zone.material.dispose();
      }
    },
  };
}
