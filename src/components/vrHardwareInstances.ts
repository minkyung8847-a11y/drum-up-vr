import * as THREE from 'three';

// Render repeated, static lug hardware with identical geometry/materials in
// instances. Keep source meshes in place for inspection and future unbatching.
// Heads, cymbals, shells, pedals and all animated feedback remain independent.
export function createVRHardwareInstances(kit: THREE.Group) {
  kit.updateWorldMatrix(true, true);
  const batches = new Map<string, { anchor: THREE.Group; meshes: THREE.Mesh[] }>();
  const geometryKeys = new Map<THREE.BufferGeometry, string>();
  const attributesKey = (geometry: THREE.BufferGeometry) => {
    let key = geometryKeys.get(geometry);
    if (key) return key;
    const hash = (array: ArrayBufferView) => {
      let value = 2166136261;
      for (const byte of new Uint8Array(array.buffer, array.byteOffset, array.byteLength)) value = Math.imul(value ^ byte, 16777619);
      return `${array.byteLength}:${value >>> 0}`;
    };
    key = Object.entries(geometry.attributes).map(([name, attribute]) => `${name}:${hash(attribute.array)}`).join('|')
      + (geometry.index ? `|index:${hash(geometry.index.array)}` : '');
    geometryKeys.set(geometry, key);
    return key;
  };
  kit.traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material) || !object.visible) return;
    const parent = object.parent;
    const anchor = parent?.parent;
    if (!(parent instanceof THREE.Group) || !(anchor instanceof THREE.Group)
      || !parent.userData.drumType || parent.userData.drumType !== anchor.userData.drumType) return;
    const key = `${anchor.uuid}:${object.material.uuid}:${object.castShadow}:${object.receiveShadow}:${attributesKey(object.geometry)}`;
    const batch = batches.get(key) ?? { anchor, meshes: [] as THREE.Mesh[] };
    batch.meshes.push(object); batches.set(key, batch);
  });
  const root = new THREE.Group(); root.name = 'vr-static-hardware-instances';
  const matrix = new THREE.Matrix4();
  const hidden: THREE.Mesh[] = [];
  const instanceMeshes: THREE.InstancedMesh[] = [];
  for (const { anchor, meshes } of batches.values()) {
    if (meshes.length < 3) continue;
    const first = meshes[0];
    // Hashes only group candidates. Verify equal buffers before sharing them.
    const identical = meshes.every(mesh => {
      const a = first.geometry, b = mesh.geometry;
      return Object.keys(a.attributes).every(name => {
        const x = a.attributes[name].array, y = b.attributes[name].array;
        return x.length === y.length && x.every((value, index) => value === y[index]);
      }) && (!a.index || (b.index && a.index.array.every((value, index) => value === b.index!.array[index])));
    });
    if (!identical) continue;
    const instances = new THREE.InstancedMesh(first.geometry, first.material, meshes.length);
    instances.name = 'vr-lug-hardware';
    instances.castShadow = first.castShadow; instances.receiveShadow = first.receiveShadow;
    const inverse = anchor.matrixWorld.clone().invert();
    meshes.forEach((mesh, index) => {
      matrix.multiplyMatrices(inverse, mesh.matrixWorld);
      instances.setMatrixAt(index, matrix);
      mesh.visible = false; hidden.push(mesh);
    });
    instances.instanceMatrix.needsUpdate = true;
    instances.computeBoundingSphere();
    anchor.add(instances);
    instanceMeshes.push(instances);
  }
  kit.add(root);
  return {
    instances: root,
    instanceMeshes,
    sourceMeshes: hidden,
    dispose() {
      hidden.forEach(mesh => { mesh.visible = true; });
      instanceMeshes.forEach(mesh => { mesh.removeFromParent(); mesh.dispose(); });
      root.removeFromParent();
    },
  };
}
