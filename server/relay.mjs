import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

// One process / replica owns the rooms. No durable event queue: late kicks are
// discarded, never replayed after an outage. TLS is terminated by Caddy/host.
export function createRelay({ origins = ['http://127.0.0.1:5173', 'http://localhost:5173'],
  pairTTL = 10 * 60_000, roomTTL = 6 * 60 * 60_000, idleTTL = 10 * 60_000,
  heartbeatMs = 15_000, maxRooms = 500, maxConnections = 1000, trustProxy = false,
  httpServer, allowOrigin = req => origins.includes(req.headers.origin),
  now = Date.now } = {}) {
  const rooms = new Map(), codes = new Map(), resumes = new Map(), ips = new Map();
  const server = httpServer ?? http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.writeHead(req.url === '/healthz' ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(req.url === '/healthz' ? { ok: true, protocol: 1 } : { error: 'not_found' }));
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
  const send = (ws, data) => {
    if (ws?.readyState !== WebSocket.OPEN || ws.bufferedAmount > 8192) return false;
    ws.send(JSON.stringify(data)); return true;
  };
  const fail = (ws, reason) => { send(ws, { type: 'error', reason }); ws.close(4000, reason); };
  const peer = (room, role) => room[role === 'vr' ? 'pedal' : 'vr'];
  const removeRoom = room => {
    rooms.delete(room.id); codes.delete(room.code);
    for (const role of ['vr', 'pedal']) {
      resumes.delete(room.tokens[role]);
      if (room[role]) fail(room[role], 'session_ended');
    }
  };
  function bind(ws, room, role) {
    if (room[role] && room[role] !== ws) room[role].close(4001, 'replaced');
    room[role] = ws; room.touched = now(); ws.room = room; ws.role = role;
    send(ws, { type: 'ready', v: 1, role, token: room.tokens[role], session: room.id,
      code: role === 'vr' && !room.paired ? room.code : '', expiresAt: room.pairExpires,
      peer: peer(room, role)?.readyState === WebSocket.OPEN, serverTime: now() });
    send(peer(room, role), { type: 'peer', connected: true });
  }
  const upgrade = (req, socket, head) => {
    // Vite owns other upgrades, including its hot-reload socket.
    if (httpServer && req.url !== '/pedal') return;
    if (req.url !== '/pedal' || !allowOrigin(req) || wss.clients.size >= maxConnections) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    // Only enable behind a proxy that overwrites X-Forwarded-For and prevents
    // direct access to the relay port. Otherwise use the actual socket address.
    const ip = trustProxy ? String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim()
      : req.socket.remoteAddress;
    let quota = ips.get(ip);
    if (!quota) {
      if (ips.size >= 5000) { socket.destroy(); return; }
      quota = { connections: 0, attempts: 0, window: now() }; ips.set(ip, quota);
    }
    if (now() - quota.window > 60_000) { quota.attempts = 0; quota.window = now(); }
    if (++quota.attempts > 60 || quota.connections >= 20) {
      socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n'); return;
    }
    wss.handleUpgrade(req, socket, head, ws => {
      quota.connections++; ws.quota = quota; wss.emit('connection', ws);
    });
  };
  server.on('upgrade', upgrade);
  wss.on('connection', ws => {
    ws.alive = true; ws.count = 0; ws.window = now();
    const handshake = setTimeout(() => ws.close(4000, 'handshake_timeout'), 8000);
    ws.on('error', () => {});
    ws.on('pong', () => { ws.alive = true; });
    ws.on('close', () => {
      clearTimeout(handshake); ws.quota.connections--;
      const room = ws.room;
      if (room?.[ws.role] === ws) {
        room[ws.role] = null; room.touched = now();
        send(peer(room, ws.role), { type: 'peer', connected: false });
      }
    });
    ws.on('message', (raw, binary) => {
      if (now() - ws.window > 1000) { ws.window = now(); ws.count = 0; }
      if (++ws.count > 100) { fail(ws, 'rate_limit'); return; }
      let m;
      try { m = JSON.parse(raw.toString()); } catch { fail(ws, 'invalid_message'); return; }
      if (binary || !m || typeof m !== 'object' || Array.isArray(m)) { fail(ws, 'invalid_message'); return; }
      if (!ws.room) {
        if (m.v !== 1) { fail(ws, 'protocol'); return; }
        if (m.type === 'create') {
          if (rooms.size >= maxRooms) { fail(ws, 'server_full'); return; }
          const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
          let code;
          do { code = [...randomBytes(10)].map(n => alphabet[n % 32]).join(''); } while (codes.has(code));
          const room = { id: randomBytes(16).toString('hex'), code, paired: false,
            pairExpires: now() + pairTTL, expires: now() + roomTTL, touched: now(),
            vr: null, pedal: null, seq: 0, pending: new Map(),
            tokens: { vr: randomBytes(32).toString('hex'), pedal: randomBytes(32).toString('hex') } };
          rooms.set(room.id, room); codes.set(code, room);
          resumes.set(room.tokens.vr, { room, role: 'vr' });
          resumes.set(room.tokens.pedal, { room, role: 'pedal' });
          bind(ws, room, 'vr');
        } else if (m.type === 'join') {
          const room = typeof m.code === 'string' && codes.get(m.code);
          if (!room || room.paired || now() > room.pairExpires || room.vr?.readyState !== WebSocket.OPEN) {
            fail(ws, 'invalid_code'); return;
          }
          room.paired = true; codes.delete(room.code); bind(ws, room, 'pedal');
        } else if (m.type === 'resume') {
          const access = typeof m.token === 'string' && resumes.get(m.token);
          if (!access || now() > access.room.expires || (!access.room.paired && now() > access.room.pairExpires)) {
            fail(ws, 'session_expired'); return;
          }
          bind(ws, access.room, access.role);
        } else { fail(ws, 'unauthorized'); return; }
        clearTimeout(handshake); return;
      }
      const room = ws.room;
      if (room[ws.role] !== ws || !rooms.has(room.id)) return;
      if (now() > room.expires) { removeRoom(room); return; }
      room.touched = now();
      if (m.type === 'ping' && Number.isFinite(m.id)) {
        send(ws, { type: 'pong', id: m.id, serverTime: now() }); return;
      }
      if (m.type === 'end' && ws.role === 'vr') { removeRoom(room); return; }
      if ((m.type === 'kick' || m.type === 'hihat') && ws.role === 'pedal') {
        const validPayload = m.type === 'kick'
          ? Number.isFinite(m.velocity) && m.velocity > 0 && m.velocity <= 1
          : typeof m.pressed === 'boolean';
        if (!Number.isSafeInteger(m.seq) || m.seq <= 0 || !validPayload || !Number.isFinite(m.sentAt)) {
          fail(ws, m.type === 'kick' ? 'invalid_kick' : 'invalid_hihat'); return;
        }
        if (m.seq <= room.seq) return; // Survives both sockets reconnecting.
        room.seq = m.seq;
        const age = now() - m.sentAt;
        if (age > 350 || age < -150 || room.vr?.readyState !== WebSocket.OPEN) {
          send(ws, { type: 'ack', seq: m.seq, played: false }); return;
        }
        for (const [seq, time] of room.pending) if (now() - time > 1000) room.pending.delete(seq);
        room.pending.set(m.seq, now());
        const payload = m.type === 'kick'
          ? { type: 'kick', seq: m.seq, velocity: m.velocity, sentAt: m.sentAt }
          : { type: 'hihat', seq: m.seq, pressed: m.pressed, sentAt: m.sentAt };
        if (!send(room.vr, payload)) {
          room.pending.delete(m.seq); send(ws, { type: 'ack', seq: m.seq, played: false });
        }
        return;
      }
      if (m.type === 'ack' && ws.role === 'vr' && Number.isSafeInteger(m.seq) && typeof m.played === 'boolean') {
        const sent = room.pending.get(m.seq); room.pending.delete(m.seq);
        if (sent !== undefined && now() - sent <= 1000) send(room.pedal, { type: 'ack', seq: m.seq, played: m.played });
        return;
      }
      fail(ws, 'invalid_message');
    });
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.alive) ws.terminate(); else { ws.alive = false; ws.ping(); } }
    for (const room of rooms.values()) {
      if (now() > room.expires || (!room.paired && now() > room.pairExpires)
        || (!room.vr && !room.pedal && now() - room.touched > idleTTL)) removeRoom(room);
    }
    for (const [ip, quota] of ips) if (!quota.connections && now() - quota.window > 60_000) ips.delete(ip);
  }, heartbeatMs);
  heartbeat.unref();
  return { server, wss, async close() {
    clearInterval(heartbeat);
    server.off('upgrade', upgrade);
    for (const ws of wss.clients) ws.terminate();
    await new Promise(resolve => wss.close(resolve));
    if (!httpServer) await new Promise(resolve => server.close(resolve));
  } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const origins = process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean);
  if (process.env.NODE_ENV === 'production' && !origins?.length) throw Error('ALLOWED_ORIGINS is required');
  const relay = createRelay({ origins, trustProxy: process.env.TRUST_PROXY === 'true' });
  relay.server.listen(Number(process.env.PORT || 8787), process.env.HOST || '127.0.0.1', () => {
    console.log(`DRUM UP pedal relay listening on port ${relay.server.address().port}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void relay.close().then(() => process.exit(0)); });
}
