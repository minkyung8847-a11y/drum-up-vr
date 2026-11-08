# Quest 3 USB 풋스위치 (키보드 HID)

2026-11-08 구현 및 검증 기록. 이 기능은 USB 장치 열거/연결 API를 사용하지 않고 페이지에 전달된 키보드 이벤트만 처리한다. 일반 키보드와 USB 풋스위치를 구분할 수 없다.

## 사용

1. 풋스위치를 Windows 전용 프로그램에서 Space로 설정한다. 설정이 장치에 저장되는지는 해당 장치의 동작으로 확인해야 한다.
2. USB-A → USB-C 어댑터로 Quest 3에 연결하고, 이 변경을 포함한 사이트의 `#/vr`를 연다. WebXR은 HTTPS 등의 보안 컨텍스트에서 실행한다.
3. VR 입장 전 PC/Quest 브라우저 상단의 **SETTINGS · CONTROLLER · FOOT PEDAL**에서 **TEST INPUT**을 누르고 페달을 밟아 2D 브라우저 수신부터 확인할 수 있다.
4. **Enter VR** → 통합 패널 **SETTINGS → CONTROLLER**. FOOT PEDAL 영역이 바로 펼쳐진다. **ENABLE FOOT PEDAL: ON**을 확인하고 **TEST INPUT**을 누른다. FOOT PEDAL 제목의 +/−로 접고 펼칠 수 있다. OFF로 끄면 페달 입력만 중단되고 기존 오른쪽 Grip은 유지된다. 페달을 밟으면 흰 원, **PEDAL PRESSED**, 수신 키, **INPUT DETECTED**, **KICK: PLAYED**를 확인한다. 놓으면 원이 꺼진다. KICK: PLAYED는 앱 타격 함수의 실행 결과이며 실제 스피커 출력/USB 신원을 보증하지 않는다.
5. **AUTO DETECT** → **PRESS YOUR FOOT PEDAL**에서 원하는 키를 입력한다. 이 입력은 할당 전용이고 타격하지 않는다. 놓은 뒤 다시 밟아 테스트한다. ESC / CANCEL로 취소한다. 할당과 ENABLE 상태는 현재 사이트의 localStorage에 저장되며 다른 도메인/브라우저에는 공유되지 않는다. 저장이 차단되면 이번 세션에만 적용된다고 표시한다.
6. MUSIC에서 **사랑으로**를 선택하고 START. 기존 네 박 카운트다운 이후 킥 노트를 페달로 친다. 오른쪽 Grip도 계속 사용 가능하다.

## 입력 처리와 기존 기능 보호

- 기본 `KeyboardEvent.code === 'Space'`. code가 없으면 key를 보조로 사용한다.
- window capture 단계에서 처리하여 자동 할당 키와 할당된 연주 키가 기존 F/G/H 단축키나 버튼 기본 동작까지 전달되지 않는다. 편집 입력란에서는 일반 연주 키를 가로채지 않는다. 자동 감지 중에는 입력을 먼저 소비한다.
- keydown 1회, repeat/누름 유지 무시, keyup 재무장, 35ms 디바운스. Space 기본 스크롤/버튼 클릭은 처리된 페달 이벤트에서만 차단한다.
- 페달과 오른쪽 Grip이 45ms 이내 교차 수신되면 최초 성공 타격만 인정한다. Grip끼리의 기존 동작은 유지한다.
- `kickRef → hitDrum('kick') → 기존 interaction.hit / highway.strike`를 사용한다. 사운드, 페달/비터 모션, 이펙트, Perfect/Great/Miss는 기존 구현이다. 키트/레인/곡 데이터/카운트다운/하이햇/스틱/판정 코드를 수정하지 않았다.
- XR 진입 시 캔버스에 focus를 요청한다. DOM의 visibilityState가 hidden이더라도 XRSession이 visible이면 수신 가능하도록 한다. 브라우저/OS가 이벤트를 주지 않으면 focus나 JavaScript만으로 강제로 수신할 수는 없다.
- XR 진입·종료마다 INPUT DETECTED 기록을 초기화한다. 2D에서 받은 입력을 VR에서 검증한 것으로 표시하지 않는다.
- AUTO DETECT/TEST INPUT에서 12초간 미수신이면 USB/포커스/WebXR 전달 제한 안내를 표시한다. 이는 장치 분리나 브라우저 미지원의 확정 판정이 아니다. 대기는 CANCEL/ESC 전까지 유지된다.
- 진단은 SETTINGS 안에서만 표시한다: code/key, down/up 횟수, 마지막 이벤트 repeat, XR 활성 여부, 마지막 입력 시각. 기존 LAN 개발용 진단 기능은 변경하지 않았다.

## 검증 결과

| 구분 | 결과 |
| --- | --- |
| Windows Edge 자동화, 실제 페이지/실제 Web Audio | Space 타격, repeat 방지, keyup 표시 복귀, F 키 할당 시 기존 tom 단축키 차단, 취소, 설정 저장/재로딩 통과 |
| 입력 모듈 | 35ms 디바운스, preventDefault, 미수신 안내, 해제/정리 통과 |
| 모의 WebXR + 실제 Three.js VR 패널 레이캐스트 | SETTINGS → CONTROLLER → FOOT PEDAL → AUTO DETECT/TEST INPUT 통과 |
| 모의 WebXR + 실제 킥 경로 | VR 진입 시 포커스/상태 초기화, 키 입력 → 킥, 페달/Grip 양쪽 순서 중복 방지, Grip 단독 타격 통과 |
| 실제 MUSIC 시작 + 제어한 곡 시계/모의 XR | Space → 기존 킥 Perfect / Great / Miss 통과 (테스트에서만 곡 시계 제어) |
| 기존 통합 UI 회귀 | 이동/탭/스크롤/배경/오디오/Grip/햅틱 통과 |
| 기존 사랑으로 회귀 | 음원 로딩·프리뷰·네 박 카운트다운·노트 시계·오프셋·종료 결과 통과 |
| Quest 3 실물 + 컴스 USB 풋스위치 | **미검증**: 실제 장치, USB 드라이버, Meta Browser 몰입 세션의 키 전달을 확인하지 못함 |

실행: `npm run test:pedal:usb` (VR), PowerShell `$env:FOOT_PEDAL_XR_MODE="immersive-ar"; npm run test:pedal:usb` (AR), `node scripts/check-vr-unified-panel.mjs`, `node scripts/check-vr-love-song.mjs`, `npm run build`.

전체 `npm run lint`는 기존 `scripts/finish-brand-theme.mjs:12` 구문 오류로 실패한다. 이번 변경 파일에 대한 개별 lint는 별도로 확인한다.

## Quest 3 실기 확인표 (아직 완료 아님)

- [ ] 어댑터 연결 후 2D에서 down/up 각각 증가, Space 수신, 1회 타격
- [ ] Enter VR 후 상태가 WAITING FOR INPUT으로 초기화되고, 다시 밟았을 때 INPUT DETECTED
- [ ] VR 안에서 code/key/down/up 증가, repeat=true 동안 추가 타격 없음
- [ ] 버튼에 포커스가 있어도 Space로 다른 버튼 클릭/페이지 스크롤 없음
- [ ] AUTO DETECT에서 다른 키 저장, CANCEL/ESC 취소, 재실행 후 저장 키 유지
- [ ] TEST INPUT 흰 원/키 표시/킥 사운드·비터 모션, 해제 후 원 복귀
- [ ] 오른쪽 Grip 단독 정상, 페달과 거의 동시에 입력 시 중복 없음
- [ ] 사랑으로 START 이후 킥 노트 판정 정상

2D에서는 수신되지만 VR에서 down/up가 증가하지 않으면 몰입 세션의 키 이벤트 전달/포커스가 제한되는 상황을 의심할 수 있다. USB 연결 성공이나 미지원 확정으로 표시하지 않는다. Meta Browser 버전, 2D/VR 각각의 code/key/down/up를 함께 기록해 원인을 좁힌다. 양쪽 모두 수신하지 못하면 어댑터/전원/장치에 저장된 매핑/OS 인식부터 확인한다.

VR에서 직접 입력이 전달되지 않을 때는 기존 **오른쪽 Grip**을 사용할 수 있다. 또는 USB 풋스위치를 Windows PC에 연결하고 기존 **VR pedals / #/pedal** WebSocket 릴레이 경로를 사용할 수 있다. 이 경로는 두 기기에서 접근 가능한 WSS 릴레이 서버와 연결 설정이 필요하며 이번 변경에서 새 서버를 배포하지 않았다. 자세한 절차는 [기존 페달 연결 문서](dual-vr-pedals.md)를 참고한다.

공식 참고: [Meta WebXR 시스템 키보드](https://developers.meta.com/vr/documentation/web/webxr-keyboard/), [MDN WebXR 입력](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Inputs). 이 문서들은 특정 컴스 USB 풋스위치의 Quest 3 몰입 모드 호환성을 보증하지 않는다.


## 메뉴 누락 수정

공개 GitHub Pages의 기존 VR 번들 `VRPractice-DbYFssK7.js`를 읽어 확인한 결과 CONTROLLER는 있지만 FOOT PEDAL과 풋페달 저장 키는 포함되지 않았다. 로컬 미배포 변경에는 VR Canvas 메뉴와 별도의 PC HTML 설정이 모두 있었다. 공개 사이트에서 메뉴가 없던 원인은 해당 풋페달 변경의 배포 누락이었다.

실제 렌더링 경로는 `src/main.tsx → VRPractice.tsx → createVRUnifiedPanel → drawUnifiedPanel`이다. VR과 AR 모두 같은 패널을 쓴다. `FootPedalSettings.tsx`는 몰입 화면 밖의 PC용 보조 설정이며 VR 메뉴를 대신하지 않는다.

CONTROLLER 선택 시 풋페달 영역을 즉시 표시한다. ENABLE FOOT PEDAL, KEY BINDING, AUTO DETECT, TEST INPUT, INPUT STATUS를 기존 패널 높이 안에 배치했다. 가장 아래 진단 글자의 기준선은 876이고 패널 배경 하단은 898이므로 세로 스크롤 없이 모두 들어간다. 기존 RESET PANEL POSITION 영역은 유지된다. 버튼 렌더링과 UV 히트 테스트는 동일한 FOOT_PEDAL_LAYOUT 좌표를 사용한다. 기존 selectstart/selectend 및 Trigger 버튼 상태 처리를 통해 모든 동작이 연결된다.

Windows Edge에서 모의 immersive-vr 및 immersive-ar 세션 각각 메뉴 열기/닫기, ENABLE ON/OFF, 비활성화 시 타격 차단, AUTO DETECT, TEST INPUT, 킥 판정까지 확인했다. Quest 3 실물 결과는 아니다.
## 페달과 스틱 동시 타격 시 부하 수정 (2026-11-08)

Quest 3에서 페달 단독은 정상이나 FREE PLAY에서 스틱과 함께 치면 화면 전체가 멈추거나 브라우저가 종료된다는 실기 제보가 있었다. Windows 모의 WebXR에서는 종료 현상 자체는 재현하지 못했다.

추가한 동시 타격 테스트에서 별개의 불필요한 작업을 확인했다. 수정 전 28회 킥+스틱과 8회 킥+양손 스틱 동안 숨은 PC 설정 DOM 변경 40회, 풋페달 정보가 없는 AUDIO 패널 텍스처 갱신 94회가 측정됐다. 이는 해당 실행의 계측 수치이며 Quest 종료 원인으로 확정한 것은 아니다.

- 몰입 세션 중 페달 이벤트가 부모 React 화면을 다시 렌더링하지 않도록 했다. VR 패널에는 최신 입력 상태를 직접 전달한다. XR 종료 시 PC 설정 상태를 다시 동기화한다.
- 페달 정보가 실제로 보이는 SETTINGS → CONTROLLER → FOOT PEDAL에서만 해당 입력으로 텍스처를 갱신한다. AUDIO/NOTE/GENERAL, 다른 탭, 접힌 패널에는 입력마다 새 텍스처를 올리지 않는다.
- 보이는 페달 진단은 최대 10Hz로 모아서 갱신한다. 버튼 조작은 기존 주기를 사용한다. 타격 함수는 입력 시 바로 호출하며 사운드/판정에 별도의 대기 시간을 넣지 않았다.
- 오디오가 이미 활성화된 경우 동기 타격 결과를 입력 상태와 함께 한 번 전달해 불필요한 Promise와 추가 갱신을 없앴다.

수정 후 동일 테스트에서 숨은 DOM 변경 0회, 불필요한 AUDIO 패널 텍스처 갱신 0회, 80개 실제 샘플 소스 실행, 765회 렌더 콜백 지속을 확인했다. 두 입력 순서, 스네어/하이햇/크래시/라이드/탐과 킥, 양손+킥을 포함한다. 100개 반복 키 이벤트에서도 킥 1회, 보이는 진단의 갱신 제한, VR 종료 후 PC 설정 복귀를 확인했다. 기존 키 저장/자동 감지/Grip 중복 방지 및 MUSIC Perfect/Great/Miss 연결 테스트도 통과했다.

실행: `npm run test:vr:pedal-chords`, `npm run test:pedal:usb`.

Quest GPU/USB 드라이버/브라우저 프로세스 종료는 모의 장치가 재현하지 못한다. 실제 Quest에서 업데이트 후 같은 동시 타격을 다시 확인해야 종료 문제가 해소됐는지 확정할 수 있다. 키트 모델, 위치, 스틱 충돌, 샘플, 타격 판정, 음악 및 노트 데이터는 변경하지 않았다.
