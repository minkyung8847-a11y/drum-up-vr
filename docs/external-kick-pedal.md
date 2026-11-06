# DRUM UP 외부 킥 페달 연결

이 문서는 초기 오른쪽 킥 페달 구현 기록이다. 현재 좌·우 페달 동작과 설정은 [VR 좌·우 페달 연결](dual-vr-pedals.md)을 따른다.

## 구현 범위와 현재 상태

기존 GitHub Pages 프런트엔드에 `#/pedal` 노트북 화면과 VR의 **Kick pedal** 연결 패널을 추가했다. Node.js WebSocket 릴레이는 `server/`에 별도 구현했다. 소스와 배포 설정은 준비되었지만 **새 릴레이 서버를 외부에 생성하거나 유료 서비스를 신청하지 않았다. 이 변경을 포함한 프런트엔드도 아직 게시하지 않았다.** 서버 주소를 확보하고 프런트엔드를 배포해야 실제 독립형 헤드셋에서 사용할 수 있다.

현재 드럼 배치·크기·기울기·시점·모델·재질·배경·조명·컨트롤러 스틱과 낙하 노트 비활성화 설정은 보존한다. 킥 연주 중 기존 페달 발판/비터의 로컬 회전만 160ms 동안 반응하며, 종료 시 저장한 원래 회전으로 복귀한다.

## 빠른 로컬 테스트 (페달 불필요)

프로젝트 폴더에서 Node.js 22 이상을 사용한다. Windows PowerShell에서 실행 정책이 npm.ps1을 막으면 `npm.cmd`를 사용한다.

```powershell
cd 'C:\Users\rntmf\OneDrive\Desktop\DRUM UP - VR'
npm.cmd ci
npm.cmd ci --prefix server
```

터미널 1:

```powershell
npm.cmd run pedal:server
```

터미널 2:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

1. PC에서 `http://127.0.0.1:5173/#/vr`를 연다.
2. **Kick pedal** → 서버 주소 `ws://127.0.0.1:8787/pedal` → **새 연결 코드**.
3. **소리 활성화**를 눌러 소리 준비 완료를 확인한다.
4. 별도 창에서 `http://127.0.0.1:5173/#/pedal`을 연다. 같은 서버 주소와 VR에 표시된 10자리 코드를 입력하고 **VR에 연결**을 누른다.
5. 컨트롤러 창의 **TEST KICK**을 누르거나 Space를 누른다. VR 쪽 기존 킥 샘플과 페달/비터가 반응한다. Space를 길게 눌러도 한 번만 입력한다. 주소/코드 입력란에서 타이핑할 때는 킥이 나지 않는다.
6. `입력`은 로컬 입력 수, `전송`은 전송한 수, `VR 재생`은 VR 앱이 소리 재생 함수를 실행했다고 응답한 수다. 실제 스피커 출력 확인과는 다르다. 오디오 잠김·만료된 패킷·연결 중단은 미재생 처리한다.

이 로컬 주소는 **같은 PC에서 하는 개발 테스트 전용**이다. 독립형 헤드셋의 `localhost`는 헤드셋 자신이다. GitHub Pages의 HTTPS 페이지에서 노트북의 `ws://` 주소를 입력하는 방식은 지원하지 않는다.

## 독립형 헤드셋과 노트북 연결

실제 운영 시 예상 프런트엔드 주소(이번 소스 배포 후 활성화):

- VR: <https://minkyung8847-a11y.github.io/drum-up-vr/#/vr>
- 노트북: <https://minkyung8847-a11y.github.io/drum-up-vr/#/pedal>

두 페이지에 **동일한 `wss://실제릴레이도메인/pedal`**을 입력한다. VR에서 코드를 만들고 소리를 활성화한 후 노트북에서 코드를 입력한다. 연결됨을 확인한 뒤 헤드셋에서 **Enter VR**. 노트북 컨트롤러 창은 계속 앞에 두고 노트북 절전/화면 잠금을 피한다. 손은 기존 VR 스틱으로 연주하고 발 입력은 릴레이로 전달된다. 서버만 두 기기에서 접근 가능하면 PC VR 케이블이나 동일 LAN은 필수 조건이 아니다. 가까운 서버와 안정적인 Wi-Fi를 사용해야 지연을 줄일 수 있다.

오디오가 다시 잠기면 헤드셋의 Enter VR/트리거 또는 연결 패널의 소리 활성화를 사용한다. 원격 메시지는 브라우저 사용자 제스처를 대신할 수 없다. 잠긴 동안 받은 킥은 버리며 소리 해제 후 재생하지 않는다. XR 세션이 숨겨지거나 헤드셋을 벗었을 때도 원격 킥을 버린다. VR에 진입하지 않은 PC 테스트는 보이는 탭에서만 재생한다.

**선택 기능:** Kick pedal 패널의 `VR 컨트롤러 그립 버튼으로도 킥 연주`를 켜면 양손 그립 버튼을 눌러 킥을 낼 수 있다. 기본값은 꺼짐. 기존 스틱 추적과 충돌 연주는 그대로 동작한다. 해당 손의 기존 햅틱 함수를 사용한다.

## 서버 배포 (별도 계정/호스트 필요)

[GitHub Pages는 정적 호스팅](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)이므로 지속적인 WebSocket 서버를 실행할 수 없다. 아래 중 하나만 선택한다. 계정 인증·호스트·도메인·비용 승인은 사용자가 제공해야 한다. 도메인 예제는 실제 서비스 주소가 아니다.

### A. 소유한 Linux 서버 + Docker + Caddy

1. 서버에 Docker/Compose를 설치하고 `server/`를 복사한다. 선택한 도메인의 DNS A/AAAA를 서버로 지정하고 TCP 80/443을 연다.
2. `server/.env.example`을 `server/.env`로 복사하고 아래 값을 설정한다.

```dotenv
RELAY_DOMAIN=pedal.your-domain.example
ALLOWED_ORIGINS=https://minkyung8847-a11y.github.io
```

3. `server` 폴더에서 실행:

```sh
docker compose up -d --build
docker compose logs --tail=50 relay caddy
```

4. `https://실제도메인/healthz`가 `{"ok":true,"protocol":1}`을 반환하는지 확인하고 두 장치에 `wss://실제도메인/pedal` 입력.

[Caddy HTTPS](https://caddyserver.com/docs/quick-starts/https)가 인증서를 관리한다. 8787 포트는 외부에 노출하지 않으며 Caddy만 접근한다. 이 구성에서만 `TRUST_PROXY=true`로 실제 클라이언트 IP 제한을 적용한다. 신뢰할 수 없는 클라이언트가 릴레이 포트에 직접 접근할 수 있는 환경에서는 이 옵션을 켜지 않는다.

### B. WebSocket 지원 Node 호스팅

`server/render.yaml`은 [Render WebSocket](https://render.com/docs/websocket)용 Blueprint 설정이다. 저장소를 연결하고 Blueprint 경로를 `server/render.yaml`로 지정한다. 생성 전 요금제를 검토한다. 또는 수동 Node Web Service 설정:

```text
Root directory: server
Build command: npm ci --omit=dev
Start command: npm start
Health check: /healthz
NODE_ENV=production
HOST=0.0.0.0
ALLOWED_ORIGINS=https://minkyung8847-a11y.github.io
TRUST_PROXY=false
```

호스트가 주는 `PORT`를 사용한다. 서버 수는 **1개**로 유지한다. 다중 서버/수평 확장에는 공유 세션 저장소와 메시지 전달 계층이 추가로 필요하다. 무료 호스트의 절전·콜드 스타트는 연주를 방해할 수 있다. 인증서·WSS 업그레이드·프록시 타임아웃은 실제 배포 후 검사한다. 플랫폼 프록시 뒤에서 `TRUST_PROXY=false`이면 IP 제한은 프록시 단위로 적용되므로 규모가 커지면 검증된 프록시 설정이 필요하다.

### 프런트엔드 설정/빌드

UI에 서버 주소를 직접 입력하면 프런트엔드를 다시 빌드할 필요가 없다. 주소만 로컬 저장하고 비밀 연결 토큰은 저장하지 않는다. 기본값을 배포 시 넣으려면 `.env.production.local` 또는 CI 환경에 다음을 설정한다:

```dotenv
VITE_PEDAL_RELAY_URL=wss://실제도메인/pedal
```

```powershell
npm.cmd run build -- --base=/drum-up-vr/
```

기존 `.github/workflows/deploy-pages.yml`은 master 푸시 시 배포한다. 게시 승인 후 변경 파일만 커밋/푸시한다. 새 서버 배포 계정은 기존 GitHub 로그인과 별개다.

## HOSIMI 3.5mm 페달: 확인된 점과 미확인 사항

**커넥터 직경만으로 신호 종류/USB 입력 호환성을 판단할 수 없다.** 현재 모델명, TS/TRS 핀 배선, 접점 극성, 출력 전압/저항, 원래 드럼 모듈과 USB MIDI 지원 여부가 제공되지 않았다. [HOSIMI 공식 사이트](https://www.hosimi.co.kr/)와 [공식 FAQ](https://www.hosimi.co.kr/service/faq.php) 공개 자료에서 이 사용자의 페달을 특정할 수 있는 핀 사양을 확인하지 못했다. 제조사에 모델명과 아래 사양을 확인해야 한다. 이 문서는 특정 HOSIMI 모델의 호환성을 보증하지 않는다.

| 가능한 신호 | 컴퓨터 입력으로 바꾸는 방법 | 현재 앱 지원 |
|---|---|---|
| 단순 순간 접점 스위치 | 해당 극성/배선 지원 USB 키보드/접점 인터페이스에 연결, Space로 설정 | 일반 키보드 이벤트로 즉시 지원 |
| 압전(piezo) 트리거 | 임피던스·트리거 종류가 맞는 드럼 모듈/트리거→USB MIDI 인터페이스 | Web MIDI Note On + 세기 지원 |
| 저항/연속 제어/독자 회로 | 해당 페달 전용 또는 명시적으로 호환되는 모듈 필요 | 모듈이 킥 Note On/키 입력을 출력하면 지원; 임의 CC/아날로그 파형은 미지원 |
| 이미 USB 키보드/MIDI/HID로 변환된 장치 | Windows에서 해당 장치로 인식되는지 확인 | 아래 방식으로 연결 |

접점 인터페이스가 스위치를 USB 키보드로 바꾸는 예시는 [Ultimarc 공식 U-HID](https://ultimarc.com/u-hid/interface/u-hid/)에 나와 있다. 전자 드럼 트리거를 먼저 모듈의 TRIGGER INPUT으로 연결하는 예시는 [Roland 트리거 공식 설명서](https://cdn.roland.com/assets/media/pdf/RT-10KST_OM.pdf)에 나와 있다. **이는 변환 방식의 근거이며 이 HOSIMI 페달과 해당 제품의 호환성 확인은 아니다.**

노트북 헤드폰/콤보 잭은 USB HID나 MIDI 입력이 아니다. 단순 3.5mm→USB 오디오 어댑터도 접점/드럼 트리거→MIDI 변환기가 아니다. 마이크 녹음 기반 추정이나 회로가 불명확한 직접 연결은 구현하지 않았다. 전기 사양을 모르는 페달을 임의 디지털 핀이나 오디오 잭에 연결해 해결하려 하지 말고, 제조사 사양과 호환 모듈을 먼저 확인한다.

**추가 장비 여부:** 원래 HOSIMI 본체가 이 페달을 읽고 USB MIDI로 킥 Note On을 출력한다면 그 본체와 USB 데이터 케이블을 사용할 수 있다. 그런 모듈이 없다면 페달 신호에 맞는 변환 장치가 필요할 가능성이 높다. 키보드형 USB 풋스위치로 교체하면 HOSIMI 페달의 전기 사양 확인과 별개로 Space 방식 테스트가 가능하다. 구매 전 신호·커넥터·극성·Windows 지원을 확인해야 한다.

## 지원 입력 연결 방법

- **USB 키보드형 페달:** 제조사 설정 프로그램에서 Space에 매핑 → 노트북에 USB 연결 → 컨트롤러 창에 초점 → 밟기. 별도 WebHID 권한 불필요. 연속 반복/매크로 기능은 끈다.
- **USB MIDI 모듈:** 페달을 호환 모듈의 킥 입력에 연결 → USB 데이터 케이블로 노트북 연결 → Windows Chrome/Edge에서 컨트롤러 열기 → 입력 `USB MIDI / 드럼 모듈` → `MIDI 장치 연결` 권한 허용 → 실제 입력 장치 하나 선택. 기본 킥 노트는 35/36(모든 채널). `킥 노트 학습` 후 한 번 밟으면 노트와 채널이 설정된다. 학습 입력 자체는 소리를 내지 않는다. Note Off/velocity 0/다른 노트/CC는 제외하고 양수 Note On의 세기를 유지한다. 분리 시 상태를 표시한다.
- **전용 WebHID:** 입력 `고급: WebHID 보고서` → 제조사 Vendor ID/Product ID와 reportId/바이트 위치/비트 마스크/눌림 값 지정 → 장치 선택 권한 허용 → 발을 떼었다가 밟기. 눌린 상태 반복 보고서는 한 번만 처리하고 최초에는 해제 보고서를 먼저 요구한다. 장치에 설정 명령을 쓰지 않고 입력 보고서만 읽는다. 실제 모델의 보고서 구조가 필요하며 임의 기본값의 호환성을 주장하지 않는다. 일반 키보드는 보안상 WebHID 대상으로 선택되지 않을 수 있으므로 Space 모드를 쓴다. [Chrome 공식 WebHID 설명](https://developer.chrome.com/docs/capabilities/hid).

[Web MIDI](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)와 WebHID는 브라우저/보안 컨텍스트/권한에 제약이 있다. 하드웨어 연결은 노트북에서 처리하므로 헤드셋 브라우저에 MIDI/HID 지원이 없어도 된다. 헤드셋에는 WebSocket, Web Audio, 기존 WebXR 지원이 필요하다.

## 통신 규칙과 운영 한계

- TLS/WSS, 정확한 Origin 허용 목록, 최대 2048바이트 메시지, 역할별 메시지 허용, 속도/접속/방 수 제한.
- 서버가 암호학적 난수로 50비트(32종 문자 10자리) 코드를 만들며 10분 후 만료. 코드 공유는 의도한 노트북에만 한다. 한 번 연결되면 재사용 불가.
- 각 역할에 별도의 256비트 재연결 토큰. URL/영구 저장소/로그에 토큰을 기록하지 않는다. 새로고침은 새 연결이 필요하다.
- 한 세션은 VR 하나 + 노트북 하나. 세션은 최대 6시간, 양쪽 모두 끊긴 상태는 10분 후 제거. 서버 재시작/업데이트 시 새 코드가 필요하다.
- 끊김은 0.5~10초 지수 백오프 및 지터로 재연결. heartbeat와 ping/pong으로 연결 상태 및 RTT 추정. RTT는 서버 왕복값이며 실제 발→헤드셋 소리 지연이 아니다.
- 증가하는 이벤트 번호로 중복 방지. 서버 시계 추정과 350ms 유효기간으로 오래된 킥을 버린다. 네트워크 적체 시 큐를 쌓지 않는다. 더 낮은 실제 연주 지연은 네트워크/호스팅 위치에 달려 있다. 실시간 음악 특성상 손실된 킥을 재전송하지 않는다.
- VR 오디오 준비/실행 상태 및 가시성을 확인한 뒤 기존 `drumSynth.trigger('kick', velocity)`를 실행한다. 샘플 재로딩이나 두 번째 오디오 엔진은 없다. 다른 킥과 손 연주는 자연스럽게 겹쳐 재생된다.
- 서버는 메모리 기반 단일 인스턴스 설계다. 대규모 공개 서비스의 인증/관측/분산 저장소까지 제공하는 시스템은 아니다.

## 변경 파일

| 파일 | 역할 |
|---|---|
| `src/pedal/PedalController.tsx`, `pedal.css` | 노트북 입력/상태/카운터/장치 선택 UI |
| `src/pedal/VRPedalPanel.tsx`, `usePedalConnection.ts` | VR 연결/오디오 활성화/컨트롤러 버튼 옵션 |
| `src/pedal/PedalConnection.ts` | 두 페이지 공통 WebSocket·재연결·중복/유효기간 검증 |
| `src/pedal/inputs.ts` | Space, MIDI, HID 입력 해석 |
| `src/pedal/kickTrigger.ts`, `xrKickInput.ts` | 통합 킥 호출과 선택적 WebXR 그립 버튼 |
| `src/main.tsx` | `#/pedal` 경로 |
| `src/components/VRPractice.tsx` | 기존 씬에 원격 킥 수신 연결 |
| `src/components/vrDrumInteraction.ts` | 기존 페달/비터의 짧은 로컬 애니메이션 |
| `src/components/virtualDrumSet.ts` | 기존 발판/비터 참조만 노출; 생성 좌표/모델 변경 없음 |
| `src/utils/synth.ts` | 오디오 실행 상태 조회 |
| `server/relay.mjs`, `server/package*.json` | 별도 릴레이와 고정 의존성 |
| `server/Dockerfile`, `compose.yaml`, `Caddyfile`, `render.yaml`, `.env.example` | TLS 서버 배포 설정 |
| `server/relay.test.mjs`, `scripts/check-pedal-integration.mjs`, `check-pedal-regression.mjs`, `check-pedal-production.mjs` | 서버·브라우저 통합·기존 VR 회귀·빌드 결과 테스트 |
| `package.json`, `.env.example`, `.gitignore` | 실행 명령, 기본 서버 설정, 환경 파일 제외 |

## 검증 명령

```powershell
npm.cmd run build -- --base=/drum-up-vr/
npm.cmd run test:pedal:server
npm.cmd run test:pedal
npm.cmd run test:pedal:regression
npm.cmd run test:pedal:production
npm.cmd run lint
```

브라우저 통합 테스트는 Edge를 headless로 열고 임시 로컬 Vite/릴레이를 스스로 시작·종료한다. 테스트용 외부 서버는 필요 없다. 선택적으로 `VR_ARTIFACT_DIR`를 지정하면 화면 이미지를 저장한다. MIDI/HID/XR 어댑터는 모의 입력이고, 소켓 및 기존 오디오 버퍼 재생 호출은 실제 브라우저에서 검사한다. 전체 lint의 기존 `scripts/finish-brand-theme.mjs:12` 문법 오류 등은 이 작업 범위 밖이다. 변경 파일은 별도 lint로 검사한다.

실제 헤드셋, 실제 HOSIMI 페달, 실제 USB MIDI/HID 장치, 외부 WSS 서버와 무선 네트워크를 통한 지연/장시간 안정성은 장비 및 배포 후 검증해야 한다. 헤드셋 슬립/복귀, 오디오 정책, 연속 킥과 양손 동시 타격, 컨트롤러 버튼 햅틱, 실제 페달 접점 튐/세기/핀 배선 확인이 남는다.

## 이번 작업의 실행 결과 (2026-10-20)

| 검사 | 결과 |
|---|---|
| TypeScript + GitHub Pages용 production build | 통과; 기존 500kB 초과 번들 경고 유지 |
| 변경 파일 oxlint / `git diff --check` | 통과 |
| 릴레이 자동 테스트 8개 | 모두 통과: 실제 소켓 전송/ACK, 세션 격리, 일회용 코드, 인증/만료, 재연결/중복 차단, 오래된 입력, Origin/메시지 크기, 속도/방 제한 |
| 독립된 브라우저 컨텍스트 2개 | 기존 킥 샘플 16회 재생 확인; TEST/Space/MIDI/HID 경로, 오디오 버퍼/세기/즉시 호출, 키 반복/입력창 제외, 끊김 복구, 재전송 없음 |
| 수신 측 중복·과거·미래 패킷, 오디오 잠김 | 모두 미재생 처리; 해제 후 밀린 킥 없음 |
| MIDI/HID/XR 어댑터 | 모의 장치로 노트 학습/Note Off 제외/분리 처리, HID 해제 후 재입력/20ms 접점 튐 방지/장치 닫기, 양손 XR 버튼 경로 확인 |
| 페달/비터 애니메이션 | 실제 렌더 중 움직임 감지; 종료 후 모든 킷 객체 및 플레이어/카메라 변환이 원래 값으로 복귀 |
| 기존 VR 회귀 검사 6종 | 배치·모델·재질·크기 보존, 28쌍 본체 간격, 192개 양손 보조 타격, 8종 마우스 소리, 20회 중첩 재생, 스틱/오디오 준비/자유연주/인스턴싱 통과 |
| 실제 빌드 파일 로컬 미리보기 | `/drum-up-vr/` 경로에서 두 페이지 로드·코드 연결·킥 재생 ACK·런타임 오류 없음 |
| 화면 검사 | 데스크톱 및 390px 화면 확인, 가로 넘침 없음 |
| 전체 프로젝트 lint | 기존 `scripts/finish-brand-theme.mjs:12` 문법 오류 및 별도 파일 경고 때문에 실패; 이번 변경 파일에는 오류/경고 없음 |
| Docker/Caddy/외부 WSS 배포 | 실행 안 함. 이 환경에는 Docker가 없고 외부 호스트/도메인/계정이 제공되지 않음 |
| 실제 페달·VR 하드웨어·무선 음향 지연 | 테스트하지 않음 |

자동 테스트용 서버와 브라우저는 종료했다. 변경 파일은 로컬 작업 폴더에 있으며 Git 커밋/푸시 및 외부 게시를 실행하지 않았다. 외부 게시와 신규 호스팅 사용 승인이 남아 있다.
