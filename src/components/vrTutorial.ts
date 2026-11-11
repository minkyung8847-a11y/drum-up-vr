import * as THREE from 'three';
import type { NoteEvent } from '../types';
import type { DrumHitSurface } from './vrStickCollision';
import type { StickHand } from './virtualDrumsticks';
import { captureRhythmSurfaces, createVRNoteHighway, createVRNoteLanes } from './vrNoteHighway';
import type { RhythmJudgment } from './vrNoteHighway';
import { NOTE_TRAVEL_TIME } from './songPracticeTiming';
import type { createVRSongCountdown } from './vrSongDetail';

export const VR_TUTORIAL_KEY = 'drumup.vr.tutorial-seen.v1';
export function hasSeenVRTutorial() {
  try { return localStorage.getItem(VR_TUTORIAL_KEY) === '1'; }
  catch { return false; }
}

const STEPS = ['welcome', 'intro', 'hihat', 'snare', 'other', 'timing', 'hat-grip', 'kick', 'ready', 'practice', 'complete'] as const;
export type TutorialStep = typeof STEPS[number];
export type TutorialAction = 'next' | 'skip';
export type TutorialView = { step: TutorialStep; closed: boolean; snarePractice: boolean; judgment?: RhythmJudgment };

export function tutorialContent(view: TutorialView) {
  const copy: Record<TutorialStep, { title: string; lines: string[]; hint?: string; next?: string }> = {
    welcome: { title: 'DRUM UP TUTORIAL', lines: ['드럼 연주 방법을 간단하게 알아볼까요?'], next: '튜토리얼 시작' },
    intro: { title: 'STEP 01  /  PLAY THE DRUMS', lines: ['먼저 드럼을 연주하는 방법을 알아볼까요?'], next: '다음' },
    hihat: { title: 'STEP 01  /  RIGHT HAND · HI-HAT', lines: ['오른손으로 하이햇을 연주하세요.'], next: '다음' },
    snare: { title: 'STEP 01  /  LEFT HAND · SNARE', lines: ['왼손으로 스네어를 연주하세요.'], next: '다음' },
    other: { title: 'STEP 01  /  BOTH HANDS', lines: ['나머지 드럼과 심벌은', '양손을 번갈아 사용해 연주하세요.'], next: '다음' },
    timing: { title: 'STEP 02  /  NOTE TIMING', lines: ['색깔별 노트가 판정선에 도착하는 순간', '스틱을 내려치세요.'], next: '다음' },
    'hat-grip': { title: 'STEP 03  /  LEFT GRIP', lines: ['왼손 컨트롤러의 안쪽 버튼을 누르면 하이햇이 닫힙니다.', '버튼을 놓으면 하이햇이 열립니다.'], hint: view.closed ? 'CLOSED HI-HAT' : 'OPEN HI-HAT', next: '다음' },
    kick: { title: 'STEP 04  /  RIGHT GRIP', lines: ['킥드럼은 페달을 밟거나 오른손 컨트롤러의', '안쪽 버튼을 눌러 연주할 수 있습니다.'], next: '다음' },
    ready: { title: 'STEP 05  /  PRACTICE', lines: ['이제 직접 연주해 볼까요?'], hint: '60 BPM  ·  HI-HAT × 4  /  SNARE × 4', next: '연습 시작' },
    practice: { title: 'STEP 05  /  PRACTICE', lines: [view.snarePractice ? '왼손으로 스네어를 연주하세요.' : '오른손으로 하이햇을 연주하세요.'], hint: view.judgment?.toUpperCase() },
    complete: { title: 'TUTORIAL COMPLETE', lines: ['이제 자유롭게 드럼을 연주해 보세요!'], next: '연주하기 — START PLAYING' },
  };
  return copy[view.step];
}

const PANEL_WIDTH = 1.25;
const PANEL_HEIGHT = .42;
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

export function createVRTutorial(scene: THREE.Scene, surfaces: DrumHitSurface[],
  countdown: ReturnType<typeof createVRSongCountdown>, callbacks: {
    onView: (view: TutorialView | null, desktop: boolean) => void;
    onClose: (completed: boolean) => void;
    onDemoHit: () => void;
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
  const grip = new THREE.Mesh(new THREE.RingGeometry(.019, .024, 32),
    new THREE.MeshBasicMaterial({ color: 0xe7edf6, transparent: true, opacity: .8, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  grip.name = 'vr-tutorial-grip';
  grip.visible = false;
  scene.add(grip);

  const demoStick = new THREE.Mesh(new THREE.CylinderGeometry(.004, .008, .30, 12),
    new THREE.MeshBasicMaterial({ color: 0xd7dce5, transparent: true, opacity: .7, depthWrite: false, toneMapped: false }));
  demoStick.name = 'vr-tutorial-demo-stick';
  demoStick.visible = false;
  scene.add(demoStick);
  const hat = surfaces.find(surface => surface.id === 'hihat');
  const scratch = new THREE.Vector3(), upright = new THREE.Vector3(0, 1, 0), stickDirection = new THREE.Vector3();

  let view: TutorialView | null = null;
  let desktop = false, placed = false, closed = false, passthrough = false;
  let phase = 0, elapsed = 0, laneFade = 0, kickFlash = 0, judgmentTime = 0, demoHit = false;
  let lastFrame: number | null = null;
  let transition: TutorialStep | 'close' | null = null;
  let lanes: ReturnType<typeof createVRNoteLanes> | null = null;
  let highway: ReturnType<typeof createVRNoteHighway> | null = null;
  let clock: TutorialClock | null = null;
  let lastNote = 0, chartFinished = false;

  function draw() {
    if (!view) return;
    const { title, lines, hint } = tutorialContent(view);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.beginPath();
    ctx.roundRect(4, 4, WIDTH - 8, HEIGHT - 8, 14);
    ctx.fillStyle = '#17191eea';
    ctx.fill();
    ctx.strokeStyle = '#c1c6d180';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = '600 43px Arial, sans-serif';
    ctx.fillText(title, WIDTH / 2, 75);
    ctx.font = '36px "Malgun Gothic", Arial, sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, (lines.length === 1 ? 173 : 153) + i * 53, 1110));
    if (hint) {
      ctx.fillStyle = '#d3d8e0';
      ctx.font = '600 27px Arial, sans-serif';
      ctx.fillText(hint, WIDTH / 2, 269);
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
      ctx.font = '600 31px "Malgun Gothic", Arial, sans-serif';
      ctx.fillText(button.label, button.x + button.width / 2, 353, button.width - 20);
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
    const fadeLanes = step === 'complete' && !!lanes;
    clearChart(fadeLanes);
    laneFade = fadeLanes ? .45 : 0;
    elapsed = 0;
    lastFrame = null;
    judgmentTime = 0;
    demoHit = chartFinished = false;
    transition = null;
    publish({ step, closed, snarePractice: false });
  }

  function close(completed: boolean) {
    clearChart();
    view = null;
    transition = null;
    panel.visible = grip.visible = demoStick.visible = false;
    rings.forEach(({ ring }) => { ring.visible = false; });
    if (completed) {
      try { localStorage.setItem(VR_TUTORIAL_KEY, '1'); } catch { /* Optional persistence. */ }
    }
    callbacks.onView(null, desktop);
    callbacks.onClose(completed);
  }

  function activate(action: TutorialAction) {
    if (!view || transition) return;
    if (action === 'skip' || view.step === 'complete') transition = 'close';
    else if (view.step !== 'practice') transition = STEPS[STEPS.indexOf(view.step) + 1];
  }

  return {
    get active() { return !!view; },
    get step() { return view?.step; },
    open(onDesktop: boolean, ar: boolean) {
      desktop = onDesktop;
      passthrough = ar;
      placed = false;
      phase = 0;
      enter('welcome');
    },
    overlay: {
      hit(ray: THREE.Raycaster) {
        if (!view || !panel.visible || phase < .65 || transition) return null;
        const hit = ray.intersectObject(panel, false)[0];
        if (!hit?.uv) return null;
        const x = hit.uv.x * WIDTH, y = (1 - hit.uv.y) * HEIGHT;
        const button = y >= 310 && y <= 375 && tutorialButtons(view).find(item => x >= item.x && x <= item.x + item.width);
        return button ? { hit, action: button.action } : null;
      },
      activate,
    },
    activate,
    close,
    setClosed(value: boolean) {
      closed = value;
      if (view?.step === 'hat-grip' && view.closed !== value) publish({ ...view, closed });
    },
    kick() { kickFlash = .35; },
    suspend() { lastFrame = null; },
    strike(id: string, now: number) { return view?.step === 'practice' ? highway?.strike(id, now) : undefined; },
    update(now: number, delta: number, eye: THREE.Vector3, rotation: THREE.Quaternion, visible: boolean,
      gripPosition: (hand: StickHand) => THREE.Vector3 | undefined) {
      if (!view || !visible) { lastFrame = null; return; }
      phase = THREE.MathUtils.clamp(phase + (transition ? -1 : 1) * delta / FADE, 0, 1);
      if (transition && phase === 0) {
        if (transition === 'close') { close(true); return; }
        enter(transition);
      }
      panel.visible = !desktop;
      if (!desktop && !placed) {
        scratch.set(0, 0, -1).applyQuaternion(rotation);
        scratch.y = 0;
        if (scratch.lengthSq() < .01) scratch.set(0, 0, -1);
        panel.position.copy(eye).addScaledVector(scratch.normalize(), 1.8);
        panel.position.y += .19;
        panel.lookAt(eye);
        panel.updateMatrixWorld();
        placed = true;
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
      if (view.step === 'other') highlight = OTHER_DRUMS[Math.floor(elapsed / .95) % OTHER_DRUMS.length];
      if (demo && demoHit && elapsed < lastNote + .65) highlight = 'hihat';
      rings.forEach(({ ring, surface, local }, id) => {
        ring.visible = id === highlight;
        if (!ring.visible) return;
        surface.mesh.updateWorldMatrix(true, false);
        ring.matrix.multiplyMatrices(surface.mesh.matrixWorld, local);
        ring.matrixWorldNeedsUpdate = true;
        ring.material.opacity = (.48 + .17 * Math.sin(elapsed * 4) + (id === 'kick' ? kickFlash : 0)) * phase;
      });
      const hand = view.step === 'hat-grip' ? 'left' : view.step === 'kick' ? 'right' : null;
      const position = hand && gripPosition(hand);
      grip.visible = !!position;
      if (position) {
        scratch.set(hand === 'left' ? .036 : -.036, .045, -.012).applyQuaternion(rotation);
        grip.position.copy(position).add(scratch);
        grip.quaternion.copy(rotation);
        grip.material.opacity = (closed && hand === 'left' ? .95 : .65) * phase;
      }
      demoStick.visible = !!hat && demo && elapsed > lastNote - .65 && elapsed < lastNote + .34;
      if (hat && demoStick.visible) {
        const swing = elapsed < lastNote ? (lastNote - elapsed) / .65 : (elapsed - lastNote) / .34;
        scratch.set(0, hat.height + .01, 0);
        hat.mesh.localToWorld(scratch);
        scratch.y += .19 * swing ** 1.6;
        stickDirection.set(.32, .24 + swing * .52, .78).normalize();
        demoStick.position.copy(scratch).addScaledVector(stickDirection, .15);
        demoStick.quaternion.setFromUnitVectors(upright, stickDirection);
      }
      panel.material.opacity = phase;
    },
    dispose() {
      clearChart();
      for (const mesh of [panel, grip, demoStick, ...Array.from(rings.values(), entry => entry.ring)]) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      texture.dispose();
    },
  };
}
