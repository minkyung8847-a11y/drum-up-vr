import fs from 'node:fs';
const files=['src/index.css','src/App.tsx','src/components/MidiSettingsModal.tsx','src/components/DrumKitSelector.tsx','src/components/DrumKit.tsx','src/components/Drum2D.tsx','src/components/SongPractice.tsx','src/components/GameCanvas.tsx','src/components/RudimentPractice.tsx'];
const accents=['00c781','00b372','00e599','34c759','30d158','ff2d55','af52de','5856d6','007aff','ff9500','ffcc00','ff3b30','ff5500','b25900','f3cd82','f4a7b9','95c2de','98d9c2','af78db','708ee6','e98862'];
for(const file of files){
 let c=fs.readFileSync(file,'utf8');
 c=c.replace(new RegExp('#('+accents.join('|')+')\\b','gi'),'#FF6D2D');
 c=c.replace(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/g,(match,r,g,b,a)=>{
  if(new Set([r,g,b]).size>1 && (Math.max(+r,+g,+b)-Math.min(+r,+g,+b)>35)) return `rgba(255, 109, 45, ${a})`;
  return match;
 });
 // Low-opacity light-theme surfaces and borders become visible on dark backgrounds.
 c=c.replace(/rgba\(0,\s*0,\s*0,\s*(0\.0\d+)\)/g,'rgba(255, 255, 255, $1)');
 if(file.endsWith('.tsx')) c=c.replace(/background: "#ffffff"/g,'background: "var(--bg-card)"');
 fs.writeFileSync(file,c);
}
let c=fs.readFileSync('src/index.css','utf8');
c=c.slice(0,c.indexOf('/* Acoustic instrument stage.'));
c=c.replace('--bg-app: #f4f5f7;','--bg-app: #0A0A0A;\n  color-scheme: dark;').replace('--bg-card: rgba(255, 255, 255, 0.85);','--bg-card: #111111;').replace('--border-card: rgba(255, 255, 255, 0.4);','--border-card: #292929;').replace('--text-primary: #1c1c1e;','--text-primary: #FFFFFF;').replace('--text-secondary: #6e6e73;','--text-secondary: #999999;').replace('--text-tertiary: #aeaeb2;','--text-tertiary: #777777;').replace('--radius-md: 16px;','--radius-md: 8px;').replace('--radius-lg: 24px;','--radius-lg: 12px;');
c=c.replace(/background: radial-gradient\(circle at 50% 30%, #ffffff 0%, #f4f5f7 100%\);/,'background: var(--bg-app);');
c=c.replace(/background(?:-color)?: #ffffff;/g,'background: var(--bg-card);');
c=c.replace('background: var(--text-primary);\n  color: #ffffff;', 'background: var(--accent-color);\n  color: #000000;');
fs.writeFileSync('src/index.css',c);
c=fs.readFileSync('src/App.tsx','utf8').replace('className={`app-container play-view-in ${activeTab === "FREE PLAY" ? "acoustic-studio" : ""}`}','className={`app-container play-view-in ${activeTab === "FREE PLAY" ? "acoustic-studio" : ""}`} data-view={activeTab}');
c=c.replace('<button className="menu-button">','<button className="menu-button" aria-label="드럼 키트 선택" onClick={() => setAppView("SHOWROOM")}>');
c=c.replace('background: "var(--accent-color, #FF6D2D)"','background: "var(--accent-color)"');
c=c.replaceAll('color: "#ffffff",\n                    background: "#FF6D2D"','color: "#000000",\n                    background: "#FF6D2D"');
fs.writeFileSync('src/App.tsx',c);
c=fs.readFileSync('src/components/SongPractice.tsx','utf8').replaceAll('background: "var(--text-primary)"','background: "var(--accent-color)"').replace('"var(--text-tertiary)" : "var(--text-primary)"','"var(--text-tertiary)" : "var(--accent-color)"').replace('fill="#ffffff"','fill="#000000"');
fs.writeFileSync('src/components/SongPractice.tsx',c);
c=fs.readFileSync('src/components/RudimentPractice.tsx','utf8');
c=c.replace(/        const grad = ctx.createRadialGradient\(0, 0, 0, 0, 0, radiusX\);[\s\S]*?        ctx.fillStyle = grad;/,'        ctx.fillStyle = color;');
c=c.replace(/          const grad = ctx.createLinearGradient\(pt.x, pt.y, targetX, targetY\);[\s\S]*?          ctx.fillStyle = grad;/,'          ctx.fillStyle = spotlightColors[index];');
c=c.replace('ctx.shadowBlur = 10 * proj.projectedProgress;', 'ctx.shadowBlur = 0;');
c=c.replace('rgba(28, 28, 30, 0.52)', 'rgba(255, 255, 255, 0.65)');
fs.writeFileSync('src/components/RudimentPractice.tsx',c);
