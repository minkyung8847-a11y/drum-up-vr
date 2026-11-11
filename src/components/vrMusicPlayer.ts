import * as THREE from 'three';
import type { VRMusicTransport } from './vrMusicSong';
import type { PlayableVRSong } from './vrMusicSong';
import type { RhythmState, createVRNoteLanes } from './vrNoteHighway';
import {createWorldPanelTransform} from './vrWorldPanel';
export const PLAYER_POSE_KEY='drumup.vr.music-player-pose.v1';
export const VR_MUSIC_PLAYER={width:1.04,height:1.04*320/1152,heightAboveLine:.60,forwardFromLine:.12,canvasWidth:1152,canvasHeight:320,refreshMs:100} as const;
export const PLAYER_PLAY_BUTTON={x:539,y:204,width:74,height:74};
export const PLAYER_BUTTONS=[PLAYER_PLAY_BUTTON,{x:408,y:204,width:74,height:74},{x:670,y:204,width:74,height:74},{x:390,y:290,width:372,height:30}];
const clock=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
export function createVRMusicPlayer(scene:THREE.Scene,rig:THREE.Group,options:{onToggle:()=>void;onSeek:(seconds:number)=>void}){
 const canvas=document.createElement('canvas');canvas.width=1152;canvas.height=320;const ctx=canvas.getContext('2d')!;
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;
 const geometry=new THREE.PlaneGeometry(VR_MUSIC_PLAYER.width,VR_MUSIC_PLAYER.height),material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
 const mesh=new THREE.Mesh(geometry,material);mesh.name='vr-music-player';mesh.renderOrder=1004;mesh.visible=false;scene.add(mesh);
 const transform=createWorldPanelTransform(mesh,rig,PLAYER_POSE_KEY);let lastDraw=-Infinity,signature='',dirty=true;
 const cover=new Image();cover.onload=()=>{dirty=true;};
 function triangle(x:number,y:number,direction:number){ctx.beginPath();ctx.moveTo(x-12*direction,y-18);ctx.lineTo(x-12*direction,y+18);ctx.lineTo(x+14*direction,y);ctx.closePath();ctx.fill();}
 function draw(song:PlayableVRSong,position:number,duration:number,paused:boolean){
  ctx.clearRect(0,0,1152,320);ctx.beginPath();ctx.roundRect(2,2,1148,316,18);ctx.fillStyle='rgba(21,24,33,.68)';ctx.fill();ctx.strokeStyle='rgba(187,195,211,.56)';ctx.lineWidth=2;ctx.stroke();
  const sheen=ctx.createLinearGradient(0,0,0,95);sheen.addColorStop(0,'#b8c5e312');sheen.addColorStop(1,'#b8c5e300');ctx.fillStyle=sheen;ctx.fill();
  ctx.fillStyle='#ffffff12';ctx.fillRect(30,30,94,94);if(cover.complete&&cover.naturalWidth)ctx.drawImage(cover,30,30,94,94);
  ctx.textAlign='left';ctx.fillStyle='#f1f3f8';ctx.font='600 34px Arial, "Malgun Gothic", sans-serif';ctx.fillText(song.title,150,70,920);
  ctx.font='25px Arial, "Malgun Gothic", sans-serif';ctx.fillStyle='#bdc4d1';ctx.fillText(song.artist,150,109);
  ctx.font='23px Arial';ctx.fillStyle='#d5dbe5';ctx.fillText(clock(position),44,151);ctx.textAlign='right';ctx.fillText(clock(duration),1108,151);
  ctx.beginPath();ctx.roundRect(44,166,1064,7,3);ctx.fillStyle='#b8c0d02b';ctx.fill();
  const progress=duration>0?THREE.MathUtils.clamp(position/duration,0,1):0;if(progress>0){ctx.beginPath();ctx.roundRect(44,166,Math.max(2,1064*progress),7,3);ctx.fillStyle='#dce2ec';ctx.fill();}
  ctx.fillStyle='#f0f3f9';triangle(450,241,-1);triangle(438,241,-1);triangle(700,241,1);triangle(712,241,1);
  if(paused)triangle(576,241,1);else{ctx.fillRect(560,221,10,40);ctx.fillRect(583,221,10,40);}
  if(transform.input){ctx.textAlign='center';ctx.font='16px Arial';ctx.fillStyle='#c7cfdd';ctx.fillText('HOLD  ·  ↑↓ SIZE  /  ←→ DISTANCE',576,290);}
  ctx.beginPath();ctx.roundRect(430,303,292,5,3);ctx.fillStyle='#bdc5d383';ctx.fill();
  texture.needsUpdate=true;dirty=false;mesh.userData.playback={position,duration,paused,progress};
 }
 return{mesh,transform,
  place(layout:ReturnType<typeof createVRNoteLanes>['layout']){const eye=new THREE.Vector3(0,1.35,1);if(!transform.load(eye)){mesh.position.set(layout.centreX,layout.y+.60,layout.z+.12);mesh.quaternion.identity();mesh.scale.setScalar(1);}mesh.updateWorldMatrix(true,true);},
  update(transport:VRMusicTransport|null,state:RhythmState,immersive:boolean,now:number){
   if(!transport||!immersive||!['playing','paused'].includes(state)||transport.currentTime<transport.preroll){mesh.visible=false;transform.finish();return;}mesh.visible=true;
   if(cover.getAttribute('src')!==transport.song.cover)cover.src=transport.song.cover;
   const position=THREE.MathUtils.clamp(transport.currentTime-transport.preroll,0,transport.duration),paused=state==='paused'||transport.paused;
   const next=`${transport.song.key}:${Math.floor(position*10)}:${paused}:${transport.duration}:${!!transform.input}`;if((dirty||next!==signature)&&now-lastDraw>=100){draw(transport.song,position,transport.duration,paused);signature=next;lastDraw=now;}
  },
  hit(ray:THREE.Raycaster){if(!mesh.visible)return null;mesh.updateWorldMatrix(true,false);const hit=ray.intersectObject(mesh,false)[0];if(!hit?.uv)return null;
   const x=hit.uv.x*1152,y=(1-hit.uv.y)*320,index=PLAYER_BUTTONS.findIndex(b=>x>=b.x&&x<=b.x+b.width&&y>=b.y&&y<=b.y+b.height);return index>=0?{hit,index}:null;
  },
  activate(index:number){if(!mesh.visible||transform.input)return;if(index===0)options.onToggle();else if(index===1)options.onSeek(-10);else if(index===2)options.onSeek(10);},
  hide(){mesh.visible=false;transform.finish();},
  dispose(){transform.finish();cover.onload=null;mesh.removeFromParent();geometry.dispose();material.dispose();texture.dispose();},
 };
}
export type VRMusicPlayer=ReturnType<typeof createVRMusicPlayer>;
