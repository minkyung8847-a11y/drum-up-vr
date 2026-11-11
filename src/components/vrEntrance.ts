import * as THREE from 'three';
import { BRAND_LOGO_URL } from './brand/BrandLogo';
import { VR_ENTRANCE_SESSION_KEY } from './vrEntranceNavigation';

const PORTAL_Z = -1.65;
const PORTAL_RADIUS = 1.02;
const TRANSITION_MS = 1300;
const SWAP_AT = 0.7;

export function hasSeenVREntrance() {
  try { return sessionStorage.getItem(VR_ENTRANCE_SESSION_KEY) === '1'; } catch { return false; }
}

export function createVREntrance(playScene: THREE.Scene) {
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
    uniforms: {
      light: { value: 0 }, ringScale: { value: 0 }, rimLight: { value: 0 },
      core: { value: 0 }, wave: { value: 0 },
    },
    vertexShader: `
      varying vec2 floorPoint;
      void main() {
        floorPoint = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      uniform float light, ringScale, rimLight, core, wave;
      varying vec2 floorPoint;
      void main() {
        vec2 p = floorPoint;
        float r = length(p);
        float aroundRing = r - ringScale * 1.02;
        float halo = exp(-abs(aroundRing) * 9.) * rimLight;
        float ripple = exp(-abs(aroundRing - wave * .17) * 27.) * sin(wave * 3.14159);
        float glimmer = (exp(-r * 10.) * .62 + exp(-r * 3.) * .28) * core;
        float disk = (1. - smoothstep(1.76, 1.78, r)) * .026;
        float trim = exp(-abs(r - 1.78) / max(.008, fwidth(r))) * .16;
        float wash = exp(-dot(p * vec2(.43, .28), p * vec2(.43, .28)));
        float streak = exp(-abs(p.x) * 3. - abs(p.y + 1.4) * 1.5);
        float silver = (disk + trim + .058 * wash + .076 * streak) * light
          + (halo * .11 + ripple * rimLight * .046) * ringScale + glimmer;
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

  const particlePositions = Array.from({ length: 18 }, (_, index) => {
    const angle = index * 2.39996;
    const radius = .08 + (index % 9) * .071;
    return new THREE.Vector3(Math.cos(angle) * radius, .06 + (index % 5) * .032,
      PORTAL_Z + Math.sin(angle) * radius);
  });
  const particles = new THREE.Points(new THREE.BufferGeometry().setFromPoints(particlePositions), new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, opacity: { value: 0 } },
    vertexShader: `
      uniform float time;
      varying float twinkle;
      void main() {
        float phase = position.x * 16. + position.z * 27.;
        vec3 point = position;
        point.y += .034 * sin(time * 1.2 + phase);
        twinkle = smoothstep(.18, .97, sin(time * 1.5 + phase));
        vec4 view = modelViewMatrix * vec4(point, 1.);
        gl_Position = projectionMatrix * view;
        gl_PointSize = clamp(15. / -view.z, 1.7, 4.);
      }`,
    fragmentShader: `
      uniform float opacity;
      varying float twinkle;
      void main() {
        float glow = 1. - smoothstep(0., .5, length(gl_PointCoord - .5));
        gl_FragColor = vec4(.9, .94, 1., glow * twinkle * opacity);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  stage.add(particles);
  const arcMaterial = silver();
  for (const side of [-1, 1]) {
    const segments = 64;
    const points = Array.from({ length: segments + 1 }, (_, index) => {
      const angle = index / segments * Math.PI / 2;
      return new THREE.Vector3(side * 2.65 * Math.cos(angle), .02 + 2.65 * Math.sin(angle), -3.55);
    });
    const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, .006, 5, false);
    const arc = new THREE.Mesh(geometry, arcMaterial);
    stage.add(arc);
  }

  const logoMap = new THREE.TextureLoader().load(BRAND_LOGO_URL, () => { logo.visible = true; });
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
  logo.visible = false;
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

  const direction = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  let anchorReady = false;
  let previousTransitionTime: number | null = null;
  let transitionElapsed = 0;
  let heldForXR = false;
  let swapped = false;
  let done = false;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  return {
    get active() { return !done; },
    resize(width: number, height: number) {
      desktop.aspect = width / height;
      const tangent = Math.max(Math.tan(THREE.MathUtils.degToRad(18.5)), .39 / desktop.aspect);
      desktop.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tangent));
      desktop.updateProjectionMatrix();
    },
    update(time: number, xr: boolean, waitingForSession: boolean, frame?: XRFrame, reference?: XRReferenceSpace | null) {
      const viewer = xr && !anchorReady && frame && reference ? frame.getViewerPose(reference) : null;
      if (viewer) {
        const { position, orientation } = viewer.transform;
        rotation.set(orientation.x, orientation.y, orientation.z, orientation.w);
        direction.set(0, 0, -1).applyQuaternion(rotation);
        stage.position.set(position.x, 0, position.z);
        stage.rotation.y = Math.atan2(-direction.x, -direction.z);
        anchorReady = true;
      }

      transitionElapsed += Math.max(0, time - (previousTransitionTime ?? time));
      previousTransitionTime = time;
      // Keep the cut covered if headset permission outlasts the camera move.
      if (waitingForSession && transitionElapsed >= TRANSITION_MS * SWAP_AT) {
        transitionElapsed = TRANSITION_MS * SWAP_AT;
        heldForXR = true;
      }
      const progress = Math.min(transitionElapsed / TRANSITION_MS, 1);
      const darken = 1 - ease(progress, .10, .65);
      const formation = ease(progress, 0, .13);
      const ringScale = Math.max(.001, formation * (1 - ease(progress, .14, .60)));
      const portalLight = 1 - ease(progress, .12, .56);
      const ignition = ease(progress, 0, .09) * (1 - ease(progress, .10, .42));
      floor.material.uniforms.light.value = darken;
      backdrop.material.uniforms.light.value = darken;
      floor.material.uniforms.ringScale.value = ringScale;
      floor.material.uniforms.rimLight.value = darken;
      floor.material.uniforms.core.value = portalLight * .25 + ignition * .64;
      floor.material.uniforms.wave.value = reducedMotion ? 0 : progress;
      particles.visible = !reducedMotion && portalLight > 0 && !xr;
      particles.material.uniforms.time.value = transitionElapsed / 1000;
      particles.material.uniforms.opacity.value = portalLight * .65;
      ring.scale.setScalar(ringScale);
      ring.material.opacity = formation * Math.min(1, darken * .83 + ignition * .40);
      logo.material.uniforms.opacity.value = formation * (1 - ease(progress, .21, .51));
      logo.material.uniforms.sweep.value = THREE.MathUtils.lerp(-.3, 1.4, ease(progress, 0, .40));
      arcMaterial.opacity = .66 * darken;

      if (!xr) {
        const push = reducedMotion ? 0 : ease(progress, .06, SWAP_AT);
        desktop.position.set(0, 1.43 - .99 * push, 4.85 - 6.19 * push);
        desktop.lookAt(0, 1.19 - 1.16 * push, -2.7 + 1.05 * push);
        desktop.updateMatrixWorld();
        trails.visible = !reducedMotion && progress > .18;
        trails.position.z = 4.6 * push;
        trailsMaterial.opacity = .52 * ease(progress, .18, .4) * (1 - ease(progress, .51, SWAP_AT));
      } else trails.visible = false;

      flash.visible = progress > 0 && progress < 1;
      const darkFade = xr || waitingForSession || heldForXR || reducedMotion;
      flash.material.uniforms.white.value = Number(!darkFade);
      flash.material.uniforms.amount.value = ease(progress, darkFade ? .28 : .51, SWAP_AT) *
        (1 - ease(progress, SWAP_AT, 1));
      if (progress >= SWAP_AT && !swapped && !waitingForSession) {
        swapped = true;
        playScene.add(flash);
      }
      if (progress >= 1) {
        done = true;
        try { sessionStorage.setItem(VR_ENTRANCE_SESSION_KEY, '1'); } catch { /* Storage may be disabled. */ }
      }
      return { scene, camera: xr ? headset : desktop, showPlayScene: swapped };
    },
    dispose() {
      flash.removeFromParent();
      flash.geometry.dispose();
      flash.material.dispose();
      stage.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Points) {
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
