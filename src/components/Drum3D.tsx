import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import * as THREE from "three";
import { createVirtualDrumSet } from "./virtualDrumSet";

export type Drum3DPartId = "kick" | "snare" | "hihat" | "tom1" | "tom2" | "tom3" | "crash" | "ride";

export interface Drum3DHandle {
  hitDrum: (partId: Drum3DPartId) => void;
}

interface Drum3DProps {
  onPartClick?: (partId: Drum3DPartId) => void;
  onDrumPositionsUpdate?: (positions: Record<Drum3DPartId, { x: number; y: number }>) => void;
}

// Maps internal drum set IDs to external standard pad IDs
const INTERNAL_TO_EXTERNAL: Record<string, Drum3DPartId> = {
  kick: "kick",
  snare: "snare",
  hihat: "hihat",
  openHihat: "hihat",
  smallTom: "tom1",
  middleTom: "tom2",
  floorTom: "tom3",
  crash: "crash",
  ride: "ride",
};

const EXTERNAL_TO_INTERNAL: Record<Drum3DPartId, string> = {
  kick: "kick",
  snare: "snare",
  hihat: "hihat",
  tom1: "smallTom",
  tom2: "middleTom",
  tom3: "floorTom",
  crash: "crash",
  ride: "ride",
};

export const Drum3D = forwardRef<Drum3DHandle, Drum3DProps>(({ onPartClick, onDrumPositionsUpdate }, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const drumSetRef = useRef<any>(null);
  
  // Keep ref to callback to prevent re-initializing Three.js when callback updates
  const onPartClickRef = useRef(onPartClick);
  useEffect(() => {
    onPartClickRef.current = onPartClick;
  }, [onPartClick]);

  const onDrumPositionsUpdateRef = useRef(onDrumPositionsUpdate);
  useEffect(() => {
    onDrumPositionsUpdateRef.current = onDrumPositionsUpdate;
  }, [onDrumPositionsUpdate]);

  // Expose trigger control to parent
  useImperativeHandle(ref, () => ({
    hitDrum(partId: Drum3DPartId) {
      console.log(`[Drum3D] hitDrum method called for: ${partId}, drumSetRef.current is:`, !!drumSetRef.current);
      if (drumSetRef.current) {
        const internalId = EXTERNAL_TO_INTERNAL[partId];
        console.log(`[Drum3D] Invoking 3D scene hit for: ${internalId}`);
        drumSetRef.current.hit(internalId, 1.0);
      }
    }
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene setup
    const scene = new THREE.Scene();

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 2. Camera setup - centered on the 3D drum kit bounds
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 20);
    camera.position.set(0, 2.05, 2.45);
    camera.lookAt(0, 0.95, 0.15);

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // 4. Lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.95);
    dirLight.position.set(3, 6, 4);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.bias = -0.001;
    scene.add(dirLight);

    // Spotlight to accent chrome and cymbal specular gradients
    const spotLight = new THREE.SpotLight(0xffffff, 1.2, 10, Math.PI / 6, 0.5, 1);
    spotLight.position.set(0, 5, 2);
    scene.add(spotLight);

    // 5. Initialize the high-fidelity procedural 3D Drum Set
    const virtualDrum = createVirtualDrumSet(scene);
    drumSetRef.current = virtualDrum;

    // 6. Raycast Mouse interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleMouseDown = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(virtualDrum.raycastTargets, true);

      if (intersects.length > 0) {
        let intersectedObj: THREE.Object3D | null = intersects[0].object;
        while (intersectedObj) {
          if (intersectedObj.userData && intersectedObj.userData.drumType) {
            const drumType = intersectedObj.userData.drumType;
            virtualDrum.hit(drumType, 1.0);
            
            if (onPartClickRef.current) {
              const externalId = INTERNAL_TO_EXTERNAL[drumType];
              if (externalId) onPartClickRef.current(externalId);
            }
            break;
          }
          intersectedObj = intersectedObj.parent;
        }
      }
    };

    renderer.domElement.addEventListener("mousedown", handleMouseDown);

    // 7. Animation Loop
    let reqId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      reqId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      virtualDrum.update(delta);
      renderer.render(scene, camera);
    };

    animate();

    // 8. Projection calculation
    const updateProjectedPositions = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;

      const positions3D: Record<Drum3DPartId, [number, number, number]> = {
        crash: [-0.88, 1.32, 0.02],
        hihat: [-0.82, 0.94, 0.28],
        kick: [0.0, 0.39, 0.282],
        ride: [0.86, 1.18, 0.1],
        snare: [-0.50, 0.72, 0.36],
        tom1: [-0.26, 0.98, 0.02],
        tom2: [0.26, 0.98, 0.02],
        tom3: [0.60, 0.7, 0.32],
      };

      const projected: Record<string, { x: number; y: number }> = {};
      const tempV = new THREE.Vector3();

      (Object.keys(positions3D) as Drum3DPartId[]).forEach((partId) => {
        const pos = positions3D[partId];
        tempV.set(pos[0], pos[1], pos[2]);
        tempV.project(camera);
        projected[partId] = {
          x: (tempV.x * 0.5 + 0.5) * w,
          y: (-(tempV.y * 0.5) + 0.5) * h,
        };
      });

      if (onDrumPositionsUpdateRef.current) {
        onDrumPositionsUpdateRef.current(projected as Record<Drum3DPartId, { x: number; y: number }>);
      }
    };

    // Calculate initially and after a short delay for container layout stabilization
    updateProjectedPositions();
    const initTimer1 = setTimeout(updateProjectedPositions, 0);
    const initTimer2 = setTimeout(updateProjectedPositions, 300);

    // 9. Handle Resize
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      updateProjectedPositions();
    };

    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      clearTimeout(initTimer1);
      clearTimeout(initTimer2);
      window.removeEventListener("resize", handleResize);
      if (renderer.domElement) {
        renderer.domElement.removeEventListener("mousedown", handleMouseDown);
        if (container) {
          container.removeChild(renderer.domElement);
        }
      }
      cancelAnimationFrame(reqId);
      scene.clear();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        position: "relative",
        cursor: "pointer",
        minHeight: "480px",
      }}
    />
  );
});

Drum3D.displayName = "Drum3D";
