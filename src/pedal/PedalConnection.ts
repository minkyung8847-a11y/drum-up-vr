export type PedalRole = 'vr' | 'pedal';
export interface PedalState {
  status: 'offline' | 'connecting' | 'waiting' | 'connected' | 'reconnecting' | 'error';
  code: string; expiresAt: number; message: string; rtt: number | null;
  sent: number; played: number; dropped: number;
  receivedKicks: number; lastKickAt: number | null; lastKickPlayed: boolean | null;
}
export const emptyPedalState = (): PedalState => ({ status: 'offline', code: '', expiresAt: 0,
  message: '', rtt: null, sent: 0, played: 0, dropped: 0,
  receivedKicks: 0, lastKickAt: null, lastKickPlayed: null });
export const LOCAL_KICK_ENABLED = import.meta.env.DEV && import.meta.env.VITE_DRUMUP_LAN_KICK === '1';
export function localKickEndpoint() {
  const url = new URL('/pedal', location.href);
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}
const errors: Record<string, string> = {
  invalid_code: '코드가 만료되었거나 이미 사용 중입니다. VR에서 새 코드를 만드세요.',
  session_expired: '세션이 만료되었습니다. VR에서 새로 연결하세요.',
  session_ended: 'VR에서 연결을 종료했거나 세션이 만료되었습니다.',
  replaced: '다른 연결이 이 세션을 사용하고 있습니다.',
  rate_limit: '입력이 너무 많습니다. 페달 반복 입력 설정을 확인하세요.',
  invalid_hihat: '하이햇 페달 신호 형식을 확인하세요.',
};
export function validateRelayURL(value: string, pageProtocol = location.protocol) {
  const url = new URL(value.trim());
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && local && pageProtocol === 'http:'))
    throw Error('HTTPS 사이트에서는 wss:// 서버 주소가 필요합니다. 로컬 테스트만 ws://localhost를 허용합니다.');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/pedal')
    throw Error('서버 주소는 wss://서버도메인/pedal 형식이어야 합니다.');
  return url.href;
}
export function savedRelayURL() {
  try { return localStorage.getItem('drumup-pedal-relay') || import.meta.env.VITE_PEDAL_RELAY_URL || ''; }
  catch { return import.meta.env.VITE_PEDAL_RELAY_URL || ''; }
}

// The only transport used by both pages. Tokens stay in memory, never in URLs,
// storage or logs. A page refresh deliberately requires pairing again.
export class PedalConnection {
  private socket: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private hiHatSync: ReturnType<typeof setInterval> | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private stopped = true;
  private token = '';
  private code = '';
  private url = '';
  private seq = 0;
  private received = 0;
  private attempts = 0;
  private offset = 0;
  private lastPong = 0;
  private ready = false;
  private peer = false;
  private hiHatPressed = true;
  private hiHatUsed = false;
  private pending = new Map<number, number>();
  private state = emptyPedalState();
  private role: PedalRole;
  private onState: (state: PedalState) => void;
  private onKick: (velocity: number, id: string) => boolean;
  private onHiHat: (pressed: boolean, id: string) => boolean;
  constructor(role: PedalRole, onState: (state: PedalState) => void,
    onKick: (velocity: number, id: string) => boolean = () => false,
    onHiHat: (pressed: boolean, id: string) => boolean = () => false) {
    this.role = role; this.onState = onState; this.onKick = onKick; this.onHiHat = onHiHat;
  }
  private publish(patch: Partial<PedalState>) {
    this.state = { ...this.state, ...patch }; this.onState(this.state);
  }
  connect(endpoint: string, code = '', remember = true) {
    this.disconnect();
    try {
      this.url = validateRelayURL(endpoint);
      this.code = code.toUpperCase().replace(/[\s-]/g, '');
      if (this.role === 'pedal' && !/^[A-HJ-NP-Z2-9]{10}$/.test(this.code)) throw Error('VR에 표시된 10자리 연결 코드를 입력하세요.');
      if (remember) {
        try { localStorage.setItem('drumup-pedal-relay', this.url); } catch { /* Optional preference. */ }
      }
      this.stopped = false; this.state = emptyPedalState(); this.open();
    } catch (error) {
      console.warn('[DRUM UP pedal] Connection setup failed', error);
      this.publish({ status: 'error', message: String((error as Error).message) });
    }
  }
  private send(data: object) {
    const ws = this.socket;
    if (ws?.readyState !== WebSocket.OPEN || ws.bufferedAmount > 2048) return false;
    try { ws.send(JSON.stringify(data)); return true; } catch { return false; }
  }
  private open() {
    if (this.stopped) return;
    this.ready = this.peer = false;
    this.publish({ status: this.token ? 'reconnecting' : 'connecting', message: '', rtt: null });
    const ws = new WebSocket(this.url); this.socket = ws;
    this.timeout = setTimeout(() => ws.close(4000, 'handshake_timeout'), 10_000);
    ws.onopen = () => {
      if (this.socket !== ws || this.stopped) return;
      this.send(this.token ? { type: 'resume', v: 1, token: this.token }
        : this.role === 'vr' ? { type: 'create', v: 1 } : { type: 'join', v: 1, code: this.code });
    };
    ws.onmessage = event => {
      if (this.socket !== ws || this.stopped || typeof event.data !== 'string' || event.data.length > 4096) return;
      let m;
      try { m = JSON.parse(event.data); } catch { return; }
      if (!m || typeof m !== 'object') return;
      if (m.type === 'error') {
        console.warn('[DRUM UP pedal] Relay rejected connection or message:', String(m.reason));
        this.stopped = true;
        this.publish({ status: 'error', message: errors[m.reason] || `연결 오류: ${String(m.reason)}` });
        ws.close(); return;
      }
      if (m.type === 'ready' && m.v === 1 && m.role === this.role && typeof m.token === 'string'
        && Number.isFinite(m.serverTime) && typeof m.code === 'string' && typeof m.peer === 'boolean') {
        clearTimeout(this.timeout); this.token = m.token; this.peer = m.peer; this.ready = true;
        this.offset = m.serverTime - performance.now(); this.lastPong = performance.now(); this.attempts = 0;
        this.publish({ status: this.peer ? 'connected' : 'waiting', code: m.code, expiresAt: m.expiresAt });
        if (this.peer && this.role === 'pedal' && this.hiHatUsed) this.sendHiHat();
        this.ping();
        clearInterval(this.heartbeat);
        this.heartbeat = setInterval(() => {
          if (performance.now() - this.lastPong > 12_000) ws.close(4000, 'heartbeat_timeout'); else this.ping();
          let dropped = 0;
          for (const [seq, time] of this.pending) if (performance.now() - time > 1500) { this.pending.delete(seq); dropped++; }
          if (dropped) this.publish({ dropped: this.state.dropped + dropped });
        }, 2000);
        clearInterval(this.hiHatSync);
        if (this.role === 'pedal') this.hiHatSync = setInterval(() => {
          if (this.hiHatUsed && this.ready && this.peer) this.sendHiHat();
        }, 1000);
      } else if (m.type === 'pong' && Number.isFinite(m.id) && Number.isFinite(m.serverTime)) {
        const time = performance.now(), rtt = time - m.id;
        if (rtt < 0 || rtt > 10_000) return;
        this.lastPong = time; this.offset = m.serverTime + rtt / 2 - time;
        this.publish({ rtt: Math.round(rtt) });
      } else if (this.ready && m.type === 'peer' && typeof m.connected === 'boolean') {
        this.peer = m.connected;
        this.publish({ status: this.peer ? 'connected' : 'waiting', ...(this.peer ? { code: '' } : {}) });
        if (this.role === 'vr' && !this.peer) this.onHiHat(false, 'peer-disconnected');
        if (this.role === 'pedal' && this.peer && this.hiHatUsed) this.sendHiHat();
      } else if (this.ready && this.role === 'vr' && (m.type === 'kick' || m.type === 'hihat') && Number.isSafeInteger(m.seq)
        && m.seq > this.received && Number.isFinite(m.sentAt)
        && (m.type === 'kick' ? Number.isFinite(m.velocity) && m.velocity > 0 && m.velocity <= 1 : typeof m.pressed === 'boolean')) {
        this.received = m.seq;
        const age = performance.now() + this.offset - m.sentAt;
        let played = false;
        if (this.peer && age >= -150 && age <= 350) {
          try { played = m.type === 'kick' ? this.onKick(m.velocity, `remote:${m.seq}`)
            : this.onHiHat(m.pressed, `remote:${m.seq}`); } catch { /* No retries for musical events. */ }
        }
        this.send({ type: 'ack', seq: m.seq, played });
        this.publish({
          ...(played ? { played: this.state.played + 1 } : { dropped: this.state.dropped + 1 }),
          ...(m.type === 'kick' ? { receivedKicks: this.state.receivedKicks + 1,
            lastKickAt: Date.now(), lastKickPlayed: played } : {}),
        });
      } else if (this.role === 'pedal' && m.type === 'ack' && this.pending.has(m.seq) && typeof m.played === 'boolean') {
        this.pending.delete(m.seq);
        this.publish(m.played ? { played: this.state.played + 1 } : { dropped: this.state.dropped + 1 });
      }
    };
    ws.onerror = () => {
      if (this.socket === ws && !this.stopped) {
        console.warn('[DRUM UP pedal] WebSocket error. Check server availability, origin and TLS trust:', this.url);
      }
    };
    ws.onclose = event => {
      if (this.socket !== ws) return;
      clearTimeout(this.timeout); clearInterval(this.heartbeat); clearInterval(this.hiHatSync);
      this.ready = this.peer = false;
      if (this.role === 'vr') this.onHiHat(true, 'connection-lost');
      const dropped = this.pending.size; this.pending.clear();
      if (dropped) this.publish({ dropped: this.state.dropped + dropped });
      if (event.code === 4001) { this.stopped = true; this.publish({ status: 'error', message: errors.replaced }); }
      if (this.stopped) return;
      console.warn('[DRUM UP pedal] Reconnecting after WebSocket close:', event.code, event.reason || '(no reason supplied)');
      this.publish({ status: 'reconnecting', message: '서버 연결을 다시 시도합니다. 서버 주소·TLS·허용 출처를 확인하세요.' });
      this.retry = setTimeout(() => this.open(), Math.min(10_000, 500 * 2 ** Math.min(this.attempts++, 5)) + Math.random() * 200);
    };
  }
  private ping() { this.send({ type: 'ping', id: performance.now() }); }
  kick(velocity = 1) {
    if (this.role !== 'pedal' || !this.ready || !this.peer || !Number.isFinite(velocity) || velocity <= 0 || velocity > 1) return false;
    const seq = ++this.seq;
    const sent = this.send({ type: 'kick', seq, velocity, sentAt: performance.now() + this.offset });
    if (sent) { this.pending.set(seq, performance.now()); this.publish({ sent: this.state.sent + 1 }); }
    return sent;
  }
  hiHat(pressed: boolean) {
    if (this.role !== 'pedal' || typeof pressed !== 'boolean') return false;
    if (this.hiHatUsed && this.hiHatPressed === pressed) return this.ready && this.peer;
    this.hiHatUsed = true; this.hiHatPressed = pressed;
    return this.sendHiHat();
  }
  private sendHiHat() {
    if (this.role !== 'pedal' || !this.ready || !this.peer) return false;
    const seq = ++this.seq;
    const sent = this.send({ type: 'hihat', seq, pressed: this.hiHatPressed, sentAt: performance.now() + this.offset });
    if (sent) { this.pending.set(seq, performance.now()); this.publish({ sent: this.state.sent + 1 }); }
    return sent;
  }
  disconnect(endSession = false) {
    this.stopped = true; clearTimeout(this.retry); clearTimeout(this.timeout); clearInterval(this.heartbeat); clearInterval(this.hiHatSync);
    if (this.role === 'vr') this.onHiHat(true, 'connection-lost');
    if (endSession && this.role === 'vr') this.send({ type: 'end' });
    const ws = this.socket; this.socket = null; ws?.close();
    this.token = ''; this.seq = this.received = this.attempts = 0; this.pending.clear();
    this.ready = this.peer = false; this.publish(emptyPedalState());
  }
}
