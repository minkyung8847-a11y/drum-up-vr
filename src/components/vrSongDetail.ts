import * as THREE from 'three';
import { LOVE_ROOT, savedLoveOffset, saveLoveOffset, loveChartOffset } from './vrMusicSong';

export function createVRSongDetail(parent: THREE.Object3D, options: {
  onStart: (offset: number) => Promise<boolean | void>; onPreview: () => Promise<void>; onClose: () => void;
}) {
  const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 1200;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const geometry = new THREE.PlaneGeometry(.62, .827, 32, 1);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) { const x = position.getX(i); position.setZ(i, x * x / 11); }
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}));
  mesh.name = 'vr-song-detail'; mesh.renderOrder = 1001; mesh.visible = false; parent.add(mesh);
  let selected: {title:string;artist:string;difficulty:string;playable?:boolean} | null = null;
  let open = false, phase = 0, lastTime = 0, dirty = true, lastDraw = -Infinity;
  let loading = false, message = '', previewPlaying = false, progress = 0, request = 0;
  let offset = loveChartOffset(), calibrated = savedLoveOffset() !== null;
  const cover = new Image(); cover.src = `${LOVE_ROOT}cover.jpg`; cover.onload = () => { dirty = true; };
  function box(x:number,y:number,w:number,h:number,fill:string|CanvasGradient) {
    ctx.beginPath();ctx.roundRect(x,y,w,h,16);ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle='#aab0bc';ctx.lineWidth=2;ctx.stroke();
  }
  function draw() {
    ctx.clearRect(0,0,900,1200);box(3,3,894,1194,'#17191e');
    ctx.textAlign='left';ctx.fillStyle='#f0f2f6';ctx.font='600 40px Arial, "Malgun Gothic", sans-serif';
    ctx.fillText(selected?.title ?? '',40,78,735);ctx.font='28px Arial';ctx.fillStyle='#bfc6d1';ctx.fillText(selected?.artist ?? '',40,124);
    ctx.textAlign='center';ctx.font='36px Arial';ctx.fillStyle='#edf1f8';ctx.fillText('×',846,65);
    if (selected?.playable && cover.complete && cover.naturalWidth) ctx.drawImage(cover,180,168,540,540);
    else { box(180,168,540,540,'#272b34');ctx.font='140px Arial';ctx.fillText('♫',450,470); }
    ctx.fillStyle='#dce1eb';ctx.font='600 30px Arial';ctx.fillText(selected?.playable ? 'BPM 62   /   4/4   /   EASY' : selected?.difficulty.toUpperCase() ?? '',450,760);
    ctx.beginPath();ctx.arc(450,822,34,0,Math.PI*2);ctx.fillStyle='#373c47';ctx.fill();ctx.strokeStyle='#cdd3df';ctx.stroke();
    ctx.font='30px Arial';ctx.fillStyle='#eef2f8';ctx.fillText(previewPlaying?'Ⅱ':'▶',450,833);
    ctx.fillStyle='#4e5664';ctx.fillRect(180,875,540,5);ctx.fillStyle='#e1e7f2';ctx.fillRect(180,875,540*progress,5);
    ctx.font='22px Arial';ctx.fillStyle='#b8c2d0';
    ctx.fillText(selected?.playable ? `CHART OFFSET  −   ${offset.toFixed(2)}s   +` : 'PREVIEW / PLAYBACK UNAVAILABLE',450,938);
    ctx.font='20px Arial';ctx.fillStyle='#939fac';ctx.fillText(selected?.playable ? (calibrated?'4 BARS ONLY · OFFSET SAVED':'4 BARS ONLY · FIRST BAR ESTIMATE 2.90s') : 'Demo selection only',450,977);
    const silver=ctx.createLinearGradient(0,1012,0,1110);silver.addColorStop(0,'#c6ccd7');silver.addColorStop(.5,'#707989');silver.addColorStop(1,'#aab3c2');
    box(55,1012,790,98,selected?.playable?silver:'#343a45');ctx.font='600 38px Arial';ctx.fillStyle='#f7f9ff';ctx.fillText(loading?'LOADING…':'▶  START',450,1076);
    ctx.font='21px Arial';ctx.fillStyle='#e6b6a6';ctx.fillText(message,450,1160,820);
    texture.needsUpdate=true;dirty=false;
  }
  draw();
  return {
    mesh,
    select(song: NonNullable<typeof selected>) {
      request++;loading=false;options.onClose();selected=song;open=true;message='';dirty=true;
    },
    close() { request++;loading=false;open=false;options.onClose(); },
    hit(ray:THREE.Raycaster) {
      if (!mesh.visible || !open || phase < .8) return null;
      mesh.updateWorldMatrix(true,false);const hit=ray.intersectObject(mesh,false)[0];if(!hit?.uv)return null;
      const x=hit.uv.x*900,y=(1-hit.uv.y)*1200;
      let index=-1;
      if(x>795&&y<110)index=0;
      else if(selected?.playable&&!loading) {
        if(Math.hypot(x-450,y-822)<55)index=1;
        else if(y>1012&&y<1110&&x>55&&x<845)index=2;
        else if(y>900&&y<960&&x>160&&x<740)index=x<450?3:4;
      }
      return {hit,index};
    },
    async activate(index:number) {
      if(index===0){request++;loading=false;open=false;options.onClose();return;}
      if(index<1||loading||!selected?.playable)return;
      if(index===3||index===4){offset=Math.max(0,Math.min(120,offset+(index===3?-.05:.05)));calibrated=true;saveLoveOffset(offset);dirty=true;return;}
      const activeRequest=++request;loading=true;message='';dirty=true;
      try { if(index===1)await options.onPreview();else {const started=await options.onStart(offset);if(activeRequest===request&&started!==false)open=false;} }
      catch(error){if(activeRequest===request)message=error instanceof Error?error.message:'Audio unavailable';console.error('[DRUM UP VR MUSIC]',error);}
      finally{if(activeRequest===request){loading=false;dirty=true;}}
    },
    update(now:number,visible:boolean,preview:{playing:boolean;progress:number}) {
      const dt=Math.min(.05,Math.max(0,(now-lastTime)/1000));lastTime=now;
      phase=THREE.MathUtils.clamp(phase+(open&&visible?1:-1)*dt*5,0,1);
      mesh.visible=phase>0;mesh.material.opacity=phase;mesh.position.set(.99+(1-phase)*.06,-.126,.025);mesh.rotation.y=-.08;
      if(previewPlaying!==preview.playing||Math.abs(progress-preview.progress)>.015){previewPlaying=preview.playing;progress=preview.progress;dirty=true;}
      if(dirty&&now-lastDraw>100){draw();lastDraw=now;}
    },
    dispose(){cover.onload=null;mesh.removeFromParent();geometry.dispose();mesh.material.dispose();texture.dispose();},
  };
}

export function createVRSongCountdown(scene:THREE.Scene) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d')!;
  const texture=new THREE.CanvasTexture(canvas);const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.48,.48),material);mesh.name='vr-song-countdown';mesh.visible=false;mesh.renderOrder=1010;scene.add(mesh);
  let previous='';
  return {
    update(time:number,eye:THREE.Vector3,quaternion:THREE.Quaternion) {
      const index=Math.floor(time/(60/62));mesh.visible=time>=0&&index<4;
      if(!mesh.visible)return;
      const label=['3','2','1','GO'][index];mesh.userData.label=label;
      if(label!==previous){ctx.clearRect(0,0,512,512);ctx.font='700 230px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=8;ctx.strokeStyle='#101318';ctx.strokeText(label,256,256);ctx.fillStyle='#f5f7ff';ctx.fillText(label,256,256);texture.needsUpdate=true;previous=label;}
      mesh.position.set(0,0,-1.7).applyQuaternion(quaternion).add(eye);mesh.quaternion.copy(quaternion);
      const beatPhase=time/(60/62)-index;mesh.scale.setScalar(1+.12*Math.max(0,1-beatPhase*4));
    },
    hide(){mesh.visible=false;},
    dispose(){mesh.removeFromParent();mesh.geometry.dispose();material.dispose();texture.dispose();},
  };
}
