import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createRestoredVRDrumSet } from './restoredVRDrumSet';
import { createStudioEnvironment } from './studioEnvironment';
import { createDrumEnvironments, getSavedDrumEnvironment } from './drumEnvironments';
import type { DrumEnvironmentId } from './drumEnvironments';
import { EnvironmentSwitcher } from './EnvironmentSwitcher';
import { createVRDrumInteraction } from './vrDrumInteraction';
import { createVRHardwareInstances } from './vrHardwareInstances';
import { createVRAssistedStrikes } from './vrAssistedStrikes';
import { VR_FREE_DRUMMING } from './vrDrumConfig';
import { createVRSeating } from './vrSeating';
import { createVirtualDrumsticks } from './virtualDrumsticks';
import { createVRNoteHighway } from './vrNoteHighway';
import { applyStickPose, createXRDrumstickControllers, DEFAULT_GRIP_OFFSETS } from './xrDrumstickControllers';
import type { StickPose } from './xrDrumstickControllers';
import type { StickHand } from './virtualDrumsticks';
import { StickControllerPanel } from './StickControllerPanel';
import { drumSynth } from '../utils/synth';
import { createVRARModeWindow } from './vrARModeWindow';
import './vrPractice.css';

type XRMode = 'vr' | 'ar';

export default function VRPractice({ preferredMode = 'vr' }: { preferredMode?: XRMode }) {
  const rootRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<() => void>(() => {});
  const [audioStatus, setAudioStatus] = useState('Loading drum sounds…');
  const [demoPaused, setDemoPaused] = useState(false);
  const demoRef = useRef<{ toggle: () => boolean; restart: () => void }>({ toggle: () => false, restart: () => {} });
  const [xrSupported, setXRSupported] = useState(false);
  const [arSupported, setArSupported] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [xrMode, setXRMode] = useState<XRMode | null>(null);
  const [xrBusy, setXRBusy] = useState(false);
  const [xrMessage, setXRMessage] = useState('Checking VR availability…');
  const xrActionRef = useRef<(mode: XRMode) => Promise<void>>(async () => {});
  const poseRef = useRef<(mode: 'preview' | 'offset', hand: StickHand, pose: StickPose) => void>(() => {});
  const [background, setBackground] = useState<DrumEnvironmentId>(getSavedDrumEnvironment);
  const initialBackground = useRef(background);
  const backgroundRef = useRef<(id: DrumEnvironmentId) => void>(() => {});

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const vrBackground = new THREE.Color(0x101114);
    scene.background = vrBackground;
    const backgrounds = createDrumEnvironments(scene, initialBackground.current);
    backgroundRef.current = backgrounds.select;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    host.appendChild(renderer.domElement);

    // Reflection source only: no room objects are added to the visible scene.
    const studio = createStudioEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(studio, 0.015);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.95;
    studio.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    });
    pmrem.dispose();

    scene.add(new THREE.AmbientLight(0xe8eaf0, 0.28));
    const key = new THREE.DirectionalLight(0xfff4e5, 2.8);
    key.position.set(-3, 6, 4);
    scene.add(key);
    const fill = new THREE.SpotLight(0xffffff, 1.2, 10, Math.PI / 6, 0.5, 1);
    fill.position.set(0, 5, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xc6d6ef, 1.6);
    rim.position.set(2, 3, -2);
    scene.add(rim);

    // Restore initial-Git instrument transforms before caching hit surfaces.
    const kit = createRestoredVRDrumSet(scene);
    const interaction = createVRDrumInteraction(kit);
    const hardware = createVRHardwareInstances(kit.group);
    let disposed = false;
    let audioReady = false;
    let audioPreparation = 0;
    const prepareAudio = async () => {
      const preparation = ++audioPreparation;
      audioReady = false;
      setAudioStatus('Loading drum sounds…');
      try {
        const ready = await drumSynth.prepareKit();
        if (disposed || preparation !== audioPreparation) return;
        audioReady = ready;
        setAudioStatus(ready ? 'Click to play · Drag to look around · Shift + drag: look without striking' : 'Sounds unavailable — reload to retry');
      } catch {
        if (!disposed && preparation === audioPreparation) setAudioStatus('Sounds unavailable — reload to retry');
      }
    };
    void prepareAudio();
    const unsubscribeKit = drumSynth.onKitChange(() => { void prepareAudio(); });

    // World seating offset belongs to the rig. The camera's local transform is
    // reserved for future headset poses; desktop look lives on separate parents.
    const rig = new THREE.Group();
    rig.name = 'player-rig';
    rig.position.set(0, 1.22, 1.0);
    const yaw = new THREE.Group();
    const pitch = new THREE.Group();
    const camera = new THREE.PerspectiveCamera(85, 1, 0.03, 30);
    camera.name = 'player-camera';
    const seatedPitch = -Math.atan2(0.83, 1.45);
    pitch.rotation.x = seatedPitch;
    rig.add(yaw);
    yaw.add(pitch);
    pitch.add(camera);
    scene.add(rig);
    const sticks = createVirtualDrumsticks(camera);
    for (const hand of ['left', 'right'] as const) applyStickPose(sticks.offsets[hand], DEFAULT_GRIP_OFFSETS[hand]);
    const controllers = createXRDrumstickControllers(renderer.xr, rig);
    const arModeWindow = createVRARModeWindow(camera, renderer.xr, rig, mode => {
      void xrActionRef.current(mode);
    });
    const collisions = createVRAssistedStrikes(kit.hitSurfaces, (id, hand, velocity) => {
      if (audioReady && interaction.hit(id, velocity)) controllers.pulse(hand, velocity);
    });
    const seating = createVRSeating(rig, kit.group, () => {
      interaction.update(1);
      collisions.refreshSurfaces();
      controllers.resetSamples();
    });
    poseRef.current = (mode, hand, pose) => {
      if (mode === 'preview') applyStickPose(sticks.grips[hand], pose);
      else {
        controllers.setOffset(hand, pose);
        collisions.reset(hand);
        applyStickPose(sticks.offsets[hand], pose);
      }
    };
    const desktopPose = { rig: rig.position.clone(), cameraPosition: camera.position.clone(), cameraScale: camera.scale.clone(),
      cameraQuaternion: camera.quaternion.clone(), yaw: 0, pitch: seatedPitch };
    let sessionMode: XRMode = preferredMode;
    const setPassthrough = (enabled: boolean) => {
      scene.background = enabled ? null : vrBackground;
      backgrounds.setVisible(!enabled);
    };
    const startXR = () => {
      cancelLook();
      desktopPose.rig.copy(rig.position);
      desktopPose.cameraPosition.copy(camera.position);
      desktopPose.cameraScale.copy(camera.scale);
      desktopPose.cameraQuaternion.copy(camera.quaternion);
      desktopPose.yaw = yaw.rotation.y;
      desktopPose.pitch = pitch.rotation.x;
      targetYaw = desktopPose.yaw;
      targetPitch = desktopPose.pitch;
      // local-floor supplies physical seated eye height, without a synthetic lift
      // or an imposed head rotation during gameplay.
      seating.enter();
      yaw.rotation.y = 0;
      pitch.rotation.x = 0;
      camera.position.set(0, 0, 0);
      camera.quaternion.identity();
      sticks.grips.left.visible = sticks.grips.right.visible = false;
      controllers.setActive(true);
      setPassthrough(sessionMode === 'ar');
      arModeWindow.setTarget(sessionMode === 'ar' ? 'vr' : 'ar');
      arModeWindow.show();
      collisions.reset();
      setImmersive(true);
      setXRMode(sessionMode);
      setXRMessage(sessionMode === 'ar'
        ? 'AR · VR과 같은 드럼 위치와 타격 방식입니다. 실제 배경이 보입니다.'
        : 'VR free play — flick either wrist toward a nearby instrument. Lift back to strike again.');
    };
    const endXR = () => {
      cancelLook();
      controllers.setActive(false);
      arModeWindow.hide();
      setPassthrough(false);
      seating.exit();
      collisions.reset();
      rig.position.copy(desktopPose.rig);
      yaw.rotation.y = desktopPose.yaw;
      pitch.rotation.x = desktopPose.pitch;
      targetYaw = desktopPose.yaw;
      targetPitch = desktopPose.pitch;
      camera.position.copy(desktopPose.cameraPosition);
      camera.scale.copy(desktopPose.cameraScale);
      camera.quaternion.copy(desktopPose.cameraQuaternion);
      sticks.grips.left.visible = sticks.grips.right.visible = true;
      if (!disposed) {
        setImmersive(false);
        setXRMode(null);
        setXRMessage('Desktop preview — real tracking has not been verified on hardware.');
        resize();
      }
    };
    renderer.xr.addEventListener('sessionstart', startXR);
    renderer.xr.addEventListener('sessionend', endXR);
    void (async () => {
      try {
        const supported = window.isSecureContext && !!navigator.xr && await navigator.xr.isSessionSupported('immersive-vr');
        const arAvailable = window.isSecureContext && !!navigator.xr && await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
        if (!disposed) {
          setXRSupported(supported);
          setArSupported(arAvailable);
          setXRMessage(supported ? 'VR available · Desktop preview is separate from tracking.' : 'VR unavailable here · Desktop preview only. Headset tracking is unverified.');
        }
      } catch {
        if (!disposed) setXRMessage('VR availability check failed · Desktop preview remains available.');
      }
    })();
    xrActionRef.current = async (target: XRMode) => {
      // Resume in this button's user gesture, before awaiting XR permission.
      void drumSynth.unlock();
      setXRBusy(true);
      let requested: XRSession | null = null;
      try {
        const current = renderer.xr.getSession();
        const sameMode = current && sessionMode === target;
        if (current) await current.end();
        if (!sameMode && navigator.xr) {
          requested = await navigator.xr.requestSession(target === 'ar' ? 'immersive-ar' : 'immersive-vr', {
            requiredFeatures: ['local-floor'],
            ...(target === 'ar' ? { optionalFeatures: ['dom-overlay'], domOverlay: { root: rootRef.current! } } : {}),
          });
          if (disposed) await requested.end();
          else { sessionMode = target; await renderer.xr.setSession(requested); }
        }
      } catch (error) {
        if (requested) await requested.end().catch(() => {});
        if (!disposed) setXRMessage(`Could not enter ${target.toUpperCase()}: ${error instanceof Error ? error.message : 'Session unavailable'}. 페이지에서 다시 시도해 주세요.`);
      } finally {
        if (!disposed) setXRBusy(false);
      }
    };
    const highway = VR_FREE_DRUMMING.fallingNotes ? createVRNoteHighway(scene) : null;
    const seatedOrientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(seatedPitch, 0, 0));
    let demoEpoch = performance.now();
    let demoPauseTime: number | null = null;
    demoRef.current = {
      toggle() {
        const now = performance.now();
        if (demoPauseTime === null) demoPauseTime = now;
        else { demoEpoch += now - demoPauseTime; demoPauseTime = null; }
        return demoPauseTime !== null;
      },
      restart() { demoEpoch = performance.now(); demoPauseTime = null; },
    };

    const corners: THREE.Vector3[] = [];
    kit.group.updateMatrixWorld(true);
    // Per-mesh bounds avoid framing the empty corners of one large kit box.
    kit.group.traverse((object: THREE.Object3D) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.computeBoundingBox();
      const bounds = object.geometry.boundingBox;
      if (!bounds) return;
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z])
            corners.push(new THREE.Vector3(x, y, z).applyMatrix4(object.matrixWorld));
    });
    // Framing margins retain the original initial view; they do not limit looking.
    const frameYaw = THREE.MathUtils.degToRad(5);
    const framePitch = THREE.MathUtils.degToRad(3);
    const pitchLimit = THREE.MathUtils.degToRad(80);
    let targetYaw = 0;
    let targetPitch = seatedPitch;

    const resize = () => {
      if (renderer.xr.isPresenting) return;
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      // Fit the original playing view, independently of the current look direction.
      let tangent = 0;
      const savedYaw = yaw.rotation.y;
      const savedPitch = pitch.rotation.x;
      for (const y of [-frameYaw, frameYaw]) {
        for (const p of [-framePitch, framePitch]) {
          yaw.rotation.y = y;
          pitch.rotation.x = seatedPitch + p;
          scene.updateMatrixWorld(true);
          camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
          for (const corner of corners) {
            const local = corner.clone().applyMatrix4(camera.matrixWorldInverse);
            tangent = Math.max(tangent, Math.abs(local.y / local.z),
              Math.abs(local.x / local.z) / camera.aspect);
          }
        }
      }
      yaw.rotation.y = savedYaw;
      pitch.rotation.x = savedPitch;
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tangent / 0.9));
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      highway?.layout(camera, rig.position, seatedOrientation);
    };

    let pointerId: number | null = null;
    let lastX = 0;
    let lastY = 0;
    let startX = 0;
    let startY = 0;
    let looking = false;
    const canvas = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const hitAtPointer = (event: PointerEvent) => {
      if (!audioReady) return;
      const rect = canvas.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1,
        -(event.clientY - rect.top) / rect.height * 2 + 1);
      scene.updateMatrixWorld(true);
      raycaster.setFromCamera(pointer, camera);
      const intersection = raycaster.intersectObjects(kit.raycastTargets, true)[0];
      const target = intersection?.object;
      let object: THREE.Object3D | null = target ?? null;
      while (object) {
        if (object.userData.drumType) {
          if (interaction.hit(object.userData.drumType)) sticks.strikeAlternating(intersection.point);
          break;
        }
        object = object.parent;
      }
    };
    const down = (event: PointerEvent) => {
      if (renderer.xr.isPresenting) return;
      void drumSynth.unlock();
      if (event.button !== 0 && event.button !== 2) return;
      if (!event.shiftKey) {
        hitAtPointer(event);
      }
      if (pointerId !== null || event.buttons === 0) return;
      pointerId = event.pointerId;
      lastX = startX = event.clientX;
      lastY = startY = event.clientY;
      looking = false;
      canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (renderer.xr.isPresenting || event.pointerId !== pointerId) return;
      if (!looking && Math.hypot(event.clientX - startX, event.clientY - startY) < 4) return;
      looking = true;
      canvas.classList.add('is-looking');
      // Only eye-centred yaw/pitch parents rotate. No world object or camera
      // translation is touched, and yaw is free to turn through the whole venue.
      targetYaw -= (event.clientX - lastX) * 0.003;
      targetPitch = THREE.MathUtils.clamp(targetPitch - (event.clientY - lastY) * 0.003, -pitchLimit, pitchLimit);
      lastX = event.clientX;
      lastY = event.clientY;
    };
    function cancelLook() {
      const captured = pointerId;
      pointerId = null;
      looking = false;
      if (captured !== null && canvas.hasPointerCapture(captured)) canvas.releasePointerCapture(captured);
      canvas.classList.remove('is-looking');
    }
    const up = (event: PointerEvent) => {
      if (event.pointerId === pointerId) cancelLook();
    };
    resetRef.current = () => {
      if (renderer.xr.isPresenting) return;
      cancelLook();
      targetYaw = 0;
      targetPitch = seatedPitch;
    };
    const preventContextMenu = (event: Event) => event.preventDefault();
    canvas.addEventListener('contextmenu', preventContextMenu);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('lostpointercapture', up);
    window.addEventListener('blur', cancelLook);
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const headPosition = new THREE.Vector3();
    let previousTime: number | null = null;
    const unlockControllerAudio = () => { void drumSynth.unlock(); };
    const referenceReset = () => { controllers.resetSamples(); collisions.reset(); };
    let referenceSpace: XRReferenceSpace | null = null;
    let audioSession: XRSession | null = null;
    renderer.setAnimationLoop((time, frame) => {
      const frameDelta = previousTime === null ? 0 : (time - previousTime) / 1000;
      const delta = Math.min(frameDelta, 0.05);
      previousTime = time;
      backgrounds.update(time / 1000);
      if (!renderer.xr.isPresenting) {
        yaw.rotation.y = THREE.MathUtils.damp(yaw.rotation.y, targetYaw, 14, delta);
        pitch.rotation.x = THREE.MathUtils.damp(pitch.rotation.x, targetPitch, 14, delta);
        sticks.update(delta);
      }
      const session = renderer.xr.getSession();
      if (session !== audioSession) {
        audioSession?.removeEventListener('selectstart', unlockControllerAudio);
        audioSession?.removeEventListener('squeezestart', unlockControllerAudio);
        audioSession = session;
        session?.addEventListener('selectstart', unlockControllerAudio);
        session?.addEventListener('squeezestart', unlockControllerAudio);
      }
      const reference = renderer.xr.getReferenceSpace();
      if (reference !== referenceSpace) {
        referenceSpace?.removeEventListener('reset', referenceReset);
        referenceSpace = reference;
        referenceSpace?.addEventListener('reset', referenceReset);
        referenceReset();
      }
      if (renderer.xr.isPresenting && frame && reference) seating.update(frame, reference);
      controllers.update(frame);
      const viewer = frame && reference ? frame.getViewerPose(reference) : null;
      if (renderer.xr.isPresenting && frame && viewer && audioReady) {
        const p = viewer.transform.position;
        headPosition.set(p.x, p.y, p.z).applyMatrix4(rig.matrixWorld);
        for (const hand of ['left', 'right'] as const) {
          collisions.update(hand, controllers.tipSamples[hand], frameDelta, time / 1000, headPosition);
        }
      } else collisions.suspend();
      interaction.update(delta);
      highway?.update(((demoPauseTime ?? performance.now()) - demoEpoch) / 1000);
      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      audioSession?.removeEventListener('selectstart', unlockControllerAudio);
      audioSession?.removeEventListener('squeezestart', unlockControllerAudio);
      referenceSpace?.removeEventListener('reset', referenceReset);
      backgrounds.dispose();
      backgroundRef.current = () => {};
      renderer.xr.removeEventListener('sessionstart', startXR);
      renderer.xr.removeEventListener('sessionend', endXR);
      const session = renderer.xr.getSession();
      if (session) void session.end().catch(() => {});
      controllers.dispose();
      arModeWindow.dispose();
      poseRef.current = () => {};
      xrActionRef.current = async () => {};
      unsubscribeKit();
      interaction.dispose();
      hardware.dispose();
      highway?.dispose();
      demoRef.current = { toggle: () => false, restart: () => {} };
      renderer.setAnimationLoop(null);
      observer.disconnect();
      resetRef.current = () => {};
      cancelLook();
      window.removeEventListener('blur', cancelLook);
      canvas.removeEventListener('contextmenu', preventContextMenu);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('lostpointercapture', up);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material);
          for (const value of Object.values(material))
            if (value instanceof THREE.Texture) textures.add(value);
        }
      });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      textures.forEach(texture => texture.dispose());
      environment.dispose();
      renderer.dispose();
      canvas.remove();
      scene.clear();
    };
  }, []);

  return (
    <main className="vr-practice" ref={rootRef} aria-label="First-person drum practice">
      <div className="vr-practice-stage" ref={hostRef} aria-label="Drum kit — click to strike, drag to look around; hold Shift to look without striking" />
      <header className="vr-practice-toolbar">
        <a href="#/">Back to DRUM UP</a>
        <span>{xrMode === 'ar' || (!immersive && preferredMode === 'ar') ? 'AR' : 'VR'} PRACTICE · {immersive ? 'HEADSET VIEW' : 'DESKTOP VIEW'}</span>
        <div className="vr-practice-actions">
          {VR_FREE_DRUMMING.fallingNotes && <><span className="vr-demo-label">120 BPM · VISUAL DEMO</span>
          <button onClick={() => setDemoPaused(demoRef.current.toggle())}>{demoPaused ? 'Resume demo' : 'Pause demo'}</button>
          <button onClick={() => { demoRef.current.restart(); setDemoPaused(false); }}>Restart demo</button></>}
          <button onClick={() => resetRef.current()}>Reset view</button>
          <button disabled={!xrSupported || xrBusy} title={xrMessage} onClick={() => { void xrActionRef.current('vr'); }}>{xrBusy ? 'Connecting…' : xrMode === 'vr' ? 'Exit VR' : xrSupported ? 'Enter VR' : 'VR unavailable'}</button>
          {xrMode !== 'ar' && <EnvironmentSwitcher selected={background} onSelect={id => { backgroundRef.current(id); setBackground(id); }} />}
        </div>
      </header>
      {!immersive && <aside className="vr-ar-mode-window" aria-label="AR mode selection">
        <span>VIEW MODE</span>
        <strong>실제 배경에서 연주하기</strong>
        <p>VR과 같은 드럼 위치와 타격 방식으로 연주하며, 가상 배경만 숨깁니다.</p>
        <button disabled={!arSupported || xrBusy} onClick={() => { void xrActionRef.current('ar'); }}>{xrBusy ? '전환 중…' : arSupported ? 'AR 패스스루 시작 →' : 'AR 미지원 기기'}</button>
      </aside>}
      <StickControllerPanel immersive={immersive} onChange={(mode, hand, pose) => poseRef.current(mode, hand, pose)} />
      <p className="vr-xr-status">{xrMessage}</p>
      <p className="vr-practice-hint" role="status">{audioStatus}</p>
    </main>
  );
}
