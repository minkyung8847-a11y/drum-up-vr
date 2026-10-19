import * as THREE from 'three';
import { createConcertStage } from './concertStage';

// A second, world-space venue. The original stage floor, crowd and white moving
// fixtures provide the same perspective; sky/islands are geometry, not a backdrop.
export function createCloudConcert(scene: THREE.Scene) {
  const group = new THREE.Group();
  group.name = 'cloud-concert-environment';
  scene.add(group);
  const stage = createConcertStage(scene);
  group.add(stage.group);
  const openSkyParts = new Set(['back-wall', 'rear-stage-wall', 'arena-ceiling', 'arena-side-wall',
    'structural-pier', 'pier-white-inlay', 'arena-led-screen', 'led-wall-frame', 'screen-header-light']);
  stage.group.traverse(object => {
    if (openSkyParts.has(object.name)) object.visible = false;
    // The open-air venue replaces the original tunnel with distant floating stages.
    if (object instanceof THREE.Mesh && object.geometry instanceof THREE.TorusGeometry &&
      object.geometry.parameters.radius > 6) object.visible = false;
  });
  const scenery = new THREE.Group();
  scenery.name = 'cloud-arena-scenery';
  group.add(scenery);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(28, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vDirection; void main(){vDirection=normalize(position);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 vDirection; void main(){float h=normalize(vDirection).y;
      vec3 horizon=vec3(0.19,0.15,0.22); vec3 zenith=vec3(0.018,0.035,0.075);
      vec3 c=mix(horizon,zenith,smoothstep(-0.04,0.62,h));
      c=mix(vec3(0.025,0.035,0.06),c,smoothstep(-0.4,0.0,h)); gl_FragColor=vec4(c,1.0);}`,
  }));
  sky.name = 'cloud-arena-sky';
  sky.position.set(0, 1.55, 1.6);
  sky.renderOrder = -100;
  scenery.add(sky);

  const planet = new THREE.Mesh(new THREE.SphereGeometry(5.8, 36, 24), new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vNormal; void main(){vNormal=normal;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 vNormal; void main(){vec3 n=normalize(vNormal);
      float terrain=sin(n.x*32.0+sin(n.y*19.0)*3.0)*sin(n.z*27.0+n.y*16.0);
      float light=0.25+0.75*max(0.0,dot(n,normalize(vec3(-0.8,-0.2,1.0))));
      vec3 c=mix(vec3(0.035,0.055,0.11),vec3(0.16,0.19,0.28),terrain*0.5+0.5)*light;
      gl_FragColor=vec4(c,1.0);}`,
  }));
  planet.name = 'distant-arena-planet';
  planet.position.set(10, 7, -17);
  scenery.add(planet);
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(5.87, 36, 24), new THREE.MeshBasicMaterial({
    color: 0x819bbc, side: THREE.BackSide, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false,
  }));
  atmosphere.position.copy(planet.position);
  scenery.add(atmosphere);

  const rock = new THREE.MeshStandardMaterial({ color: 0x414653, roughness: 0.95, metalness: 0.05, envMapIntensity: 0.3, flatShading: true });
  const metal = new THREE.MeshStandardMaterial({ color: 0x333a48, roughness: 0.45, metalness: 0.7, envMapIntensity: 0.25 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xcbd9e8, toneMapped: false });
  const warm = new THREE.MeshBasicMaterial({ color: 0xb79584, toneMapped: false });
  const cone = new THREE.ConeGeometry(1, 1, 11, 4);
  const vertices = cone.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
    const relief = 1 + 0.18 * Math.sin(x * 13 + z * 9 + y * 17);
    vertices.setXYZ(i, x * relief + 0.12 * (y + 0.5), y, z * relief);
  }
  cone.computeVertexNormals();
  const platform = new THREE.CylinderGeometry(1, 1, 0.12, 32);
  const ring = new THREE.TorusGeometry(1, 0.012, 5, 48);
  const gate = new THREE.TorusGeometry(0.6, 0.035, 6, 32, Math.PI);
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform float time; varying vec2 vUv;
      void main(){float edge=pow(max(0.0,sin(vUv.x*3.14159)),2.0);
      float streak=0.5+0.5*sin(vUv.x*95.0+sin(vUv.y*19.0+time)*0.8);
      float fade=smoothstep(0.0,0.2,vUv.y);
      gl_FragColor=vec4(0.6,0.75,0.9,edge*fade*(0.035+streak*0.07));}`,
  });
  const waterGeometry = new THREE.PlaneGeometry(0.35, 3.5);
  for (const [index, [x, y, z, size]] of [
    [-6, 3.5, -11, 1.5], [7, 4.1, -13, 1.8], [-11, 6, -18, 1.5],
    [3.8, 5.6, -21, 1.3], [-3.5, 3.1, -23, 1.1], [12, 2.6, -18, 1.6],
  ].entries()) {
    const island = new THREE.Group();
    island.name = 'floating-concert-platform';
    island.position.set(x, y, z);
    const stone = new THREE.Mesh(cone, rock);
    stone.rotation.z = Math.PI;
    stone.scale.set(size, size * 1.8, size);
    stone.position.y = -size * 0.9;
    const deck = new THREE.Mesh(platform, metal);
    deck.scale.set(size, 1, size);
    const rim = new THREE.Mesh(ring, index % 3 === 0 ? warm : glow);
    rim.rotation.x = Math.PI / 2;
    rim.scale.setScalar(size);
    rim.position.y = 0.08;
    const arch = new THREE.Mesh(gate, glow);
    arch.position.y = 0.12;
    arch.scale.setScalar(size);
    const waterfall = new THREE.Mesh(waterGeometry, waterMaterial);
    waterfall.position.set(size * 0.55, -1.7, size * 0.75);
    waterfall.rotation.y = x > 0 ? -0.4 : 0.4;
    island.add(stone, deck, rim, arch, waterfall);
    scenery.add(island);
  }
  const cloudMatrices: THREE.Matrix4[] = [];
  for (let i = 0; i < 40; i++) {
    const seed = Math.abs(Math.sin(i * 78.233 + 1));
    cloudMatrices.push(new THREE.Matrix4().compose(
      new THREE.Vector3(-22 + (i % 10) * 4.8, 0.2 + seed * 1.2, -13 - Math.floor(i / 10) * 3.4),
      new THREE.Quaternion(), new THREE.Vector3(2.5 + seed, 0.65 + seed * 0.3, 1.5 + seed)));
  }
  const clouds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0x8c91a8, transparent: true, opacity: 0.10, depthWrite: false }), cloudMatrices.length);
  cloudMatrices.forEach((matrix, index) => clouds.setMatrixAt(index, matrix));
  scenery.add(clouds);
  return {
    group,
    update(time: number) { stage.update(time); waterMaterial.uniforms.time.value = time; },
    dispose() {
      stage.dispose();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scenery.traverse(object => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      group.removeFromParent();
    },
  };
}
