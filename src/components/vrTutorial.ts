import * as THREE from 'three';
import type { NoteEvent } from '../types';
import type { DrumHitSurface } from './vrStickCollision';
import type { StickHand } from './virtualDrumsticks';
import { captureRhythmSurfaces, createVRNoteHighway, createVRNoteLanes } from './vrNoteHighway';
import type { RhythmJudgment } from './vrNoteHighway';
import { NOTE_TRAVEL_TIME } from './songPracticeTiming';
import type { createVRSongCountdown } from './vrSongDetail';
import { createVRTutorialGuides } from './vrTutorialGuides';
import { createWorldPanelTransform } from './vrWorldPanel';


const STEPS = ['welcome', 'intro', 'hihat', 'snare', 'other', 'timing', 'hat-grip', 'kick', 'ready', 'practice', 'complete'] as const;
export type TutorialStep = typeof STEPS[number];
export type TutorialAction = 'next' | 'skip';
export type TutorialHitAction = TutorialAction | 'handle';
export type TutorialView = { step: TutorialStep; closed: boolean; snarePractice: boolean; judgment?: RhythmJudgment };

export function tutorialContent(view: TutorialView) {
  const copy: Record<TutorialStep, { title: string; lines: string[]; hint?: string; next?: string }> = {
    welcome: { title: 'DRUM UP TUTORIAL', lines: ['드럼 연주 방법을 간단하게 알아볼까요?'], next: '튜토리얼 시작' },
    intro: { title: 'STEP 01  /  PLAY THE DRUMS', lines: ['먼저 드럼을 연주하는 방법을 알아볼까요?'], next: '다음' },
    hihat: { title: 'STEP 01  /  RIGHT HAND · HI-HAT', lines: ['오른손으로 하이햇을 연주하세요.'], next: '다음' },
    snare: { title: 'STEP 01  /  LEFT HAND · SNARE', lines: ['왼손으로 스네어를 연주하세요.'], next: '다음' },
    other: { title: 'STEP 01  /  BOTH HANDS', lines: ['다른 드럼과 심벌은 양손을 번갈아 사용하세요.'], next: '다음' },
    timing: { title: 'STEP 02  /  NOTE TIMING', lines: ['노트가 판정선에 도착하면 스틱을 내려치세요.'], next: '다음' },
    'hat-grip': { title: 'STEP 03  /  LEFT GRIP', lines: ['왼손 안쪽 버튼을 누르면 하이햇이 닫히고,', '놓으면 열립니다.'], hint: view.closed ? 'CLOSED HI-HAT' : 'OPEN HI-HAT', next: '다음' },
    kick: { title: 'STEP 04  /  RIGHT GRIP', lines: ['킥 페달을 밟거나 오른손 안쪽 버튼을', '눌러 연주하세요.'], hint: 'PEDAL', next: '다음' },
    ready: { title: 'STEP 05  /  PRACTICE', lines: ['이제 직접 연주해 볼까요?'], hint: '60 BPM  ·  HI-HAT × 4  /  SNARE × 4', next: '연습 시작' },
    practice: { title: 'STEP 05  /  PRACTICE', lines: [view.snarePractice ? '왼손으로 스네어를 연주하세요.' : '오른손으로 하이햇을 연주하세요.'], hint: view.judgment?.toUpperCase() },
    complete: { title: 'TUTORIAL COMPLETE', lines: ['이제 자유롭게 드럼을 연주해 보세요!'], next: '연주하기 — START PLAYING' },
  };
  return copy[view.step];
}

const PANEL_WIDTH = .865;
const PANEL_HEIGHT = .29;
const WIDTH = 1200;
const HEIGHT = 403;
const COUNT_IN = 4;
const DEMO_TRAVEL = 3.4;
const FADE = .18;
const OTHER_DRUMS = ['smallTom', 'middleTom', 'floorTom', 'crash', 'ride'];

type Button = { action: TutorialAction; label: string; x: number; width: number };
function tutorialButtons(view: TutorialView): Button[] {
  const next = tutorialContent(view).next;
  if (view.step === 'complete') return [{ action: 'next', label: next!, x: 300, width: 600 }];
  return next
    ? [{ action: 'next', label: next, x: 305, width: 280 }, { action: 'skip', label: '건너뛰기', x: 615, width: 280 }]
    : [{ action: 'skip', label: '건너뛰기', x: 460, width: 280 }];
}

class TutorialClock extends EventTarget {
  currentTime = 0;
  paused = true;
  readonly seeking = false;
  async play() { this.paused = false; }
  pause() { this.paused = true; }
}

function practiceNotes(demo: boolean): NoteEvent[] {
  return Array.from({ length: demo ? 1 : 8 }, (_, i) => {
    const time = demo ? DEMO_TRAVEL : COUNT_IN + NOTE_TRAVEL_TIME + i;
    const instrument = i < 4 ? 'hihat' : 'snare';
    return { time, hitTime: time, instrument, padId: i < 4 ? 'hihat-closed' : 'snare',
      measure: Math.floor(i / 4) + 1, measureBeat: i % 4 + 1, velocity: .8 };
  });
}

export function createVRTutorial(scene: THREE.Scene, rig: THREE.Group, surfaces: DrumHitSurface[],
  countdown: ReturnType<typeof createVRSongCountdown>, callbacks: {
    onView: (view: TutorialView | null, desktop: boolean) => void;
    onClose: (completed: boolean) => void;
    onDemoHit: () => void;
    onDemoKick: () => void;
    onHiHatPreview: (closed: boolean) => void;
  }) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT), new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  }));
  panel.name = 'vr-tutorial-panel';
  panel.renderOrder = 1002;
  panel.visible = false;
  scene.add(panel);
  const handle = new THREE.Mesh(new THREE.CapsuleGeometry(.004, .18, 4, 12),
    new THREE.MeshBasicMaterial({ color: 0xbdc6d3, transparent: true, depthWrite: false, toneMapped: false }));
  handle.name = 'vr-tutorial-drag-handle';
  handle.rotation.z = Math.PI / 2;
  handle.position.y = -PANEL_HEIGHT / 2 - .014;
  handle.renderOrder = 1003;
  const handleHit = new THREE.Mesh(new THREE.PlaneGeometry(.28, .045),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
  handleHit.position.copy(handle.position);
  panel.add(handle, handleHit);
  const viewRotation = new THREE.Quaternion(), inverseView = new THREE.Quaternion();
  const offset = new THREE.Vector3();
  const transform = createWorldPanelTransform(panel, rig, null, {
    translationOnly: true,
    constrainPosition(position, eye) {
      offset.copy(position).sub(eye).applyQuaternion(inverseView.copy(viewRotation).invert());
      const depth = THREE.MathUtils.clamp(-offset.z, 1.04, 2.6);
      offset.set(THREE.MathUtils.clamp(offset.x, -.48 * depth, .48 * depth),
        THREE.MathUtils.clamp(offset.y, -.31 * depth, .50 * depth), -depth);
      position.copy(offset.applyQuaternion(viewRotation).add(eye));
    },
  });
  const guides = createVRTutorialGuides(scene);
  let handleHovered = false;

  const rings = new Map(surfaces.map(surface => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(surface.radius * .975, surface.radius * 1.035, 64),
      new THREE.MeshBasicMaterial({ color: 0xe1e6ef, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    ring.name = `vr-tutorial-highlight-${surface.id}`;
    const local = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    local.setPosition(0, surface.height + .004, 0);
    ring.matrixAutoUpdate = false;
    ring.renderOrder = 6;
    ring.visible = false;
    scene.add(ring);
    return [surface.id, { ring, surface, local }] as const;
  }));
  const hat = surfaces.find(surface => surface.id === 'hihat');
  const scratch = new THREE.Vector3();

  let view: TutorialView | null = null;
  let desktop = false, placed = false, closed = false, passthrough = false;
  let phase = 0, elapsed = 0, laneFade = 0, kickFlash = 0, judgmentTime = 0, demoHit = false;
  let lastFrame: number | null = null;
  let transition: TutorialStep | 'close' | null = null;
  let lanes: ReturnType<typeof createVRNoteLanes> | null = null;
  let highway: ReturnType<typeof createVRNoteHighway> | null = null;
  let clock: TutorialClock | null = null;
  let lastNote = 0, chartFinished = false;
  let previewClosed: boolean | null = null, manualHatUntil = 0, manualKickUntil = 0, demoKickCycle = -1;

  function previewHat(value: boolean | null) {
    if (previewClosed === value) return;
    previewClosed = value;
    const shown = value ?? closed;
    callbacks.onHiHatPreview(shown);
    if (view?.step === 'hat-grip' && view.closed !== shown) publish({ ...view, closed: shown });
  }

  function draw() {
    if (!view) return;
    const { title, lines, hint } = tutorialContent(view);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.beginPath();
    ctx.roundRect(4, 4, WIDTH - 8, HEIGHT - 8, 14);
    ctx.fillStyle = '#21242be8';
    ctx.fill();
    ctx.strokeStyle = '#c1c6d180';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = '600 58px Arial, sans-serif';
    ctx.fillText(title, WIDTH / 2, 83, 1100);
    ctx.font = '49px "Malgun Gothic", Arial, sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, (lines.length === 1 ? 177 : 155) + i * 59, 1110));
    if (hint) {
      ctx.fillStyle = '#d3d8e0';
      ctx.font = '600 34px Arial, sans-serif';
      ctx.fillText(hint, WIDTH / 2, 269);
      if (view.step === 'kick') {
        ctx.strokeStyle = '#d3d8e0';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(492, 273); ctx.lineTo(526, 273); ctx.lineTo(526, 247);
        ctx.moveTo(492, 273); ctx.lineTo(519, 251); ctx.lineTo(526, 251);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(526, 242, 5, 0, Math.PI * 2); ctx.stroke();
      }
    }
    tutorialButtons(view).forEach(button => {
      const silver = ctx.createLinearGradient(0, 311, 0, 374);
      silver.addColorStop(0, '#f2f4f7');
      silver.addColorStop(1, '#aab2bf');
      ctx.beginPath();
      ctx.roundRect(button.x, 310, button.width, 65, 8);
      ctx.fillStyle = button.action === 'next' ? silver : '#373c46';
      ctx.fill();
      ctx.strokeStyle = '#dfe4ec70';
      ctx.stroke();
      ctx.fillStyle = button.action === 'next' ? '#17191e' : '#fff';
      ctx.font = '600 41px "Malgun Gothic", Arial, sans-serif';
      const label = button.action === 'next' ? `A 확인 · ${button.label}` : button.label;
      ctx.fillText(label, button.x + button.width / 2, 356, button.width - 20);
    });
    texture.needsUpdate = true;
  }

  function publish(next: TutorialView) {
    view = next;
    panel.userData.step = view.step;
    draw();
    callbacks.onView(view, desktop);
  }

  function clearChart(keepLanes = false) {
    highway?.dispose();
    highway = null;
    clock = null;
    countdown.hide();
    if (!keepLanes) {
      lanes?.dispose();
      lanes = null;
    }
  }

  function startChart(demo: boolean, eye: THREE.Vector3) {
    surfaces.forEach(surface => surface.mesh.updateWorldMatrix(true, false));
    const rhythmSurfaces = captureRhythmSurfaces(surfaces);
    lanes = createVRNoteLanes(rhythmSurfaces, eye);
    lanes.lines.name = 'vr-tutorial-lanes';
    lanes.lines.visible = demo;
    lanes.setPassthrough(passthrough);
    scene.add(lanes.lines);
    const notes = practiceNotes(demo);
    lastNote = notes.at(-1)!.time;
    clock = new TutorialClock();
    highway = createVRNoteHighway(scene, rhythmSurfaces, lanes.paths, (state, judgment) => {
      if (state === 'finished') chartFinished = true;
      if (!judgment || view?.step !== 'practice') return;
      judgmentTime = .65;
      publish({ ...view, judgment });
    }, { notes, audio: clock, offset: 0, windows: { perfect: 50, great: 120 }, fadeDistantNotes: true,
      travelSeconds: demo ? DEMO_TRAVEL : undefined });
    highway.restart(0);
  }

  function enter(step: TutorialStep) {
    if (step !== 'hat-grip') previewHat(null);
    const fadeLanes = step === 'complete' && !!lanes;
    clearChart(fadeLanes);
    laneFade = fadeLanes ? .45 : 0;
    elapsed = 0;
    lastFrame = null;
    judgmentTime = 0;
    demoHit = chartFinished = false;
    manualHatUntil = manualKickUntil = 0;
    demoKickCycle = -1;
    transition = null;
    panel.scale.setScalar(step === 'practice' ? .84 : 1);
    publish({ step, closed, snarePractice: false });
  }

  function close(completed: boolean) {
    previewHat(null);
    transform.finish();
    clearChart();
    view = null;
    transition = null;
    panel.visible = false;
    guides.hide();
    rings.forEach(({ ring }) => { ring.visible = false; });
    callbacks.onView(null, desktop);
    callbacks.onClose(completed);
  }

  function activate(action: TutorialAction) {
    if (!view || transition || transform.input) return;
    if (action === 'skip' || view.step === 'complete') transition = 'close';
    else if (view.step !== 'practice') transition = STEPS[STEPS.indexOf(view.step) + 1];
  }

  return {
    get active() { return !!view; },
    get step() { return view?.step; },
    get dragging() { return !!transform.input; },
    beginGrab(source: XRInputSource, frame: XRFrame, reference: XRReferenceSpace | null) {
      return !!view && !transition && transform.begin(source, frame, reference);
    },
    endGrab(source: XRInputSource) { transform.finish(source); },
    open(onDesktop: boolean, ar: boolean) {
      desktop = onDesktop;
      passthrough = ar;
      placed = false;
      handleHovered = false;
      phase = 0;
      guides.load();
      enter('welcome');
    },
    overlay: {
      hit(ray: THREE.Raycaster) {
        if (!view || !panel.visible || phase < .65 || transition || transform.input) return null;
        const handleIntersection = ray.intersectObject(handleHit, false)[0];
        if (handleIntersection) return { hit: handleIntersection, action: 'handle' as const };
        const hit = ray.intersectObject(panel, false)[0];
        if (!hit?.uv) return null;
        const x = hit.uv.x * WIDTH, y = (1 - hit.uv.y) * HEIGHT;
        const button = y >= 310 && y <= 375 && tutorialButtons(view).find(item => x >= item.x && x <= item.x + item.width);
        return button ? { hit, action: button.action } : null;
      },
      activate,
      hoverHandle(hover: boolean) { handleHovered = hover; },
    },
    activate,
    close,
    setClosed(value: boolean) {
      closed = value;
      previewClosed = null;
      if (view?.step === 'hat-grip') manualHatUntil = elapsed + 2.5;
      if (view?.step === 'hat-grip' && view.closed !== value) publish({ ...view, closed });
    },
    kick() { kickFlash = .35; manualKickUntil = elapsed + 2.5; },
    suspend() { lastFrame = null; transform.finish(); },
    strike(id: string, now: number) { return view?.step === 'practice' ? highway?.strike(id, now) : undefined; },
    update(now: number, delta: number, eye: THREE.Vector3, rotation: THREE.Quaternion, visible: boolean,
      frame?: XRFrame, reference: XRReferenceSpace | null = null) {
      if (!view || !visible) { lastFrame = null; transform.finish(); return; }
      viewRotation.copy(rotation);
      phase = THREE.MathUtils.clamp(phase + (transition ? -1 : 1) * delta / FADE, 0, 1);
      if (transition && phase === 0) {
        if (transition === 'close') { close(true); return; }
        enter(transition);
      }
      panel.visible = !desktop;
      if (!desktop && !placed) {
        scratch.set(0, 0, -1).applyQuaternion(rotation);
        const pitchOffset = THREE.MathUtils.clamp(scratch.y * .20, -.04, .025);
        scratch.y = 0;
        if (scratch.lengthSq() < .01) scratch.set(0, 0, -1);
        panel.position.copy(eye).addScaledVector(scratch.normalize(), 1.62);
        panel.position.y += .38 + pitchOffset;
        panel.lookAt(eye);
        panel.updateMatrixWorld();
        placed = true;
      }
      if (transform.input) {
        if (!frame || !Array.from(frame.session.inputSources).includes(transform.input)
          || !transform.update(transform.input, frame, reference, eye)) transform.finish();
        else {
          panel.lookAt(eye);
          panel.updateMatrixWorld(true);
        }
      }
      if (lastFrame !== null) elapsed += Math.max(0, now - lastFrame) / 1000;
      lastFrame = now;
      kickFlash = Math.max(0, kickFlash - delta);
      judgmentTime -= delta;
      if (view.judgment && judgmentTime <= 0) publish({ ...view, judgment: undefined });
      const demo = view.step === 'timing';
      const practice = view.step === 'practice';
      if ((demo || practice) && !clock && !chartFinished) startChart(demo, eye);
      if (clock && highway && lanes) {
        clock.currentTime = elapsed;
        if (practice) {
          countdown.update(elapsed, eye, rotation, COUNT_IN, 'GO!');
          lanes.lines.visible = elapsed >= COUNT_IN;
          if (elapsed > COUNT_IN + NOTE_TRAVEL_TIME + 3.2 && !view.snarePractice) publish({ ...view, snarePractice: true });
        }
        if (demo && elapsed >= lastNote && !demoHit) {
          demoHit = true;
          clock.currentTime = lastNote;
          highway.strike('hihat', now);
          callbacks.onDemoHit();
          clock.currentTime = elapsed;
        }
        lanes.update(now);
        highway.update(now, eye);
        if (practice && elapsed > lastNote + .38 && !chartFinished) {
          clock.dispatchEvent(new Event('ended'));
          enter('complete');
          phase = 0;
        }
      }
      if (laneFade > 0 && lanes) {
        laneFade = Math.max(0, laneFade - delta);
        lanes.setOpacity(laneFade / .45);
        if (!laneFade) { lanes.dispose(); lanes = null; }
      }

      let highlight: string | undefined;
      if (view.step === 'hihat' || view.step === 'hat-grip') highlight = 'hihat';
      if (view.step === 'snare' || view.step === 'kick') highlight = view.step;
      const strokeIndex = Math.floor(elapsed / .95);
      if (view.step === 'other') highlight = OTHER_DRUMS[strokeIndex % OTHER_DRUMS.length];
      if (demo && demoHit && elapsed < lastNote + .65) highlight = 'hihat';
      rings.forEach(({ ring, surface, local }, id) => {
        ring.visible = id === highlight;
        if (!ring.visible) return;
        surface.mesh.updateWorldMatrix(true, false);
        ring.matrix.multiplyMatrices(surface.mesh.matrixWorld, local);
        ring.matrixWorldNeedsUpdate = true;
        ring.material.opacity = (.48 + .17 * Math.sin(elapsed * 4) + (id === 'kick' ? kickFlash : 0)) * phase;
      });
      guides.hide();
      if (view.step === 'hihat' || view.step === 'snare' || view.step === 'other') {
        const surface = highlight && rings.get(highlight)?.surface;
        if (surface) {
          const hand: StickHand = view.step === 'other' ? (strokeIndex % 2 ? 'left' : 'right')
            : view.step === 'snare' ? 'left' : 'right';
          const lift = Math.abs((elapsed % .95) - .59) / .59;
          guides.stroke(hand, surface, lift, phase);
          if (view.step === 'other') guides.stroke(hand === 'left' ? 'right' : 'left', surface, .55, phase * .62, true);
        }
      } else if (hat && demo && elapsed > lastNote - .65 && elapsed < lastNote + .40) {
        const lift = elapsed < lastNote ? (lastNote - elapsed) / .65 : (elapsed - lastNote) / .40;
        guides.stroke('right', hat, lift, phase * (1 - THREE.MathUtils.smoothstep(elapsed, lastNote + .15, lastNote + .4)));
      } else if (view.step === 'hat-grip' || view.step === 'kick') {
        const cycle = Math.floor(elapsed / 2.65);
        const t = elapsed % 2.65;
        const press = THREE.MathUtils.smoothstep(t, .58, .80) * (1 - THREE.MathUtils.smoothstep(t, 1.38, 1.58));
        if (view.step === 'hat-grip') {
          const manual = closed || elapsed < manualHatUntil || !!transform.input;
          previewHat(manual ? null : press > .7);
          guides.grip('left', eye, rotation, manual ? Number(closed) : press, phase);
        } else {
          if (press > .7 && cycle !== demoKickCycle && elapsed >= manualKickUntil && !transform.input) {
            demoKickCycle = cycle;
            callbacks.onDemoKick();
            kickFlash = .35;
          }
          guides.grip('right', eye, rotation, elapsed < manualKickUntil ? Math.min(1, kickFlash * 4) : press, phase);
        }
      }
      panel.material.opacity = phase;
      handle.material.opacity = phase * (transform.input || handleHovered ? 1 : .55);
    },
    dispose() {
      clearChart();
      guides.dispose();
      for (const mesh of [panel, handle, handleHit, ...Array.from(rings.values(), entry => entry.ring)]) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      texture.dispose();
    },
  };
}
