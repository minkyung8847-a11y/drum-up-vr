import * as THREE from 'three';
import { DRUM_ENVIRONMENTS } from './drumEnvironments';
import type { DrumEnvironmentId } from './drumEnvironments';
import type { StickHand } from './virtualDrumsticks';
import { PANEL_SIZE, PANEL_TABS, PANEL_GENRES, SONG_LIST, drawUnifiedPanel, maxSongScroll, panelActionAt } from './vrUnifiedPanelDesign';
import type { UnifiedPanelState, PanelAction } from './vrUnifiedPanelDesign';

const WIDTH = 1.26, HEIGHT = WIDTH * PANEL_SIZE.height / PANEL_SIZE.width, RADIUS = 5.5;
// UVs remain linear; the actual surface bends by only 3.6cm at either edge.
export function unifiedPanelPoint(x: number, y: number, out: THREE.Vector3) {
  const angle = (x / PANEL_SIZE.width - .5) * WIDTH / RADIUS;
  return out.set(RADIUS * Math.sin(angle), (.5 - y / PANEL_SIZE.height) * HEIGHT, RADIUS * (1 - Math.cos(angle)));
}
export function createVRUnifiedPanel(scene: THREE.Scene, rig: THREE.Group, kit: THREE.Group, options: {
  background: DrumEnvironmentId; onBackground: (id: DrumEnvironmentId) => void;
  getVolume: () => number; setVolume: (volume: number) => void;
}) {
  const state: UnifiedPanelState = { tab: 'MUSIC', genre: 'All', song: 0, scroll: 0,
    practice: 'FREE PLAY', background: options.background, setting: 'AUDIO', volume: options.getVolume(), hover: '', pressed: '' };
  const canvas = document.createElement('canvas');
  const resolution = 1.5; canvas.width = PANEL_SIZE.width * resolution; canvas.height = PANEL_SIZE.height * resolution;
  const context = canvas.getContext('2d')!; context.scale(resolution, resolution);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
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
  let session: XRSession | null = null, reference: XRReferenceSpace | null = null;
  let placed = false, dirty = true, lastDraw = -Infinity, lastFrame = 0, pressedUntil = 0;
  const held = new Set<XRInputSource>(), handledSelect = new Set<XRInputSource>();
  const down = new Map<XRInputSource, boolean>();
  type Gesture = { action: PanelAction; y: number; scroll: number; dragging: boolean };
  const gestures = new Map<XRInputSource, Gesture>();
  function redraw(now: number) {
    drawUnifiedPanel(context, state); texture.needsUpdate = true; dirty = false; lastDraw = now;
  }
  redraw(0);
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
    mesh.updateWorldMatrix(true, false);
    const hit = raycaster.intersectObject(mesh, false)[0];
    if (!hit?.uv) return null;
    const x = hit.uv.x * PANEL_SIZE.width, y = (1 - hit.uv.y) * PANEL_SIZE.height;
    const action = panelActionAt(state, x, y);
    return action ? { hit, action, x, y } : null;
  }
  function activate(action: PanelAction) {
    if (action.kind === 'tab') { state.tab = PANEL_TABS[action.index]; state.hover = ''; }
    else if (action.kind === 'genre') { state.genre = PANEL_GENRES[action.index]; state.scroll = 0; }
    else if (action.kind === 'song') state.song = action.index;
    else if (action.kind === 'practice') state.practice = action.index ? 'RUDIMENT' : 'FREE PLAY';
    else if (action.kind === 'background') {
      state.background = DRUM_ENVIRONMENTS[action.index].id; options.onBackground(state.background);
    } else if (action.kind === 'setting') state.setting = (['AUDIO', 'CONTROLLER', 'NOTE', 'GENERAL'] as const)[action.index];
    else if (action.kind === 'volume') {
      state.volume = THREE.MathUtils.clamp(options.getVolume() + action.index * .05, 0, 1); options.setVolume(state.volume);
    }
    dirty = true;
  }
  function begin(input: XRInputSource, frame: XRFrame) {
    if (held.has(input)) return;
    const target = cast(input, frame); if (!target) return;
    held.add(input); handledSelect.add(input);
    state.pressed = target.action.key; pressedUntil = performance.now() + 160;
    if (target.action.kind === 'song' || target.action.kind === 'scrollbar') {
      gestures.set(input, { action: target.action, y: target.y, scroll: state.scroll, dragging: target.action.kind === 'scrollbar' });
      if (target.action.kind === 'scrollbar') setScroll((target.y - 437 - 72) / 226 * maxSongScroll(state));
    } else activate(target.action);
    dirty = true;
  }
  function finish(input: XRInputSource) {
    const gesture = gestures.get(input);
    if (gesture && !gesture.dragging) activate(gesture.action);
    gestures.delete(input); held.delete(input); state.pressed = ''; dirty = true;
  }
  const start = (event: XRInputSourceEvent) => begin(event.inputSource, event.frame);
  const end = (event: XRInputSourceEvent) => finish(event.inputSource);
  const select = (event: XRInputSourceEvent) => {
    if (handledSelect.delete(event.inputSource)) return;
    const target = cast(event.inputSource, event.frame);
    if (target) { activate(target.action); state.pressed = target.action.key; pressedUntil = performance.now() + 160; }
  };
  const changed = (event: XRInputSourcesChangeEvent) => {
    for (const input of event.removed) { gestures.delete(input); held.delete(input); down.delete(input); handledSelect.delete(input); }
  };
  function resetInput() { gestures.clear(); held.clear(); down.clear(); handledSelect.clear(); pointing.clear(); }
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
    show() { mesh.visible = true; dirty = true; },
    hide() { mesh.visible = false; resetInput(); pointers.forEach(({ line, dot }) => { line.visible = dot.visible = false; }); },
    setBackground(id: DrumEnvironmentId) { if (state.background !== id) { state.background = id; dirty = true; } },
    isPointing(hand: StickHand) { return pointing.has(hand); },
    update(next: XRSession | null, frame: XRFrame | undefined, space: XRReferenceSpace | null, viewer: XRViewerPose | null, now: number) {
      bind(next); reference = space;
      const delta = Math.min(.05, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
      pointers.forEach(({ line, dot }) => { line.visible = dot.visible = false; }); pointing.clear();
      if (!mesh.visible || !frame || !space || !viewer || next?.visibilityState !== 'visible') { resetInput(); return; }
      if (!placed) {
        rig.updateWorldMatrix(true, false); world.fromArray(viewer.transform.matrix).premultiply(rig.matrixWorld); eye.setFromMatrixPosition(world);
        kit.getWorldPosition(anchor);
        mesh.position.set(anchor.x - 1.25, Math.max(anchor.y + 2.25, eye.y + .95), anchor.z - 1.05);
        mesh.lookAt(eye); mesh.updateWorldMatrix(true, false); placed = true;
      }
      let hover = '', pointerIndex = 0;
      for (const input of next.inputSources) {
        let target = cast(input, frame);
        const known = (input.gamepad?.mapping as string) === 'xr-standard'
          || input.profiles.some(profile => /^(meta-quest-touch|oculus-touch|generic-trigger)/.test(profile));
        const button = known && !input.hand ? input.gamepad?.buttons[0] : undefined;
        if (button) {
          const previous = down.get(input) ?? false, pressed = button.pressed || button.value >= (previous ? .4 : .75);
          if (pressed && !previous) begin(input, frame);
          else if (!pressed && previous) finish(input);
          down.set(input, pressed); target = cast(input, frame);
        }
        const gesture = gestures.get(input);
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
          const axis = input.gamepad?.axes[3] ?? input.gamepad?.axes[1] ?? 0;
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
      if (state.pressed && !held.size && now >= pressedUntil) { state.pressed = ''; dirty = true; }
      if (dirty && now - lastDraw >= 32) redraw(now);
    },
    dispose() {
      bind(null); mesh.removeFromParent(); geometry.dispose(); mesh.material.dispose(); texture.dispose();
      pointers.forEach(({ line, dot }) => { line.removeFromParent(); dot.removeFromParent(); });
      pointerGeometry.dispose(); pointerMaterial.dispose(); dotGeometry.dispose(); dotMaterial.dispose();
    },
  };
}
