import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1440,height:900}});
await page.addInitScript(()=>sessionStorage.setItem('drumup.brand-intro.v1','1'));
const errors=[];
page.on('pageerror', e=>errors.push(e.message));
try {
await page.goto('http://127.0.0.1:5173');
await page.locator('.showroom-drum-img').first().waitFor();
await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
const alpha=await page.locator('.showroom-drum-img').evaluateAll(imgs=>imgs.map(img=>{
  const canvas=document.createElement('canvas'); canvas.width=img.naturalWidth; canvas.height=img.naturalHeight;
  const ctx=canvas.getContext('2d'); ctx.drawImage(img,0,0);
  const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
  let transparent=0; for(let i=3;i<data.length;i+=4) if(data[i]===0) transparent++;
  return {src:img.getAttribute('src'),transparent:transparent/(canvas.width*canvas.height)};
}));
assert(alpha.every(i=>i.transparent>0.2),'All images need actual transparent backgrounds');
await page.evaluate(async()=>{
 const {drumSynth}=await import('/src/utils/synth.ts');
 window.auditions=[]; const trigger=drumSynth.trigger.bind(drumSynth);
 drumSynth.trigger=(...args)=>{window.auditions.push(args[0]);return trigger(...args)};
});
await page.locator('.slot-active .showroom-drum-img-wrapper').click();
assert.equal(await page.evaluate(()=>window.auditions.at(-1)),'snare');
for(const kit of ['Room','Rock','Jazz','Brush','Electronic','Standard']) {
 await page.getByRole('button',{name:kit,exact:true}).click();
 await page.waitForTimeout(310);
 assert.equal(await page.locator('.showroom-title').textContent(),kit.toUpperCase());
 assert.equal(await page.locator('.showroom-thumb-card[aria-pressed="true"]').innerText(),kit);
}
await page.getByRole('button',{name:'Previous drum kit',exact:true}).click();
assert.equal(await page.locator('.showroom-title').textContent(),'ELECTRONIC');
await page.keyboard.press('ArrowRight');
assert.equal(await page.locator('.showroom-title').textContent(),'STANDARD');
// Enter on a kit name changes the kit without accidentally entering play.
await page.getByRole('button',{name:'Jazz',exact:true}).focus();
await page.keyboard.press('Enter');
assert.equal(await page.locator('.showroom-title').textContent(),'JAZZ');
// Swipe navigation and click suppression.
const box=await page.locator('.showroom-stage-track').boundingBox();
const before=await page.evaluate(()=>window.auditions.length);
await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
await page.mouse.down(); await page.mouse.move(box.x+box.width/2-150,box.y+box.height/2,{steps:8}); await page.mouse.up();
assert.equal(await page.locator('.showroom-title').textContent(),'BRUSH');
assert.equal(await page.evaluate(()=>window.auditions.length),before);
await page.getByRole('button',{name:'Standard',exact:true}).click();
await page.waitForTimeout(310);
await page.screenshot({path:'selection-desktop.png'});
for(const [width,height] of [[390,844],[320,568],[844,390],[768,1024]]) {
 await page.setViewportSize({width,height});
 for(const kit of ['Standard','Room','Rock','Jazz','Brush','Electronic']) {
  await page.getByRole('button',{name:kit,exact:true}).click();
  await page.waitForTimeout(300);
  const bounds=await page.locator('.slot-active .showroom-drum-img').boundingBox();
  assert(bounds.x>=0 && bounds.x+bounds.width<=width+1,'Image must fit horizontally');
  assert.equal(await page.locator('.slot-active .showroom-drum-img').evaluate(i=>getComputedStyle(i).objectFit),'contain');
 }
 await page.getByRole('button',{name:'Standard',exact:true}).click();
 await page.waitForTimeout(310);
 await page.locator('.showroom-container').evaluate(e=>e.scrollTop=0);
 await page.screenshot({path:`selection-${width}x${height}.png`});
}
await page.setViewportSize({width:1440,height:900});
await page.getByRole('button',{name:'Room',exact:true}).click();
await page.locator('.showroom-select-btn').click();
await page.getByRole('button',{name:'← DRUM KITS'}).waitFor();
await page.getByRole('button',{name:'← DRUM KITS'}).click();
assert.equal(await page.locator('.showroom-title').textContent(),'ROOM');
await page.emulateMedia({reducedMotion:'reduce'});
assert.equal(await page.locator('.slot-active').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
assert.deepEqual(errors,[]);
console.log(JSON.stringify({result:'PASS',alpha,checks:['six kits','audition','arrows/wrap','keyboard Enter','drag suppression','four responsive sizes','selection and return','reduced motion','no runtime errors']},null,2));
} finally {await browser.close();}



