import {VR_JUDGMENT_COLORS} from './vrNeonStyle';
import {DRUM_HEIGHT} from './vrDrumHeight';
import type { FootPedalState } from '../pedal/footPedal';
import { DRUM_ENVIRONMENTS } from './drumEnvironments';
import type { DrumEnvironmentId } from './drumEnvironments';
import { ANTIFREEZE_SONG, LOVE_SONG } from './vrMusicSong';

// Canvas drawing and UV raycasting share these bounds.
export const FOOT_PEDAL_LAYOUT = {
  entry: { x: 84, y: 518, width: 856, height: 40 },
  enable: { x: 84, y: 568, width: 380, height: 40 },
  buttons: [84, 374, 664].map(x => ({ x, y: 618, width: 270, height: 44 })),
};
export const PANEL_SIZE = { width: 1024, height: 920 };
export const PANEL_TABS = ['MUSIC', 'PRACTICE', 'BACKGROUND', 'SETTINGS'] as const;
export const PANEL_GENRES = ['All', 'Pop', 'Rock', 'Band', 'K-Pop', 'My Song'] as const;
export const SONG_LIST = { x: 50, y: 388, width: 922, height: 480, row: 80 };
export const DEMO_SONGS = [
  LOVE_SONG,
  ANTIFREEZE_SONG,
  { title: 'Shape of You', artist: 'Ed Sheeran', difficulty: 'Normal', stars: 4, genres: ['Pop'], art: 0 },
  { title: 'Believer', artist: 'Imagine Dragons', difficulty: 'Hard', stars: 3, genres: ['Rock', 'Band'], art: 1 },
  { title: 'Back In Black', artist: 'AC/DC', difficulty: 'Hard', stars: 2, genres: ['Rock', 'Band'], art: 2 },
  { title: 'Sunday Morning', artist: 'Maroon 5', difficulty: 'Normal', stars: 3.5, genres: ['Pop', 'Band'], art: 3 },
  { title: 'I Was Made For Loving You', artist: 'KISS', difficulty: 'Expert', stars: 3, genres: ['Rock', 'Band'], art: 4 },
  { title: 'Radioactive', artist: 'Imagine Dragons', difficulty: 'Normal', stars: 4, genres: ['Rock', 'Band'], art: 5 },
  { title: 'Hysteria', artist: 'Muse', difficulty: 'Expert', stars: 5, genres: ['Rock', 'Band'], art: 6 },
  { title: 'Seven Nation Army', artist: 'The White Stripes', difficulty: 'Hard', stars: 3, genres: ['Rock', 'Band'], art: 7 },
] as const;
export interface UnifiedPanelState {
  tab: typeof PANEL_TABS[number]; genre: string; song: number; scroll: number;
  practice: 'FREE PLAY' | 'RUDIMENT'; background: DrumEnvironmentId;
  setting: 'AUDIO' | 'CONTROLLER' | 'NOTE' | 'GENERAL'; volume: number;
  hover: string; pressed: string;
  minimized: boolean; viewMode: 'vr' | 'ar'; canAR: boolean;
  rhythm: 'idle' | 'playing' | 'paused' | 'finished'; bpm: number;
  perfect: number; great: number; miss: number; countIn?: number; noteSyncMs: number;
  judgment?: 'Perfect' | 'Great' | 'Miss';
  drumHeight?: number; drumHeightSaved?: boolean;
  footPedal?: FootPedalState; footPedalOpen?: boolean;
  songResults?: { perfect: number; great: number; miss: number; accuracy: number };
}
export function filteredSongs(state: UnifiedPanelState) {
  return DEMO_SONGS.map((song, id) => ({ ...song, id }))
    .filter(song => state.genre === 'All' || (song.genres as readonly string[]).includes(state.genre));
}
export const maxSongScroll = (state: UnifiedPanelState) => Math.max(0, filteredSongs(state).length * SONG_LIST.row - SONG_LIST.height);
export type PanelAction = { key: string; kind: 'tab' | 'genre' | 'song' | 'practice' | 'background' | 'setting' | 'volume' | 'scrollbar' | 'panel' | 'rhythm' | 'view' | 'reset' | 'move' | 'detail' | 'noteSync' | 'results' | 'pedal' | 'player' | 'drumHeight' | 'tutorial' | 'overlay'; index: number };
export function panelActionAt(state: UnifiedPanelState, x: number, y: number): PanelAction | null {
  for (let index = 0; index < 4; index++) {
    if (Math.hypot(x - [200, 432, 656, 880][index], y - 106) <= 86)
      return { key: `tab-${index}`, kind: 'tab', index };
  }
  if (state.minimized) return null;
  if (x < 12 || x > 1012 || y < 226 || y > 898) return null;
  const action = (kind: PanelAction['kind'], index: number): PanelAction => ({ key: `${kind}-${index}`, kind, index });
  if (state.songResults) return x >= 180 && x <= 844 && y >= 770 && y <= 842 ? action('results', 0) : action('panel', 0);
  if (state.tab === 'PRACTICE' && state.practice === 'RUDIMENT' && y >= 660 && y <= 728 && x >= 60 && x <= 964) {
    const index = Math.floor((x - 60) / 310);
    if (index < 3 && (x - 60) % 310 <= 284) return action('rhythm', index);
  }
  if (state.tab === 'BACKGROUND' && y >= 307 && y <= 359) {
    if (x >= 60 && x <= 490) return action('view', 0);
    if (x >= 534 && x <= 964 && state.canAR) return action('view', 1);
  }
  if (state.tab === 'SETTINGS' && x >= 84 && x <= 940 && y >= 770 && y <= 828) return action('reset', 0);
  if (state.tab === 'SETTINGS' && state.setting !== 'CONTROLLER' && x >= 84 && x <= 940 && y >= 840 && y <= 890)
    return action('tutorial', 0);
  if (state.tab === 'MUSIC') {
    if (y >= 311 && y <= 365 && x >= 60 && x <= 976) {
      const index = Math.floor((x - 60) / 156);
      if (index < 6 && (x - 60) % 156 <= 140) return action('genre', index);
    }
    if (x >= 980 && x <= 1007 && y >= 420 && y <= 856) return action('scrollbar', 0);
    if (x >= SONG_LIST.x && x <= SONG_LIST.x + SONG_LIST.width && y >= SONG_LIST.y && y < SONG_LIST.y + SONG_LIST.height) {
      const song = filteredSongs(state)[Math.floor((y - SONG_LIST.y + state.scroll) / SONG_LIST.row)];
      if (song) return action('song', song.id);
    }
  } else if (state.tab === 'PRACTICE' && y >= 364 && y <= 604) {
    if (x >= 60 && x <= 490) return action('practice', 0);
    if (x >= 534 && x <= 964) return action('practice', 1);
  } else if (state.tab === 'BACKGROUND' && y >= 370 && y <= 670 && x >= 60 && x <= 964) {
    const index = Math.floor((x - 60) / 310);
    if (index < DRUM_ENVIRONMENTS.length && (x - 60) % 310 <= 284) return action('background', index);
  } else if (state.tab === 'SETTINGS') {
    if (state.setting === 'CONTROLLER') {
      const within = (box: { x: number; y: number; width: number; height: number }) =>
        x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
      if (within(FOOT_PEDAL_LAYOUT.entry)) return action('pedal', 0);
      if (state.footPedalOpen) {
        if (within(FOOT_PEDAL_LAYOUT.enable)) return action('pedal', 4);
        const index = FOOT_PEDAL_LAYOUT.buttons.findIndex(within);
        if (index >= 0) return action('pedal', index + 1);
      }
    }
    if (state.setting === 'GENERAL' && y>=618 && y<=678) {
      if(x>=84&&x<=344)return action('drumHeight',-1);
      if(x>=382&&x<=642)return action('drumHeight',1);
      if(x>=680&&x<=940)return action('drumHeight',0);
    }
    if (state.setting === 'NOTE') {
      if (y >= 611 && y <= 683 && x >= 84 && x <= 194) return action('noteSync', -1);
      if (y >= 611 && y <= 683 && x >= 830 && x <= 940) return action('noteSync', 1);
      if (y >= 700 && y <= 748 && x >= 390 && x <= 634) return action('noteSync', 0);
    }
    if (y >= 370 && y <= 500 && x >= 60 && x <= 964) {
      const index = Math.floor((x - 60) / 234);
      if (index < 4 && (x - 60) % 234 <= 202) return action('setting', index);
    }
    if (state.setting === 'AUDIO' && y >= 611 && y <= 683) {
      if (x >= 84 && x <= 164) return action('volume', -1);
      if (x >= 860 && x <= 940) return action('volume', 1);
    }
  }
  return action('panel', 0);
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius);
}
function metal(ctx: CanvasRenderingContext2D, y: number, height: number, selected = false) {
  const gradient = ctx.createLinearGradient(0, y, 0, y + height);
  for (const [stop, color] of (selected
    ? [[0, '#c7cbd5'], [.12, '#989eac'], [.52, '#616676'], [.88, '#9298a6'], [1, '#dce0e8']]
    : [[0, '#393c44'], [.18, '#292b32'], [.62, '#17191f'], [1, '#30333c']]) as [number, string][]) gradient.addColorStop(stop, color);
  return gradient;
}
function icon(ctx: CanvasRenderingContext2D, type: string, x: number, y: number, size: number) {
  ctx.save(); ctx.translate(x - size / 2, y - size / 2); ctx.scale(size / 80, size / 80);
  const gradient = ctx.createLinearGradient(0, 0, 60, 80);
  gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.4, '#e7e9f2'); gradient.addColorStop(1, '#a1a7b5');
  ctx.fillStyle = gradient; ctx.strokeStyle = '#edf0f7'; ctx.lineWidth = 1;
  let path: Path2D;
  if (type === 'MUSIC') path = new Path2D('M25 13 L69 5 L69 57 C69 72 46 77 45 62 C45 54 54 49 62 51 L62 23 L32 29 L32 64 C32 78 9 82 8 68 C8 60 17 55 25 57 Z');
  else if (type === 'PRACTICE') path = new Path2D('M40 3 C55 20 39 24 55 39 C61 31 59 26 60 21 C81 54 67 72 47 77 C59 61 43 57 42 43 C23 59 31 68 34 77 C8 70 6 50 23 32 C21 42 26 45 29 42 C41 29 32 18 40 3 Z');
  else if (type === 'BACKGROUND') path = new Path2D('M4 36 L40 5 L76 36 L66 36 L66 73 L48 73 L48 50 L32 50 L32 73 L14 73 L14 36 Z');
  else {
    path = new Path2D();
    for (let index = 0; index < 64; index++) {
      const angle = index / 64 * Math.PI * 2 - Math.PI / 2;
      const radius = index % 8 < 4 ? 35 : 27;
      const px = 40 + Math.cos(angle) * radius, py = 40 + Math.sin(angle) * radius;
      if (index === 0) path.moveTo(px, py); else path.lineTo(px, py);
    }
    path.closePath(); path.moveTo(55, 40); path.arc(40, 40, 15, 0, Math.PI * 2, true);
  }
  ctx.shadowColor = '#d9e4ff55'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
  ctx.fill(path, 'evenodd'); ctx.shadowBlur = 0; ctx.stroke(path); ctx.restore();
}
function stars(ctx: CanvasRenderingContext2D, count: number, y: number) {
  for (let index = 0; index < 5; index++) {
    const path = new Path2D(); const x = 805 + index * 28;
    for (let point = 0; point < 10; point++) {
      const angle = -Math.PI / 2 + point * Math.PI / 5, radius = point % 2 ? 5.2 : 12;
      const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius;
      if (point === 0) path.moveTo(px, py); else path.lineTo(px, py);
    }
    path.closePath(); ctx.fillStyle = '#454850'; ctx.fill(path);
    const fraction = Math.min(1, Math.max(0, count - index));
    if (fraction) { ctx.save(); ctx.clip(path); ctx.fillStyle = '#f68c3e'; ctx.fillRect(x - 13, y - 14, 26 * fraction, 28); ctx.restore(); }
  }
}
// Local illustrative placeholders, not downloaded or presented as real album art.
function album(index: number) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 120;
  const ctx = canvas.getContext('2d')!;
  const palettes = [['#0588c1', '#fa9488', '#33234b'], ['#06080b', '#31404d', '#08090b'], ['#11100e', '#403b33', '#060606'],
    ['#404c6b', '#df7e59', '#683633'], ['#f3efe5', '#f7e5cc', '#f0e9dc'], ['#003c50', '#138599', '#001d2c'],
    ['#261e4f', '#aebbd0', '#141023'], ['#26212a', '#dbdfdc', '#73171f']];
  const gradient = ctx.createLinearGradient(0, 0, 0, 120);
  palettes[index].forEach((color, at) => gradient.addColorStop(at / 2, color)); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 120, 120);
  if (index === 0) {
    ctx.fillStyle = '#403761'; ctx.beginPath(); ctx.moveTo(0, 91); ctx.lineTo(42, 69); ctx.lineTo(120, 98); ctx.lineTo(120, 120); ctx.lineTo(0, 120); ctx.fill();
    ctx.fillStyle = '#151723'; ctx.beginPath(); ctx.arc(62, 59, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(59, 63, 7, 25); ctx.fillRect(58, 85, 3, 16); ctx.fillRect(64, 85, 3, 16);
  } else if (index === 1) {
    const glow = ctx.createRadialGradient(61, 39, 1, 61, 39, 48); glow.addColorStop(0, '#ffffff'); glow.addColorStop(.2, '#bdcfdc'); glow.addColorStop(1, '#202b3500'); ctx.fillStyle = glow; ctx.fillRect(0, 0, 120, 120);
    ctx.fillStyle = '#d4e0e7'; ctx.beginPath(); ctx.moveTo(57, 17); ctx.lineTo(68, 83); ctx.lineTo(43, 83); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#9e332c'; ctx.fillRect(40, 79, 39, 16);
  } else if (index === 2) {
    ctx.textAlign = 'center'; ctx.fillStyle = '#d8d2c6'; ctx.font = 'italic bold 22px Georgia'; ctx.fillText('Back', 60, 43); ctx.font = 'italic 15px Georgia'; ctx.fillText('in black', 60, 65);
  } else if (index === 3 || index === 4) {
    for (let n = 0; n < 14; n++) {
      const x = 12 + (n * 23 % 96), y = 26 + (n * 17 % 64);
      ctx.fillStyle = index === 3 ? (n % 2 ? '#ffbd8d' : '#813d38') : (n % 2 ? '#c8452e' : '#921f21');
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x - 4, y + 5, 9, 20);
    }
  } else {
    ctx.fillStyle = index === 7 ? '#a42c32' : '#b9d1d3';
    for (let n = 0; n < 12; n++) { const y = 45 + n * 5; ctx.fillRect(15 + n * 7 % 65, y, 24, 2); }
    ctx.fillStyle = '#e1e8df'; ctx.font = 'bold 8px Arial'; ctx.textAlign = 'center'; ctx.fillText(index === 5 ? 'RADIOACTIVE' : index === 6 ? 'HYSTERIA' : 'SEVEN NATION', 60, 22);
  }
  return canvas;
}
const albumCache: HTMLCanvasElement[] = [];
const songCovers = new Map([LOVE_SONG, ANTIFREEZE_SONG].map(song => {
  const cover = new Image();
  cover.src = song.cover;
  return [song.key, cover] as const;
}));
export const musicCovers = Array.from(songCovers.values());
function card(ctx: CanvasRenderingContext2D, state: UnifiedPanelState, key: string, x: number, y: number, w: number, h: number, selected: boolean, radius = 15) {
  rounded(ctx, x, y, w, h, radius); ctx.fillStyle = metal(ctx, y, h, selected); ctx.fill();
  ctx.strokeStyle = selected ? '#edf0f8' : state.hover === key ? '#aeb6c5' : '#666c7855'; ctx.lineWidth = selected ? 1.5 : 1; ctx.stroke();
  if (state.pressed === key) { ctx.fillStyle = '#ffffff18'; ctx.fill(); }
}
function title(ctx: CanvasRenderingContext2D, text: string, symbol: string) {
  icon(ctx, symbol, 78, 269, 40); ctx.fillStyle = '#e7e8ef'; ctx.font = '600 34px Arial'; ctx.textAlign = 'left'; ctx.fillText(text, 132, 281);
}
function environmentThumb(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, width: number) {
  ctx.save(); rounded(ctx, x, y, width, 175, 7); ctx.clip();
  const gradient = ctx.createLinearGradient(x, y, x, y + 175);
  gradient.addColorStop(0, id === 'cloud' ? '#636b96' : '#151a23'); gradient.addColorStop(1, id === 'cloud' ? '#bd9bba' : '#06080d');
  ctx.fillStyle = gradient; ctx.fillRect(x, y, width, 175);
  if (id === 'concert') {
    ctx.fillStyle = '#b8c4d928'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + 35 + i * 62, y); ctx.lineTo(x + i * 62, y + 175); ctx.lineTo(x + 95 + i * 62, y + 175); ctx.fill(); }
    ctx.fillStyle = '#ccd2df88'; ctx.fillRect(x + 18, y + 135, width - 36, 3);
  } else if (id === 'cloud') {
    ctx.fillStyle = '#dfe0ec66'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(x + i * 65, y + 120 + i % 2 * 15, 75, 28, 0, 0, Math.PI * 2); ctx.fill(); }
  } else { ctx.strokeStyle = '#b7c1d333'; ctx.strokeRect(x + 35, y + 28, width - 70, 115); ctx.beginPath(); ctx.moveTo(x, y + 156); ctx.lineTo(x + width, y + 156); ctx.stroke(); }
  ctx.restore();
}
export function drawUnifiedPanel(ctx: CanvasRenderingContext2D, state: UnifiedPanelState) {
  const { width: w, height: h } = PANEL_SIZE;
  ctx.clearRect(0, 0, w, h);
  PANEL_TABS.forEach((tab, index) => {
    const x = [200, 432, 656, 880][index], selected = state.tab === tab;
    ctx.save(); ctx.beginPath(); ctx.arc(x, 106, selected ? 86 : 81, 0, Math.PI * 2);
    ctx.fillStyle = metal(ctx, 24, 164); ctx.shadowColor = selected ? '#dce8ff88' : '#000000'; ctx.shadowBlur = selected ? 10 : 3; ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = selected ? '#eff5ff' : '#b4b8c4'; ctx.lineWidth = selected ? 2.2 : 1.6; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, 106, selected ? 82 : 77, 0, Math.PI * 2); ctx.strokeStyle = '#dce0ed28'; ctx.lineWidth = 1; ctx.stroke();
    if (state.hover === `tab-${index}` || state.pressed === `tab-${index}`) { ctx.fillStyle = state.pressed === `tab-${index}` ? '#ffffff20' : '#ffffff0c'; ctx.fill(); }
    icon(ctx, tab, x, 85, 72); ctx.fillStyle = '#f2f3f7'; ctx.font = '600 17px Arial'; ctx.textAlign = 'center'; ctx.fillText(tab, x, 154); ctx.restore();
  });
  if (state.minimized) return;
  rounded(ctx, 12, 226, 1000, 672, 20);
  ctx.fillStyle = '#17191e'; ctx.fill(); ctx.strokeStyle = '#c7c9d4'; ctx.lineWidth = 1.8; ctx.stroke();
  rounded(ctx, 15, 229, 994, 666, 17); ctx.strokeStyle = '#ffffff24'; ctx.lineWidth = .8; ctx.stroke();
  if (state.songResults) {
    title(ctx, 'RESULTS', 'MUSIC');
    const result = state.songResults;
    [['PERFECT', result.perfect], ['GREAT', result.great], ['MISS', result.miss], ['ACCURACY', `${result.accuracy.toFixed(1)}%`]].forEach(([label, value], index) => {
      ctx.textAlign = 'left'; ctx.font = '600 28px Arial'; ctx.fillStyle = '#cbd2de'; ctx.fillText(String(label), 180, 410 + index * 85);
      ctx.textAlign = 'right'; ctx.fillStyle = '#f4f6fb'; ctx.font = '600 36px Arial'; ctx.fillText(String(value), 844, 410 + index * 85);
    });
    card(ctx, state, 'results-0', 180, 770, 664, 72, true);
    ctx.textAlign = 'center'; ctx.font = '600 25px Arial'; ctx.fillStyle = '#f5f7ff'; ctx.fillText('BACK TO MUSIC', 512, 816);
    return;
  }
  if (state.tab === 'MUSIC') {
    title(ctx, 'SONG SELECT', 'MUSIC');
    card(ctx, state, 'search', 894, 249, 92, 52, false, 26);
    ctx.strokeStyle = '#edf0f7'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(935, 272, 12, 0, Math.PI * 2); ctx.moveTo(944, 281); ctx.lineTo(958, 294); ctx.stroke();
    PANEL_GENRES.forEach((genre, index) => {
      card(ctx, state, `genre-${index}`, 60 + index * 156, 311, 140, 54, state.genre === genre, 27);
      ctx.font = '400 23px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = state.genre === genre ? '#ffffff' : '#c6c9d2'; ctx.fillText(genre, 130 + index * 156, 346);
    });
    ctx.save(); rounded(ctx, SONG_LIST.x, SONG_LIST.y, SONG_LIST.width, SONG_LIST.height, 16); ctx.clip();
    const songs = filteredSongs(state);
    songs.forEach((song, index) => {
      const y = SONG_LIST.y + index * SONG_LIST.row - state.scroll;
      if (y + SONG_LIST.row < SONG_LIST.y || y > SONG_LIST.y + SONG_LIST.height) return;
      const selected = song.id === state.song;
      if (selected) {
        rounded(ctx, 50, y + 1, 922, 78, 16);
        const selectedBody = ctx.createLinearGradient(0, y, 0, y + 80);
        [[0, '#a6adbc'], [.12, '#444953'], [.5, '#292c33'], [.86, '#3b404b'], [1, '#969eae']].forEach(([stop, color]) => selectedBody.addColorStop(stop as number, color as string));
        ctx.fillStyle = selectedBody; ctx.fill(); ctx.strokeStyle = '#d7dce8'; ctx.lineWidth = 1.2; ctx.stroke();
      } else if (state.hover === `song-${song.id}`) { ctx.fillStyle = '#ffffff08'; ctx.fillRect(51, y, 920, 80); }
      if (!albumCache[song.art]) albumCache[song.art] = album(song.art % 8);
      ctx.save(); rounded(ctx, 88, y + 4, 72, 72, 9); ctx.clip();
      const cover = 'key' in song ? songCovers.get(song.key) : undefined;
      ctx.drawImage(cover?.complete && cover.naturalWidth ? cover : albumCache[song.art], 88, y + 4, 72, 72); ctx.restore();
      ctx.textAlign = 'left'; ctx.fillStyle = '#f2f3f6'; ctx.font = '600 24px Arial'; ctx.fillText(song.title, 204, y + 32, 430);
      ctx.fillStyle = '#c1c4ce'; ctx.font = '400 21px Arial, "Malgun Gothic", sans-serif'; ctx.fillText(song.artist, 204, y + 62, 430);
      ctx.textAlign = 'center'; ctx.fillStyle = '#e0e2e8'; ctx.font = '400 21px Arial'; ctx.fillText(song.difficulty, 692, y + 47);
      stars(ctx, song.stars, y + 42);
      if (!selected) { const line = ctx.createLinearGradient(90, 0, 966, 0); line.addColorStop(0, '#bcc5db00'); line.addColorStop(.4, '#a6aec044'); line.addColorStop(1, '#bcc5db00'); ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(90, y + 79.5); ctx.lineTo(966, y + 79.5); ctx.stroke(); }
    });
    if (!songs.length) { ctx.fillStyle = '#afb5c1'; ctx.font = '24px Arial'; ctx.textAlign = 'center'; ctx.fillText('No songs in this category', 512, 610); }
    ctx.restore();
    if (maxSongScroll(state)) {
      rounded(ctx, 994, 437, 7, 370, 4); ctx.fillStyle = '#575b6555'; ctx.fill();
      const y = 437 + state.scroll / maxSongScroll(state) * 226;
      ctx.save(); ctx.shadowColor = '#d8e6ff77'; ctx.shadowBlur = 5; rounded(ctx, 993, y, 8, 144, 4); ctx.fillStyle = '#f0f3fc'; ctx.fill(); ctx.restore();
    }
  } else if (state.tab === 'PRACTICE') {
    title(ctx, 'PRACTICE', 'PRACTICE');
    ['FREE PLAY', 'RUDIMENT'].forEach((name, index) => {
      const x = 60 + index * 474;
      card(ctx, state, `practice-${index}`, x, 364, 430, 240, state.practice === name);
      icon(ctx, 'PRACTICE', x + 215, 432, 57); ctx.textAlign = 'center'; ctx.fillStyle = '#f3f4f7'; ctx.font = '600 30px Arial'; ctx.fillText(name, x + 215, 514);
      ctx.font = '22px Arial, "Malgun Gothic", sans-serif'; ctx.fillStyle = '#d0d4dd'; ctx.fillText(index ? '루디먼트 연습' : '자유 연습', x + 215, 553);
    });
    ctx.textAlign = 'center'; ctx.fillStyle = '#d4dae5'; ctx.font = '600 22px Arial';
    ctx.fillText(state.practice === 'RUDIMENT' ? `BASIC DRUM BEAT  /  ${state.bpm} BPM` : 'FREE PLAY  /  NO NOTES', 512, 330);
    if (state.practice === 'RUDIMENT') {
      ['START', 'PAUSE', 'RESTART'].forEach((label, index) => {
        const x = 60 + index * 310;
        card(ctx, state, `rhythm-${index}`, x, 660, 284, 68, false);
        ctx.fillStyle = '#f1f3f8'; ctx.font = '600 24px Arial'; ctx.fillText(label, x + 142, 703);
      });
      ctx.save();const judgment=state.countIn===undefined?state.judgment:undefined;
      ctx.fillStyle=judgment?VR_JUDGMENT_COLORS[judgment]:'#d0d7e2';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=judgment==='Perfect'?10:judgment?6:0;ctx.font='600 23px Arial';
      ctx.fillText(state.countIn !== undefined ? `COUNT IN ${state.countIn}` : state.judgment?.toUpperCase() ?? state.rhythm.toUpperCase(), 512, 782);
      ctx.restore();ctx.fillStyle='#d0d7e2';ctx.font = '21px Arial'; ctx.fillText(`PERFECT ${state.perfect}    GREAT ${state.great}    MISS ${state.miss}`, 512, 829);
    }
  } else if (state.tab === 'BACKGROUND') {
    title(ctx, 'BACKGROUND', 'BACKGROUND');
    ['VR MODE', 'AR MODE'].forEach((label, index) => {
      const x = index ? 534 : 60;
      card(ctx, state, `view-${index}`, x, 307, 430, 52, state.viewMode === (index ? 'ar' : 'vr'));
      ctx.fillStyle = index && !state.canAR ? '#727a88' : '#f1f3f8'; ctx.font = '600 23px Arial'; ctx.textAlign = 'center'; ctx.fillText(label, x + 215, 342);
    });
    DRUM_ENVIRONMENTS.forEach((environment, index) => {
      const x = 60 + index * 310;
      card(ctx, state, `background-${index}`, x, 370, 284, 300, state.background === environment.id);
      environmentThumb(ctx, environment.id, x + 12, 382, 260);
      ctx.fillStyle = '#f1f2f6'; ctx.textAlign = 'center'; ctx.font = '600 22px Arial'; ctx.fillText(environment.name, x + 142, 604);
      ctx.fillStyle = '#bdc3cf'; ctx.font = '15px Arial'; ctx.fillText(environment.description, x + 142, 636, 255);
    });
  } else {
    title(ctx, 'SETTINGS', 'SETTINGS');
    ['AUDIO', 'CONTROLLER', 'NOTE', 'GENERAL'].forEach((setting, index) => {
      const x = 60 + index * 234;
      card(ctx, state, `setting-${index}`, x, 370, 202, 130, state.setting === setting);
      ctx.textAlign = 'center'; ctx.fillStyle = '#f1f3f8'; ctx.font = '600 22px Arial'; ctx.fillText(setting==='GENERAL'?'DRUM HEIGHT':setting, x + 101, 443);
    });
    if (state.setting === 'AUDIO') {
      ctx.textAlign = 'left'; ctx.fillStyle = '#c9ced8'; ctx.font = '23px Arial'; ctx.fillText('MASTER VOLUME', 84, 574);
      card(ctx, state, 'volume--1', 84, 611, 80, 72, false); card(ctx, state, 'volume-1', 860, 611, 80, 72, false);
      ctx.fillStyle = '#eff2f8'; ctx.textAlign = 'center'; ctx.font = '32px Arial'; ctx.fillText('−', 124, 658); ctx.fillText('+', 900, 658);
      rounded(ctx, 205, 640, 610, 8, 4); ctx.fillStyle = '#4d535f'; ctx.fill(); rounded(ctx, 205, 640, Math.max(5, 610 * state.volume), 8, 4); ctx.fillStyle = '#d1d7e2'; ctx.fill();
      ctx.font = '20px Arial'; ctx.fillText(`${Math.round(state.volume * 100)}%`, 510, 710);
    } else if (state.setting === 'CONTROLLER') {
      const pedal = state.footPedal, layout = FOOT_PEDAL_LAYOUT;
      card(ctx, state, 'pedal-0', layout.entry.x, layout.entry.y, layout.entry.width, layout.entry.height, !!state.footPedalOpen);
      ctx.textAlign = 'left'; ctx.fillStyle = '#edf0f5'; ctx.font = '600 21px Arial';
      ctx.fillText('FOOT PEDAL', 104, 545);
      ctx.textAlign = 'right'; ctx.font = '20px Arial'; ctx.fillText(state.footPedalOpen ? '−' : '+', 916, 545);
      if (state.footPedalOpen && pedal) {
        const enable = layout.enable;
        card(ctx, state, 'pedal-4', enable.x, enable.y, enable.width, enable.height, pedal.enabled);
        ctx.textAlign = 'center'; ctx.fillStyle = '#edf0f5'; ctx.font = '600 18px Arial';
        ctx.fillText('ENABLE FOOT PEDAL: ' + (pedal.enabled ? 'ON' : 'OFF'), enable.x + enable.width / 2, 594);
        ctx.textAlign = 'left'; ctx.font = '19px Arial'; ctx.fillText('KEY BINDING: ' + pedal.label, 490, 594, 450);
        ['AUTO DETECT', 'TEST INPUT', 'CANCEL'].forEach((text, i) => {
          const box = layout.buttons[i];
          card(ctx, state, 'pedal-' + (i + 1), box.x, box.y, box.width, box.height, i === 0 ? pedal.detecting : i === 1 && pedal.testing);
          ctx.textAlign = 'center'; ctx.fillStyle = pedal.enabled || i === 2 ? '#edf0f5' : '#8e96a3'; ctx.font = '600 19px Arial';
          ctx.fillText(text, box.x + box.width / 2, 646);
        });
        ctx.beginPath(); ctx.arc(98, 683, 8, 0, Math.PI * 2); ctx.fillStyle = pedal.pressed ? '#ffffff' : '#4c515a'; ctx.fill();
        ctx.textAlign = 'left'; ctx.font = '18px Arial'; ctx.fillStyle = '#edf0f5';
        ctx.fillText(pedal.pressed ? 'PEDAL PRESSED · ' + pedal.label : 'PEDAL IDLE', 120, 690, 310);
        ctx.fillText('INPUT STATUS: ' + (!pedal.enabled ? 'DISABLED' : pedal.status === 'INPUT DETECTED' ? 'INPUT DETECTED' : 'WAITING'), 450, 690, 490);
        ctx.font = '16px Arial'; ctx.fillStyle = '#bdc5d1';
        ctx.fillText('CONNECTION STATUS: ' + pedal.status + ' · USB connection unknown', 84, 714, 856);
        ctx.fillText(pedal.message, 84, 737, 856);
        ctx.fillText('KICK: ' + (pedal.played === null ? 'WAITING' : pedal.played ? 'PLAYED' : 'NOT PLAYED (audio / duplicate / visibility)'), 84, 758, 856);
        ctx.font = '16px monospace'; ctx.fillStyle = '#aeb8c7';
        ctx.fillText('code: ' + (pedal.eventCode || '—') + '  key: ' + JSON.stringify(pedal.eventKey) + '  repeat: ' + pedal.repeat + '  ignored: ' + pedal.ignoredRepeats, 84, 851, 856);
        ctx.fillText('down: ' + pedal.down + '  up: ' + pedal.up + '  VR/XR: ' + pedal.immersive + '  last: ' + (pedal.lastInput ? new Date(pedal.lastInput).toLocaleTimeString() : '—'), 84, 876, 856);
      }
    } else if (state.setting === 'NOTE') {
      ctx.textAlign = 'center'; ctx.fillStyle = '#c9ced8'; ctx.font = '23px Arial'; ctx.fillText('NOTE SYNC OFFSET (ms)', 512, 574);
      card(ctx, state, 'noteSync--1', 84, 611, 110, 72, false); card(ctx, state, 'noteSync-1', 830, 611, 110, 72, false);
      ctx.fillStyle = '#eff2f8'; ctx.font = '24px Arial'; ctx.fillText('−10', 139, 658); ctx.fillText('+10', 885, 658);
      ctx.font = '32px Arial'; ctx.fillText(`${state.noteSyncMs >= 0 ? '+' : ''}${state.noteSyncMs} ms`, 512, 658);
      card(ctx, state, 'noteSync-0', 390, 700, 244, 48, false); ctx.font = '600 21px Arial'; ctx.fillText('RESET', 512, 731);
    } else if(state.setting==='GENERAL') {
      ctx.textAlign='center';ctx.fillStyle='#edf0f5';ctx.font='600 25px Arial';ctx.fillText('DRUM HEIGHT',512,550);
      const height=state.drumHeight??DRUM_HEIGHT.default;ctx.font='28px Arial';ctx.fillText((height>=0?'+':'')+Math.round(height*100)+' cm',512,593);
      ['LOWER','RAISE','RESET HEIGHT'].forEach((label,i)=>{const index=[-1,1,0][i],x=[84,382,680][i];card(ctx,state,'drumHeight-'+index,x,618,260,60,false);ctx.fillStyle='#edf0f5';ctx.font='600 21px Arial';ctx.fillText(label,x+130,655);});
      ctx.fillStyle='#b7c0cf';ctx.font='19px Arial';ctx.fillText('2 cm steps · range -30 to +30 cm',512,715);
      ctx.fillText(state.drumHeightSaved===false?'SESSION ONLY · storage unavailable':'Height saved automatically',512,744);
    } else {
      ctx.fillStyle = '#afb7c5'; ctx.textAlign = 'center'; ctx.font = '24px Arial'; ctx.fillText(`${state.setting} SETTINGS`, 512, 623);
      ctx.font = '20px Arial'; ctx.fillStyle = '#737d8d'; ctx.fillText('Preview', 512, 663);
    }
    card(ctx, state, 'reset-0', 84, 770, 856, 58, false);
    ctx.textAlign = 'center'; ctx.fillStyle = '#e5eaf3'; ctx.font = '600 22px Arial'; ctx.fillText('RESET PANEL POSITION', 512, 807);
    if (state.setting !== 'CONTROLLER') {
      card(ctx, state, 'tutorial-0', 84, 840, 856, 50, false);
      ctx.fillStyle = '#e5eaf3';
      ctx.font = '600 22px "Malgun Gothic", Arial, sans-serif';
      ctx.fillText('튜토리얼 다시 보기', 512, 873);
    }
  }
}
