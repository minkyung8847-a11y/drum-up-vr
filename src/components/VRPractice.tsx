import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createRestoredVRDrumSet } from './restoredVRDrumSet';
import { createStudioEnvironment } from './studioEnvironment';
import { createDrumEnvironments, getSavedDrumEnvironment } from './drumEnvironments';
import type { DrumEnvironmentId } from './drumEnvironments';
import { EnvironmentSwitcher } from './EnvironmentSwitcher';
import { createVRDrumInteraction } from './vrDrumInteraction';
import { createVRHardwareInstances } from './vrHardwareInstances';
import { createVRAssistedStrikes } from './vrAssistedStrikes';
import { createVRStickCollision } from './vrStickCollision';
import { createVRSeating, VR_SEATING } from './vrSeating';
import { createVirtualDrumsticks } from './virtualDrumsticks';
import { captureRhythmSurfaces, createVRNoteHighway, createVRNoteLanes } from './vrNoteHighway';
import { applyStickPose, createXRDrumstickControllers } from './xrDrumstickControllers';
import type { StickPose } from './xrDrumstickControllers';
import { createXRHandDrumsticks } from './xrHandDrumsticks';
import type { HandStickCalibration } from './xrHandDrumsticks';
import type { StickHand } from './virtualDrumsticks';
import { StickControllerPanel } from './StickControllerPanel';
import { drumSynth } from '../utils/synth';
import { VRPedalPanel } from '../pedal/VRPedalPanel';
import { LocalKickReceiver } from '../pedal/LocalKickTest';
import { LOCAL_KICK_ENABLED } from '../pedal/PedalConnection';
import type { PedalState } from '../pedal/PedalConnection';
import { createLocalKickDebug } from '../pedal/localKickDebug';
import { createKickTrigger } from '../pedal/kickTrigger';
import { attachXRKickInput } from '../pedal/xrKickInput';
import { createVRARModeWindow } from './vrARModeWindow';
import { createSongMedia, songBpmAt } from './songPlayback';
import type { SongPlayback } from './songPlayback';
import './vrPractice.css';

type XRMode = 'vr' | 'ar';

export default function VRPractice({ preferredMode = 'vr', song }: { preferredMode?: XRMode; song?: SongPlayback }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<() => void>(() => {});
  const kickRef = useRef<(velocity: number) => boolean>(() => false);
  const kickDebugRef = useRef<(state: PedalState) => void>(() => {});
  const updateKickDebug = useCallback((state: PedalState) => kickDebugRef.current(state), []);
  const hiHatRef = useRef<(pressed: boolean) => boolean>(() => false);
  const unlockKickRef = useRef<() => Promise<boolean>>(async () => false);
  const controllerKick = useRef(false);
  const [audioStatus, setAudioStatus] = useState('Loading drum sounds…');
  const [xrSupported, setXRSupported] = useState(false);
  const [arSupported, setArSupported] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [xrMode, setXRMode] = useState<XRMode | null>(null);
  const [pendingMode, setPendingMode] = useState<XRMode | null>(null);
  const [xrBusy, setXRBusy] = useState(false);
  const [xrMessage, setXRMessage] = useState('Checking VR availability…');
  const xrActionRef = useRef<(mode: XRMode | 'exit') => Promise<void>>(async () => {});
  const poseRef = useRef<(mode: 'preview' | 'offset', hand: StickHand, pose: StickPose) => void>(() => {});
  const handCalibrationRef = useRef<(hand: StickHand, calibration: HandStickCalibration) => void>(() => {});
  const [background, setBackground] = useState<DrumEnvironmentId>(getSavedDrumEnvironment);
  const initialBackground = useRef(background);
  const backgroundRef = useRef<(id: DrumEnvironmentId) => void>(() => {});

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const kickDebug = LOCAL_KICK_ENABLED && preferredMode === 'vr' ? createLocalKickDebug(scene) : null;
    if (kickDebug) kickDebugRef.current = kickDebug.update;
    const vrBackground = new THREE.Color(0x101114);
    scene.background = vrBackground;
    // Three clears alpha-blend XR buffers to transparent, including when
    // scene.background is a Color. A background texture writes opaque pixels.
    const opaqueBackground = new THREE.DataTexture(new Uint8Array([0x10, 0x11, 0x14, 255]), 1, 1);
    opaqueBackground.colorSpace = THREE.SRGBColorSpace;
    opaqueBackground.needsUpdate = true;
    const viewFade = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { darkness: { value: 0 } },
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform float darkness; void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, darkness); }',
      transparent: true, depthTest: false, depthWrite: false,
    }));
    viewFade.name = 'xr-view-fade';
    viewFade.renderOrder = 2000;
    viewFade.frustumCulled = false;
    viewFade.visible = false;
    scene.add(viewFade);
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
    const rhythmSurfaces = captureRhythmSurfaces(kit.hitSurfaces);
    const laneEye = new THREE.Vector3(0, 1.35, VR_SEATING.playerZ);
    let noteLanes: ReturnType<typeof createVRNoteLanes> | null = null;
    const interaction = createVRDrumInteraction(kit);
    const hardware = createVRHardwareInstances(kit.group);
    let disposed = false;
    let audioReady = false;
    let highway: ReturnType<typeof createVRNoteHighway> | null = null;
    let scoreMedia: { audio: HTMLAudioElement; url: string; offset: number } | undefined;
    const releaseScoreMedia = () => {
      if (!scoreMedia) return;
      scoreMedia.audio.pause();
      scoreMedia.audio.removeAttribute('src');
      scoreMedia.audio.load();
      URL.revokeObjectURL(scoreMedia.url);
      scoreMedia = undefined;
    };
    let sessionMode: XRMode = preferredMode;
    let previousTime: number | null = null;
    const isVisibleXR = () => renderer.xr.getSession()?.visibilityState === 'visible';
    const triggerKick = createKickTrigger(() => audioReady && drumSynth.isAudioRunning() && !disposed,
      (id, velocity) => interaction.hit(id, velocity));
    const hitDrum = (id: string, velocity = 1, now = performance.now()) => {
      const played = id === 'kick' ? triggerKick(velocity) : interaction.hit(id, velocity);
      if (played && isVisibleXR()) {
        const judgment = highway?.strike(id, now);
        if (judgment === 'Perfect' || judgment === 'Great') drumSynth.playRhythmSuccess(judgment === 'Perfect');
      }
      return played;
    };
    const playPedalKick = (velocity: number) => hitDrum('kick', velocity);
    kickRef.current = velocity => {
      const session = renderer.xr.getSession();
      // A headset's DOM may be hidden while immersive WebXR is active.
      const visible = session ? session.visibilityState === 'visible' : document.visibilityState === 'visible';
      return visible && playPedalKick(velocity);
    };
    hiHatRef.current = pressed => {
      const session = renderer.xr.getSession();
      const visible = session ? session.visibilityState === 'visible' : document.visibilityState === 'visible';
      interaction.setHiHatClosed(visible && pressed);
      return visible;
    };
    unlockKickRef.current = async () => (await drumSynth.unlock()) && audioReady;
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
    for (const hand of ['left', 'right'] as const) sticks.offsets[hand].rotation.x = THREE.MathUtils.degToRad(12);
    const controllers = createXRDrumstickControllers(renderer.xr, rig);
    const handSticks = createXRHandDrumsticks(rig);
    const handCollisions = createVRStickCollision(kit.hitSurfaces, (id, _hand, velocity) => {
      hitDrum(id, velocity, previousTime ?? performance.now());
    });
    handCalibrationRef.current = (hand, calibration) => {
      handSticks.setCalibration(hand, calibration);
      handCollisions.reset(hand);
    };
    let realStickMode = false;
    const arModeWindow = createVRARModeWindow(scene, renderer.xr, rig, mode => {
      void xrActionRef.current(mode);
    }, action => {
      if (isVisibleXR()) highway?.[action](performance.now());
    }, () => {
      if (!isVisibleXR()) return;
      realStickMode = !realStickMode;
      applyStickMode();
      collisions.reset();
    });
    const applyStickMode = () => {
      controllers.setActive(!realStickMode);
      handSticks.reset();
      handCollisions.reset();
      arModeWindow.setStickMode(realStickMode, 'Put controllers down · show your hands');
    };
    const collisions = createVRAssistedStrikes(kit.hitSurfaces, (id, hand, velocity) => {
      if (audioReady && hitDrum(id, velocity, previousTime ?? performance.now())) controllers.pulse(hand, velocity);
    });
    const seating = createVRSeating(rig, kit.group, () => {
      interaction.update(1);
      collisions.refreshSurfaces();
      handCollisions.refreshSurfaces();
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
    let rhythmSession: XRSession | null = null;
    let arAvailable = false;
    let preferSharedSession = false;
    let sessionBusy = false;
    let retainedRig: THREE.Vector3 | null = null;
    let resumeAfterSwitch = false;
    let viewTransition: { target: XRMode; start: number | null; applied: boolean } | null = null;
    const pauseHiddenRhythm = () => {
      if (rhythmSession?.visibilityState !== 'visible') highway?.pause(performance.now());
    };
    const applyView = (mode: XRMode) => {
      sessionMode = mode;
      scene.background = mode === 'ar' ? null
        : renderer.xr.getSession()?.environmentBlendMode === 'alpha-blend' ? opaqueBackground : vrBackground;
      backgrounds.setVisible(mode === 'vr');
      noteLanes?.setPassthrough(mode === 'ar');
      arModeWindow.setTarget(mode === 'ar' ? 'vr' : 'ar');
      kickDebug?.setImmersive(mode === 'vr');
      setXRMode(mode);
      setXRMessage(mode === 'ar'
        ? 'AR · 실제 배경 위에서 같은 드럼을 연주합니다.'
        : 'VR · 가상공간에서 드럼을 연주합니다.');
    };
    const startXR = () => {
      cancelLook();
      if (retainedRig) {
        rig.position.copy(retainedRig);
        retainedRig = null;
      } else {
        desktopPose.rig.copy(rig.position);
        desktopPose.cameraPosition.copy(camera.position);
        desktopPose.cameraScale.copy(camera.scale);
        desktopPose.cameraQuaternion.copy(camera.quaternion);
        desktopPose.yaw = yaw.rotation.y;
        desktopPose.pitch = pitch.rotation.x;
        seating.enter();
      }
      targetYaw = desktopPose.yaw;
      targetPitch = desktopPose.pitch;
      yaw.rotation.y = 0;
      pitch.rotation.x = 0;
      camera.position.set(0, 0, 0);
      camera.quaternion.identity();
      sticks.grips.left.visible = sticks.grips.right.visible = false;
      if (!noteLanes) {
        noteLanes = createVRNoteLanes(rhythmSurfaces, laneEye);
        scene.add(noteLanes.lines);
        if (song) {
          const media = createSongMedia(song);
          scoreMedia = { ...media, audio: new Audio(media.url) };
          arModeWindow.setRhythmBpm(songBpmAt(song.chart, -media.offset));
        }
        highway = createVRNoteHighway(scene, rhythmSurfaces, noteLanes.paths,
          (state, judgment) => arModeWindow.setRhythmStatus(state, judgment),
          song && scoreMedia ? { ...scoreMedia, notes: song.chart.notes, windows: song.windows,
            onResults: (perfect, great, miss, time) => arModeWindow.setSongResults(perfect, great, miss, time),
          } : undefined);
      }
      rhythmSession = renderer.xr.getSession();
      applyStickMode();
      rhythmSession?.addEventListener('visibilitychange', pauseHiddenRhythm);
      applyView(sessionMode);
      arModeWindow.show(rhythmSession?.environmentBlendMode === 'alpha-blend' || arAvailable);
      if (resumeAfterSwitch) highway?.toggle(performance.now());
      resumeAfterSwitch = false;
      setPendingMode(null);
      collisions.reset();
      setImmersive(true);
    };
    const endXR = () => {
      cancelLook();
      kickDebug?.setImmersive(false);
      rhythmSession?.removeEventListener('visibilitychange', pauseHiddenRhythm);
      rhythmSession = null;
      viewTransition = null;
      viewFade.visible = false;
      if (!retainedRig) {
        highway?.stop();
        highway?.dispose();
        highway = null;
        releaseScoreMedia();
        noteLanes?.dispose();
        noteLanes = null;
        seating.exit();
      }
      controllers.setActive(false);
      handSticks.reset();
      handCollisions.reset();
      arModeWindow.hide();
      scene.background = vrBackground;
      backgrounds.setVisible(true);
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
        setXRMessage(retainedRig ? '연주 상태를 보존했습니다. 입장 버튼을 눌러 전환을 완료하세요.' : 'Desktop preview');
        resize();
      }
    };
    renderer.xr.addEventListener('sessionstart', startXR);
    renderer.xr.addEventListener('sessionend', endXR);
    void (async () => {
      try {
        const supported = window.isSecureContext && !!navigator.xr && await navigator.xr.isSessionSupported('immersive-vr');
        arAvailable = window.isSecureContext && !!navigator.xr && await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
        preferSharedSession = arAvailable;
        if (!disposed) {
          setXRSupported(supported || arAvailable);
          setArSupported(arAvailable);
          setXRMessage(supported || arAvailable ? 'VR available · Desktop preview is separate from tracking.'
            : 'VR unavailable here · Desktop preview only. Headset tracking is unverified.');
        }
      } catch {
        if (!disposed) setXRMessage('VR availability check failed · Desktop preview remains available.');
      }
    })();
    xrActionRef.current = async target => {
      if (sessionBusy || disposed) return;
      // Resume in this button's user gesture, before awaiting XR permission.
      void drumSynth.unlock();
      const current = renderer.xr.getSession();
      if (current && target !== 'exit') {
        if (target === sessionMode || viewTransition || !isVisibleXR()) return;
        if (current.environmentBlendMode === 'alpha-blend') {
          viewTransition = { target, start: null, applied: false };
          return;
        }
        if (!arAvailable) return;
        // A new immersive session may require fresh user activation after exit.
        // Preserve the chart and seating until the existing entry button is used.
        retainedRig = rig.position.clone();
        resumeAfterSwitch = highway?.pause(performance.now()) ?? false;
        setPendingMode(target);
      }
      sessionBusy = true;
      setXRBusy(true);
      let requested: XRSession | null = null;
      const tryAR = target === 'ar' || (target === 'vr' && preferSharedSession);
      try {
        if (current) {
          await current.end();
        } else if (target !== 'exit' && navigator.xr) {
          requested = await navigator.xr.requestSession(tryAR ? 'immersive-ar' : 'immersive-vr', {
            requiredFeatures: ['local-floor'],
            optionalFeatures: ['hand-tracking'],
          });
          if (tryAR && requested.environmentBlendMode !== 'alpha-blend') {
            throw new Error('이 세션은 카메라 패스스루 합성을 제공하지 않습니다.');
          }
          if (disposed) await requested.end();
          else { sessionMode = target; await renderer.xr.setSession(requested); }
        }
      } catch (error) {
        if (requested) await requested.end().catch(() => {});
        if (current && retainedRig) {
          retainedRig = null;
          if (resumeAfterSwitch) highway?.toggle(performance.now());
          resumeAfterSwitch = false;
          setPendingMode(null);
        }
        if (!current && target === 'vr' && tryAR) preferSharedSession = false;
        if (!disposed) setXRMessage(`XR: ${error instanceof Error ? error.message : 'Session unavailable'}. 입장 버튼에서 다시 시도해 주세요.`);
      } finally {
        sessionBusy = false;
        if (!disposed) setXRBusy(false);
      }
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
          if (hitDrum(object.userData.drumType)) sticks.strikeAlternating(intersection.point);
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
    const tomKeys: Record<string, string> = { KeyF: 'smallTom', KeyG: 'middleTom', KeyH: 'floorTom' };
    const hitTomKey = (event: KeyboardEvent) => {
      const part = tomKeys[event.code];
      const target = event.target;
      if (!part || event.repeat || event.altKey || event.ctrlKey || event.metaKey
        || (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)))) return;
      void drumSynth.unlock();
      if (audioReady) hitDrum(part);
    };
    window.addEventListener('keydown', hitTomKey);
    window.addEventListener('blur', cancelLook);
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const headPosition = new THREE.Vector3();
    const unlockControllerAudio = () => { void drumSynth.unlock(); };
    let detachKickInput = () => {};
    const referenceReset = () => {
      controllers.resetSamples();
      collisions.reset();
      handSticks.reset();
      handCollisions.reset();
    };
    let referenceSpace: XRReferenceSpace | null = null;
    let audioSession: XRSession | null = null;
    let rightPointerWasActive = false;
    renderer.setAnimationLoop((time, frame) => {
      const frameDelta = previousTime === null ? 0 : (time - previousTime) / 1000;
      const delta = Math.min(frameDelta, 0.05);
      previousTime = time;
      if (viewTransition) {
        viewTransition.start ??= time;
        const progress = THREE.MathUtils.clamp((time - viewTransition.start) / 240, 0, 1);
        viewFade.visible = progress < 1;
        viewFade.material.uniforms.darkness.value = 0.85 * Math.sin(Math.PI * progress);
        if (progress >= 0.5 && !viewTransition.applied) {
          applyView(viewTransition.target);
          viewTransition.applied = true;
        }
        if (progress >= 1) viewTransition = null;
      }
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
        detachKickInput();
        audioSession = session;
        session?.addEventListener('selectstart', unlockControllerAudio);
        session?.addEventListener('squeezestart', unlockControllerAudio);
        detachKickInput = session ? attachXRKickInput(session, () => controllerKick.current && !realStickMode,
          playPedalKick, controllers.pulse) : () => {};
      }
      const reference = renderer.xr.getReferenceSpace();
      if (reference !== referenceSpace) {
        referenceSpace?.removeEventListener('reset', referenceReset);
        referenceSpace = reference;
        referenceSpace?.addEventListener('reset', referenceReset);
        referenceReset();
      }
      if (renderer.xr.isPresenting && frame && reference) seating.update(frame, reference);
      const viewer = frame && reference ? frame.getViewerPose(reference) ?? null : null;
      const rightPointerActive = arModeWindow.update(session, viewer);
      controllers.setRightPointerActive(rightPointerActive);
      controllers.update(frame);
      if (rightPointerActive && !rightPointerWasActive) collisions.reset('right');
      rightPointerWasActive = rightPointerActive;
      if (renderer.xr.isPresenting && viewer) {
        const p = viewer.transform.position;
        headPosition.set(p.x, p.y, p.z).applyMatrix4(rig.matrixWorld);
        if (!isVisibleXR()) highway?.pause(time);
        highway?.update(time, headPosition);
        if (song && scoreMedia) arModeWindow.setRhythmBpm(songBpmAt(song.chart, scoreMedia.audio.currentTime - scoreMedia.offset));
      }
      if (realStickMode && session) {
        if (frame && reference && viewer) handSticks.update(frame, reference);
        else handSticks.reset();
        const { left, right } = handSticks.samples;
        const tracked = left.valid || right.valid;
        arModeWindow.setStickMode(true, tracked ? `Hand tracking · ${left.valid ? 'L' : '–'}  ${right.valid ? 'R' : '–'}`
          : session.enabledFeatures && !session.enabledFeatures.includes('hand-tracking')
            ? 'Hand tracking unavailable in this session' : 'Put controllers down · show your hands');
        if (audioReady && tracked) {
          for (const hand of ['left', 'right'] as const) {
            handCollisions.update(hand, handSticks.samples[hand], frameDelta, time / 1000);
          }
        } else handCollisions.reset();
      }
      if (renderer.xr.isPresenting && frame && viewer && audioReady && !realStickMode) {
        for (const hand of ['left', 'right'] as const) {
          if (hand === 'right' && rightPointerActive) continue;
          collisions.update(hand, controllers.tipSamples[hand], frameDelta, time / 1000, headPosition);
        }
      } else collisions.suspend();
      if (!retainedRig || renderer.xr.isPresenting) interaction.update(delta);
      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      kickRef.current = () => false;
      kickDebugRef.current = () => {};
      kickDebug?.dispose();
      hiHatRef.current = () => false;
      unlockKickRef.current = async () => false;
      audioSession?.removeEventListener('selectstart', unlockControllerAudio);
      audioSession?.removeEventListener('squeezestart', unlockControllerAudio);
      detachKickInput();
      referenceSpace?.removeEventListener('reset', referenceReset);
      backgrounds.dispose();
      backgroundRef.current = () => {};
      renderer.xr.removeEventListener('sessionstart', startXR);
      renderer.xr.removeEventListener('sessionend', endXR);
      rhythmSession?.removeEventListener('visibilitychange', pauseHiddenRhythm);
      const session = renderer.xr.getSession();
      if (session) void session.end().catch(() => {});
      controllers.dispose();
      handSticks.dispose();
      handCalibrationRef.current = () => {};
      arModeWindow.dispose();
      poseRef.current = () => {};
      xrActionRef.current = async () => {};
      unsubscribeKit();
      interaction.dispose();
      hardware.dispose();
      highway?.dispose();
      releaseScoreMedia();
      noteLanes?.dispose();
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
      window.removeEventListener('keydown', hitTomKey);
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
      opaqueBackground.dispose();
      environment.dispose();
      renderer.dispose();
      canvas.remove();
      scene.clear();
    };
  }, []);

  return (
    <main className="vr-practice" aria-label="First-person drum practice">
      <div className="vr-practice-stage" ref={hostRef} aria-label="Drum kit — click to strike, drag to look around; hold Shift to look without striking" />
      <header className="vr-practice-toolbar">
        <a href="#/">Back to DRUM UP</a>
        <span>{xrMode === 'ar' || (!immersive && preferredMode === 'ar') ? 'AR' : 'VR'} PRACTICE · {immersive ? 'HEADSET VIEW' : 'DESKTOP VIEW'}</span>
        <div className="vr-practice-actions">
          <VRPedalPanel onKick={velocity => kickRef.current(velocity)}
            onHiHat={pressed => hiHatRef.current(pressed)} unlock={() => unlockKickRef.current()}
            onButtonMode={enabled => { controllerKick.current = enabled; }} />
          {LOCAL_KICK_ENABLED && preferredMode === 'vr' && <LocalKickReceiver
            onKick={velocity => kickRef.current(velocity)} onStatus={updateKickDebug} />}
          <button onClick={() => resetRef.current()}>Reset view</button>
          <button disabled={xrBusy || (!immersive && !(pendingMode === 'ar' ? arSupported : xrSupported))}
            title={xrMessage} onClick={() => { void xrActionRef.current(immersive ? 'exit' : pendingMode ?? 'vr'); }}>
            {xrBusy ? 'Connecting…' : immersive ? 'Exit VR' : pendingMode === 'ar' ? 'Enter AR' : xrSupported ? 'Enter VR' : 'VR unavailable'}
          </button>
          {xrMode !== 'ar' && <EnvironmentSwitcher selected={background} onSelect={id => { backgroundRef.current(id); setBackground(id); }} />}
        </div>
      </header>
      {!immersive && <aside className="vr-ar-mode-window" aria-label="AR mode selection">
        <span>VIEW MODE</span>
        <strong>실제 배경에서 연주하기</strong>
        <p>VR과 같은 드럼 위치와 타격 방식으로 연주하며, 가상 배경만 숨깁니다.</p>
        <button disabled={!arSupported || xrBusy} onClick={() => { void xrActionRef.current('ar'); }}>{xrBusy ? '전환 중…' : arSupported ? 'AR 패스스루 시작 →' : 'AR 미지원 기기'}</button>
      </aside>}
      <StickControllerPanel immersive={immersive} onChange={(mode, hand, pose) => poseRef.current(mode, hand, pose)}
        onHandChange={(hand, calibration) => handCalibrationRef.current(hand, calibration)} />
      <p className="vr-xr-status">{xrMessage}</p>
      <p className="vr-practice-hint" role="status">{audioStatus}</p>
    </main>
  );
}
