import {readDrumHeight,saveDrumHeight} from './vrDrumHeight';
import { createVRMusicPlayer } from './vrMusicPlayer';
import { createFootPedal, createPedalGripGate } from '../pedal/footPedal';
import type { FootPedalController, FootPedalState } from '../pedal/footPedal';
import { FootPedalSettings } from '../pedal/FootPedalSettings';
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
import { createVRSeating, VR_SEATING, applySeatedKitHeight } from './vrSeating';
import { createVirtualDrumsticks } from './virtualDrumsticks';
import { captureRhythmSurfaces, createVRNoteHighway, createVRNoteLanes, RHYTHM_BPM } from './vrNoteHighway';
import { applyStickPose, createXRDrumstickControllers } from './xrDrumstickControllers';
import type { StickPose } from './xrDrumstickControllers';
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
import { createVRUnifiedPanel } from './vrUnifiedPanel';
import { createSongMedia, songBpmAt } from './songPlayback';
import type { SongPlayback } from './songPlayback';
import { createVRMusicAudio, loadVRMusicChart } from './vrMusicSong';
import type { VRMusicTransport } from './vrMusicSong';
import { createVRSongCountdown } from './vrSongDetail';
import { getNoteSyncMs } from './vrNoteSync';
import { createVREntrance, hasSeenVREntrance } from './vrEntrance';
import { takeVREntranceSession } from './vrEntranceNavigation';
import { createVRTutorial, hasSeenVRTutorial, tutorialContent } from './vrTutorial';
import type { TutorialAction, TutorialView } from './vrTutorial';
import './vrPractice.css';

type XRMode = 'vr' | 'ar';

export default function VRPractice({ song }: { song?: SongPlayback }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [entranceActive, setEntranceActive] = useState(() => !song && !hasSeenVREntrance());
  const resetRef = useRef<() => void>(() => {});
  const tutorialOpenRef = useRef<() => void>(() => {});
  const tutorialActionRef = useRef<(action: TutorialAction) => void>(() => {});
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialView, setTutorialView] = useState<TutorialView | null>(null);
  const kickRef = useRef<(velocity: number) => boolean>(() => false);
  const kickDebugRef = useRef<(state: PedalState) => void>(() => {});
  const updateKickDebug = useCallback((state: PedalState) => kickDebugRef.current(state), []);
  const hiHatRef = useRef<(pressed: boolean) => boolean>(() => false);
  const unlockKickRef = useRef<() => Promise<boolean>>(async () => false);
  const controllerKick = useRef(true);
  const footPedalRef = useRef<FootPedalController | null>(null);
  const [footPedalState, setFootPedalState] = useState<FootPedalState | null>(null);
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
  const [background, setBackground] = useState<DrumEnvironmentId>(getSavedDrumEnvironment);
  const initialBackground = useRef(background);
  const backgroundRef = useRef<(id: DrumEnvironmentId) => void>(() => {});

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    let entrance = !song && !hasSeenVREntrance() ? createVREntrance(scene) : null;
    const openedThroughEntrance = !!entrance;
    const kickDebug = LOCAL_KICK_ENABLED ? createLocalKickDebug(scene) : null;
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
    // Keep native XR framebuffer density; improve peripheral UI without global supersampling.
    renderer.xr.setFramebufferScaleFactor(1);
    renderer.xr.setFoveation(.25);
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
    let drumHeight=readDrumHeight();
    applySeatedKitHeight(kit.group,drumHeight);
    kit.group.name = 'vr-drum-kit';
    // Discard placements from the removed editor; always use the authored kit.
    try { localStorage.removeItem('drumup.vr.drum-layout.v1'); } catch { /* Storage can be unavailable. */ }
    const rhythmSurfaces = captureRhythmSurfaces(kit.hitSurfaces);
    const laneEye = new THREE.Vector3(0, 1.35, VR_SEATING.playerZ);
    let noteLanes: ReturnType<typeof createVRNoteLanes> | null = null;
    const interaction = createVRDrumInteraction(kit);
    const hardware = createVRHardwareInstances(kit.group);
    let disposed = false;
    let audioReady = false;
    let highway: ReturnType<typeof createVRNoteHighway> | null = null;
    const musicAudio = createVRMusicAudio();
    const songCountdown = createVRSongCountdown(scene);
    let musicTransport: VRMusicTransport | null = null;
    let musicRequest = 0;
    let scoreMedia: { audio: HTMLAudioElement; url: string; offset: number } | undefined;
    const releaseScoreMedia = () => {
      if (!scoreMedia) return;
      scoreMedia.audio.pause();
      scoreMedia.audio.removeAttribute('src');
      scoreMedia.audio.load();
      URL.revokeObjectURL(scoreMedia.url);
      scoreMedia = undefined;
    };
    let sessionMode: XRMode = 'vr';
    let previousTime: number | null = null;
    const isVisibleXR = () => renderer.xr.getSession()?.visibilityState === 'visible';
    const triggerKick = createKickTrigger(() => audioReady && drumSynth.isAudioRunning() && !disposed,
      (id, velocity) => interaction.hit(id, velocity));
    const hitDrum = (id: string, velocity = 1, now = performance.now(), hand?: StickHand) => {
      if (entrance) return false;
      const played = id === 'kick' ? triggerKick(velocity) : interaction.hit(id, velocity);
      if (played && (isVisibleXR() || tutorial.active)) {
        if (hand && isVisibleXR()) controllers.pulse(hand);
        if (id === 'kick' && tutorial.active) tutorial.kick();
        const judgment = tutorial.active ? tutorial.strike(id, now) : highway?.strike(id, now);
        if (judgment === 'Perfect' || judgment === 'Great') {
          drumSynth.playRhythmSuccess(judgment === 'Perfect');
        }
      }
      return played;
    };
    const pedalGripGate = createPedalGripGate();
    const playPedalKick = (velocity: number) => hitDrum('kick', velocity);
    kickRef.current = velocity => {
      const session = renderer.xr.getSession();
      // A headset's DOM may be hidden while immersive WebXR is active.
      const visible = session ? session.visibilityState === 'visible' : document.visibilityState === 'visible';
      return visible && playPedalKick(velocity);
    };
    hiHatRef.current = pressed => {
      if (entrance) return false;
      const session = renderer.xr.getSession();
      const visible = session ? session.visibilityState === 'visible' : document.visibilityState === 'visible';
      interaction.setHiHatClosed(visible && pressed);
      tutorial.setClosed(visible && pressed);
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
    const musicPlayer = createVRMusicPlayer(scene, rig, {
      onToggle: () => { if (musicTransport && isVisibleXR()) highway?.toggle(performance.now()); },
      onSeek: delta => {
        if (!musicTransport || !isVisibleXR()) return;
        const position = THREE.MathUtils.clamp(musicTransport.currentTime-musicTransport.preroll+delta,0,musicTransport.duration-.02);
        highway?.seekTo(musicTransport.preroll+position,performance.now());
      },
    });
    const unifiedPanel = createVRUnifiedPanel(scene, rig, kit.group, {
      footPedal: () => footPedal,
      player: musicPlayer,
      getDrumHeight:()=>drumHeight,
      onDrumHeight:setDrumHeight,
      background: initialBackground.current,
      onBackground: id => { backgrounds.select(id); setBackground(id); },
      getVolume: () => drumSynth.getVolume(), setVolume: volume => drumSynth.setVolume(volume),
      maxTextureSize: renderer.capabilities.maxTextureSize, maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
      getSongPreview: musicAudio.previewStatus,
      onTutorial: () => openTutorial(),
      onNoteSync: milliseconds => { if (musicTransport) highway?.setNoteSyncMs(milliseconds); },
      onSongPreviewStop: () => { musicRequest++; musicAudio.stopPreview(); },
      onSongPreview: async selectedSong => {
        musicRequest++;
        highway?.stop();
        if (noteLanes) noteLanes.lines.visible = false;
        await musicAudio.togglePreview(selectedSong);
      },
      onSongStart: async (selectedSong, chartOffsetSeconds) => {
        const request = ++musicRequest;
        musicAudio.stopPreview();
        // Resume synchronously from the actual XR Trigger activation, before fetching.
        await musicAudio.unlock();
        const chart = await loadVRMusicChart(selectedSong);
        if (disposed || request !== musicRequest || !isVisibleXR() || !noteLanes) return false;
        const transport = await musicAudio.transport(selectedSong);
        try {
          if (disposed || request !== musicRequest || !isVisibleXR() || !noteLanes) { transport.dispose(); return false; }
          const notes = chart.map(note => ({ ...note, time: note.time + chartOffsetSeconds }));
          highway?.dispose(); musicTransport?.dispose(); musicTransport = transport;
          highway = createVRNoteHighway(scene, rhythmSurfaces, noteLanes.paths,
            (state, judgment) => unifiedPanel.setRhythmStatus(state, judgment), {
              notes, audio: transport, offset: transport.preroll, windows: { perfect: 50, great: 120 },
              noteSyncMs: getNoteSyncMs(), timingDebug: {
                contextAt: time => transport.contextTimeAt(time), outputTime: () => transport.outputTime(),
              },
              onResults: (perfect, great, miss, time) => {
                unifiedPanel.setSongResults(perfect, great, miss, time);
                if (unifiedPanel.state.rhythm === 'finished') {
                  if (noteLanes) noteLanes.lines.visible = false;
                  unifiedPanel.showSongResults(perfect, great, miss);
                }
              },
            });
          noteLanes.lines.visible = true;
          unifiedPanel.setRhythmBpm(selectedSong.bpm);
          console.info('[DRUM UP VR MUSIC] Chart loaded', { song: selectedSong.key, notes: notes.length, chartOffsetSeconds });
          console.table(notes.slice(0, 16).map(note => ({ instrument: note.instrument, chartOffsetSeconds, noteSyncMs: getNoteSyncMs(),
            targetMP3Seconds: note.time + getNoteSyncMs() / 1000,
            spawnSecondsFromStart: Math.max(0, transport.preroll + note.time + getNoteSyncMs() / 1000 - 3),
            arrivalSecondsFromStart: transport.preroll + note.time + getNoteSyncMs() / 1000 })));
          highway.restart(performance.now());
          return true;
        } catch (error) { transport.dispose(); throw error; }
      },
      onViewMode: mode => { void xrActionRef.current(mode); },
      onRhythm: action => {
        if (!isVisibleXR()) return;
        musicRequest++;
        const now = performance.now();
        if (musicTransport) {
          musicRequest++; highway?.dispose(); musicTransport.dispose(); musicTransport = null; songCountdown.hide();
          highway = createDefaultHighway();
          unifiedPanel.setRhythmBpm(song ? songBpmAt(song.chart, 0) : RHYTHM_BPM);
        }
        musicAudio.stopPreview();
        if (action === 'free') {
          highway?.stop();
          if (noteLanes) noteLanes.lines.visible = false;
          unifiedPanel.setSongResults(0, 0, 0, 0);
          return;
        }
        if (noteLanes) noteLanes.lines.visible = true;
        if (action === 'pause') highway?.pause(now);
        else if (action === 'restart') highway?.restart(now);
        else if (unifiedPanel.state.rhythm !== 'playing') highway?.toggle(now);
      },
    });
    function createDefaultHighway() {
      return createVRNoteHighway(scene, rhythmSurfaces, noteLanes!.paths,
        (state, judgment) => unifiedPanel.setRhythmStatus(state, judgment),
        song && scoreMedia ? { ...scoreMedia, notes: song.chart.notes, windows: song.windows,
          onResults: (perfect, great, miss, time) => unifiedPanel.setSongResults(perfect, great, miss, time),
        } : undefined, (perfect, great, miss, time) => unifiedPanel.setSongResults(perfect, great, miss, time));
    }
    let tutorialReturn: { resume: boolean; lanesVisible: boolean; session: XRSession | null; hiHatClosed: boolean } | null = null;
    let tutorialSeen = hasSeenVRTutorial();
    let tutorialPromptSession: XRSession | null = null;
    let desktopHatPressed = false;
    const tutorial = createVRTutorial(scene, kit.hitSurfaces, songCountdown, {
      onView: (view, desktop) => {
        setTutorialOpen(!!view);
        if (desktop) setTutorialView(view);
      },
      onDemoHit: () => { if (audioReady) interaction.hit('hihat', .65); },
      onClose: completed => {
        tutorialSeen ||= completed;
        if (desktopHatPressed) {
          desktopHatPressed = false;
          hiHatRef.current(false);
        }
        unifiedPanel.setTutorialOverlay(null);
        const saved = tutorialReturn;
        tutorialReturn = null;
        if (saved && !saved.session) interaction.setHiHatClosed(saved.hiHatClosed, false);
        highway?.setVisible(true);
        if (noteLanes && saved) noteLanes.lines.visible = saved.lanesVisible;
        if (completed && saved?.session && saved.session === renderer.xr.getSession() && isVisibleXR()) {
          kickDebug?.setImmersive(sessionMode === 'vr');
          if (saved.resume) highway?.toggle(performance.now());
        }
      },
    });
    function openTutorial() {
      if (disposed || entrance || tutorial.active) return;
      const session = renderer.xr.getSession();
      tutorialReturn = { resume: highway?.pause(performance.now()) ?? false,
        lanesVisible: !!noteLanes?.lines.visible, session, hiHatClosed: interaction.isHiHatClosed() };
      if (!session) interaction.setHiHatClosed(false, false);
      tutorial.setClosed(interaction.isHiHatClosed());
      highway?.setVisible(false);
      if (noteLanes) noteLanes.lines.visible = false;
      musicPlayer.hide();
      musicAudio.stopPreview();
      kickDebug?.setImmersive(false);
      unifiedPanel.setTutorialOverlay(tutorial.overlay);
      tutorial.open(!session, sessionMode === 'ar' && !!session);
    }
    tutorialOpenRef.current = () => { void drumSynth.unlock(); openTutorial(); };
    tutorialActionRef.current = action => { void drumSynth.unlock(); tutorial.activate(action); };
    const footPedal = createFootPedal(window, {
      active: () => {
        const session = renderer.xr.getSession();
        return !disposed && !entrance && (session ? session.visibilityState === 'visible' : document.visibilityState === 'visible');
      },
      kick: () => {
        const strike = () => pedalGripGate('pedal', () => kickRef.current(1));
        if (drumSynth.isAudioRunning()) return strike();
        return drumSynth.unlock().then(() => !disposed && strike());
      },
      changed: state => {
        unifiedPanel.setFootPedal(state);
        // Keyboard events continue during immersive XR. Updating the hidden DOM
        // here makes React/layout compete with controller hits and stereo rendering.
        // The in-world panel reads the same live snapshot without a React commit.
        if (!renderer.xr.isPresenting) setFootPedalState(state);
      },
    });
    footPedalRef.current = footPedal;
    backgroundRef.current = id => { backgrounds.select(id); unifiedPanel.setBackground(id); };
    const collisions = createVRAssistedStrikes(kit.hitSurfaces, (id, hand, velocity) => {
      if (audioReady) hitDrum(id, velocity, previousTime ?? performance.now(), hand);
    });
    function setDrumHeight(value:number) {
      const result=saveDrumHeight(value),delta=result.height-drumHeight;drumHeight=result.height;
      applySeatedKitHeight(kit.group,drumHeight);
      // Move visuals immediately, even paused, without resetting transport or score.
      for(const surface of rhythmSurfaces)surface.world.copy(surface.mesh.matrixWorld);
      noteLanes?.shiftHeight(delta);highway?.shiftHeight(delta);
      collisions.refreshSurfaces();controllers.resetSamples();return result;
    }
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
    let rhythmSession: XRSession | null = null;
    let arAvailable = false;
    let preferSharedSession = false;
    let sessionBusy = false;
    let retainedRig: THREE.Vector3 | null = null;
    let resumeAfterSwitch = false;
    let viewTransition: { target: XRMode; start: number | null; applied: boolean } | null = null;
    const pauseHiddenRhythm = () => {
      if (rhythmSession?.visibilityState !== 'visible') {
        highway?.pause(performance.now());
        tutorial.suspend();
      }
    };
    const pauseHiddenDesktopTutorial = () => {
      if (!renderer.xr.isPresenting && document.visibilityState !== 'visible') tutorial.suspend();
    };
    document.addEventListener('visibilitychange', pauseHiddenDesktopTutorial);
    const applyView = (mode: XRMode) => {
      sessionMode = mode;
      scene.background = mode === 'ar' ? null
        : renderer.xr.getSession()?.environmentBlendMode === 'alpha-blend' ? opaqueBackground : vrBackground;
      backgrounds.setVisible(mode === 'vr');
      noteLanes?.setPassthrough(mode === 'ar');
      unifiedPanel.setViewMode(mode, renderer.xr.getSession()?.environmentBlendMode === 'alpha-blend' || arAvailable);
      kickDebug?.setImmersive(mode === 'vr');
      setXRMode(mode);
      setXRMessage(mode === 'ar'
        ? 'AR · 실제 배경 위에서 같은 드럼을 연주합니다.'
        : 'VR · 가상공간에서 드럼을 연주합니다.');
    };
    const startXR = () => {
      if (tutorial.active) tutorial.close(false);
      footPedal.setImmersive(true);
      renderer.domElement.tabIndex = -1; renderer.domElement.focus({ preventScroll: true });
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
        musicPlayer.place(noteLanes.layout);
        noteLanes.lines.visible = unifiedPanel.state.practice === 'RUDIMENT';
        if (song) {
          const media = createSongMedia(song);
          scoreMedia = { ...media, audio: new Audio(media.url) };
          unifiedPanel.setRhythmBpm(songBpmAt(song.chart, -media.offset));
        }
        highway = createDefaultHighway();
      }
      rhythmSession = renderer.xr.getSession();
      controllers.setActive(true);
      rhythmSession?.addEventListener('visibilitychange', pauseHiddenRhythm);
      applyView(sessionMode);
      unifiedPanel.show();
      if (resumeAfterSwitch) highway?.toggle(performance.now());
      resumeAfterSwitch = false;
      setPendingMode(null);
      collisions.reset();
      setImmersive(true);
    };
    const endXR = () => {
      if (tutorial.active) tutorial.close(false);
      tutorialPromptSession = null;
      footPedal.setImmersive(false);
      if (!disposed) setFootPedalState({ ...footPedal.state });
      cancelLook();
      songCountdown.hide();
      musicPlayer.hide();
      kickDebug?.setImmersive(false);
      rhythmSession?.removeEventListener('visibilitychange', pauseHiddenRhythm);
      rhythmSession = null;
      viewTransition = null;
      viewFade.visible = false;
      if (!retainedRig) {
        musicRequest++; musicTransport?.dispose(); musicTransport = null; songCountdown.hide();
        highway?.stop();
        highway?.dispose();
        highway = null;
        releaseScoreMedia();
        noteLanes?.dispose();
        noteLanes = null;
        seating.exit();
      }
      controllers.setActive(false);
      unifiedPanel.hide();
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
        if (openedThroughEntrance && !retainedRig) window.location.replace('#/');
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
    const enterXR = async (target: XRMode | 'exit', pending?: NonNullable<ReturnType<typeof takeVREntranceSession>>) => {
      if (sessionBusy || disposed) return;
      // Resume in this button's user gesture, before awaiting XR permission.
      void drumSynth.unlock();
      if (target !== 'exit') void musicAudio.unlock().catch(error => console.warn('[DRUM UP VR MUSIC] Audio unlock', error));
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
      const tryAR = pending ? pending.mode === 'immersive-ar' : target === 'ar' || (target === 'vr' && preferSharedSession);
      try {
        if (current) {
          await current.end();
        } else if (target !== 'exit' && navigator.xr) {
          requested = await (pending?.request ?? navigator.xr.requestSession(tryAR ? 'immersive-ar' : 'immersive-vr', {
            requiredFeatures: ['local-floor'],
          }));
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

    xrActionRef.current = enterXR;
    // Claim only after the development StrictMode setup/cleanup replay.
    queueMicrotask(() => {
      if (disposed || !openedThroughEntrance) return;
      const pending = takeVREntranceSession();
      if (pending) void enterXR('vr', pending);
    });

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
      entrance?.resize(width, height);
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
      const fittedFov = THREE.MathUtils.radToDeg(2 * Math.atan(tangent / 0.9));
      // Near-camera hardware bounds can push the preview fit close to 180°.
      // Keep the desktop lesson readable without changing the headset camera.
      const tutorialFov = camera.aspect < 1
        ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(52)) / camera.aspect))
        : 76;
      camera.fov = tutorial.active ? Math.min(fittedFov, tutorialFov) : fittedFov;
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
      if (renderer.xr.isPresenting || entrance) return;
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
      if (!renderer.xr.isPresenting && tutorial.step === 'hat-grip' && event.code === 'KeyH' && !event.repeat) {
        event.preventDefault();
        desktopHatPressed = hiHatRef.current(true);
        return;
      }
      const part = tomKeys[event.code];
      const target = event.target;
      if (entrance || !part || event.repeat || event.altKey || event.ctrlKey || event.metaKey
        || (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)))) return;
      void drumSynth.unlock();
      if (audioReady) hitDrum(part);
    };
    const releaseTutorialHat = (event?: KeyboardEvent) => {
      if (!desktopHatPressed || (event && event.code !== 'KeyH')) return;
      desktopHatPressed = false;
      hiHatRef.current(false);
    };
    const blurTutorialHat = () => releaseTutorialHat();
    window.addEventListener('keydown', hitTomKey);
    window.addEventListener('keyup', releaseTutorialHat);
    window.addEventListener('blur', blurTutorialHat);
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
    };
    const worldViewerMatrix = new THREE.Matrix4(), worldViewerQuaternion = new THREE.Quaternion();
    let referenceSpace: XRReferenceSpace | null = null;
    let audioSession: XRSession | null = null;
    const panelPointerWasActive = { left: false, right: false };
    renderer.setAnimationLoop((time, frame) => {
      const frameDelta = previousTime === null ? 0 : (time - previousTime) / 1000;
      const delta = Math.min(frameDelta, 0.05);
      previousTime = time;
      if (entrance) {
        const xr = renderer.xr.isPresenting;
        const reference = renderer.xr.getReferenceSpace();
        const view = entrance.update(time, xr, sessionBusy, frame, reference);
        if (!entrance.active) {
          entrance.dispose();
          entrance = null;
          setEntranceActive(false);
        } else {
          if (view.showPlayScene && xr && frame && reference) seating.update(frame, reference);
          renderer.render(view.showPlayScene ? scene : view.scene, view.showPlayScene ? camera : view.camera);
          return;
        }
      }
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
        detachKickInput = session ? attachXRKickInput(session, () => true,
          (velocity, hand) => controllerKick.current && pedalGripGate('grip', () => hitDrum('kick', velocity, performance.now(), hand)), () => {},
          closed => { interaction.setHiHatClosed(closed, false); tutorial.setClosed(closed); }) : () => {};
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
      footPedal.tick(time);
      if (session && viewer && isVisibleXR() && sessionMode === 'vr' && !song && !tutorialSeen && tutorialPromptSession !== session) {
        tutorialPromptSession = session;
        openTutorial();
      }
      if (!tutorial.active) musicPlayer.update(musicTransport, unifiedPanel.state.rhythm, renderer.xr.isPresenting && isVisibleXR(), time);
      unifiedPanel.update(session, frame, reference, viewer, time);
      controllers.update(frame);
      if (renderer.xr.isPresenting && viewer) {
        const p = viewer.transform.position;
        headPosition.set(p.x, p.y, p.z).applyMatrix4(rig.matrixWorld);
        if (tutorial.active || (musicTransport && isVisibleXR())) {
          worldViewerQuaternion.setFromRotationMatrix(worldViewerMatrix.fromArray(viewer.transform.matrix).premultiply(rig.matrixWorld));
        }
        if (tutorial.active) {
          tutorial.update(time, delta, headPosition, worldViewerQuaternion, isVisibleXR(),
            hand => controllers.tipSamples[hand].valid ? controllers.tipSamples[hand].grip : undefined);
        } else {
          if (!isVisibleXR()) highway?.pause(time);
          noteLanes?.update(time);
          highway?.update(time, headPosition);
          if (musicTransport && isVisibleXR()) {
            songCountdown.update(musicTransport.currentTime, headPosition, worldViewerQuaternion, musicTransport.preroll);
          } else songCountdown.hide();
          if (!musicTransport && song && scoreMedia) unifiedPanel.setRhythmBpm(songBpmAt(song.chart, scoreMedia.audio.currentTime - scoreMedia.offset));
        }
      } else if (!renderer.xr.isPresenting && tutorial.active) {
        camera.getWorldPosition(headPosition);
        camera.getWorldQuaternion(worldViewerQuaternion);
        tutorial.update(time, delta, headPosition, worldViewerQuaternion, document.visibilityState === 'visible', () => undefined);
      } else if (tutorial.active) tutorial.suspend();
      if (renderer.xr.isPresenting && frame && viewer && audioReady) {
        for (const hand of ['left', 'right'] as const) {
          const overPanel = unifiedPanel.isPointing(hand);
          if (overPanel !== panelPointerWasActive[hand]) collisions.reset(hand);
          panelPointerWasActive[hand] = overPanel;
          if (overPanel) { collisions.suspend(hand); continue; }
          collisions.update(hand, controllers.tipSamples[hand], frameDelta, time / 1000, headPosition);
        }
      } else collisions.suspend();
      if (!retainedRig || renderer.xr.isPresenting) interaction.update(delta);
      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      tutorial.dispose();
      tutorialOpenRef.current = () => {};
      tutorialActionRef.current = () => {};
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
      document.removeEventListener('visibilitychange', pauseHiddenDesktopTutorial);
      const session = renderer.xr.getSession();
      if (session) void session.end().catch(() => {});
      controllers.dispose();
      footPedal.dispose(); footPedalRef.current = null;
      unifiedPanel.dispose(); musicPlayer.dispose();
      poseRef.current = () => {};
      xrActionRef.current = async () => {};
      unsubscribeKit();
      interaction.dispose();
      hardware.dispose();
      highway?.dispose();
      musicRequest++; musicTransport?.dispose(); musicAudio.dispose(); songCountdown.dispose();
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
      window.removeEventListener('keyup', releaseTutorialHat);
      window.removeEventListener('blur', blurTutorialHat);
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
      entrance?.dispose();
      environment.dispose();
      renderer.dispose();
      canvas.remove();
      scene.clear();
    };
  }, []);

  const tutorialCopy = tutorialView && tutorialContent(tutorialView);
  return (
    <main className={`vr-practice${entranceActive ? ' is-entrance' : ''}${tutorialOpen ? ' is-tutorial' : ''}`}
      aria-label={entranceActive ? 'DRUM UP VR ZONE' : 'First-person drum practice'}>
      <div className="vr-practice-stage" ref={hostRef} aria-label={entranceActive ? 'DRUM UP' : 'Drum kit — click to strike, drag to look around; hold Shift to look without striking'} />
      <div className="vr-practice-controls" inert={entranceActive || tutorialOpen}>
        <header className="vr-practice-toolbar">
          <a href="#/">Back to DRUM UP</a>
          <span>{xrMode === 'ar' ? 'AR' : 'VR'} PRACTICE · {immersive ? 'HEADSET VIEW' : 'DESKTOP VIEW'}</span>
          <div className="vr-practice-actions">
            <FootPedalSettings state={footPedalState} controller={footPedalRef} />
            <VRPedalPanel onKick={velocity => kickRef.current(velocity)}
              onHiHat={pressed => hiHatRef.current(pressed)} unlock={() => unlockKickRef.current()}
              onButtonMode={enabled => { controllerKick.current = enabled; }} />
            {LOCAL_KICK_ENABLED && <LocalKickReceiver
              onKick={velocity => kickRef.current(velocity)} onStatus={updateKickDebug} />}
            <button onClick={() => resetRef.current()}>Reset view</button>
            {!immersive && <button onClick={() => tutorialOpenRef.current()}>튜토리얼 다시 보기</button>}
            <button disabled={xrBusy || (!immersive && !(pendingMode === 'ar' ? arSupported : xrSupported))}
              title={xrMessage} onClick={() => { void xrActionRef.current(immersive ? 'exit' : pendingMode ?? 'vr'); }}>
              {xrBusy ? 'Connecting…' : immersive ? 'Exit VR' : pendingMode === 'ar' ? 'Enter AR' : xrSupported ? 'Enter VR' : 'VR unavailable'}
            </button>
            {xrMode !== 'ar' && <EnvironmentSwitcher selected={background} onSelect={id => { backgroundRef.current(id); setBackground(id); }} />}
          </div>
        </header>
        <StickControllerPanel immersive={immersive} onChange={(mode, hand, pose) => poseRef.current(mode, hand, pose)} />
        <p className="vr-xr-status">{xrMessage}</p>
        <p className="vr-practice-hint" role="status">{audioStatus}</p>
      </div>
      {tutorialView && tutorialCopy && (
        <section key={tutorialView.step} className="vr-tutorial-desktop" role="dialog" aria-labelledby="vr-tutorial-title">
          <h2 id="vr-tutorial-title">{tutorialCopy.title}</h2>
          <p>{tutorialCopy.lines.join(' ')}</p>
          {tutorialView.step === 'hat-grip' && <p className="vr-tutorial-desktop-hint">H 키를 누르고 놓아 보세요.</p>}
          {tutorialView.step === 'kick' && <p className="vr-tutorial-desktop-hint">킥드럼을 클릭하거나 연결된 페달을 밟아 보세요.</p>}
          {tutorialCopy.hint && <p className="vr-tutorial-desktop-hint" role="status">{tutorialCopy.hint}</p>}
          <div className="vr-tutorial-desktop-actions">
            {tutorialCopy.next && <button onClick={() => tutorialActionRef.current('next')}>{tutorialCopy.next}</button>}
            {tutorialView.step !== 'complete' && <button onClick={() => tutorialActionRef.current('skip')}>건너뛰기</button>}
          </div>
        </section>
      )}
    </main>
  );
}
