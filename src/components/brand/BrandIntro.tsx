import { useCallback, useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { BrandLogo, BRAND_LOGO_URL } from "./BrandLogo";
import { IntroAudio, INTRO_SCORE } from "./introScore";
import "./brandIntro.css";

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const ease = (n: number) => 1 - Math.pow(1 - clamp(n), 3);

export function BrandExperience({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const finish = useCallback(() => {
    setActive(false);
    requestAnimationFrame(() => {
      const target = returnFocus.current?.isConnected ? returnFocus.current : contentRef.current?.querySelector<HTMLElement>("button");
      target?.focus({ preventScroll: true });
    });
  }, []);
  return <>
    <div ref={contentRef} inert={active} aria-hidden={active || undefined}>{children}</div>
    {active && <BrandIntro onComplete={finish} />}
    {import.meta.env.DEV && <button hidden={active} className="intro-replay" onClick={event => {
      returnFocus.current = event.currentTarget; setActive(true);
    }}>↻ REPLAY INTRO</button>}
  </>;
}

/** One visual/audio clock, an independently mounted overlay, and no app-state mutations. */
export function BrandIntro({ onComplete }: { onComplete: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const flightRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const soundRef = useRef<IntroAudio | null>(null);
  const [audible, setAudible] = useState(false);
  const finished = useRef(false);
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true; soundRef.current?.dispose(); onComplete();
  }, [onComplete]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false, raf = 0, origin = 0, ready = false;
    let audioOrigin: number | null = null;
    let wasRunning = false;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    root.dataset.reduced = String(motion.matches);
    skipRef.current?.focus({ preventScroll: true });
    const preload = new Image(); preload.src = BRAND_LOGO_URL;
    const timeout = window.setTimeout(finish, 8000);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") finish(); };
    window.addEventListener("keydown", escape);
    const render = (now: number) => {
      if (cancelled || finished.current) return;
      let time = (now-origin)/1000;
      const audio = soundRef.current;
      const running = audio?.context.state === "running";
      if (running && audio) {
        if (!wasRunning) audioOrigin = audio.context.currentTime - time;
        time = audio.context.currentTime - (audioOrigin ?? 0);
        audio.schedule(time, audio.context.currentTime);
      } else if (wasRunning && audioOrigin !== null && audio) {
        origin = now - (audio.context.currentTime-audioOrigin)*1000;
        time = (now-origin)/1000;
      }
      wasRunning = Boolean(running);
      if (time >= (motion.matches ? 1 : 5.66)) { finish(); return; }
      const visualTime = motion.matches ? 4.6 : time;
      const pulse = (voice: string, decay: number) => INTRO_SCORE.reduce((value, beat) => {
        const age = time-beat.time;
        return beat.voice===voice && age>=0 ? Math.max(value,Math.exp(-age*decay)) : value;
      },0);
      const kick=pulse("kick",13), snare=pulse("snare",19), hat=pulse("hat",28);
      const set = (name: string, value: string | number) => root.style.setProperty(name,String(value));
      set("--kick",motion.matches?0:kick);set("--snare",motion.matches?0:snare);set("--hat",motion.matches?0:hat);
      set("--opening", time<0.8 ? Math.max(kick,0.01) : 0);
      set("--grid", visualTime<0.5?0:visualTime<2.5?0.1:0.23);
      const reveal = visualTime<0.85?0:visualTime<1.15?0.3:visualTime<1.45?0.64:visualTime<1.75?0.83:1;
      set("--reveal", `${reveal*100}%`);set("--logo-opacity",reveal?1:0);
      set("--logo-impact", motion.matches?1:1 + (time>=0.85&&time<2?kick*0.018:0));
      set("--glint", time>1.15&&time<1.62?1:0);
      set("--glint-x", `${100-clamp((time-1.15)/0.47)*100}%`);
      let progress=0;
      INTRO_SCORE.forEach(beat=>{if(beat.time<=visualTime&&beat.progress!==undefined)progress=beat.progress;});
      set("--progress",progress);set("--progress-percent",`${progress*100}%`);
      set("--loading-visible",visualTime>=2?1:0);
      set("--background-visible",visualTime>=2.5?1:0);
      set("--gather",ease((visualTime-4.5)/0.7));
      set("--exit",motion.matches?0:ease((time-5.2)/0.46));
      const exiting=time>=5.2&&!motion.matches;
      root.dataset.phase = exiting?"exit":visualTime>=4.5?"ready":visualTime>=2?"loading":visualTime>=0.85?"reveal":"black";
      if(labelRef.current) labelRef.current.textContent=visualTime>=4.5?"READY":progress===1?"SESSION PREPARED":"SETTING UP DRUMS";
      if(progressRef.current) progressRef.current.textContent=`${Math.round(progress*100).toString().padStart(2,"0")}%`;
      if(exiting&&flightRef.current) {
        const target=document.querySelector(".brand-header .brand-mark")?.getBoundingClientRect();
        if(target) {
          const p=ease((time-5.2)/0.46);
          const width=flightRef.current.offsetWidth;
          set("--land-x",`${(target.left+target.width/2-window.innerWidth/2)*p}px`);
          set("--land-y",`${(target.top+target.height/2-window.innerHeight*0.43)*p}px`);
          set("--land-scale",1+(target.width/width-1)*p);
        } else {
          const p=ease((time-5.2)/0.46);
          set("--land-scale",1+p*0.16);
          set("--land-y",`${-24*p}px`);
        }
      }
      raf=requestAnimationFrame(render);
    };
    const start = () => {
      if(cancelled || ready || finished.current) return;
      ready=true; clearTimeout(timeout);origin=performance.now();root.dataset.loaded="true";
      if(!motion.matches && typeof AudioContext!=="undefined") {
        try { const bus=new IntroAudio();soundRef.current=bus;setAudible(bus.context.state==="running"); } catch { /* Silent visual timeline remains available. */ }
      }
      raf=requestAnimationFrame(render);
    };
    void preload.decode().then(start).catch(finish);
    return () => {
      cancelled=true;cancelAnimationFrame(raf);clearTimeout(timeout);
      window.removeEventListener("keydown",escape);
      soundRef.current?.dispose();soundRef.current=null;
    };
  }, [finish]);

  const toggleSound = async () => {
    const audio=soundRef.current;
    if(!audio) return;
    try {
      if(audio.context.state==="running") await audio.context.suspend();
      else await audio.context.resume();
      setAudible(audio.context.state==="running");
    } catch { setAudible(false); }
  };
  return <div ref={rootRef} className="brand-intro" role="dialog" aria-modal="true" aria-label="DRUM UP 시작 인트로"
    onKeyDown={event=>{
      event.stopPropagation();
      if(event.key==="Escape") { event.preventDefault(); finish(); return; }
      if(event.key==="Tab") {
        const buttons=Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>("button")??[]);
        const i=buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault();buttons[(i+(event.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();
      }
    }}>
    <div className="intro-curtain intro-curtain-top" /><div className="intro-curtain intro-curtain-bottom" />
    <div className="intro-scene" aria-hidden="true">
      <div className="intro-perspective"><div className="intro-grid" /></div>
      <div className="intro-bass-wave" />
      <svg className="intro-waveform" viewBox="0 0 1200 160" preserveAspectRatio="none">
        <path d="M0 80H230l18-7 13 14 16-32 16 49 15-24h45l11-18 16 35 15-17h61l20-46 20 95 19-75 19 44 20-18h52l17-24 18 43 20-19h45l16-37 18 66 19-44 20 15h180" />
        <path className="intro-snare-line" d="M0 80H1200" />
      </svg>
      <div className="intro-spectrum">{Array.from({length:49},(_,i)=><i key={i} style={{"--bar-height":`${8+Math.abs(Math.sin(i*1.37))*42}px`,"--bar-weight":0.25+Math.abs(Math.cos(i*.83))*.75} as CSSProperties} />)}</div>
      <div className="intro-first-dot" />
      <div className="intro-loader">
        <div className="intro-loader-head"><span ref={labelRef}>SETTING UP DRUMS</span><span ref={progressRef}>00%</span></div>
        <div className="intro-progress"><i /><b /></div>
        <svg className="intro-mini-kit" viewBox="0 0 300 92">
          <g className="intro-mini-kick"><circle cx="80" cy="54" r="22"/><circle cx="80" cy="54" r="17"/><path d="M66 73l-7 9M95 73l7 9"/></g>
          <g className="intro-mini-snare"><ellipse cx="151" cy="52" rx="24" ry="8"/><path d="M127 52v16q24 17 48 0V52M151 76v10"/></g>
          <g className="intro-mini-hat"><path d="M205 39q23-10 46 0M207 42h42M228 35v45m-12 7 12-7 13 7"/></g>
          <path className="intro-stick-left" d="M127 15l20 32"/><path className="intro-stick-right" d="M176 13l-21 34"/>
          <path className="intro-hat-stick" d="M251 16l-20 20"/>
        </svg>
        <div className="intro-voice-labels"><span>KICK</span><span>SNARE</span><span>HI-HAT</span></div>
      </div>
    </div>
    <div ref={flightRef} className="intro-logo-flight" aria-hidden="true">
      <div className="intro-logo-reveal"><BrandLogo /><div className="intro-logo-glint"><BrandLogo /></div></div>
      <div className="intro-tagline">FIND YOUR RHYTHM.</div>
    </div>
    <div className="intro-sweep" aria-hidden="true" />
    <div className="intro-controls"><button onClick={()=>void toggleSound()} aria-pressed={audible}>{audible?"SOUND ON":"SOUND OFF"}</button>
      <button ref={skipRef} onClick={finish}>SKIP INTRO <span aria-hidden="true">↗</span></button></div>
    <div className="intro-footnote" aria-hidden="true"><span>DRUM UP / PERFORMANCE SYSTEM</span><span>MUSIC. RHYTHM. YOU.</span></div>
  </div>;
}
