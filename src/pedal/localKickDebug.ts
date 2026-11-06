import * as THREE from 'three';
import type { PedalState } from './PedalConnection';
import { connectionLabels } from './usePedalConnection';

export function createLocalKickDebug(scene: THREE.Scene) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(.48, .24),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  panel.name = 'lan-kick-debug';
  panel.position.set(.98, 1.22, -.75);
  panel.rotation.y = -.22;
  panel.visible = false;
  scene.add(panel);
  let immersive = false;
  let enabled = false;
  let previous = '';
  const clock = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return {
    setImmersive(value: boolean) {
      immersive = value;
      panel.visible = immersive && enabled;
    },
    update(state: PedalState) {
      enabled = state.status !== 'offline';
      panel.visible = immersive && enabled;
      if (!enabled) return;
      const lines = [
        `WebSocket · ${connectionLabels[state.status]}`,
        `킥 수신 · ${state.receivedKicks}회`,
        `마지막 입력 · ${state.lastKickAt === null ? '—' : clock.format(state.lastKickAt)}`,
        `킥 실행 · ${state.lastKickPlayed === null ? '입력 대기' : state.lastKickPlayed ? '실행됨' : '미실행'}`,
      ];
      const next = lines.join('\n');
      if (next === previous) return;
      previous = next;
      ctx.fillStyle = '#111820';
      ctx.fillRect(0, 0, 512, 256);
      ctx.fillStyle = '#82e9da';
      ctx.font = 'bold 29px system-ui';
      ctx.fillText('DRUM UP / LAN KICK', 24, 45);
      ctx.fillStyle = '#e8eef4';
      ctx.font = '26px system-ui';
      lines.forEach((line, index) => ctx.fillText(line, 24, 90 + 42 * index));
      texture.needsUpdate = true;
    },
    dispose() {
      panel.removeFromParent();
      panel.geometry.dispose();
      panel.material.dispose();
      texture.dispose();
    },
  };
}
