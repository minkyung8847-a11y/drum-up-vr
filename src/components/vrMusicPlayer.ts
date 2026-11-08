import * as THREE from 'three';
import type { VRMusicTransport } from './vrMusicSong';
import { LOVE_ROOT } from './vrMusicSong';
import type { RhythmState, createVRNoteLanes } from './vrNoteHighway';

export const VR_MUSIC_PLAYER = { width: 1.16, height: .194, heightAboveLine: .48, forwardFromLine: .12,
  canvasWidth: 1152, canvasHeight: 192, refreshMs: 100 } as const;
export const PLAYER_PLAY_BUTTON = { x: 682, y: 36, width: 76, height: 76 };
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2,'0')}`;

export function createVRMusicPlayer(scene: THREE.Scene, onToggle: () => void) {
  const canvas=document.createElement('canvas');canvas.width=VR_MUSIC_PLAYER.canvasWidth;canvas.height=VR_MUSIC_PLAYER.canvasHeight;
  const ctx=canvas.getContext('2d')!, texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;
  const geometry=new THREE.PlaneGeometry(VR_MUSIC_PLAYER.width,VR_MUSIC_PLAYER.height);
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='vr-music-player';mesh.renderOrder=1004;mesh.visible=false;
  // Direct child of the world scene, never the camera, headset, rig or movable panel.
  scene.add(mesh);
  let lastDraw=-Infinity, signature='', dirty=true;
  const cover=new Image();cover.src=`${LOVE_ROOT}cover.jpg`;cover.onload=()=>{dirty=true;};
  function draw(position:number,duration:number,paused:boolean) {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.beginPath();ctx.roundRect(2,2,1148,188,16);ctx.fillStyle='#1d1f24';ctx.fill();ctx.strokeStyle='#9299a5';ctx.lineWidth=2;ctx.stroke();
    const sheen=ctx.createLinearGradient(0,4,0,70);sheen.addColorStop(0,'#ffffff12');sheen.addColorStop(1,'#ffffff00');
    ctx.fillStyle=sheen;ctx.fill();
    ctx.fillStyle='#353a43';ctx.fillRect(26,25,98,98);
    if(cover.complete&&cover.naturalWidth)ctx.drawImage(cover,26,25,98,98);
    ctx.textAlign='left';ctx.fillStyle='#eff1f5';ctx.font='600 33px Arial, "Malgun Gothic", sans-serif';ctx.fillText('사랑으로 (love.)',148,66,490);
    ctx.fillStyle='#adb5c2';ctx.font='25px Arial';ctx.fillText('wave to earth',148,106);
    const button=PLAYER_PLAY_BUTTON;
    ctx.beginPath();ctx.roundRect(button.x,button.y,button.width,button.height,10);
    const metal=ctx.createLinearGradient(0,button.y,0,button.y+button.height);metal.addColorStop(0,'#626975');metal.addColorStop(.5,'#30353e');metal.addColorStop(1,'#484f5a');
    ctx.fillStyle=metal;ctx.fill();ctx.strokeStyle='#aeb5c0';ctx.stroke();ctx.fillStyle='#f4f6fa';
    if(paused){ctx.beginPath();ctx.moveTo(710,55);ctx.lineTo(710,92);ctx.lineTo(738,74);ctx.closePath();ctx.fill();}
    else{ctx.fillRect(708,56,9,35);ctx.fillRect(725,56,9,35);}
    ctx.textAlign='right';ctx.fillStyle='#e1e5ec';ctx.font='30px Arial';ctx.fillText(`${clock(position)} / ${clock(duration)}`,1118,88);
    ctx.beginPath();ctx.roundRect(28,149,1096,9,4);ctx.fillStyle='#454b55';ctx.fill();
    const progress=duration>0?THREE.MathUtils.clamp(position/duration,0,1):0;
    if(progress>0){ctx.beginPath();ctx.roundRect(28,149,Math.max(2,1096*progress),9,4);ctx.fillStyle='#d9dfe7';ctx.fill();}
    texture.needsUpdate=true;dirty=false;
    mesh.userData.playback={position,duration,paused,progress};
  }
  return {
    mesh,
    place(layout:ReturnType<typeof createVRNoteLanes>['layout']) {
      mesh.position.set(layout.centreX,layout.y+VR_MUSIC_PLAYER.heightAboveLine,layout.z+VR_MUSIC_PLAYER.forwardFromLine);
      mesh.quaternion.identity();mesh.updateWorldMatrix(true,false);
    },
    update(transport:VRMusicTransport|null,state:RhythmState,immersive:boolean,now:number) {
      if(!transport||!immersive||!['playing','paused'].includes(state)){mesh.visible=false;return;}
      const timeline=transport.currentTime;
      if(timeline<transport.preroll){mesh.visible=false;return;}
      mesh.visible=true;
      // Transport includes count-in, whereas the UI is MP3 time only. No chart
      // offset or note calibration is involved in this position/progress.
      const position=THREE.MathUtils.clamp(timeline-transport.preroll,0,transport.buffer.duration);
      const paused=state==='paused'||transport.paused;
      const next=`${Math.floor(position*10)}:${paused}:${transport.buffer.duration}`;
      if((dirty||next!==signature)&&now-lastDraw>=VR_MUSIC_PLAYER.refreshMs){draw(position,transport.buffer.duration,paused);signature=next;lastDraw=now;}
    },
    hit(ray:THREE.Raycaster) {
      if(!mesh.visible)return null;
      mesh.updateWorldMatrix(true,false);const hit=ray.intersectObject(mesh,false)[0];if(!hit?.uv)return null;
      const x=hit.uv.x*canvas.width,y=(1-hit.uv.y)*canvas.height,b=PLAYER_PLAY_BUTTON;
      return x>=b.x&&x<=b.x+b.width&&y>=b.y&&y<=b.y+b.height?hit:null;
    },
    toggle(){if(mesh.visible)onToggle();},
    hide(){mesh.visible=false;},
    dispose(){cover.onload=null;mesh.removeFromParent();geometry.dispose();material.dispose();texture.dispose();},
  };
}
