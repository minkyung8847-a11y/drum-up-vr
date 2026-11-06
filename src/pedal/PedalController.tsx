import { useEffect, useRef, useState } from 'react';
import { savedRelayURL } from './PedalConnection';
import { connectionLabels, usePedalConnection } from './usePedalConnection';
import { attachHiHatKeyInput, attachSpaceInput, createHIDEdge, createHIDState, midiHiHat, midiKick } from './inputs';
import type { HIDMapping, PedalHID, PedalHIDDevice, PedalHIDEvent } from './inputs';
import './pedal.css';

export default function PedalController() {
  const { state, client } = usePedalConnection('pedal');
  const [endpoint, setEndpoint] = useState(savedRelayURL);
  const [code, setCode] = useState('');
  const [inputCount, setInputCount] = useState(0);
  const [leftPressed, setLeftPressed] = useState(false);
  const [inputStatus, setInputStatus] = useState('Space 또는 TEST KICK을 누르세요.');
  const [method, setMethod] = useState('keyboard');
  const [inputError, setInputError] = useState('');
  const [access, setAccess] = useState<MIDIAccess | null>(null);
  const [ports, setPorts] = useState<MIDIInput[]>([]);
  const [portId, setPortId] = useState('');
  const [notes, setNotes] = useState('35,36');
  const [channel, setChannel] = useState('all');
  const [hiHatCC, setHiHatCC] = useState('4');
  const [hiHatThreshold, setHiHatThreshold] = useState('64');
  const [hiHatClosedWhenLow, setHiHatClosedWhenLow] = useState(true);
  const [learning, setLearning] = useState(false);
  const [midiBusy, setMidiBusy] = useState(false);
  const [hidName, setHidName] = useState('');
  const [hidBusy, setHidBusy] = useState(false);
  const [vendor, setVendor] = useState('');
  const [product, setProduct] = useState('');
  const [mapping, setMapping] = useState<HIDMapping>({ reportId: 0, byte: 0, mask: 1, pressed: 1 });
  const [hiHatMapping, setHiHatMapping] = useState<HIDMapping>({ reportId: 0, byte: 0, mask: 2, pressed: 2 });
  const hidCleanup = useRef<() => void>(() => {});
  const lifetime = useRef(0);
  const kick = useRef((_: number, __: string) => {});
  const hiHat = useRef((_: boolean, __: string) => {});
  const leftDown = useRef(false);
  kick.current = (velocity, source) => {
    setInputCount(count => count + 1);
    const sent = client.current?.kick(velocity);
    setInputStatus(`${source} · ${Math.round(velocity * 100)}% · ${sent ? '전송됨' : '연결 대기 — 전송 안 됨'}`);
  };
  hiHat.current = (pressed, source) => {
    if (leftDown.current === pressed) return;
    leftDown.current = pressed;
    setLeftPressed(pressed);
    setInputCount(count => count + 1);
    const sent = client.current?.hiHat(pressed);
    setInputStatus(`${source} · 왼쪽 하이햇 ${pressed ? '닫힘' : '열림'} · ${sent ? '전송됨' : '연결 대기 — 전송 안 됨'}`);
  };
  useEffect(() => attachSpaceInput(window, (velocity, source) => kick.current(velocity, source)), []);
  useEffect(() => method === 'keyboard' ? attachHiHatKeyInput(window, pressed => hiHat.current(pressed, 'Z / 왼쪽 USB 페달')) : undefined, [method]);
  useEffect(() => {
    const generation = lifetime, cleanup = hidCleanup;
    generation.current++;
    return () => { generation.current++; cleanup.current(); };
  }, []);
  useEffect(() => { hidCleanup.current(); setHidName(''); setInputError(''); setLearning(false);
    hiHat.current(false, '입력 방식 변경'); }, [method]);
  useEffect(() => {
    if (!access) return;
    const refresh = () => {
      const next = [...access.inputs.values()].filter(input => input.state === 'connected');
      setPorts(previous => previous.length === next.length && previous.every((port, index) => port === next[index]) ? previous : next);
    };
    refresh(); access.addEventListener('statechange', refresh);
    return () => access.removeEventListener('statechange', refresh);
  }, [access]);
  useEffect(() => {
    if (method !== 'midi') return;
    const port = ports.find(input => input.id === portId);
    if (!port) return;
    const onMessage = (event: Event) => {
      const data = (event as MIDIMessageEvent).data;
      if (!data || data.length < 3) return;
      if (learning && (data[0] & 0xf0) === 0x90 && data[2] > 0) {
        setNotes(String(data[1])); setChannel(String(data[0] & 15)); setLearning(false);
        setInputStatus(`MIDI 학습 완료: 노트 ${data[1]}, 채널 ${(data[0] & 15) + 1}`); return;
      }
      const allowed = notes.split(',').map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 127);
      const velocity = midiKick(data, allowed, channel === 'all' ? null : Number(channel));
      if (velocity !== null) kick.current(velocity, `MIDI ${data[1]}`);
      const closed = midiHiHat(data, Number(hiHatCC), Number(hiHatThreshold), hiHatClosedWhenLow,
        channel === 'all' ? null : Number(channel));
      if (closed !== null) hiHat.current(closed, `MIDI CC${hiHatCC}`);
    };
    port.addEventListener('midimessage', onMessage);
    void port.open().catch(() => setInputError('MIDI 입력을 열 수 없습니다. 장치를 다시 연결하세요.'));
    return () => { port.removeEventListener('midimessage', onMessage); void port.close().catch(() => {}); };
  }, [method, ports, portId, notes, channel, learning, hiHatCC, hiHatThreshold, hiHatClosedWhenLow]);
  const connectMidi = async () => {
    setInputError(''); setMidiBusy(true); const version = lifetime.current;
    try {
      if (!navigator.requestMIDIAccess) throw Error('Web MIDI를 지원하는 Windows Chrome 또는 Edge에서 열어주세요.');
      const value = await navigator.requestMIDIAccess({ sysex: false });
      if (lifetime.current !== version) return;
      setAccess(value);
      setPortId([...value.inputs.values()].find(input => input.state === 'connected')?.id || '');
    } catch (error) { if (lifetime.current === version) setInputError(`MIDI: ${(error as Error).message}`); }
    finally { if (lifetime.current === version) setMidiBusy(false); }
  };
  const connectHid = async () => {
    hidCleanup.current(); setHidName(''); setInputError(''); setHidBusy(true);
    const version = lifetime.current;
    let device: PedalHIDDevice | undefined;
    try {
      const hid = (navigator as Navigator & { hid?: PedalHID }).hid;
      if (!hid) throw Error('이 브라우저는 WebHID를 지원하지 않습니다. Windows Chrome/Edge를 사용하세요.');
      const vendorId = Number(vendor), productId = Number(product);
      if (!vendor.trim() || !product.trim() || ![vendorId, productId].every(n => Number.isInteger(n) && n >= 0 && n <= 65535))
        throw Error('제조사 문서의 Vendor ID와 Product ID를 입력하세요. 0x 접두사로 16진수도 입력할 수 있습니다.');
      const edge = createHIDEdge(mapping, (velocity, source) => kick.current(velocity, source));
      const hiHatState = createHIDState(hiHatMapping, pressed => hiHat.current(pressed, 'USB HID 왼쪽'));
      [device] = await hid.requestDevice({ filters: [{ vendorId, productId }] });
      if (!device) return;
      await device.open();
      if (lifetime.current !== version) { await device.close(); return; }
      const selected = device;
      const input = (event: Event) => { const e = event as PedalHIDEvent; edge(e.reportId, e.data); hiHatState(e.reportId, e.data); };
      const disconnected = (event: Event) => {
        if ((event as PedalHIDEvent).device === selected) { hidCleanup.current(); hiHat.current(false, 'HID 분리');
          setHidName(''); setInputError('HID가 분리되었습니다. 다시 연결하고 발을 뗀 후 밟으세요.'); }
      };
      selected.addEventListener('inputreport', input); hid.addEventListener('disconnect', disconnected);
      hidCleanup.current = () => {
        selected.removeEventListener('inputreport', input); hid.removeEventListener('disconnect', disconnected);
        void selected.close().catch(() => {}); hidCleanup.current = () => {};
      };
      setHidName(selected.productName || 'USB HID');
    } catch (error) { void device?.close().catch(() => {}); if (lifetime.current === version) setInputError(`HID: ${(error as Error).message}`); }
    finally { if (lifetime.current === version) setHidBusy(false); }
  };
  return <main className="pedal-page">
    <header><a href="#/vr">DRUM UP VR</a><span>노트북 전용</span></header>
    <h1>Pedal Controller</h1>
    <p>VR에서 연결 코드를 만든 뒤 이 페이지에 입력하세요. 노트북에서는 소리를 재생하지 않습니다.</p>
    <section className="pedal-card">
      <h2>1. VR 연결</h2>
      <label>릴레이 서버 주소<input aria-label="릴레이 서버 주소" type="url" placeholder="wss://relay.example.com/pedal" value={endpoint} onChange={e => setEndpoint(e.target.value)} /></label>
      <label>VR 연결 코드<input aria-label="VR 연결 코드" autoComplete="off" spellCheck={false} maxLength={16} placeholder="ABCDE-FGH23" value={code} onChange={e => setCode(e.target.value.toUpperCase())} /></label>
      <div className="pedal-buttons"><button onClick={() => client.current?.connect(endpoint, code)}>VR에 연결</button><button onClick={() => client.current?.disconnect()}>연결 해제</button></div>
      <p className={`pedal-connection ${state.status}`} data-testid="pedal-connection">● {connectionLabels[state.status]}{state.rtt !== null && ` · 서버 왕복 ${state.rtt}ms`}</p>
      {state.message && <p role="alert">{state.message}</p>}
    </section>
    <section className="pedal-card">
      <h2>2. 왼쪽 하이햇 · 오른쪽 킥 입력</h2>
      <button className="pedal-test" onClick={() => kick.current(1, 'TEST KICK')}>TEST KICK</button>
      <div className="pedal-buttons"><button onClick={() => hiHat.current(true, 'TEST LEFT')}>왼쪽 밟기 · 닫힘</button>
        <button onClick={() => hiHat.current(false, 'TEST LEFT')}>왼쪽 떼기 · 열림</button></div>
      <p>왼쪽 상태: <b data-testid="hihat-state">{leftPressed ? '닫힘' : '열림'}</b> · 오른쪽은 Space, 왼쪽은 Z 키로 테스트합니다. 연주 중에는 이 창을 앞에 두세요.</p>
      <p data-testid="pedal-input">{inputStatus}</p>
      <div className="pedal-counts"><span>입력 <b data-testid="input-count">{inputCount}</b></span><span>전송 <b data-testid="sent-count">{state.sent}</b></span><span>VR 재생 <b data-testid="played-count">{state.played}</b></span><span>미재생 <b>{state.dropped}</b></span></div>
      <p className="pedal-help">VR 재생 수에는 킥 타격과 하이햇 상태 적용이 포함됩니다. 실제 스피커 소리와 무선 지연은 헤드셋에서 확인하세요.</p>
      <label>물리 페달 입력<select aria-label="물리 페달 입력" value={method} disabled={hidBusy} onChange={e => setMethod(e.target.value)}><option value="keyboard">USB 키보드 페달 (Space)</option><option value="midi">USB MIDI / 드럼 모듈</option><option value="hid">고급: WebHID 보고서</option></select></label>
      {method === 'keyboard' && <p>오른쪽 USB 페달은 Space, 왼쪽은 Z 키로 설정하세요. 왼쪽은 누르는 동안 닫히고 키를 떼면 열립니다.</p>}
      {method === 'midi' && <div className="pedal-device">
        <button disabled={midiBusy} onClick={() => void connectMidi()}>{midiBusy ? 'MIDI 권한 대기…' : 'MIDI 장치 연결'}</button>
        <label>MIDI 입력<select aria-label="MIDI 입력" value={portId} onChange={e => { setPortId(e.target.value); setLearning(false); }}><option value="">장치를 선택하세요</option>{ports.map(port => <option key={port.id} value={port.id}>{port.name || port.id}</option>)}</select></label>
        {portId && !ports.some(port => port.id === portId) && <p role="alert">선택한 MIDI 장치가 분리되었습니다.</p>}
        <label>킥 노트 (쉼표로 구분)<input aria-label="킥 노트" value={notes} onChange={e => setNotes(e.target.value)} /></label>
        <label>왼쪽 하이햇 CC 번호<input aria-label="하이햇 CC" type="number" min="0" max="127" value={hiHatCC} onChange={e => setHiHatCC(e.target.value)} /></label>
        <label>닫힘 경계값<input aria-label="하이햇 경계값" type="number" min="1" max="127" value={hiHatThreshold} onChange={e => setHiHatThreshold(e.target.value)} /></label>
        <label className="pedal-checkbox"><input type="checkbox" checked={hiHatClosedWhenLow} onChange={e => setHiHatClosedWhenLow(e.target.checked)} />CC 값이 낮을 때 닫힘</label>
        <label>MIDI 채널<select aria-label="MIDI 채널" value={channel} onChange={e => setChannel(e.target.value)}><option value="all">모든 채널</option>{Array.from({ length: 16 }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}</select></label>
        <button disabled={!ports.some(port => port.id === portId)} onClick={() => setLearning(!learning)}>{learning ? '학습 취소' : '킥 노트 학습'}</button>
        {learning && <p>킥 페달을 한 번 밟으세요. 학습 입력은 소리를 내지 않습니다.</p>}
      </div>}
      {method === 'hid' && <fieldset className="pedal-device" disabled={!!hidName || hidBusy}>
        <legend>제조사 HID 사양으로 설정</legend>
        <p>일반 키보드형 페달은 위의 Space 모드를 사용하세요. 이 기능은 명시된 입력 보고서를 보내는 장치 전용입니다.</p>
        <label>Vendor ID<input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="0x1234" /></label>
        <label>Product ID<input value={product} onChange={e => setProduct(e.target.value)} placeholder="0x0001" /></label>
        {(['reportId', 'byte', 'mask', 'pressed'] as const).map(key => <label key={key}>{key}<input type="number" value={mapping[key]} onChange={e => setMapping({ ...mapping, [key]: Number(e.target.value) })} /></label>)}
        <p>왼쪽 하이햇 HID 필드</p>
        {(['reportId', 'byte', 'mask', 'pressed'] as const).map(key => <label key={`left-${key}`}>왼쪽 {key}<input type="number" value={hiHatMapping[key]} onChange={e => setHiHatMapping({ ...hiHatMapping, [key]: Number(e.target.value) })} /></label>)}
        <button onClick={() => void connectHid()}>HID 장치 연결</button>
      </fieldset>}
      {hidName && <p>{hidName} 연결됨 · 발을 뗀 상태를 먼저 인식해야 합니다. <button onClick={() => { hidCleanup.current(); setHidName(''); }}>HID 해제</button></p>}
      {inputError && <p role="alert">{inputError}</p>}
    </section>
  </main>;
}
