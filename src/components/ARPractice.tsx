import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createRestoredVRDrumSet } from './restoredVRDrumSet';
import { createVRDrumInteraction } from './vrDrumInteraction';
import { createStudioEnvironment } from './studioEnvironment';
import { drumSynth } from '../utils/synth';
import './arPractice.css';

type ViewMode = 'idle' | 'camera' | 'xr';

export default function ARPractice() {
  const rootRef = useRef<HTMLElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const startCameraRef = useRef<() => Promise<void>>(async () => {});
  const stopCameraRef = useRef<() => void>(() => {});
  const toggleXRRef = useRef<() => Promise<void>>(async () => {});
  const [mode, setMode] = useState<ViewMode>('idle');
  const [message, setMessage] = useState('카메라를 켜면 실제 배경 위에 드럼이 표시됩니다.');
  const [xrAvailable, setXRAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const host = canvasHostRef.current;
    const video = videoRef.current;
    if (!host || !video) return;

    let disposed = false;
    let stream: MediaStream | null = null;
    let currentMode: ViewMode = 'idle';
    let xrSession: XRSession | null = null;
    let placedInXR = false;
    const scene = new THREE.Scene();
    scene.background = null;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local');
    host.appendChild(renderer.domElement);

    const studio = createStudioEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(studio, 0.015);
    scene.environment = environment.texture;
    studio.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    });
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8d949d, 2));
    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(-2, 4, 3);
    scene.add(key);
    const kit = createRestoredVRDrumSet(scene);
    const interaction = createVRDrumInteraction(kit);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.02, 30);
    camera.position.set(0, 1.3, 2.2);
    camera.lookAt(0, 0.7, 0);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const direction = new THREE.Vector3();
    const viewerPosition = new THREE.Vector3();
    let lastTime = 0;

    const setCurrentMode = (next: ViewMode) => {
      currentMode = next;
      if (!disposed) setMode(next);
    };
    const stopCamera = () => {
      stream?.getTracks().forEach(track => track.stop());
      stream = null;
      video.pause();
      video.srcObject = null;
      if (currentMode === 'camera') setCurrentMode('idle');
    };
    stopCameraRef.current = stopCamera;
    startCameraRef.current = async () => {
      if (currentMode === 'camera' || disposed) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage('이 브라우저에서는 카메라를 사용할 수 없습니다. HTTPS 또는 localhost에서 열어 주세요.');
        return;
      }
      setBusy(true);
      try {
        const acquired = await navigator.mediaDevices.getUserMedia({
          audio: false, video: { facingMode: { ideal: 'environment' } },
        });
        if (disposed) { acquired.getTracks().forEach(track => track.stop()); return; }
        stream = acquired;
        video.srcObject = acquired;
        await video.play();
        setCurrentMode('camera');
        setMessage('드럼을 터치하거나 클릭해서 연주하세요. 카메라 미리보기에서는 드럼이 화면에 고정됩니다.');
        void drumSynth.unlock();
      } catch (error) {
        stopCamera();
        setMessage(`카메라를 시작할 수 없습니다: ${error instanceof Error ? error.message : '접근 권한을 확인해 주세요.'}`);
      } finally {
        if (!disposed) setBusy(false);
      }
    };

    const placeKitInFront = () => {
      const xrCamera = renderer.xr.getCamera();
      xrCamera.getWorldPosition(viewerPosition);
      xrCamera.getWorldDirection(direction);
      direction.y = 0;
      if (direction.lengthSq() < 0.001) direction.set(0, 0, -1);
      direction.normalize();
      kit.group.position.copy(viewerPosition).addScaledVector(direction, 1.8);
      kit.group.position.y = viewerPosition.y - 1.05;
      kit.group.rotation.y = Math.atan2(-direction.x, -direction.z);
      kit.group.updateWorldMatrix(true, true);
      placedInXR = true;
    };
    const onSessionEnd = () => {
      xrSession?.removeEventListener('end', onSessionEnd);
      xrSession = null;
      placedInXR = false;
      kit.group.position.set(0, 0, 0);
      kit.group.rotation.y = 0;
      setCurrentMode('idle');
      if (!disposed) setMessage('AR 세션이 종료되었습니다. 카메라 또는 AR을 다시 시작할 수 있습니다.');
    };
    toggleXRRef.current = async () => {
      if (xrSession) { await xrSession.end(); return; }
      if (!navigator.xr || disposed) return;
      setBusy(true);
      try {
        stopCamera();
        const session = await navigator.xr.requestSession('immersive-ar', {
          optionalFeatures: ['dom-overlay'],
          domOverlay: { root: rootRef.current! },
        });
        if (disposed) { await session.end(); return; }
        xrSession = session;
        session.addEventListener('end', onSessionEnd);
        await renderer.xr.setSession(session);
        setCurrentMode('xr');
        setMessage('실제 공간에 드럼을 배치했습니다. 컨트롤러로 드럼을 선택해 연주하세요.');
        void drumSynth.unlock();
      } catch (error) {
        if (xrSession) await xrSession.end().catch(() => {});
        onSessionEnd();
        if (!disposed) setMessage(`AR을 시작할 수 없습니다: ${error instanceof Error ? error.message : '기기 지원 상태를 확인해 주세요.'}`);
      } finally {
        if (!disposed) setBusy(false);
      }
    };

    if (window.isSecureContext && navigator.xr) {
      void navigator.xr.isSessionSupported('immersive-ar').then(supported => {
        if (!disposed) setXRAvailable(supported);
      }).catch(() => {});
    }
    void drumSynth.prepareKit().catch(() => {
      if (!disposed) setMessage('드럼 소리를 불러오지 못했습니다. 화면을 새로고침해 주세요.');
    });

    const strike = (object: THREE.Object3D | undefined) => {
      let target: THREE.Object3D | null = object ?? null;
      while (target && !target.userData.drumType) target = target.parent;
      const id = target?.userData.drumType as string | undefined;
      if (id) {
        void drumSynth.unlock();
        interaction.hit(id === 'openHihat' ? 'hihat' : id);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (currentMode !== 'camera') return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      strike(raycaster.intersectObjects(kit.raycastTargets, true)[0]?.object);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    const controllers = [renderer.xr.getController(0), renderer.xr.getController(1)];
    const controllerRay = new THREE.Matrix4();
    const onSelect = (controller: THREE.Group) => {
      controllerRay.identity().extractRotation(controller.matrixWorld);
      raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      raycaster.ray.direction.set(0, 0, -1).applyMatrix4(controllerRay);
      strike(raycaster.intersectObjects(kit.raycastTargets, true)[0]?.object);
    };
    const selectHandlers = controllers.map(controller => () => onSelect(controller));
    controllers.forEach((controller, index) => controller.addEventListener('select', selectHandlers[index]));

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height || renderer.xr.isPresenting) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    renderer.setAnimationLoop(time => {
      const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
      lastTime = time;
      if (renderer.xr.isPresenting && !placedInXR) placeKitInFront();
      interaction.update(delta);
      if (currentMode !== 'idle') renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      stopCamera();
      if (xrSession) void xrSession.end();
      renderer.setAnimationLoop(null);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      controllers.forEach((controller, index) => controller.removeEventListener('select', selectHandlers[index]));
      interaction.dispose();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      kit.group.traverse(object => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            materials.add(material);
            for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
          }
        }
      });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      textures.forEach(texture => texture.dispose());
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      startCameraRef.current = async () => {};
      stopCameraRef.current = () => {};
      toggleXRRef.current = async () => {};
    };
  }, []);

  return (
    <main className={`ar-practice${mode === 'idle' ? ' is-idle' : ''}`} ref={rootRef} aria-label="AR 드럼 연습">
      <video ref={videoRef} className="ar-camera" autoPlay muted playsInline aria-hidden="true" />
      <div className="ar-drum-stage" ref={canvasHostRef} aria-label="실제 배경 위의 가상 드럼" />
      <header className="ar-toolbar">
        <a className="ar-home" href="#/">← DRUM UP</a>
        <strong>AR DRUM</strong>
        <a className="ar-vr-link" href="#/vr">VR 버전</a>
      </header>
      {mode === 'idle' && <div className="ar-start">
        <span className="ar-eyebrow">REAL WORLD · VIRTUAL DRUMS</span>
        <h1>내 공간에서<br />드럼을 연주하세요</h1>
        <p>카메라에 보이는 실제 배경 위로 드럼만 나타납니다.</p>
        <button disabled={busy} onClick={() => { void startCameraRef.current(); }}>{busy ? '연결 중…' : '카메라로 시작'}</button>
        {xrAvailable && <button className="ar-secondary" disabled={busy} onClick={() => { void toggleXRRef.current(); }}>공간 AR 시작</button>}
      </div>}
      {mode !== 'idle' && <div className="ar-actions">
        {mode === 'camera' ? <button onClick={() => stopCameraRef.current()}>카메라 종료</button>
          : <button onClick={() => { void toggleXRRef.current(); }}>AR 종료</button>}
      </div>}
      <p className="ar-status" role="status">{message}</p>
    </main>
  );
}
