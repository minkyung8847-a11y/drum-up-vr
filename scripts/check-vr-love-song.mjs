import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installMockWebXR } from './helpers/mock-webxr.mjs';
import { installUnifiedPanelControls } from './helpers/unified-panel-controls.mjs';
const vite=await createServer({server:{host:'127.0.0.1',port:0,watch:null}});await vite.listen();let browser;
try {
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(installMockWebXR,{mode:'switchable'});
  await page.goto(`${vite.resolvedUrls.local[0]}#/vr`);
  await page.getByRole('status').filter({hasText:'Click to play'}).waitFor();
  await page.evaluate(async()=>{
    const url=performance.getEntriesByType('resource').find(e=>/\/three\.js\?/.test(e.name)).name;
    window.T=await import(url);const update=window.T.Scene.prototype.updateMatrixWorld;
    window.T.Scene.prototype.updateMatrixWorld=function(...args){if(this.getObjectByName('vr-unified-panel'))window.scene=this;return update.apply(this,args);};
    window.musicStarts=[];
    const original=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args){if(this.buffer?.duration>20)window.musicStarts.push({when:args[0],scheduledAt:this.context.currentTime,offset:args[1],duration:args[2],context:this.context,buffer:this.buffer});return original.apply(this,args);};
  });
  await page.waitForFunction(()=>window.scene);
  await page.getByRole('button',{name:'Enter VR',exact:true}).click();
  await page.getByRole('button',{name:'Exit VR',exact:true}).waitFor();await page.evaluate(installUnifiedPanelControls);
  await page.evaluate(()=>{
    const input=window.input=window.testXR.connect('right');input.targetRaySpace={...input.gripSpace};window.panelStep(3);
    window.detailClick=(x,y)=>{
      const T=window.T,detail=window.scene.getObjectByName('vr-song-detail'),rig=window.scene.getObjectByName('player-rig');
      const localX=(x/900-.5)*.62,point=detail.localToWorld(new T.Vector3(localX,(.5-y/1200)*.827,localX*localX/11));
      const origin=new T.Vector3(.24,1.15,.86);
      input.targetRaySpace.position=rig.worldToLocal(origin.clone()).toArray();
      input.targetRaySpace.quaternion=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),point.sub(origin).normalize()).toArray();window.panelStep(3);
      input.gamepad.buttons[0].pressed=true;input.gamepad.buttons[0].value=1;window.panelStep();
      input.gamepad.buttons[0].pressed=false;input.gamepad.buttons[0].value=0;window.panelStep(4);
    };
    window.panelClick(input,350,430);window.panelStep(30);
  });
  assert(await page.evaluate(()=>{
    const panel=window.scene.getObjectByName('vr-unified-panel'),detail=window.scene.getObjectByName('vr-song-detail');
    return panel.userData.panelState.song===0&&detail.visible&&detail.parent===panel;
  }),'First song opens sibling detail under the movable root');
  const preview=await page.evaluate(()=>window.scene.getObjectByName('vr-song-detail').material.map.image.toDataURL('image/png'));
  await writeFile(join(tmpdir(),'drum-up-love-detail.png'),Buffer.from(preview.split(',')[1],'base64'));
  assert(await page.evaluate(()=>{
    const panel=window.scene.getObjectByName('vr-unified-panel'),detail=window.scene.getObjectByName('vr-song-detail');
    const before=detail.getWorldPosition(new window.T.Vector3());window.panelAim(window.input,512,934);
    window.input.gamepad.buttons[0].pressed=true;window.input.gamepad.buttons[0].value=1;window.panelStep();
    window.input.gripSpace.position[0]+=.08;window.input.gripSpace.position[1]+=.04;window.panelStep(3);
    window.input.gamepad.buttons[0].pressed=false;window.input.gamepad.buttons[0].value=0;window.panelStep(3);
    return detail.getWorldPosition(new window.T.Vector3()).distanceTo(before)>.08&&detail.parent===panel;
  }),'Open detail moves together with the existing handle');
  await page.evaluate(()=>window.detailClick(450,822));
  await page.waitForFunction(()=>window.musicStarts.length>0,{timeout:60000});
  assert(await page.evaluate(()=>{
    const s=window.scene.getObjectByName('vr-unified-panel').userData.panelState;
    return s.rhythm==='idle'&&!window.scene.getObjectByName('vr-note-lanes').visible&&window.musicStarts[0].duration===20;
  }),'Real MP3 decodes; preview starts no notes');
  await page.evaluate(()=>window.detailClick(450,822));
  await page.evaluate(()=>window.detailClick(450,1050));
  await page.waitForFunction(()=>window.scene.getObjectByName('vr-unified-panel').userData.panelState.minimized,{timeout:60000});
  await page.waitForFunction(()=>window.musicStarts.some(start=>start.duration===undefined),{timeout:60000});
  assert(await page.evaluate(()=>{
    window.panelStep(3);const start=window.musicStarts.at(-1),count=window.scene.getObjectByName('vr-song-countdown');
    return start.duration===undefined&&Math.abs(start.when-start.scheduledAt-(4*60/62+.035))<.025&&count.visible&&count.userData.label==='3';
  }),'START schedules MP3 after four beats and shows 3');
  const countdown=await page.evaluate(async()=>{
    const labels=new Set(),start=window.musicStarts.at(-1),end=performance.now()+7000;
    while(start.context.currentTime<start.when+.03&&performance.now()<end){
      window.panelStep();const count=window.scene.getObjectByName('vr-song-countdown');
      if(count.visible)labels.add(count.userData.label);
      await new Promise(resolve=>setTimeout(resolve,30));
    }
    window.panelStep();
    return {labels:[...labels],began:start.context.currentTime>=start.when,
      hidden:!window.scene.getObjectByName('vr-song-countdown').visible};
  });
  assert.deepEqual(countdown.labels,['3','2','1','GO']);assert(countdown.began&&countdown.hidden,'Real AudioContext advances through GO into MP3 playback');
  assert(await page.evaluate(()=>{
    const panel=window.scene.getObjectByName('vr-unified-panel'),state=panel.userData.panelState;
    const starts=window.musicStarts.length;
    window.panelClick(window.input,880,106);window.panelClick(window.input,630,430);
    window.panelClick(window.input,885,646);const plus=state.noteSyncMs===10;
    window.panelClick(window.input,139,646);window.panelClick(window.input,139,646);const minus=state.noteSyncMs===-10;
    window.panelClick(window.input,512,724);
    return plus&&minus&&state.noteSyncMs===0&&localStorage.getItem('drumup.vr.note-sync-ms.v1')==='0'&&window.musicStarts.length===starts;
  }),'Quest-style Trigger controls adjust signed offsets and reset without restarting MP3');
  const timed=await page.evaluate(async()=>{
    const T=window.T,{VRMusicTransport,LOVE_COUNT_IN,parseLoveChart}=await import('/src/components/vrMusicSong.ts');
    const {captureRhythmSurfaces,createVRNoteLanes,createVRNoteHighway}=await import('/src/components/vrNoteHighway.ts');
    const data=await(await fetch('/songs/love/love_first_4_bars.json')).json(),notes=parseLoveChart(data),starts=[];
    const gain=()=>({gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}});
    const fake={currentTime:10,destination:{},resume:async()=>{},createGain:gain,
      createBufferSource:()=>({connect(){},disconnect(){},stop(){},start:(...args)=>starts.push(args)}),
      createOscillator:()=>({frequency:{value:0},connect(){},disconnect(){},start(){},stop(){}})};
    const audio=new VRMusicTransport(fake,{duration:300});
    // Extract authored surfaces from the same unchanged kit factory, in an isolated scene.
    const {createRestoredVRDrumSet}=await import('/src/components/restoredVRDrumSet.ts');
    const testScene=new T.Scene(),kit=createRestoredVRDrumSet(testScene);testScene.updateMatrixWorld(true);
    const actual=captureRhythmSurfaces(kit.hitSurfaces),lanes=createVRNoteLanes(actual,new T.Vector3(0,1.35,1));
    let results;const highway=createVRNoteHighway(testScene,actual,lanes.paths,()=>{},
      {notes,audio,offset:LOVE_COUNT_IN,windows:{perfect:50,great:120},onResults:(p,g,m,t)=>{results={p,g,m,t};}});
    highway.restart(1000);await Promise.resolve();await Promise.resolve();
    const epoch=10.035,eye=new T.Vector3(0,1.35,1);
    fake.currentTime=epoch+.5;highway.update(999999,eye);
    const earlyAbsent=!testScene.children.find(o=>o.name==='note-highway-anchor').children.some(o=>o.name.startsWith('note-')&&o.visible);
    fake.currentTime=epoch+LOVE_COUNT_IN-1;highway.update(-500,eye);
    const visible=testScene.children.find(o=>o.name==='note-highway-anchor').children.filter(o=>o.name.startsWith('note-')&&o.visible).length>0;
    fake.currentTime=epoch+LOVE_COUNT_IN;highway.update(123456,eye);
    const kick=highway.strike('kick',123456),ride=highway.strike('ride',123456),wrong=highway.strike('snare',123456);
    const simultaneous=kick==='Perfect'&&ride==='Perfect'&&wrong==='Miss';
    highway.pause(123456);const paused=audio.currentTime;fake.currentTime+=3;highway.update(123999,eye);
    const frozen=audio.currentTime===paused;highway.toggle(123999);await Promise.resolve();await Promise.resolve();
    fake.currentTime+=16;highway.update(1,eye);
    const count=notes.length,counts=Object.fromEntries(['ride','kick','snare'].map(id=>[id,notes.filter(n=>n.instrument===id).length]));
    const noFake=testScene.children.find(o=>o.name==='note-highway-anchor').children.filter(o=>o.name.startsWith('note-')&&o.visible).length===0;
    highway.dispose();audio.dispose();lanes.dispose();
    return {count,counts,scheduled:Math.abs(starts[0][0]-(epoch+LOVE_COUNT_IN))<1e-9,earlyAbsent,visible,simultaneous,frozen,noFake,total:results.p+results.g+results.m};
  });
  assert.equal(timed.count,52);assert.deepEqual(timed.counts,{ride:32,kick:12,snare:8});
  for(const key of ['scheduled','earlyAbsent','visible','simultaneous','frozen','noFake'])assert(timed[key],key);assert.equal(timed.total,52);
  assert.deepEqual(errors,[]);
  console.log('PASS: VR love. selection/detail raycasts, actual MP3 decoding and preview isolation, scheduled four-beat count-in, 52 authored notes, shared audio clock, simultaneous judgments, pause/resume and no invented notes. Quest 3 hardware and recording alignment NOT verified.');
}finally{await browser?.close();await vite.close();}
