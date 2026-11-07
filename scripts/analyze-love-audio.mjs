import { chromium } from 'playwright';
import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const vite=await createServer({server:{host:'127.0.0.1',port:0,watch:null}});await vite.listen();let browser;
try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();
  await page.goto(vite.resolvedUrls.local[0]);
  const result=await page.evaluate(async()=>{
    const ctx=new AudioContext();const buffer=await ctx.decodeAudioData(await(await fetch('/songs/love/love.mp3')).arrayBuffer());
    const sr=22050,seconds=65,hop=.01;
    async function envelope(low,high){
      const offline=new OfflineAudioContext(1,sr*seconds,sr),source=offline.createBufferSource();source.buffer=buffer;
      const hp=offline.createBiquadFilter();hp.type='highpass';hp.frequency.value=low;
      const lp=offline.createBiquadFilter();lp.type='lowpass';lp.frequency.value=high;
      source.connect(hp);hp.connect(lp);lp.connect(offline.destination);source.start();
      const data=(await offline.startRendering()).getChannelData(0),env=[];
      for(let i=0;i<data.length;i+=Math.round(sr*hop)){let sum=0,n=Math.min(Math.round(sr*hop),data.length-i);for(let j=0;j<n;j++)sum+=data[i+j]**2;env.push(Math.sqrt(sum/n));}
      return env;
    }
    const [low,high,full]=await Promise.all([envelope(35,180),envelope(1400,8000),envelope(20,10000)]);
    const onset=e=>e.map((v,i)=>Math.max(0,v-(e[i-1]??v)));
    const peaks=e=>e.map((v,i)=>({time:i*hop,value:v})).filter((p,i)=>i>0&&p.value>e[i-1]&&p.value>e[i+1]).sort((a,b)=>b.value-a.value).slice(0,80).sort((a,b)=>a.time-b.time);
    const chart=await(await fetch('/songs/love/love_first_4_bars.json')).json();
    const lo=onset(low),hi=onset(high),max=e=>Math.max(...e);
    const at=(e,t)=>{const i=Math.round(t/hop);return Math.max(0,...e.slice(Math.max(0,i-3),i+5));};
    const candidates=[];
    for(let offset=0;offset<40;offset+=.01){let score=0;
      for(const note of chart.notes.filter(n=>n.instrument!=='ride'))score+=at(note.instrument==='kick'?lo:hi,offset+note.time)/(note.instrument==='kick'?max(lo):max(hi));
      candidates.push({offset:Number(offset.toFixed(2)),score});
    }
    const best=[];for(const c of candidates.sort((a,b)=>b.score-a.score)){if(best.every(p=>Math.abs(p.offset-c.offset)>.35))best.push(c);if(best.length===12)break;}
    const bins=Array.from({length:100},(_,i)=>({time:i*.1,rms:Math.max(...full.slice(i*10,i*10+10)),low:Math.max(...low.slice(i*10,i*10+10)),high:Math.max(...high.slice(i*10,i*10+10))}));
    const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=650;const g=canvas.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,1600,650);
    [full,low,high].forEach((e,row)=>{g.strokeStyle=['#222','#d33','#36a'][row];g.beginPath();for(let i=0;i<4000;i++){const x=i/4000*1560+30,y=row*210+195-e[i]/max(e)*175;if(i)g.lineTo(x,y);else g.moveTo(x,y);}g.stroke();g.fillStyle='#222';g.font='16px Arial';for(let s=0;s<=40;s+=2){g.fillText(String(s),30+s/40*1560,row*210+208);}});
    await ctx.close();return {duration:buffer.duration,sampleRate:buffer.sampleRate,firstAudible:full.findIndex(v=>v>.001)*hop,best,lowPeaks:peaks(lo),highPeaks:peaks(hi),bins,image:canvas.toDataURL()};
  });
  const image=result.image;delete result.image;await writeFile(join(tmpdir(),'love-audio-analysis.json'),JSON.stringify(result,null,2));await writeFile(join(tmpdir(),'love-audio-analysis.png'),Buffer.from(image.split(',')[1],'base64'));
  console.log(JSON.stringify(result,null,2));
}finally{await browser?.close();await vite.close();}
