import { openVRPractice } from './helpers/open-vr-practice.mjs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installMockWebXR } from './helpers/mock-webxr.mjs';
import { installUnifiedPanelControls } from './helpers/unified-panel-controls.mjs';

const vite = await createServer({server:{host:'127.0.0.1',port:0,watch:null}});
await vite.listen();
let browser;
try {
  browser = await chromium.launch({channel:'msedge',headless:true});
  const page = await browser.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(installMockWebXR,{mode:'switchable'});
  async function enter() {
    await openVRPractice(page, `${vite.resolvedUrls.local[0]}#/vr`);
    await page.getByRole('status').filter({hasText:'Click to play'}).waitFor();
    await page.evaluate(async()=>{
      const url=performance.getEntriesByType('resource').find(e=>/\/three\.js\?/.test(e.name)).name;
      window.T=await import(url);
      const original=window.T.Scene.prototype.updateMatrixWorld;
      window.T.Scene.prototype.updateMatrixWorld=function(...args){
        if(this.getObjectByName('vr-unified-panel')) window.scene=this;
        return original.apply(this,args);
      };
    });
    await page.waitForFunction(()=>window.scene);
    await page.getByRole('button',{name:'Enter VR',exact:true}).click();
    await page.getByRole('button',{name:'Exit VR',exact:true}).waitFor();
    await page.evaluate(installUnifiedPanelControls);
  }
  await enter();
  const result=await page.evaluate(()=>{
    const T=window.T,get=name=>window.scene.getObjectByName(name),s=window.testXR;
    const panel=get('vr-unified-panel'),state=panel.userData.panelState,kit=get('vr-drum-kit');
    const right=s.connect('right'),left=s.connect('left');
    for(const input of [right,left])input.targetRaySpace={...input.gripSpace};window.panelStep(3);
    const initial=panel.matrixWorld.clone(),kitPose=kit.matrixWorld.clone();
    window.defaultPanelPosition=panel.position.toArray();
    const map=panel.material.map,backing=get('vr-panel-opaque-backing');
    const sharp=map.image.width===2560&&map.image.height===2300&&map.generateMipmaps
      &&map.minFilter===T.LinearMipmapLinearFilter&&map.anisotropy>=1;
    const opaque=!backing.material.transparent&&backing.material.color.getHex()===0x17191e;
    const freeInitial=!get('vr-note-lanes').visible;
    window.panelStart(right);const minimized=state.minimized&&!backing.visible;
    window.panelPractice(right);window.panelClick(right,490,695);
    const note=get('note-kick-3000'),frozen=note.position.clone();window.panelStep(40);
    const paused=state.rhythm==='paused'&&note.position.equals(frozen);
    window.panelClick(right,60+100,450);
    const free=state.practice==='FREE PLAY'&&!get('vr-note-lanes').visible&&!note.visible;
    window.panelClick(right,200,106);
    window.panelAim(right,512,934);
    right.gamepad.buttons[0].pressed=true;right.gamepad.buttons[0].value=1;window.panelStep();
    const noJump=panel.matrixWorld.equals(initial);
    right.gripSpace.position[0]+=.2;right.gripSpace.position[1]+=.12;right.gripSpace.position[2]-=.18;
    window.panelStep(3);
    const moved=panel.position.distanceTo(new T.Vector3().fromArray(window.defaultPanelPosition))>.25;
    // A second controller must not click navigation while the first holds the handle.
    window.panelClick(left,880,106);const blocked=state.tab==='MUSIC';
    right.gamepad.buttons[0].pressed=false;right.gamepad.buttons[0].value=0;window.panelStep(3);
    const released=panel.matrixWorld.clone();right.gripSpace.position[0]+=.3;window.panelStep(3);
    const fixed=panel.matrixWorld.equals(released);
    window.panelClick(right,308,338);const clickAfterMove=state.genre==='Pop';
    window.panelMode(right,'ar');
    const movedAcrossAR=panel.matrixWorld.equals(released)&&window.scene.background===null;
    window.panelMode(right,'vr');
    const saved=JSON.parse(localStorage.getItem('drumup.vr.panel-pose.v1'));
    window.savedPanelPose=saved;
    const persisted=new T.Vector3().fromArray(saved.position).distanceTo(panel.position)<1e-6;
    const childrenFollow=[backing,get('vr-panel-move-handle'),get('vr-panel-move-hit')].every(o=>o.parent===panel);
    return {sharp,opaque,freeInitial,minimized,paused,free,noJump,moved,blocked,fixed,clickAfterMove,movedAcrossAR,persisted,childrenFollow,
      kitUnchanged:kit.matrixWorld.equals(kitPose),legacyAbsent:!get('ar-mode-window')&&!get('vr-rhythm-controls')};
  });
  for(const [key,value]of Object.entries(result))assert(value,key);
  const saved=await page.evaluate(()=>window.savedPanelPose);
  await page.getByRole('button',{name:'Exit VR',exact:true}).click();
  await enter();
  assert(await page.evaluate(saved=>{
    window.panelStep(3);const p=window.scene.getObjectByName('vr-unified-panel');
    return p.position.distanceTo(new window.T.Vector3().fromArray(saved.position))<1e-6;
  },saved),'Reload restores saved world pose');
  assert(await page.evaluate(()=>{
    const input=window.testXR.connect('right');input.targetRaySpace={...input.gripSpace};window.panelStep(3);
    window.panelClick(input,880,106);window.panelClick(input,512,798);
    const p=window.scene.getObjectByName('vr-unified-panel');
    return p.position.x===-1.25&&p.position.z===-1.05&&JSON.parse(localStorage.getItem('drumup.vr.panel-pose.v1')).position[0]===-1.25;
  }),'SETTINGS reset restores and saves default pose');
  await page.getByRole('button',{name:'Exit VR',exact:true}).click();
  await page.evaluate(()=>localStorage.setItem('drumup.vr.panel-pose.v1',JSON.stringify({version:1,position:[20,20,20],quaternion:[0,0,0,1]})));
  await enter();
  assert(await page.evaluate(()=>{
    window.panelStep(3);const p=window.scene.getObjectByName('vr-unified-panel');
    return p.position.x===-1.25&&p.position.z===-1.05;
  }),'Unreachable saved pose falls back to visible default');
  assert.deepEqual(errors,[]);
  console.log('PASS: high-resolution opaque UI, integrated practice/free play, minimization, no-jump two-hand-safe dragging, fixed release, moved raycasts, persistence and reset. Physical Quest 3 NOT tested.');
}finally{await browser?.close();await vite.close();}
