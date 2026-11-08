import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installMockWebXR } from './helpers/mock-webxr.mjs';
import { installUnifiedPanelControls } from './helpers/unified-panel-controls.mjs';
const vite=await createServer({server:{host:'127.0.0.1',port:0}});await vite.listen();let browser;
try {
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(installMockWebXR,{mode:'switchable'});
 await page.goto(`${vite.resolvedUrls.local[0]}#/vr`);
 await page.locator('.vr-practice-hint').filter({hasText:'Click to play'}).waitFor({timeout:30000});
 await page.evaluate(async()=>{
  const url=performance.getEntriesByType('resource').find(e=>/\/three\.js\?/.test(e.name)).name;
  const T=window.THREE=await import(url),update=T.Scene.prototype.updateMatrixWorld;
  T.Scene.prototype.updateMatrixWorld=function(...a){if(this.getObjectByName('vr-unified-panel'))window.scene=this;return update.apply(this,a);};
  const {drumSynth}=await import('/src/utils/synth.ts');window.synth=drumSynth;window.hits=[];window.voices=0;
  const trigger=drumSynth.trigger.bind(drumSynth);drumSynth.trigger=(id,v)=>{window.hits.push(id);return trigger(id,v);};
  const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...a){window.voices++;return start.apply(this,a);};
 });
 await page.waitForFunction(()=>window.scene);
 await page.getByRole('button',{name:'Enter VR',exact:true}).click();await page.getByRole('button',{name:'Exit VR',exact:true}).waitFor();
 await page.evaluate(installUnifiedPanelControls);
 await page.evaluate(()=>{
  const session=window.testXR;window.left=session.connect('left');window.right=session.connect('right');
  window.right.targetRaySpace={...window.right.gripSpace};window.panelStep(3);
  window.panelClick(window.right,880,106);window.panelClick(window.right,150,430);
  // Move pointer away; leave AUDIO open to detect unnecessary pedal texture uploads.
  window.right.targetRaySpace={position:[0,1,0],quaternion:[0,0,0,1],tracked:false};window.left.targetRaySpace={...window.right.targetRaySpace};window.panelStep(20);
 });
 await page.waitForTimeout(150);
 const result=await page.evaluate(async()=>{
  const T=window.THREE,session=window.testXR,rig=window.scene.getObjectByName('player-rig'),root=window.scene.getObjectByName('vr-drum-kit');
  const panel=window.scene.getObjectByName('vr-unified-panel'),version=panel.material.map.version;
  let domMutations=0,frames=0,lost=false;const observer=new MutationObserver(records=>{domMutations+=records.length;});
  observer.observe(document.querySelector('.vr-practice-toolbar'),{subtree:true,childList:true,characterData:true,attributes:true});
  document.querySelector('.vr-practice-stage canvas').addEventListener('webglcontextlost',()=>{lost=true;});
  const render=window.scene.onAfterRender;window.scene.onAfterRender=function(...args){frames++;render?.apply(this,args);};
  const lift=hand=>{window[hand].gripSpace.quaternion=[0,0,0,1];window.panelStep(6);};
  const place=(hand,id)=>{
   lift(hand);const source=window[hand];source.gripSpace.tracked=false;window.panelStep();
   const group=root.children.find(o=>o.userData.drumType===id),cymbal=['hihat','crash','ride'].includes(id);
   const mesh=group.children.find(o=>o.isMesh&&o.userData.drumType===id&&(cymbal?o.geometry.type==='LatheGeometry':o.position.y>0));
   mesh.updateWorldMatrix(true,false);const target=mesh.getWorldPosition(new T.Vector3()),normal=new T.Vector3(0,1,0).transformDirection(mesh.matrixWorld);
   target.addScaledVector(normal,cymbal?.14:.12);const offset=new T.Vector3(0,0,-.31).applyAxisAngle(new T.Vector3(1,0,0),12*Math.PI/180);
   rig.worldToLocal(target);target.sub(offset);source.gripSpace.position=target.toArray();source.gripSpace.quaternion=[0,0,0,1];source.gripSpace.tracked=true;window.panelStep(6);
  };
  const pedal=type=>window.dispatchEvent(new KeyboardEvent(type,{code:'Space',key:' ',cancelable:true}));
  const groups=[];window.hits.length=0;window.voices=0;
  for(const id of ['snare','hihat','crash','ride','smallTom','middleTom','floorTom']){
   place('right',id);
   for(let i=0;i<4;i++){
    await new Promise(r=>setTimeout(r,50));lift('right');const n=window.hits.length;
    if(i%2===0)pedal('keydown');
    window.right.gripSpace.quaternion=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-.05).toArray();window.panelStep();
    if(i%2!==0)pedal('keydown');
    pedal('keyup');window.panelStep(8);await new Promise(r=>setTimeout(r,0));groups.push({id,hits:window.hits.slice(n)});
   }
  }
  // Both sticks + pedal, same rendering frame.
  place('left','snare');place('right','ride');
  for(let i=0;i<8;i++){
   await new Promise(r=>setTimeout(r,50));lift('left');lift('right');const n=window.hits.length;pedal('keydown');
   for(const hand of ['left','right'])window[hand].gripSpace.quaternion=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-.05).toArray();
   window.panelStep();pedal('keyup');window.panelStep(8);await new Promise(r=>setTimeout(r,0));groups.push({id:'both',hits:window.hits.slice(n)});
  }
  window.panelStep(60);await new Promise(r=>setTimeout(r,30));observer.disconnect();
  return {groups,frames,lost,domMutations,textureUploads:panel.material.map.version-version,voices:window.voices,active:!session.ended};
 });
 console.log(JSON.stringify({...result,groups:result.groups.length}));
 const sound={snare:'snare',hihat:'hihat-open',crash:'crash',ride:'ride',smallTom:'tom-high',middleTom:'tom-mid',floorTom:'tom-floor'};
 for(const group of result.groups)assert.deepEqual(group.hits.slice().sort(),(group.id==='both'?['kick','snare','ride']:['kick',sound[group.id]]).sort(),group.id);
 assert.equal(result.voices,80);assert(result.frames>500);assert(!result.lost&&result.active);assert.deepEqual(errors,[]);
 assert.equal(result.domMutations,0,'Pedal during immersive playback must not mutate the desktop React settings');
 assert.equal(result.textureUploads,0,'Pedal must not upload the settings texture while AUDIO is open');
 const visibleDiagnostics=await page.evaluate(async()=>{
  window.right.targetRaySpace.tracked=true;
  window.panelClick(window.right,390,435);
  window.right.targetRaySpace.tracked=false;window.panelStep(20);
  const panel=window.scene.getObjectByName('vr-unified-panel'),version=panel.material.map.version,n=window.hits.length;
  await new Promise(r=>setTimeout(r,50));
  window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',cancelable:true}));
  for(let i=0;i<100;i++){
   window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',repeat:true,cancelable:true}));window.panelStep();
  }
  const pressed=panel.userData.panelState.footPedal.pressed;
  window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',key:' ',cancelable:true}));window.panelStep(12);
  return {uploads:panel.material.map.version-version,played:window.hits.slice(n),pressed,released:!panel.userData.panelState.footPedal.pressed};
 });
 assert(visibleDiagnostics.uploads>0&&visibleDiagnostics.uploads<=13,JSON.stringify(visibleDiagnostics));
 assert.deepEqual(visibleDiagnostics.played,['kick']);assert(visibleDiagnostics.pressed&&visibleDiagnostics.released);
 await page.getByRole('button',{name:'Exit VR',exact:true}).click();
 await page.locator('.foot-pedal-settings > summary').click();
 assert.match(await page.getByRole('region',{name:'Foot pedal settings'}).innerText(),/WAITING FOR INPUT/);
 console.log('PASS visible diagnostics stay live at <=10 Hz under 100 repeat events, one kick only, desktop snapshot resumes on XR exit.');
 console.log('PASS 28 pedal+stick pairs and 8 two-stick+pedal triples, real samples, continuous XR frames, no desktop DOM work or unrelated texture uploads. Physical Quest crash not reproduced/verified.');
}finally{await browser?.close();await vite.close();}
