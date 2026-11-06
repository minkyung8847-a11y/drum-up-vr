import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createRelay } from './relay.mjs';

const origin = 'http://localhost:5173';
async function fixture(t, options = {}) {
  const relay = createRelay({ origins: [origin], ...options });
  await new Promise(resolve => relay.server.listen(0, '127.0.0.1', resolve));
  t.after(() => relay.close());
  const url = `ws://127.0.0.1:${relay.server.address().port}/pedal`;
  async function connect(message, response = 'ready') {
    const ws = new WebSocket(url, { origin });
    const messages = [], waiting = [];
    ws.on('message', raw => {
      const value = JSON.parse(raw.toString()); messages.push(value);
      for (const item of [...waiting]) if (item.type === value.type) { waiting.splice(waiting.indexOf(item), 1); clearTimeout(item.timer); item.resolve(value); }
    });
    ws.on('error', () => {});
    const next = type => new Promise((resolve, reject) => {
      const item = { type, resolve, timer: setTimeout(() => reject(Error(`Timed out: ${type}`)), 2000) }; waiting.push(item);
    });
    await once(ws, 'open');
    const send = value => ws.send(JSON.stringify(value));
    const ready = next(response); send(message);
    return { ws, messages, next, send, ready };
  }
  async function pair() {
    const vr = await connect({ type: 'create', v: 1 }); const host = await vr.ready;
    const pedal = await connect({ type: 'join', v: 1, code: host.code }); const sender = await pedal.ready;
    return { vr, pedal, host, sender };
  }
  return { relay, connect, pair, url };
}
const pause = () => new Promise(resolve => setTimeout(resolve, 40));

test('two real WebSockets: pairing, velocity, receipt and exactly-once sequence', async t => {
  const { pair } = await fixture(t); const { vr, pedal, host } = await pair();
  assert.match(host.code, /^[A-HJ-NP-Z2-9]{10}$/); assert.equal(host.token.length, 64);
  const received = vr.next('kick');
  const event = { type: 'kick', seq: 1, velocity: .4, sentAt: Date.now() };
  pedal.send(event); assert.equal((await received).velocity, .4);
  const ack = pedal.next('ack'); vr.send({ type: 'ack', seq: 1, played: true }); assert.equal((await ack).played, true);
  pedal.send(event); vr.send({ type: 'ack', seq: 1, played: true }); await pause();
  assert.equal(vr.messages.filter(m => m.type === 'kick').length, 1);
  assert.equal(pedal.messages.filter(m => m.type === 'ack').length, 1);
});
test('left hi-hat holds closed until release and shares sequence with right kick', async t => {
  const { pair } = await fixture(t); const { vr, pedal } = await pair();
  const closed = vr.next('hihat');
  pedal.send({ type: 'hihat', seq: 1, pressed: true, sentAt: Date.now() });
  assert.equal((await closed).pressed, true);
  const firstAck = pedal.next('ack'); vr.send({ type: 'ack', seq: 1, played: true }); await firstAck;
  const kick = vr.next('kick'); pedal.send({ type: 'kick', seq: 2, velocity: .7, sentAt: Date.now() });
  assert.equal((await kick).velocity, .7);
  const opened = vr.next('hihat'); pedal.send({ type: 'hihat', seq: 3, pressed: false, sentAt: Date.now() });
  assert.equal((await opened).pressed, false);
  pedal.send({ type: 'hihat', seq: 1, pressed: true, sentAt: Date.now() }); await pause();
  assert.equal(vr.messages.filter(m => m.type === 'hihat').length, 2);
});
test('session isolation and one-use code rejects a third device', async t => {
  const { pair, url } = await fixture(t); const a = await pair(), b = await pair();
  a.pedal.send({ type: 'kick', seq: 1, velocity: 1, sentAt: Date.now() }); await pause();
  assert.equal(b.vr.messages.filter(m => m.type === 'kick').length, 0);
  const ws = new WebSocket(url, { origin }); await once(ws, 'open');
  const error = once(ws, 'message'); ws.send(JSON.stringify({ type: 'join', v: 1, code: a.host.code }));
  assert.equal(JSON.parse((await error)[0]).reason, 'invalid_code');
});
test('reconnect requires secret; old event sequences survive reconnect; no queued kick replay', async t => {
  const { pair, connect } = await fixture(t); const { vr, pedal, host, sender } = await pair();
  const event = { type: 'kick', seq: 1, velocity: 1, sentAt: Date.now() };
  const hit = vr.next('kick'); pedal.send(event); await hit;
  const closed = once(vr.ws, 'close'); vr.ws.close(); await closed; await pause();
  const dropped = pedal.next('ack'); pedal.send({ ...event, seq: 2, sentAt: Date.now() }); assert.equal((await dropped).played, false);
  const vr2 = await connect({ type: 'resume', v: 1, token: host.token }); await vr2.ready;
  const oldClosed = once(pedal.ws, 'close'); pedal.ws.close(); await oldClosed;
  const p2 = await connect({ type: 'resume', v: 1, token: sender.token }); await p2.ready;
  p2.send({ ...event, seq: 2, sentAt: Date.now() }); await pause(); assert.equal(vr2.messages.filter(m => m.type === 'kick').length, 0);
  const fresh = vr2.next('kick'); p2.send({ ...event, seq: 3, sentAt: Date.now() }); assert.equal((await fresh).seq, 3);
});
test('reject stale/future/invalid events; role cannot impersonate sender', async t => {
  const { pair } = await fixture(t); const { vr, pedal } = await pair();
  for (const [index, sentAt] of [Date.now() - 1000, Date.now() + 1000].entries()) {
    const ack = pedal.next('ack'); pedal.send({ type: 'kick', seq: index + 1, velocity: .5, sentAt }); assert.equal((await ack).played, false);
  }
  assert.equal(vr.messages.filter(m => m.type === 'kick').length, 0);
  const denied = vr.next('error'); vr.send({ type: 'kick', seq: 4, velocity: 1, sentAt: Date.now() }); assert.equal((await denied).reason, 'invalid_message');
  const invalid = pedal.next('error'); pedal.send({ type: 'kick', seq: 5, velocity: 2, sentAt: Date.now() }); assert.equal((await invalid).reason, 'invalid_kick');
});
test('explicit session end invalidates both resume tokens', async t => {
  const { pair, url } = await fixture(t); const { vr, pedal, sender } = await pair();
  const ended = pedal.next('error'); vr.send({ type: 'end' }); assert.equal((await ended).reason, 'session_ended');
  const ws = new WebSocket(url, { origin }); await once(ws, 'open'); const error = once(ws, 'message');
  ws.send(JSON.stringify({ type: 'resume', v: 1, token: sender.token })); assert.equal(JSON.parse((await error)[0]).reason, 'session_expired');
});
test('expiration, unpaired/unknown session authentication, protocol version', async t => {
  let time = Date.now(); const { connect, url } = await fixture(t, { now: () => time, pairTTL: 100 });
  const vr = await connect({ type: 'create', v: 1 }); const host = await vr.ready; time += 200;
  for (const [message, expected] of [
    [{ type: 'join', v: 1, code: host.code }, 'invalid_code'],
    [{ type: 'resume', v: 1, token: host.token }, 'session_expired'],
    [{ type: 'resume', v: 1, token: 'invented' }, 'session_expired'],
    [{ type: 'create', v: 9 }, 'protocol'],
    [{ type: 'kick', v: 1, velocity: 1 }, 'unauthorized'],
  ]) {
    const ws = new WebSocket(url, { origin }); await once(ws, 'open'); const response = once(ws, 'message');
    ws.send(JSON.stringify(message)); assert.equal(JSON.parse((await response)[0]).reason, expected);
  }
});
test('origin/path validation, health endpoint, malformed and oversize frames', async t => {
  const { url } = await fixture(t);
  for (const [address, allowedOrigin] of [[url, 'https://unrelated.example'], [url.replace('/pedal', '/other'), origin]]) {
    const ws = new WebSocket(address, { origin: allowedOrigin }); const error = once(ws, 'error');
    assert.match((await error)[0].message, /403/);
  }
  const health = await fetch(url.replace('ws:', 'http:').replace('/pedal', '/healthz')); assert.equal(health.status, 200);
  const ws = new WebSocket(url, { origin }); await once(ws, 'open'); const error = once(ws, 'message');
  ws.send('{oops'); assert.equal(JSON.parse((await error)[0]).reason, 'invalid_message');
  const big = new WebSocket(url, { origin }); await once(big, 'open'); const closed = once(big, 'close'); big.send('a'.repeat(3000));
  assert.equal((await closed)[0], 1009);
});
test('rate limit and bounded room creation', async t => {
  const { pair, connect } = await fixture(t, { maxRooms: 1 }); const { pedal } = await pair();
  const error = pedal.next('error'); for (let i = 0; i < 105; i++) pedal.send({ type: 'ping', id: i });
  assert.equal((await error).reason, 'rate_limit');
  // Use the same transport helper but handle error instead of a ready promise.
  const full = await connect({ type: 'create', v: 1 }, 'error'); assert.equal((await full.ready).reason, 'server_full');
});
