import * as THREE from 'three';
import { BRAND_LOGO_URL } from './brand/BrandLogo';

const PORTAL_Z = -1.65;
const PORTAL_RADIUS = 1.02;
const INTRO_MS = 4000;
const TRANSITION_MS = 1800;
const SWAP_AT = 0.7;
const SESSION_KEY = 'drumup.vr.entrance-seen';

export function hasSeenVREntrance() {
  try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}

export function createVREntrance(playScene: THREE.Scene, onEnter: () => void) {
  const scene = new THREE.Scene();
  const stage = new THREE.Group();
  scene.add(stage);
  // A texture also clears the real-world background on alpha-blend XR sessions.
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  black.needsUpdate = true;
  scene.background = black;
  const desktop = new THREE.PerspectiveCamera(37, 1, .03, 40);
  const headset = new THREE.PerspectiveCamera(50, 1, .03, 40);
  const ease = (value: number, from: number, to: number) => THREE.MathUtils.smoothstep(value, from, to);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(32, 32), new THREE.ShaderMaterial({
    uniforms: { light: { value: 0 }, ringScale: { value: 0 }, rimLight: { value: 0 } },
    vertexShader: `
      varying vec2 floorPoint;
      void main() {
        floorPoint = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      uniform float light, ringScale, rimLight;
      varying vec2 floorPoint;
      void main() {
        vec2 p = floorPoint;
        float r = length(p);
        float halo = exp(-abs(r - ringScale * 1.02) * 9.) * rimLight;
        float disk = (1. - smoothstep(1.76, 1.78, r)) * .026;
        float trim = exp(-abs(r - 1.78) / max(.008, fwidth(r))) * .16;
        float wash = exp(-dot(p * vec2(.43, .28), p * vec2(.43, .28)));
        float streak = exp(-abs(p.x) * 3. - abs(p.y + 1.4) * 1.5);
        float silver = (disk + trim + .058 * wash + .076 * streak) * light
          + halo * .11 * ringScale;
        gl_FragColor = vec4(silver * vec3(.87, .93, 1.), 1.);
      }`,
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = PORTAL_Z;
  stage.add(floor);

  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.ShaderMaterial({
    uniforms: { light: { value: 0 } },
    vertexShader: `
      varying vec2 wall;
      void main() {
        wall = uv * 2. - 1.;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      varying vec2 wall;
      uniform float light;
      void main() {
        vec2 wash = (wall - vec2(.0, -.1)) * vec2(2.9, 2.6);
        vec2 beam = vec2(wall.x + .37 + wall.y * .25, wall.y - .35);
        float silver = .038 * exp(-dot(wash, wash))
          + .048 * exp(-dot(beam * vec2(8., 1.8), beam * vec2(8., 1.8)));
        float edge = (1. - smoothstep(.55, 1., abs(wall.x))) * (1. - smoothstep(.48, 1., abs(wall.y)));
        gl_FragColor = vec4(vec3(.84, .91, 1.) * silver * edge * light, 1.);
      }`,
  }));
  backdrop.position.set(0, 1.38, -3.83);
  stage.add(backdrop);

  function silver(opacity = 0) {
    return new THREE.MeshBasicMaterial({
      color: 0xcbd2dc, transparent: true, opacity, depthWrite: false, toneMapped: false,
    });
  }

  const ring = new THREE.Mesh(new THREE.TorusGeometry(PORTAL_RADIUS, .009, 6, 128), silver());
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, .014, PORTAL_Z);
  stage.add(ring);
  const arcMaterial = silver();
  // Each half starts at floor level and grows toward the crown.
  const arcs = [-1, 1].map(side => {
    const segments = 64;
    const points = Array.from({ length: segments + 1 }, (_, index) => {
      const angle = index / segments * Math.PI / 2;
      return new THREE.Vector3(side * 2.65 * Math.cos(angle), .02 + 2.65 * Math.sin(angle), -3.55);
    });
    const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, .006, 5, false);
    const arc = new THREE.Mesh(geometry, arcMaterial);
    stage.add(arc);
    return { geometry, segments };
  });

  let disposed = false;
  let logoReady = false;
  const logoMap = new THREE.TextureLoader().load(BRAND_LOGO_URL,
    () => { if (!disposed) logoReady = true; },
    undefined, () => { logoReady = true; });
  logoMap.colorSpace = THREE.SRGBColorSpace;
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(3.18, 3.18 * 114 / 621), new THREE.ShaderMaterial({
    uniforms: { mark: { value: logoMap }, opacity: { value: 0 }, sweep: { value: -1 } },
    transparent: true, depthWrite: false,
    vertexShader: `
      varying vec2 markUV;
      void main() {
        markUV = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      uniform sampler2D mark;
      uniform float opacity, sweep;
      varying vec2 markUV;
      void main() {
        vec2 uv = (vec2(103., 243.) + markUV * vec2(621., 114.)) / vec2(842., 596.);
        vec4 source = texture2D(mark, uv);
        float metal = mix(.19, .93, dot(source.rgb, vec3(.2126, .7152, .0722)));
        float edge = max(0., source.a - min(
          texture2D(mark, uv + vec2(.0024, .0033)).a,
          texture2D(mark, uv - vec2(.0024, .0033)).a));
        float offset = (markUV.x + markUV.y * .13 - sweep) * 9.;
        float glint = exp(-offset * offset);
        gl_FragColor = vec4(vec3(metal + glint * (.12 + edge * .5)), source.a * opacity);
        #include <colorspace_fragment>
      }`,
  }));
  logo.position.set(0, 1.45, -3.46);
  stage.add(logo);

  const trailsMaterial = new THREE.LineBasicMaterial({
    color: 0xe1e7ef, transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
  });
  const trailPoints = Array.from({ length: 56 }, (_, i) => {
    const index = Math.floor(i / 2);
    const angle = index * 2.39996;
    const radius = .48 + (index % 8) * .24;
    return new THREE.Vector3(Math.cos(angle) * radius,
      .92 + Math.sin(angle) * radius * .47, -3.6 + (index % 13) * .33 + (i % 2) * (.19 + (index % 4) * .15));
  });
  const trails = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(trailPoints), trailsMaterial);
  stage.add(trails);

  const flash = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { amount: { value: 0 }, white: { value: 0 } },
    vertexShader: `
      varying vec2 screenPoint;
      void main() {
        screenPoint = position.xy;
        gl_Position = vec4(position.xy, 0., 1.);
      }`,
    fragmentShader: `
      uniform float amount, white;
      varying vec2 screenPoint;
      void main() {
        float softWhite = 1. - .34 * smoothstep(0., 1.3, length(screenPoint));
        gl_FragColor = vec4(vec3(white * softWhite), amount);
      }`,
    transparent: true, depthTest: false, depthWrite: false,
  }));
  flash.renderOrder = 3000;
  flash.frustumCulled = false;
  flash.visible = false;
  scene.add(flash);

  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const localRay = new THREE.Ray();
  const inverseStage = new THREE.Matrix4();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
  const hit = new THREE.Vector3();
  const head = new THREE.Vector3();
  const projectedTarget = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  let anchorReady = false;
  let startTime: number | null = null;
  let reveal = 0;
  let transitionStart: number | null = null;
  let transitioning = false;
  let swapped = false;
  let done = false;
  let hover = false;
  let brightness = 0;
  let wasXR = false;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function pointsAtPortal() {
    localRay.copy(ray.ray).applyMatrix4(inverseStage);
    return !!localRay.intersectPlane(floorPlane, hit) &&
      Math.hypot(hit.x, hit.z - PORTAL_Z) <= PORTAL_RADIUS * 1.06;
  }

  function controllerAims(frame: XRFrame, source: XRInputSource, reference: XRReferenceSpace) {
    const pose = frame.getPose(source.targetRaySpace, reference);
    if (!pose) return false;
    const { position, orientation } = pose.transform;
    origin.set(position.x, position.y, position.z);
    rotation.set(orientation.x, orientation.y, orientation.z, orientation.w);
    direction.set(0, 0, -1).applyQuaternion(rotation);
    ray.set(origin, direction);
    return pointsAtPortal();
  }

  function enter() {
    if (reveal < INTRO_MS || transitioning || done) return;
    transitioning = true;
    onEnter();
  }

  return {
    get active() { return !done; },
    get ready() { return reveal >= INTRO_MS && !transitioning && !done; },
    resize(width: number, height: number) {
      desktop.aspect = width / height;
      const tangent = Math.max(Math.tan(THREE.MathUtils.degToRad(18.5)), .39 / desktop.aspect);
      desktop.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tangent));
      desktop.updateProjectionMatrix();
    },
    point(clientX: number, clientY: number, bounds: DOMRect) {
      pointer.set((clientX - bounds.left) / bounds.width * 2 - 1, 1 - (clientY - bounds.top) / bounds.height * 2);
      ray.setFromCamera(pointer, desktop);
      hover = reveal >= INTRO_MS && !transitioning && pointsAtPortal();
      return hover;
    },
    highlightPointer() { hover = true; },
    clearPointer() { hover = false; },
    desktopTargetY() {
      projectedTarget.set(0, 0, PORTAL_Z).project(desktop);
      return `${(1 - projectedTarget.y) * 50}%`;
    },
    enter,
    select(event: XRInputSourceEvent, reference: XRReferenceSpace | null) {
      if (anchorReady && reference && event.frame.session.visibilityState === 'visible' &&
        controllerAims(event.frame, event.inputSource, reference)) enter();
    },
    update(time: number, delta: number, xr: boolean, frame?: XRFrame, reference?: XRReferenceSpace | null) {
      if (xr !== wasXR) {
        wasXR = xr;
        anchorReady = false;
        stage.position.set(0, 0, 0);
        stage.rotation.y = 0;
        inverseStage.identity();
        hover = false;
        // Ending a headset session during the fade returns to the desktop portal.
        if (!xr && transitioning) {
          transitioning = false;
          transitionStart = null;
          swapped = false;
          flash.visible = false;
          scene.add(flash);
        }
      }

      const viewer = xr && frame && reference ? frame.getViewerPose(reference) : null;
      let proximity = 0;
      if (viewer) {
        const { position, orientation } = viewer.transform;
        if (!anchorReady) {
          rotation.set(orientation.x, orientation.y, orientation.z, orientation.w);
          direction.set(0, 0, -1).applyQuaternion(rotation);
          stage.position.set(position.x, 0, position.z);
          stage.rotation.y = Math.atan2(-direction.x, -direction.z);
          stage.updateMatrixWorld(true);
          inverseStage.copy(stage.matrixWorld).invert();
          anchorReady = true;
        }
        head.set(position.x, position.y, position.z).applyMatrix4(inverseStage);
        const distance = Math.hypot(head.x, head.z - PORTAL_Z);
        proximity = 1 - ease(distance, .32, 1.45);
        if (frame && reference && frame.session.visibilityState === 'visible') {
          if (!viewer.emulatedPosition && distance <= .32) enter();
          if (!transitioning && reveal >= INTRO_MS) {
            for (const source of frame.session.inputSources) {
              if (controllerAims(frame, source, reference)) { proximity = 1; break; }
            }
          }
        }
      }

      startTime ??= time;
      if (logoReady || time - startTime >= 1000) reveal = Math.max(reveal, time - startTime);
      const floorLight = ease(reveal, 2500, INTRO_MS);
      const arcProgress = ease(reveal, 1500, 3000);
      for (const { geometry, segments } of arcs)
        geometry.setDrawRange(0, Math.floor(arcProgress * segments) * 30);
      if (transitioning) transitionStart ??= time;
      const progress = transitionStart === null ? 0 : Math.min((time - transitionStart) / TRANSITION_MS, 1);
      const darken = 1 - ease(progress, .05, .64);
      brightness = THREE.MathUtils.damp(brightness, xr ? proximity : Number(hover), 7, delta);
      const ringScale = Math.max(.001, floorLight * (1 - ease(progress, 0, .52)));
      floor.material.uniforms.light.value = floorLight * darken;
      backdrop.material.uniforms.light.value = ease(reveal, 900, INTRO_MS) * darken;
      floor.material.uniforms.ringScale.value = ringScale;
      floor.material.uniforms.rimLight.value = floorLight * darken * (.7 + brightness * .3);
      ring.scale.setScalar(ringScale);
      ring.material.opacity = floorLight * darken * (.66 + brightness * .34);
      arcMaterial.opacity = .76 * ease(reveal, 1500, 1800) * darken;
      logo.material.uniforms.opacity.value = ease(reveal, 0, 1500) * darken;
      logo.material.uniforms.sweep.value = THREE.MathUtils.lerp(-.3, 1.4, ease(reveal, 120, 1480));

      if (!xr) {
        const push = reducedMotion ? 0 : ease(progress, .13, SWAP_AT);
        const dolly = reducedMotion ? 0 : .18 * floorLight;
        desktop.position.set(0, 1.43 - .99 * push, 5.03 - dolly - 6.19 * push);
        desktop.lookAt(0, 1.19 - 1.16 * push, -2.7 + 1.05 * push);
        desktop.updateMatrixWorld();
        trails.visible = !reducedMotion && progress > .18;
        trails.position.z = 4.6 * push;
        trailsMaterial.opacity = .52 * ease(progress, .18, .4) * (1 - ease(progress, .51, SWAP_AT));
      } else trails.visible = false;

      flash.visible = progress > 0 && progress < 1;
      flash.material.uniforms.white.value = Number(!xr && !reducedMotion);
      flash.material.uniforms.amount.value = ease(progress, xr ? .28 : .51, SWAP_AT) *
        (1 - ease(progress, SWAP_AT, 1));
      if (progress >= SWAP_AT && !swapped) {
        swapped = true;
        playScene.add(flash);
      }
      if (progress >= 1) {
        done = true;
        try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* Storage may be disabled. */ }
      }
      return { scene, camera: xr ? headset : desktop, showPlayScene: swapped };
    },
    dispose() {
      disposed = true;
      flash.removeFromParent();
      flash.geometry.dispose();
      flash.material.dispose();
      stage.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          if (object.material !== arcMaterial) object.material.dispose();
        }
      });
      arcMaterial.dispose();
      logoMap.dispose();
      black.dispose();
    },
  };
}
