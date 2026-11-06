import * as THREE from 'three';
import { RHYTHM_BPM } from './vrNoteHighway';
import type { RhythmAction, RhythmJudgment, RhythmState } from './vrNoteHighway';

// Quest Touch Plus exposes A after the four reserved XR button slots.
// Browsers can report a generic profile while preserving this layout.
const A_BUTTON_INDEX = 4;

// View and stick controls share a peripheral headset position. Rhythm stays by the kit.
export function createVRARModeWindow(scene: THREE.Scene, xr: THREE.WebXRManager, rig: THREE.Group,
  onSelectMode: (mode: 'vr' | 'ar') => void, onRhythmAction: (action: RhythmAction) => void,
  onToggleRealSticks: () => void) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  let target: 'vr' | 'ar' = 'ar';
  let hovered = false;
  let pointerActive = false;
  let aWasPressed = false;
  let pointerInput: XRInputSource | undefined;
  const draw = () => {
    context.fillStyle = '#111820';
    context.fillRect(0, 0, 512, 256);
    context.strokeStyle = '#64717f';
    context.lineWidth = 4;
    context.strokeRect(3, 3, 506, 250);
    context.fillStyle = '#b8c1ca';
    context.font = '600 30px Arial';
    context.fillText('DRUM UP  /  VIEW MODE', 28, 58);
    context.fillStyle = hovered ? '#ffad75' : '#ff6d2d';
    context.fillRect(24, 93, 464, 129);
    context.fillStyle = '#151515';
    context.font = 'bold 52px Arial';
    context.textAlign = 'center';
    context.fillText(`${target.toUpperCase()} MODE`, 256, 175);
    context.textAlign = 'start';
    context.fillStyle = '#d9e1e9';
    context.font = '20px Arial';
    context.fillText('A: HAND CURSOR     TRIGGER: SELECT', 25, 247);
  };
  draw();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.23),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  panel.name = 'ar-mode-window';
  panel.renderOrder = 1001;
  panel.visible = false;
  scene.add(panel);

  const stickCanvas = document.createElement('canvas');
  stickCanvas.width = 512;
  stickCanvas.height = 160;
  const stickContext = stickCanvas.getContext('2d')!;
  const stickTexture = new THREE.CanvasTexture(stickCanvas);
  stickTexture.colorSpace = THREE.SRGBColorSpace;
  const stickPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.144),
    new THREE.MeshBasicMaterial({ map: stickTexture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  stickPanel.name = 'vr-stick-mode-window';
  stickPanel.renderOrder = panel.renderOrder;
  stickPanel.visible = false;
  scene.add(stickPanel);
  let stickUnavailableReason: string | null = null;
  let stickHovered = false;
  const drawStickMode = () => {
    stickContext.fillStyle = '#101114';
    stickContext.fillRect(0, 0, 512, 160);
    stickContext.strokeStyle = '#87909b';
    stickContext.lineWidth = 3;
    stickContext.strokeRect(2, 2, 508, 156);
    stickContext.fillStyle = stickHovered ? '#ffffff' : '#c5cbd2';
    stickContext.fillRect(24, 14, 464, 65);
    stickContext.fillStyle = '#151515';
    stickContext.font = 'bold 34px Arial';
    stickContext.textAlign = 'center';
    stickContext.fillText(stickUnavailableReason ? 'CONTROLLER MODE' : 'REAL STICK MODE', 256, 58);
    stickContext.fillStyle = '#f1f5fa';
    stickContext.font = '600 23px Arial';
    stickContext.fillText(stickUnavailableReason ? 'TRACKING UNAVAILABLE' : 'Aim and press trigger', 256, 111);
    if (stickUnavailableReason) {
      stickContext.font = '20px Arial';
      stickContext.fillText(stickUnavailableReason, 256, 140);
    }
    stickTexture.needsUpdate = true;
  };
  drawStickMode();

  const rhythmCanvas = document.createElement('canvas');
  rhythmCanvas.width = 512;
  rhythmCanvas.height = 224;
  const rhythmContext = rhythmCanvas.getContext('2d')!;
  const rhythmTexture = new THREE.CanvasTexture(rhythmCanvas);
  rhythmTexture.colorSpace = THREE.SRGBColorSpace;
  const rhythmPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.228),
    new THREE.MeshBasicMaterial({ map: rhythmTexture, transparent: true, depthWrite: false, toneMapped: false }));
  rhythmPanel.name = 'vr-rhythm-controls';
  rhythmPanel.position.set(-0.96, 1.54, -0.67);
  rhythmPanel.rotation.y = 0.22;
  rhythmPanel.renderOrder = 1000;
  rhythmPanel.visible = false;
  scene.add(rhythmPanel);
  let rhythmState: RhythmState = 'idle';
  let rhythmJudgment: RhythmJudgment | undefined;
  const drawRhythm = () => {
    rhythmContext.fillStyle = '#111820';
    rhythmContext.fillRect(0, 0, 512, 224);
    rhythmContext.strokeStyle = '#64717f';
    rhythmContext.lineWidth = 4;
    rhythmContext.strokeRect(3, 3, 506, 218);
    rhythmContext.fillStyle = '#d9e1e9';
    rhythmContext.font = '600 27px Arial';
    rhythmContext.fillText(`RHYTHM  /  ${RHYTHM_BPM} BPM`, 24, 45);
    rhythmContext.fillStyle = '#87e9dd';
    rhythmContext.fillRect(24, 70, 220, 72);
    rhythmContext.fillStyle = '#243441';
    rhythmContext.fillRect(268, 70, 220, 72);
    rhythmContext.font = 'bold 31px Arial';
    rhythmContext.textAlign = 'center';
    rhythmContext.fillStyle = '#111820';
    rhythmContext.fillText(rhythmState === 'playing' ? 'Pause' : rhythmState === 'paused' ? 'Resume' : 'Start', 134, 117);
    rhythmContext.fillStyle = '#f1f5fa';
    rhythmContext.fillText('Restart', 378, 117);
    rhythmContext.font = '600 27px Arial';
    rhythmContext.fillStyle = rhythmJudgment === 'Miss' ? '#ffad89' : '#9cf7e7';
    rhythmContext.fillText(rhythmJudgment ?? (rhythmState === 'finished' ? 'Pattern complete' : 'A: cursor   ·   Trigger: select'), 256, 190);
    rhythmContext.textAlign = 'start';
    rhythmTexture.needsUpdate = true;
  };
  drawRhythm();

  const raycaster = new THREE.Raycaster();
  const rotation = new THREE.Matrix4();
  const viewerWorld = new THREE.Matrix4();
  const sources = [0, 1, 2, 3].map(index => xr.getController(index));
  const bindings = new Map<XRInputSource, THREE.Group>();
  const connectedHandlers = sources.map(source => (event: { data: XRInputSource }) => {
    bindings.set(event.data, source);
  });
  const disconnectedHandlers = sources.map(() => (event: { data: XRInputSource }) => {
    bindings.delete(event.data);
  });
  const handCanvas = document.createElement('canvas');
  handCanvas.width = handCanvas.height = 96;
  const hand = handCanvas.getContext('2d')!;
  hand.lineJoin = 'round';
  hand.lineCap = 'round';
  hand.fillStyle = '#ffffff';
  hand.strokeStyle = '#18222d';
  hand.lineWidth = 7;
  hand.beginPath();
  hand.moveTo(34, 82); hand.lineTo(25, 59); hand.lineTo(18, 47);
  hand.quadraticCurveTo(16, 39, 24, 37);
  hand.quadraticCurveTo(30, 36, 35, 43);
  hand.lineTo(35, 17); hand.quadraticCurveTo(35, 8, 43, 8);
  hand.quadraticCurveTo(51, 8, 51, 17);
  hand.lineTo(51, 48); hand.quadraticCurveTo(58, 42, 65, 47);
  hand.quadraticCurveTo(71, 43, 77, 50);
  hand.quadraticCurveTo(83, 48, 86, 55);
  hand.lineTo(77, 82); hand.closePath();
  hand.fill(); hand.stroke();
  const handTexture = new THREE.CanvasTexture(handCanvas);
  const handCursor = new THREE.Sprite(new THREE.SpriteMaterial({ map: handTexture, transparent: true, depthTest: false }));
  handCursor.name = 'ar-hand-cursor';
  handCursor.scale.set(0.075, 0.075, 1);
  handCursor.renderOrder = 1003;
  handCursor.visible = false;
  const ray = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0xffaa72, transparent: true, opacity: 0.9, depthTest: false }),
  );
  ray.name = 'ar-hand-ray';
  ray.renderOrder = 1002;
  ray.visible = false;
  const pointAtPanels = (source: THREE.Group) => {
    source.updateWorldMatrix(true, false);
    panel.updateWorldMatrix(true, false);
    stickPanel.updateWorldMatrix(true, false);
    rhythmPanel.updateWorldMatrix(true, false);
    rotation.identity().extractRotation(source.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(source.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotation);
    return (panel.visible ? raycaster.intersectObject(panel, false)[0] : undefined)
      ?? (stickPanel.visible ? raycaster.intersectObject(stickPanel, false)[0] : undefined)
      ?? (rhythmPanel.visible ? raycaster.intersectObject(rhythmPanel, false)[0] : undefined);
  };
  const isStickButton = (hit?: THREE.Intersection) => hit?.object === stickPanel && hit.uv
    && hit.uv.x >= 24 / 512 && hit.uv.x <= 488 / 512 && hit.uv.y >= 81 / 160 && hit.uv.y <= 146 / 160;
  const selectHandlers = sources.map(source => (event: { data: XRInputSource }) => {
    if (!source.visible) return;
    const hit = pointAtPanels(source);
    if (isStickButton(hit) && event.data.targetRayMode === 'tracked-pointer' && !event.data.hand && event.data.gripSpace) {
      onToggleRealSticks();
      pointerActive = false;
      handCursor.visible = ray.visible = false;
      return;
    }
    if (hit?.object === panel && hit.uv && hit.uv.x >= 24 / 512 && hit.uv.x <= 488 / 512
      && hit.uv.y >= 34 / 256 && hit.uv.y <= 163 / 256) onSelectMode(target);
    if (hit?.object !== rhythmPanel || !pointerActive || ray.parent !== source || !hit.uv) return;
    const x = hit.uv.x * 512;
    const y = (1 - hit.uv.y) * 224;
    if (y < 70 || y > 142) return;
    if (x >= 24 && x <= 244) onRhythmAction('toggle');
    else if (x >= 268 && x <= 488) onRhythmAction('restart');
    else return;
    if (rhythmState === 'playing') {
      pointerActive = false;
      handCursor.visible = ray.visible = false;
    }
  });
  sources.forEach((source, index) => {
    rig.add(source);
    source.addEventListener('connected', connectedHandlers[index]);
    source.addEventListener('disconnected', disconnectedHandlers[index]);
    source.addEventListener('select', selectHandlers[index]);
  });

  const updateHover = (object?: THREE.Object3D) => {
    const overMode = object === panel;
    if (hovered !== overMode) { hovered = overMode; draw(); texture.needsUpdate = true; }
    const overSticks = object === stickPanel;
    if (stickHovered !== overSticks) { stickHovered = overSticks; drawStickMode(); }
  };
  const resetPointer = () => {
    pointerActive = false;
    aWasPressed = false;
    pointerInput = undefined;
    handCursor.visible = ray.visible = false;
    updateHover();
  };

  return {
    setTarget(mode: 'vr' | 'ar') { target = mode; draw(); texture.needsUpdate = true; },
    show(canSwitch: boolean) { panel.visible = canSwitch; rhythmPanel.visible = stickPanel.visible = true; resetPointer(); },
    hide() { panel.visible = rhythmPanel.visible = stickPanel.visible = false; resetPointer(); },
    setStickMode(unavailableReason: string | null) { stickUnavailableReason = unavailableReason; drawStickMode(); },
    setRhythmStatus(state: RhythmState, judgment?: RhythmJudgment) {
      if (state === rhythmState && judgment === rhythmJudgment) return;
      rhythmState = state;
      rhythmJudgment = judgment;
      drawRhythm();
    },
    update(session: XRSession | null, viewer: XRViewerPose | null) {
      if (!stickPanel.visible || session?.visibilityState !== 'visible') { resetPointer(); return false; }
      if (viewer) {
        rig.updateWorldMatrix(true, false);
        viewerWorld.fromArray(viewer.transform.matrix).premultiply(rig.matrixWorld);
        panel.position.set(0.47, 0.37, -1.35).applyMatrix4(viewerWorld);
        stickPanel.position.set(0.47, 0.16, -1.35).applyMatrix4(viewerWorld);
        panel.quaternion.setFromRotationMatrix(viewerWorld);
        stickPanel.quaternion.copy(panel.quaternion);
      }
      const input = [...(session?.inputSources ?? [])].find(source => source.handedness === 'right'
        && !source.hand && source.gripSpace && source.targetRayMode === 'tracked-pointer'
        && bindings.has(source) && source.gamepad?.buttons[A_BUTTON_INDEX]);
      if (pointerInput !== input) {
        resetPointer();
        pointerInput = input;
      }
      const button = input?.gamepad?.buttons[A_BUTTON_INDEX];
      const aPressed = !!button && (button.pressed || button.value >= (aWasPressed ? 0.55 : 0.75));
      if (aPressed && !aWasPressed) {
        pointerActive = !pointerActive;
      }
      aWasPressed = aPressed;
      let source = pointerActive && input ? bindings.get(input) : undefined;
      let hit = source?.visible ? pointAtPanels(source) : undefined;
      if (!source?.visible) {
        // Show the controller ray over the stick button without requiring A.
        for (const [candidate, targetRay] of bindings) {
          if (!targetRay.visible || candidate.targetRayMode !== 'tracked-pointer' || !candidate.gripSpace || candidate.hand) continue;
          const candidateHit = pointAtPanels(targetRay);
          if (isStickButton(candidateHit)) { source = targetRay; hit = candidateHit; break; }
        }
      }
      if (!source?.visible) {
        handCursor.visible = ray.visible = false;
        updateHover();
        return pointerActive;
      }
      if (ray.parent !== source) { source.add(ray); source.add(handCursor); }
      const distance = hit?.distance ?? 1.2;
      ray.scale.z = distance;
      handCursor.position.set(0, 0, -distance);
      ray.visible = handCursor.visible = true;
      handCursor.material.color.set(hit ? 0xff8f4d : 0xffffff);
      updateHover(hit?.object);
      return pointerActive;
    },
    dispose() {
      sources.forEach((source, index) => {
        source.removeEventListener('connected', connectedHandlers[index]);
        source.removeEventListener('disconnected', disconnectedHandlers[index]);
        source.removeEventListener('select', selectHandlers[index]);
        source.removeFromParent();
      });
      handCursor.removeFromParent();
      ray.removeFromParent();
      handCursor.material.dispose();
      handTexture.dispose();
      ray.geometry.dispose();
      (ray.material as THREE.Material).dispose();
      panel.removeFromParent();
      panel.geometry.dispose();
      (panel.material as THREE.Material).dispose();
      texture.dispose();
      stickPanel.removeFromParent();
      stickPanel.geometry.dispose();
      stickPanel.material.dispose();
      stickTexture.dispose();
      rhythmPanel.removeFromParent();
      rhythmPanel.geometry.dispose();
      rhythmPanel.material.dispose();
      rhythmTexture.dispose();
    },
  };
}
