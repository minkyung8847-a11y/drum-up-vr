import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installMockWebXR } from './helpers/mock-webxr.mjs';
import { installUnifiedPanelControls } from './helpers/unified-panel-controls.mjs';

const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await vite.listen();
const origin = vite.resolvedUrls.local[0];
let browser;
const errors = [];
async function setup(options) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(installMockWebXR, { mode: 'switchable', ...options });
  await page.goto(`${origin}#/vr`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('status').filter({ hasText: 'Click to play' }).waitFor();
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const T = await import(url);
    const original = T.Scene.prototype.updateMatrixWorld;
    T.Scene.prototype.updateMatrixWorld = function (...args) {
      if (this.getObjectByName('player-rig')) {
        window.vrScene = this;
        this.onAfterRender = renderer => { window.vrRenderer = renderer; };
      }
      return original.apply(this, args);
    };
    const { drumSynth } = await import('/src/utils/synth.ts');
    const trigger = drumSynth.trigger.bind(drumSynth);
    const success = drumSynth.playRhythmSuccess.bind(drumSynth);
    window.hits = [];
    window.successTones = [];
    drumSynth.trigger = (id, velocity) => { window.hits.push(id); return trigger(id, velocity); };
    drumSynth.playRhythmSuccess = perfect => { window.successTones.push(perfect); success(perfect); };
    window.THREE = T;
    window.get = name => window.vrScene.getObjectByName(name);

  });
  await page.waitForFunction(() => window.vrRenderer);
  await page.evaluate(installUnifiedPanelControls);
  return page;
}
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await setup();
  await page.getByRole('button', {name:'Enter VR',exact:true}).click();
  await page.getByRole('button', {name:'Exit VR',exact:true}).waitFor();
  const modes = await page.evaluate(() => {
    const session=window.testXR,get=window.get,panel=get('vr-unified-panel');
    const background=window.vrScene.background,kit=get('vr-drum-kit'),lanes=get('vr-note-lanes');
    const source=session.connect('right');source.targetRaySpace={...source.gripSpace};window.panelStep(3);
    const pose=kit.matrixWorld.clone(),panelPose=panel.matrixWorld.clone();
    const initial=session.mode==='immersive-ar' && background.image.data[3]===255;
    window.panelStart(source);window.panelStep(10);
    const chart=get('note-highway-anchor'),note=get('note-kick-3000'),before=note.position.clone();
    window.panelMode(source,'ar');
    const ar=window.vrScene.background===null && note.visible && !note.position.equals(before);
    window.panelMode(source,'vr');
    return {initial,ar,restored:window.vrScene.background===background,
      continuous:kit===get('vr-drum-kit')&&lanes===get('vr-note-lanes')&&chart===get('note-highway-anchor')&&note.visible,
      fixed:kit.matrixWorld.equals(pose)&&panel.matrixWorld.equals(panelPose),
      noLegacy:!get('ar-mode-window')&&!get('vr-rhythm-controls'),sameSession:window.testXR===session&&!session.ended};
  });
  for(const [key,value] of Object.entries(modes)) assert(value,key);
  await page.close();
  const fallback=await setup({rejectFirstAR:true});
  await fallback.getByRole('button',{name:'Enter VR',exact:true}).click();
  await fallback.getByText(/First AR request rejected/).waitFor();
  await fallback.getByRole('button',{name:'Enter VR',exact:true}).click();
  await fallback.getByRole('button',{name:'Exit VR',exact:true}).waitFor();
  await fallback.evaluate(()=>{
    const session=window.testXR,source=session.connect('right');source.targetRaySpace={...source.gripSpace};window.panelStep(3);
    if(session.mode!=='immersive-vr')throw Error('Expected opaque fallback');
    window.panelStart(source);window.previousSession=session;
    window.previousChart=window.get('note-highway-anchor');window.previousKit=window.get('vr-drum-kit');
    window.previousPose=window.get('vr-unified-panel').matrixWorld.clone();window.panelMode(source,'ar');
  });
  await fallback.getByRole('button',{name:'Enter AR',exact:true}).waitFor();
  assert(await fallback.evaluate(()=>window.previousSession.ended));
  await fallback.getByRole('button',{name:'Enter AR',exact:true}).click();
  await fallback.getByRole('button',{name:'Exit VR',exact:true}).waitFor();
  assert(await fallback.evaluate(()=>{
    window.panelStep(5);const note=window.get('note-kick-3000'),before=note.position.clone();window.panelStep(10);
    return window.testXR.mode==='immersive-ar'&&window.vrScene.background===null
      &&window.get('note-highway-anchor')===window.previousChart&&window.get('vr-drum-kit')===window.previousKit
      &&window.get('vr-unified-panel').matrixWorld.equals(window.previousPose)&&note.visible&&!note.position.equals(before);
  }),'Fallback session preserves chart, kit, panel and resumes note timeline');
  assert.deepEqual(errors,[]);
  console.log('PASS: integrated BACKGROUND VR/AR switches, unchanged kit/panel, continuous chart and safe user-gesture session fallback. Physical Quest 3 NOT tested.');
} finally {await browser?.close();await vite.close();}
