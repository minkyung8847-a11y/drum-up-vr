import type { FootPedalController, FootPedalState } from '../pedal/footPedal';
import * as THREE from 'three';
import { DRUM_ENVIRONMENTS } from './drumEnvironments';
import type { DrumEnvironmentId } from './drumEnvironments';
import type { StickHand } from './virtualDrumsticks';
import { PANEL_SIZE, PANEL_TABS, PANEL_GENRES, SONG_LIST, DEMO_SONGS, loveCover, drawUnifiedPanel, maxSongScroll, panelActionAt } from './vrUnifiedPanelDesign';
import { createVRSongDetail } from './vrSongDetail';
import { getNoteSyncMs, setNoteSyncMs } from './vrNoteSync';
import type { UnifiedPanelState, PanelAction } from './vrUnifiedPanelDesign';
import { RHYTHM_BPM } from './vrNoteHighway';
import type { RhythmState } from './vrNoteHighway';

const WIDTH = 1.26, HEIGHT = WIDTH * PANEL_SIZE.height / PANEL_SIZE.width, RADIUS = 5.5;
export const PANEL_POSE_KEY = 'drumup.vr.panel-pose.v1';
// UVs remain linear; the actual surface bends by only 3.6cm at either edge.
export function unifiedPanelPoint(x: number, y: number, out: THREE.Vector3) {
  const angle = (x / PANEL_SIZE.width - .5) * WIDTH / RADIUS;
  return out.set(RADIUS * Math.sin(angle), (.5 - y / PANEL_SIZE.height) * HEIGHT, RADIUS * (1 - Math.cos(angle)));
}
export function createVRUnifiedPanel(scene: THREE.Scene, rig: THREE.Group, kit: THREE.Group, options: {
  background: DrumEnvironmentId; onBackground: (id: DrumEnvironmentId) => void;
  getVolume: () => number; setVolume: (volume: number) => void;
  onRhythm: (action: 'start' | 'pause' | 'restart' | 'free') => void;
  onViewMode: (mode: 'vr' | 'ar') => void;
  maxTextureSize?: number; maxAnisotropy?: number;
  onSongStart?: (offset: number) => Promise<boolean | void>;
  onSongPreview?: () => Promise<void>;
  onSongPreviewStop?: () => void;
  getSongPreview?: () => { playing: boolean; progress: number };
  footPedal?: () => FootPedalController;
  onNoteSync?: (milliseconds: number) => void;
}) {
  const state: UnifiedPanelState = { tab: 'MUSIC', genre: 'All', song: 0, scroll: 0,
    practice: 'FREE PLAY', background: options.background, setting: 'AUDIO', volume: options.getVolume(), hover: '', pressed: '',
    minimized: false, viewMode: 'vr', canAR: false, rhythm: 'idle', bpm: RHYTHM_BPM, perfect: 0, great: 0, miss: 0, noteSyncMs: getNoteSyncMs() };
  const canvas = document.createElement('canvas');
  const resolution = Math.min(2.5, (options.maxTextureSize ?? 4096) / PANEL_SIZE.width);
  canvas.width = Math.floor(PANEL_SIZE.width * resolution); canvas.height = Math.floor(PANEL_SIZE.height * resolution);
  const context = canvas.getContext('2d')!; context.scale(resolution, resolution);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter; texture.anisotropy = Math.max(1, Math.min(8, options.maxAnisotropy ?? 1));
  const geometry = new THREE.PlaneGeometry(WIDTH, HEIGHT, 64, 1);
  const vertices = geometry.getAttribute('position') as THREE.BufferAttribute;
  const uv = geometry.getAttribute('uv'); const scratch = new THREE.Vector3();
  for (let index = 0; index < vertices.count; index++) {
    unifiedPanelPoint(uv.getX(index) * PANEL_SIZE.width, (1 - uv.getY(index)) * PANEL_SIZE.height, scratch);
    vertices.setXYZ(index, scratch.x, scratch.y, scratch.z);
  }
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, transparent: true,
    depthWrite: false, toneMapped: false, side: THREE.DoubleSide, alphaTest: .01 }));
  mesh.name = 'vr-unified-panel'; mesh.renderOrder = 1000; mesh.visible = false; scene.add(mesh);
  mesh.userData.panelState = state;
  const detail = createVRSongDetail(mesh, {
    onStart: async offset => { const started = await options.onSongStart?.(offset); if (started === false) return false; state.songResults = undefined; state.minimized = true; dirty = true; return true; },
    onPreview: async () => { await options.onSongPreview?.(); },
    onClose: () => options.onSongPreviewStop?.(),
  });
  // Opaque geometry, independent of the alpha-textured navigation and controls.
  const backingGeometry = new THREE.PlaneGeometry(1, 1, 128, 48);
  const backingVertices = backingGeometry.getAttribute('position') as THREE.BufferAttribute;
  const backingUV = backingGeometry.getAttribute('uv');
  for (let index = 0; index < backingVertices.count; index++) {
    let x = 12 + backingUV.getX(index) * 1000, y = 226 + (1 - backingUV.getY(index)) * 672;
    const cx = THREE.MathUtils.clamp(x, 32, 992), cy = THREE.MathUtils.clamp(y, 246, 878);
    const dx = x - cx, dy = y - cy, distance = Math.hypot(dx, dy);
    if (distance > 20) { x = cx + dx * 20 / distance; y = cy + dy * 20 / distance; }
    unifiedPanelPoint(x, y, scratch); backingVertices.setXYZ(index, scratch.x, scratch.y, scratch.z - .004);
  }
  backingGeometry.computeBoundingSphere();
  const backing = new THREE.Mesh(backingGeometry, new THREE.MeshBasicMaterial({ color: 0x17191e, toneMapped: false, side: THREE.DoubleSide }));
  backing.name = 'vr-panel-opaque-backing'; backing.renderOrder = 999; mesh.add(backing);
  const handleGeometry = new THREE.CapsuleGeometry(.008, .26, 4, 12);
  const handleMaterial = new THREE.MeshBasicMaterial({ color: 0x858c98, toneMapped: false, depthTest: false });
  const handle = new THREE.Mesh(handleGeometry, handleMaterial);
  handle.name = 'vr-panel-move-handle'; handle.rotation.z = Math.PI / 2; handle.renderOrder = 1002;
  const handleHitGeometry = new THREE.CapsuleGeometry(.026, .26, 4, 12);
  const handleHit = new THREE.Mesh(handleHitGeometry, handleMaterial);
  handleHit.name = 'vr-panel-move-hit'; handleHit.rotation.z = Math.PI / 2; handleHit.visible = false;
  mesh.add(handle, handleHit);
  const pointerGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
  const pointerMaterial = new THREE.LineBasicMaterial({ color: 0xdde3ed, transparent: true, opacity: .55, depthTest: false });
  const dotGeometry = new THREE.SphereGeometry(.0045, 8, 6);
  const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xf5f6ff, depthTest: false, toneMapped: false });
  const pointers = [0, 1].map(index => {
    const line = new THREE.Line(pointerGeometry, pointerMaterial), dot = new THREE.Mesh(dotGeometry, dotMaterial);
    line.name = `unified-panel-ray-${index}`; dot.name = `unified-panel-dot-${index}`;
    line.renderOrder = dot.renderOrder = 1008; line.visible = dot.visible = false; scene.add(line, dot); return { line, dot };
  });
  const raycaster = new THREE.Raycaster(), world = new THREE.Matrix4(), rotation = new THREE.Matrix4();
  const eye = new THREE.Vector3(), anchor = new THREE.Vector3(), forward = new THREE.Vector3(0, 0, -1);
  const pointing = new Set<StickHand>();
  const dragWorld = new THREE.Matrix4(), dragPosition = new THREE.Vector3(), dragScale = new THREE.Vector3();
  let drag: { input: XRInputSource; relative: THREE.Matrix4 } | null = null;
  let session: XRSession | null = null, reference: XRReferenceSpace | null = null;
  let placed = false, dirty = true, pedalDirty = false, lastDraw = -Infinity, lastFrame = 0, pressedUntil = 0;
  const coverLoaded = () => { dirty = true; };
  loveCover.addEventListener('load', coverLoaded);
  const held = new Set<XRInputSource>(), handledSelect = new Set<XRInputSource>();
  const down = new Map<XRInputSource, boolean>();
  type Gesture = { action: PanelAction; y: number; scroll: number; dragging: boolean };
  const gestures = new Map<XRInputSource, Gesture>();
  function redraw(now: number) {
    backing.visible = !state.minimized;
    unifiedPanelPoint(512, state.minimized ? 212 : 934, handle.position); handleHit.position.copy(handle.position);
    drawUnifiedPanel(context, state); texture.needsUpdate = true; dirty = pedalDirty = false; lastDraw = now;
  }
  redraw(0);
  function savePose() {
    try { localStorage.setItem(PANEL_POSE_KEY, JSON.stringify({ version: 1, position: mesh.position.toArray(), quaternion: mesh.quaternion.toArray() })); }
    catch { /* The current world pose remains usable without persistence. */ }
  }
  function placeDefault(save = false) {
    kit.getWorldPosition(anchor);
    mesh.position.set(anchor.x - 1.25, Math.max(anchor.y + 2.25, eye.y + .95), anchor.z - 1.05);
    mesh.lookAt(eye); mesh.updateWorldMatrix(true, true); placed = true;
    if (save) savePose();
  }
  function loadPose() {
    try {
      const pose = JSON.parse(localStorage.getItem(PANEL_POSE_KEY) ?? 'null');
      if (pose?.version !== 1 || !Array.isArray(pose.position) || pose.position.length !== 3
        || !pose.position.every((value: number) => Number.isFinite(value) && Math.abs(value) < 30)
        || !Array.isArray(pose.quaternion) || pose.quaternion.length !== 4
        || !pose.quaternion.every(Number.isFinite) || Math.abs(Math.hypot(...pose.quaternion) - 1) > .01) return false;
      dragPosition.fromArray(pose.position).sub(eye);
      // Recover an unreachable/behind-the-player saved window on fresh entry.
      if (dragPosition.length() < .45 || dragPosition.length() > 6 || dragPosition.z > .25) return false;
      mesh.position.fromArray(pose.position); mesh.quaternion.fromArray(pose.quaternion).normalize();
      mesh.updateWorldMatrix(true, true); placed = true; return true;
    } catch { return false; }
  }
  function gripWorld(input: XRInputSource, frame: XRFrame) {
    const pose = reference && input.gripSpace ? frame.getPose(input.gripSpace, reference) : null;
    if (!pose || pose.emulatedPosition) return false;
    rig.updateWorldMatrix(true, false); dragWorld.fromArray(pose.transform.matrix).premultiply(rig.matrixWorld); return true;
  }
  function movePanel(input: XRInputSource, frame: XRFrame) {
    if (!drag || drag.input !== input || !gripWorld(input, frame)) return false;
    dragWorld.multiply(drag.relative).decompose(mesh.position, mesh.quaternion, dragScale);
    mesh.updateWorldMatrix(true, true); return true;
  }
  function setScroll(value: number) {
    const next = THREE.MathUtils.clamp(value, 0, maxSongScroll(state));
    if (state.scroll !== next) { state.scroll = next; dirty = true; }
  }
  function cast(input: XRInputSource, frame: XRFrame) {
    if (!mesh.visible || !placed || session?.visibilityState !== 'visible' || !reference || input.hand
      || !input.gripSpace || input.targetRayMode !== 'tracked-pointer') return null;
    const pose = frame.getPose(input.targetRaySpace, reference);
    if (!pose || pose.emulatedPosition) return null;
    rig.updateWorldMatrix(true, false); world.fromArray(pose.transform.matrix).premultiply(rig.matrixWorld);
    rotation.extractRotation(world); raycaster.ray.origin.setFromMatrixPosition(world);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotation);
    const detailHit = detail.hit(raycaster);
    if (detailHit) return { hit: detailHit.hit, action: { key: `detail-${detailHit.index}`, kind: 'detail', index: detailHit.index } as PanelAction, x: 0, y: 0 };
    mesh.updateWorldMatrix(true, false);
    handleHit.updateWorldMatrix(true, false);
    const grabHit = raycaster.intersectObject(handleHit, false)[0];
    if (grabHit) return { hit: grabHit, action: { key: 'move-0', kind: 'move', index: 0 } as PanelAction, x: 512, y: state.minimized ? 212 : 934 };
    const hit = raycaster.intersectObject(mesh, false)[0];
    if (!hit?.uv) return null;
    const x = hit.uv.x * PANEL_SIZE.width, y = (1 - hit.uv.y) * PANEL_SIZE.height;
    const action = panelActionAt(state, x, y);
    return action ? { hit, action, x, y } : null;
  }
  function activate(action: PanelAction) {
    if (action.kind === 'pedal') {
      if (action.index === 0) state.footPedalOpen = !state.footPedalOpen;
      const pedal = options.footPedal?.();
      if (!state.footPedalOpen) pedal?.cancel();
      if (action.index === 1) pedal?.detect();
      else if (action.index === 2) pedal?.test();
      else if (action.index === 3) pedal?.cancel();
      else if (action.index === 4 && pedal) pedal.setEnabled(!pedal.state.enabled);
      dirty = true; return;
    }
    if ((action.kind === 'tab' || action.kind === 'setting') && state.footPedalOpen) options.footPedal?.().cancel();
    if (action.kind === 'results') { state.songResults = undefined; state.tab = 'MUSIC'; state.minimized = false; dirty = true; return; }
    if (action.kind === 'noteSync') {
      state.noteSyncMs = setNoteSyncMs(action.index ? state.noteSyncMs + action.index * 10 : 0);
      options.onNoteSync?.(state.noteSyncMs); dirty = true; return;
    }
    if (action.kind === 'tab') { state.songResults = undefined; state.tab = PANEL_TABS[action.index]; state.hover = ''; state.minimized = false; if (state.tab !== 'MUSIC') detail.close(); }
    else if (action.kind === 'genre') { state.genre = PANEL_GENRES[action.index]; state.scroll = 0; }
    else if (action.kind === 'song') { state.song = action.index; detail.select(DEMO_SONGS[action.index]); }
    else if (action.kind === 'detail') void detail.activate(action.index);
    else if (action.kind === 'practice') {
      state.practice = action.index ? 'RUDIMENT' : 'FREE PLAY';
      if (!action.index) options.onRhythm('free');
    }
    else if (action.kind === 'rhythm') {
      const command = (['start', 'pause', 'restart'] as const)[action.index];
      options.onRhythm(command);
      if (command !== 'pause') state.minimized = true;
    }
    else if (action.kind === 'view') options.onViewMode(action.index ? 'ar' : 'vr');
    else if (action.kind === 'reset') placeDefault(true);
    else if (action.kind === 'background') {
      state.background = DRUM_ENVIRONMENTS[action.index].id; options.onBackground(state.background);
    } else if (action.kind === 'setting') {
      state.setting = (['AUDIO', 'CONTROLLER', 'NOTE', 'GENERAL'] as const)[action.index];
      // Show the real VR controls immediately; do not leave CONTROLLER as a preview.
      if (state.setting === 'CONTROLLER') state.footPedalOpen = true;
    }
    else if (action.kind === 'volume') {
      state.volume = THREE.MathUtils.clamp(options.getVolume() + action.index * .05, 0, 1); options.setVolume(state.volume);
    }
    dirty = true;
  }
  function begin(input: XRInputSource, frame: XRFrame) {
    if (held.has(input)) return;
    if (drag) { held.add(input); handledSelect.add(input); return; }
    const target = cast(input, frame); if (!target) return;
    held.add(input); handledSelect.add(input);
    state.pressed = target.action.key; pressedUntil = performance.now() + 160;
    if (target.action.kind === 'move') {
      if (gripWorld(input, frame)) {
        mesh.updateWorldMatrix(true, false);
        drag = { input, relative: dragWorld.clone().invert().multiply(mesh.matrixWorld) };
        gestures.clear();
      }
    } else if (target.action.kind === 'song' || target.action.kind === 'scrollbar') {
      gestures.set(input, { action: target.action, y: target.y, scroll: state.scroll, dragging: target.action.kind === 'scrollbar' });
      if (target.action.kind === 'scrollbar') setScroll((target.y - 437 - 72) / 226 * maxSongScroll(state));
    } else activate(target.action);
    dirty = true;
  }
  function finish(input: XRInputSource, frame?: XRFrame) {
    if (drag?.input === input) { if (frame) movePanel(input, frame); drag = null; savePose(); }
    const gesture = gestures.get(input);
    if (gesture && !gesture.dragging) activate(gesture.action);
    gestures.delete(input); held.delete(input); state.pressed = ''; dirty = true;
  }
  const start = (event: XRInputSourceEvent) => begin(event.inputSource, event.frame);
  const end = (event: XRInputSourceEvent) => finish(event.inputSource, event.frame);
  const select = (event: XRInputSourceEvent) => {
    if (handledSelect.delete(event.inputSource)) return;
    if (drag) return;
    const target = cast(event.inputSource, event.frame);
    if (target) { activate(target.action); state.pressed = target.action.key; pressedUntil = performance.now() + 160; }
  };
  const changed = (event: XRInputSourcesChangeEvent) => {
    for (const input of event.removed) { if (drag?.input === input) { drag = null; savePose(); } gestures.delete(input); held.delete(input); down.delete(input); handledSelect.delete(input); }
  };
  function resetInput() { if (drag) { drag = null; savePose(); } gestures.clear(); held.clear(); down.clear(); handledSelect.clear(); pointing.clear(); }
  function bind(next: XRSession | null) {
    if (next === session) return;
    session?.removeEventListener('selectstart', start); session?.removeEventListener('selectend', end);
    session?.removeEventListener('select', select); session?.removeEventListener('inputsourceschange', changed);
    resetInput(); session = next;
    session?.addEventListener('selectstart', start); session?.addEventListener('selectend', end);
    session?.addEventListener('select', select); session?.addEventListener('inputsourceschange', changed);
  }
  return {
    mesh, state,
    setFootPedal(value: FootPedalState) {
      state.footPedal = value;
      // Do not upload a 2560×2300 canvas (and regenerate its mipmaps) for each
      // pedal edge while AUDIO/NOTE/GENERAL or a collapsed panel is displayed.
      if (mesh.visible && !state.minimized && !state.songResults && state.tab === 'SETTINGS'
        && state.setting === 'CONTROLLER' && state.footPedalOpen) pedalDirty = true;
    },
    showSongResults(perfect: number, great: number, miss: number) {
      const total = perfect + great + miss;
      state.songResults = { perfect, great, miss, accuracy: total ? (perfect + great * .7) / total * 100 : 0 };
      state.minimized = false; detail.close(); dirty = true;
    },
    show() { mesh.visible = true; dirty = true; },
    hide() { mesh.visible = false; options.onSongPreviewStop?.(); resetInput(); pointers.forEach(({ line, dot }) => { line.visible = dot.visible = false; }); },
    setBackground(id: DrumEnvironmentId) { if (state.background !== id) { state.background = id; dirty = true; } },
    setViewMode(mode: 'vr' | 'ar', canAR: boolean) { state.viewMode = mode; state.canAR = canAR; dirty = true; },
    setRhythmStatus(status: RhythmState, judgment?: 'Perfect' | 'Great' | 'Miss') {
      if (state.rhythm !== status || state.judgment !== judgment) {
        state.rhythm = status; state.judgment = judgment;
        if (state.tab === 'PRACTICE' && !state.minimized) dirty = true;
      }
    },
    setRhythmBpm(bpm: number) { if (state.bpm !== bpm) { state.bpm = bpm; dirty = true; } },
    setSongResults(perfect: number, great: number, miss: number, time: number) {
      const count = time < 0 ? Math.ceil(-time * state.bpm / 60) : undefined;
      if (state.perfect !== perfect || state.great !== great || state.miss !== miss || state.countIn !== count) {
        state.perfect = perfect; state.great = great; state.miss = miss; state.countIn = count;
        if (state.tab === 'PRACTICE' && !state.minimized) dirty = true;
      }
    },
    isPointing(hand: StickHand) { return pointing.has(hand); },
    update(next: XRSession | null, frame: XRFrame | undefined, space: XRReferenceSpace | null, viewer: XRViewerPose | null, now: number) {
      bind(next); reference = space;
      detail.update(now, mesh.visible && state.tab === 'MUSIC' && !state.minimized, options.getSongPreview?.() ?? { playing: false, progress: 0 });
      const delta = Math.min(.05, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
      pointers.forEach(({ line, dot }) => { line.visible = dot.visible = false; }); pointing.clear();
      if (!mesh.visible || !frame || !space || !viewer || next?.visibilityState !== 'visible') { resetInput(); return; }
      rig.updateWorldMatrix(true, false); world.fromArray(viewer.transform.matrix).premultiply(rig.matrixWorld); eye.setFromMatrixPosition(world);
      if (!placed && !loadPose()) placeDefault();
      let hover = '', pointerIndex = 0;
      for (const input of next.inputSources) {
        if (drag?.input === input && !movePanel(input, frame)) finish(input);
        let target = cast(input, frame);
        const known = (input.gamepad?.mapping as string) === 'xr-standard'
          || input.profiles.some(profile => /^(meta-quest-touch|oculus-touch|generic-trigger)/.test(profile));
        const button = known && !input.hand ? input.gamepad?.buttons[0] : undefined;
        if (button) {
          const previous = down.get(input) ?? false, pressed = button.pressed || button.value >= (previous ? .4 : .75);
          if (pressed && !previous) begin(input, frame);
          else if (!pressed && previous) finish(input, frame);
          down.set(input, pressed); target = cast(input, frame);
        }
        const gesture = gestures.get(input);
        if (drag) {
          if (input.handedness === 'left' || input.handedness === 'right') pointing.add(input.handedness);
          if (drag.input !== input) continue;
        }
        if (!target) {
          if (gesture && !frame.getPose(input.targetRaySpace, space)) { gestures.delete(input); held.delete(input); }
          continue;
        }
        if (input.handedness === 'left' || input.handedness === 'right') pointing.add(input.handedness);
        hover = target.action.key;
        if (gesture && state.tab === 'MUSIC') {
          if (gesture.action.kind === 'scrollbar') setScroll((target.y - 437 - 72) / 226 * maxSongScroll(state));
          else if (Math.abs(target.y - gesture.y) > 10 || gesture.dragging) {
            gesture.dragging = true; setScroll(gesture.scroll - (target.y - gesture.y));
          }
        }
        if (state.tab === 'MUSIC' && target.y >= SONG_LIST.y) {
          const axis = input.gamepad?.axes?.[3] ?? input.gamepad?.axes?.[1] ?? 0;
          if (Math.abs(axis) > .25) setScroll(state.scroll + axis * delta * 360);
        }
        const pointer = pointers[pointerIndex++];
        if (pointer) {
          pointer.line.position.copy(raycaster.ray.origin); pointer.line.quaternion.setFromUnitVectors(forward, raycaster.ray.direction);
          pointer.line.scale.z = target.hit.distance; pointer.dot.position.copy(target.hit.point);
          pointer.line.visible = pointer.dot.visible = true;
        }
      }
      if (hover !== state.hover) { state.hover = hover; dirty = true; }
      handleMaterial.color.setHex(drag ? 0xf5f7ff : hover === 'move-0' ? 0xd9deea : 0x858c98);
      if (state.pressed && !held.size && now >= pressedUntil) { state.pressed = ''; dirty = true; }
      // Diagnostic counters may change at keyboard repeat speed. Coalesce them
      // to 10 Hz; navigation and Trigger feedback keep their existing cadence.
      if ((dirty && now - lastDraw >= 32) || (pedalDirty && now - lastDraw >= 100)) redraw(now);
    },
    dispose() {
      bind(null); mesh.removeFromParent(); geometry.dispose(); mesh.material.dispose(); texture.dispose();
      detail.dispose(); loveCover.removeEventListener('load', coverLoaded);
      backingGeometry.dispose(); backing.material.dispose(); handleGeometry.dispose(); handleHitGeometry.dispose(); handleMaterial.dispose();
      pointers.forEach(({ line, dot }) => { line.removeFromParent(); dot.removeFromParent(); });
      pointerGeometry.dispose(); pointerMaterial.dispose(); dotGeometry.dispose(); dotMaterial.dispose();
    },
  };
}
