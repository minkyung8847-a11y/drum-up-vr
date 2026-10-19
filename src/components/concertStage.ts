import * as THREE from 'three';

// No scene lighting, fog, camera, environment map, or kit settings are changed.
// Only light sticks and simulated spotlight directions animate in this venue.
export function createConcertStage(scene: THREE.Scene) {
  const venue = new THREE.Group();
  venue.name = 'concert-stage-environment';
  // Enlarge the venue around its front edge, leaving the kit and seated camera
  // fixed. The stage lip is now 2.8 m ahead of the kit, facing the audience.
  venue.scale.set(1.4, 1, 1.4);
  venue.position.z = 8.5 * 1.4 - 2.8;
  scene.add(venue);
  const black = new THREE.MeshStandardMaterial({ color: 0x11151b, roughness: 0.7, metalness: 0.35, envMapIntensity: 0.2 });
  const wall = new THREE.MeshBasicMaterial({ color: 0x10131a });
  const steel = new THREE.MeshStandardMaterial({ color: 0x454d57, roughness: 0.48, metalness: 0.75, envMapIntensity: 0.25 });
  const white = new THREE.MeshBasicMaterial({ color: 0xd6e1f4, toneMapped: false });
  const dim = new THREE.MeshBasicMaterial({ color: 0x536178, toneMapped: false });
  const box = new THREE.BoxGeometry(1, 1, 1);
  function block(name: string, x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material = black) {
    const mesh = new THREE.Mesh(box, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    venue.add(mesh);
    return mesh;
  }

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 16.5), new THREE.MeshStandardMaterial({
    color: 0x141820, roughness: 0.32, metalness: 0.5, envMapIntensity: 0.22,
  }));
  floor.name = 'concert-stage-floor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.045, -0.25);
  venue.add(floor);
  const arenaFloor = new THREE.Mesh(new THREE.PlaneGeometry(28, 19.5), new THREE.MeshBasicMaterial({ color: 0x020305 }));
  arenaFloor.name = 'lower-arena-floor';
  arenaFloor.rotation.x = -Math.PI / 2;
  arenaFloor.position.set(0, -0.545, -18.25);
  venue.add(arenaFloor);
  block('stage-front-fascia', 0, -0.28, -8.5, 24, 0.45, 0.3);
  block('stage-front-led', 0, 0.03, -8.35, 22, 0.045, 0.04, white);
  block('back-wall', 0, 5, -27, 28, 10, 0.4, wall);
  block('rear-stage-wall', 0, 5, 7, 28, 10, 0.4, wall);
  block('arena-ceiling', 0, 10, -10, 28, 0.2, 34, wall);
  for (const side of [-1, 1]) {
    block('arena-side-wall', side * 14, 5, -10, 0.4, 10, 34, wall);
    for (const z of [-5, -13, -21]) {
      block('structural-pier', side * 12.5, 4.3, z, 0.65, 8.6, 0.8);
      block('pier-white-inlay', side * 12.12, 4.3, z, 0.025, 6.8, 0.06, dim);
    }
    for (const x of [6.2, 9.8]) {
      const monitor = block('stage-monitor', side * x, 0.22, -6.8, 1.2, 0.42, 0.7);
      monitor.rotation.x = -0.18;
      block('monitor-grille', side * x, 0.34, -6.44, 0.95, 0.12, 0.018, dim);
    }
  }

  // Floor joints and inset light arcs establish scale without mirror rendering.
  const grid: number[] = [];
  for (let x = -14; x <= 14; x += 2) {
    grid.push(x, -0.042, 7, x, -0.042, -8.5);
    grid.push(x, -0.542, -8.5, x, -0.542, -26);
  }
  for (let z = -26; z <= 7; z += 2) {
    const y = z < -8.5 ? -0.542 : -0.042;
    grid.push(-14, y, z, 14, y, z);
  }
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
  venue.add(new THREE.LineSegments(gridGeometry, new THREE.LineBasicMaterial({ color: 0x77818d, transparent: true, opacity: 0.12 })));
  for (const radius of [6.4, 7.5]) {
    const arc = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.024, 128), white);
    arc.rotation.x = -Math.PI / 2;
    arc.position.y = -0.04;
    venue.add(arc);
  }

  // Shared instanced tubes for lattice trusses and supports.
  const tubeMatrices: THREE.Matrix4[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  function tube(a: THREE.Vector3, b: THREE.Vector3, radius = 0.025) {
    const delta = b.clone().sub(a);
    tubeMatrices.push(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(up, delta.clone().normalize()),
      new THREE.Vector3(radius, delta.length(), radius)));
  }
  for (const z of [-5, -13, -21]) {
    for (const y of [8.2, 8.6]) for (const dz of [-0.18, 0.18])
      tube(new THREE.Vector3(-12, y, z + dz), new THREE.Vector3(12, y, z + dz));
    for (let x = -12; x < 12; x += 1.5) {
      for (const dz of [-0.18, 0.18]) {
        tube(new THREE.Vector3(x, 8.2, z + dz), new THREE.Vector3(x + 1.5, 8.6, z + dz), 0.018);
        tube(new THREE.Vector3(x, 8.6, z + dz), new THREE.Vector3(x + 1.5, 8.2, z + dz), 0.018);
      }
    }
    for (const side of [-1, 1]) {
      for (const dx of [-0.18, 0.18]) tube(new THREE.Vector3(side * 12 + dx, 0, z), new THREE.Vector3(side * 12 + dx, 8.6, z), 0.045);
      tube(new THREE.Vector3(side * 12, 8.4, -24), new THREE.Vector3(side * 12, 8.4, 5), 0.06);
    }
  }
  const trusses = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), steel, tubeMatrices.length);
  trusses.name = 'instanced-lighting-trusses';
  tubeMatrices.forEach((matrix, index) => trusses.setMatrixAt(index, matrix));
  venue.add(trusses);

  // Receding architectural portals, with restrained illuminated edges.
  const archGeometry = new THREE.TorusGeometry(7, 0.11, 6, 64, Math.PI);
  const archLightGeometry = new THREE.TorusGeometry(6.85, 0.018, 4, 64, Math.PI);
  const archStripMatrices: THREE.Matrix4[] = [];
  for (const [depth, z] of [-12, -14, -16, -18, -20, -22, -24, -26].entries()) {
    const scale = 1 - depth * 0.055;
    const arch = new THREE.Mesh(archGeometry, black);
    arch.scale.setScalar(scale);
    arch.position.set(0, 0.8, z);
    const edge = new THREE.Mesh(archLightGeometry, white);
    edge.scale.setScalar(scale);
    edge.position.set(0, 0.8, z + 0.03);
    venue.add(arch, edge);
    // Small broken white strips echo the reference's receding roof lights.
    for (const angle of [0.18, 0.62, 1.06, 1.50, 1.94, 2.38, 2.82]) {
      archStripMatrices.push(new THREE.Matrix4().compose(new THREE.Vector3(0, 0.8, z + 0.045),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle), new THREE.Vector3(scale, scale, scale)));
    }
  }
  const archStrips = new THREE.InstancedMesh(new THREE.TorusGeometry(6.85, 0.022, 4, 8, 0.13), white, archStripMatrices.length);
  archStripMatrices.forEach((matrix, index) => archStrips.setMatrixAt(index, matrix));
  venue.add(archStrips);

  // Physical LED walls with one small procedural texture, never a venue panorama.
  const ledCanvas = document.createElement('canvas');
  ledCanvas.width = ledCanvas.height = 256;
  const led = ledCanvas.getContext('2d')!;
  led.fillStyle = '#070b14'; led.fillRect(0, 0, 256, 256);
  for (let cloud = 0; cloud < 5; cloud++) {
    const x = 25 + cloud * 51, y = 220 - cloud * 43;
    const glow = led.createRadialGradient(x, y, 0, x, y, 95);
    glow.addColorStop(0, 'rgba(195,207,234,0.52)');
    glow.addColorStop(0.4, 'rgba(120,138,178,0.18)');
    glow.addColorStop(1, 'rgba(70,90,125,0)');
    led.fillStyle = glow; led.fillRect(0, 0, 256, 256);
  }
  for (let i = 0; i < 650; i++) {
    const x = (Math.sin(i * 127.1) * 43758.5) % 1;
    const y = (Math.sin(i * 311.7) * 19642.3) % 1;
    led.fillStyle = `rgba(210,222,250,${0.15 + (i % 7) * 0.1})`;
    led.fillRect(Math.abs(x) * 256, Math.abs(y) * 256, i % 9 === 0 ? 2 : 1, 1);
  }
  const ledTexture = new THREE.CanvasTexture(ledCanvas);
  ledTexture.colorSpace = THREE.SRGBColorSpace;
  const ledMaterial = new THREE.MeshBasicMaterial({ map: ledTexture, color: 0xbac4de, toneMapped: false });
  const ledGeometry = new THREE.PlaneGeometry(5.2, 4.5);
  for (const side of [-1, 1]) for (const z of [-11.5, -17.5, -23.5]) {
    block('led-wall-frame', side * 12.15, 5.1, z, 0.22, 4.9, 5.5);
    const screen = new THREE.Mesh(ledGeometry, ledMaterial);
    screen.name = 'arena-led-screen';
    screen.position.set(side * 12, 5.1, z);
    screen.rotation.y = -side * Math.PI / 2;
    venue.add(screen);
    block('screen-header-light', side * 11.98, 7.45, z, 0.04, 0.045, 4.8, white);
  }

  // A clear central aisle runs from the drum-facing stage edge to the tunnel.
  block('central-audience-aisle', 0, -0.51, -17, 1.35, 0.04, 17, new THREE.MeshBasicMaterial({ color: 0x1b2331 }));
  for (let z = -10; z >= -25; z -= 1.25) block('aisle-step-light', 0, -0.46, z, 1.15, 0.012, 0.035, dim);
  for (const side of [-1, 1]) {
    block('aisle-edge-light', side * 0.7, -0.475, -17, 0.018, 0.018, 17, dim);
    block('aisle-handrail', side * 0.92, 0.35, -16.5, 0.025, 0.025, 15, steel);
    for (let z = -9.5; z >= -24; z -= 1.5) block('aisle-rail-post', side * 0.92, -0.05, z, 0.025, 0.8, 0.025, steel);
    block('front-audience-barrier', side * 5.8, -0.05, -9.15, 9.6, 0.85, 0.06);
    for (const x of [2, 4, 6, 8, 10]) block('front-white-footlight', side * x, 0.06, -8.25, 0.32, 0.12, 0.08, white);
  }
  const nearbyGlints: number[] = [];
  for (let row = 0; row < 16; row++) for (const side of [-1, 1]) for (let column = 0; column < 24; column++) {
    const seed = Math.abs(Math.sin((row * 48 + column * 2 + side + 3) * 78.233));
    const x = side * (1.22 + column * 0.40 + (seed - 0.5) * 0.14);
    const z = -9.8 - row * 0.49 + (seed - 0.5) * 0.16;
    const y = 0.94 + seed * 0.20 + row * 0.012;
    nearbyGlints.push(x + 0.15, y + 0.1 + seed * 0.13, z - 0.02);
  }

  // Tiered arena seating is real 3D geometry, batched into a single draw call.
  const seating: THREE.Matrix4[] = [];
  const glints: number[] = [];
  for (let row = 0; row < 7; row++) {
    const radius = 12 + row * 1.5;
    for (let column = 0; column < 26; column++) {
      const angle = Math.PI * (0.08 + column / 25 * 0.84);
      const x = Math.cos(angle) * radius;
      const z = -3 - Math.sin(angle) * radius;
      const height = 0.4 + row * 0.48;
      seating.push(new THREE.Matrix4().compose(new THREE.Vector3(x, (height - 0.5) / 2, z),
        new THREE.Quaternion().setFromAxisAngle(up, angle + Math.PI / 2), new THREE.Vector3(1.65, height + 0.5, 1.2)));
      for (let person = 0; person < 8; person++) {
        const seed = (Math.sin((row * 208 + column * 8 + person + 1) * 78.233) * 43758.5453) % 1;
        const spread = Math.abs(seed);
        glints.push(x + (spread - 0.5) * 1.45, height + 0.12 + spread * 0.3, z + (person / 8 - 0.5) * 0.7);
      }
    }
  }
  const stands = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: 0x020305 }), seating.length);
  stands.name = 'arena-tiered-seating';
  seating.forEach((matrix, index) => stands.setMatrixAt(index, matrix));
  venue.add(stands);
  // Crossed emissive quads are the visible light sticks themselves, with no
  // characters, supporting rods, or per-stick scene objects. Animate on the GPU.
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 32; glowCanvas.height = 128;
  const glowContext = glowCanvas.getContext('2d')!;
  const glowGradient = glowContext.createLinearGradient(0, 0, 32, 0);
  for (const [stop, alpha] of [[0, 0], [0.22, 0.04], [0.4, 0.28], [0.46, 1], [0.54, 1], [0.6, 0.28], [0.78, 0.04], [1, 0]])
    glowGradient.addColorStop(stop, `rgba(255,255,255,${alpha})`);
  glowContext.fillStyle = glowGradient;
  glowContext.fillRect(0, 0, 32, 128);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  const stickGeometry = new THREE.BufferGeometry();
  stickGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.028, 0, 0, 0.028, 0, 0, -0.028, 0.26, 0, 0.028, 0.26, 0,
    0, 0, -0.028, 0, 0, 0.028, 0, 0.26, -0.028, 0, 0.26, 0.028,
  ], 3));
  stickGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1], 2));
  stickGeometry.setIndex([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7]);
  const anchors = [...nearbyGlints, ...glints];
  const count = anchors.length / 3;
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  const amplitudes = new Float32Array(count);
  const brightness = new Float32Array(count);
  const stickMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, glowMap: { value: glowTexture } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float time; attribute float phase; attribute float speed;
      attribute float amplitude; attribute float brightness; varying vec2 vUv;
      varying float vBrightness; varying float vTint;
      void main(){vUv=uv; vBrightness=brightness; vTint=0.5+0.5*sin(phase);
      float angle=sin(time*speed+phase)*amplitude;
      vec3 p=position; p.xy=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p.xy;
      float lean=sin(time*speed*0.73+phase*1.7)*0.09;
      p.yz=mat2(cos(lean),-sin(lean),sin(lean),cos(lean))*p.yz;
      gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(p,1.0);}`,
    fragmentShader: `uniform sampler2D glowMap; varying vec2 vUv;
      varying float vBrightness; varying float vTint;
      void main(){float ends=smoothstep(0.0,0.06,vUv.y)*(1.0-smoothstep(0.94,1.0,vUv.y));
      float alpha=texture2D(glowMap,vUv).a*ends*vBrightness;
      gl_FragColor=vec4(mix(vec3(0.94,0.97,1.0),vec3(0.72,0.84,1.0),vTint),alpha);}`,
  });
  const lightSticks = new THREE.InstancedMesh(stickGeometry, stickMaterial, count);
  lightSticks.name = 'audience-glow-sticks';
  const matrix = new THREE.Matrix4();
  const stickPosition = new THREE.Vector3();
  const identity = new THREE.Quaternion();
  const stickScale = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const seed = Math.abs(Math.sin((i + 1) * 127.1) * 43758.5453) % 1;
    phases[i] = seed * Math.PI * 2;
    speeds[i] = 0.65 + (Math.abs(Math.sin(i * 43.7)) % 1) * 0.75;
    amplitudes[i] = 0.18 + seed * 0.24;
    brightness[i] = 0.45 + (Math.abs(Math.sin(i * 21.3)) % 1) * 0.5;
    stickPosition.fromArray(anchors, i * 3);
    stickScale.set(1, 0.75 + seed * 0.55, 1);
    lightSticks.setMatrixAt(i, matrix.compose(stickPosition, identity, stickScale));
  }
  stickGeometry.setAttribute('phase', new THREE.InstancedBufferAttribute(phases, 1));
  stickGeometry.setAttribute('speed', new THREE.InstancedBufferAttribute(speeds, 1));
  stickGeometry.setAttribute('amplitude', new THREE.InstancedBufferAttribute(amplitudes, 1));
  stickGeometry.setAttribute('brightness', new THREE.InstancedBufferAttribute(brightness, 1));
  lightSticks.computeBoundingSphere();
  if (lightSticks.boundingSphere) lightSticks.boundingSphere.radius += 0.5;
  venue.add(lightSticks);

  // Local haze is confined to beam geometry; global fog would also alter the kit.
  const beamMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
      void main(){vUv=uv; vec4 p=modelViewMatrix*vec4(position,1.0);
      vNormal=normalize(normalMatrix*normal); vView=-p.xyz; gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
      void main(){float edge=pow(abs(dot(normalize(vNormal),normalize(vView))),1.5);
      float fade=smoothstep(0.0,0.24,vUv.y)*(0.45+0.55*vUv.y);
      gl_FragColor=vec4(0.68,0.75,0.88,0.09*edge*fade);}`,
  });
  const beamGeometry = new THREE.CylinderGeometry(0.025, 1, 1, 16, 1, true);
  const fixtureGeometry = new THREE.CylinderGeometry(0.15, 0.20, 0.42, 10);
  const lensGeometry = new THREE.CircleGeometry(0.14, 12);
  const poolCanvas = document.createElement('canvas');
  poolCanvas.width = poolCanvas.height = 64;
  const ctx = poolCanvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(180,200,225,0.13)');
  gradient.addColorStop(0.35, 'rgba(150,175,210,0.055)');
  gradient.addColorStop(1, 'rgba(150,175,210,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  const poolTexture = new THREE.CanvasTexture(poolCanvas);
  const portalCanvas = document.createElement('canvas');
  portalCanvas.width = portalCanvas.height = 64;
  const portalContext = portalCanvas.getContext('2d')!;
  const portalGradient = portalContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  portalGradient.addColorStop(0, 'rgba(225,233,255,0.65)');
  portalGradient.addColorStop(0.25, 'rgba(185,202,242,0.25)');
  portalGradient.addColorStop(1, 'rgba(160,180,225,0)');
  portalContext.fillStyle = portalGradient;
  portalContext.fillRect(0, 0, 64, 64);
  const portalTexture = new THREE.CanvasTexture(portalCanvas);
  const portalGlow = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({
    map: portalTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  portalGlow.position.set(0, 2.5, -26.7);
  venue.add(portalGlow);
  const poolMaterial = new THREE.MeshBasicMaterial({ map: poolTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const poolGeometry = new THREE.PlaneGeometry(4, 7);
  const movingLights: { source: THREE.Vector3; target: THREE.Vector3; beam: THREE.Mesh;
    fixture: THREE.Mesh; lens: THREE.Mesh; pool: THREE.Mesh; phase: number; speed: number }[] = [];
  for (const z of [-5, -13, -21]) for (const side of [-1, 1]) for (const x of [6, 10]) {
    const source = new THREE.Vector3(side * x, 8.1, z);
    const target = new THREE.Vector3(side * (x - 1.6), 0, z + 2.5);
    if (target.z < -8.5) target.y = -0.5;
    const direction = source.clone().sub(target);
    const rotation = new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize());
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.position.copy(source).add(target).multiplyScalar(0.5);
    beam.quaternion.copy(rotation);
    beam.scale.set(1.1, direction.length(), 1.1);
    const fixture = new THREE.Mesh(fixtureGeometry, black);
    fixture.position.copy(source); fixture.quaternion.copy(rotation);
    const lens = new THREE.Mesh(lensGeometry, white);
    lens.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.clone().normalize().negate());
    lens.position.copy(source).addScaledVector(direction.clone().normalize(), -0.22);
    const pool = new THREE.Mesh(poolGeometry, poolMaterial);
    pool.rotation.x = -Math.PI / 2;
    pool.position.copy(target); pool.position.y -= 0.038;
    venue.add(beam, fixture, lens, pool);
    movingLights.push({ source, target, beam, fixture, lens, pool,
      phase: movingLights.length * 1.71, speed: 0.10 + movingLights.length % 4 * 0.015 });
  }
  // A very small brand accent, placed on the remote stage edge only.
  block('stage-orange-accent', 0, 0.035, -8.3, 0.6, 0.018, 0.04,
    new THREE.MeshBasicMaterial({ color: 0xff6d2d, toneMapped: false }));

  const sweep = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const forward = new THREE.Vector3(0, 0, 1);
  return {
    group: venue,
    update(elapsedSeconds: number) {
      // Absolute time keeps motion identical at any frame rate; only one uniform
      // changes for the entire crowd. Spotlight work is bounded to 12 fixtures.
      stickMaterial.uniforms.time.value = elapsedSeconds;
      for (const light of movingLights) {
        sweep.copy(light.target);
        sweep.x += Math.sin(elapsedSeconds * light.speed + light.phase) * 0.85;
        sweep.z += Math.cos(elapsedSeconds * light.speed * 0.79 + light.phase * 1.3) * 1.2;
        direction.copy(light.source).sub(sweep);
        const length = direction.length();
        direction.divideScalar(length);
        rotation.setFromUnitVectors(up, direction);
        light.beam.position.copy(light.source).add(sweep).multiplyScalar(0.5);
        light.beam.quaternion.copy(rotation);
        light.beam.scale.y = length;
        light.fixture.quaternion.copy(rotation);
        light.lens.position.copy(light.source).addScaledVector(direction, -0.22);
        light.lens.quaternion.setFromUnitVectors(forward, direction.negate());
        light.pool.position.copy(sweep); light.pool.position.y -= 0.038;
      }
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      venue.traverse(object => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
        if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Points)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      poolTexture.dispose();
      ledTexture.dispose();
      portalTexture.dispose();
      glowTexture.dispose();
      venue.removeFromParent();
    },
  };
}
