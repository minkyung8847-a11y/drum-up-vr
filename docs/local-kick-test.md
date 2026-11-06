# Quest 3 로컬 킥 테스트

노트북과 Quest 3가 같은 Wi-Fi에서 **같은 DRUM UP 개발 서버 주소**를 엽니다. 테스트용 WebSocket은 Vite의 `/pedal` 경로에서 실행되며, VR에서 발급한 일회용 코드로 노트북 한 대를 연결합니다.

## 개발 서버

기존 개발 서버를 시작한 터미널에서 종료 후 재실행합니다. 릴레이 의존성이 아직 설치되지 않았다면 프로젝트 폴더에서 `npm.cmd --prefix server ci`를 한 번 실행합니다.

이미 신뢰되는 HTTPS 주소로 Vite에 접속하고 있다면, 기존 실행 명령에 아래 환경 변수만 추가합니다. HTTPS 프록시를 사용하는 경우 기존 호스트 헤더를 보존하고 같은 주소의 `/pedal` WebSocket 업그레이드를 Vite에 전달해야 합니다.

```powershell
$env:VITE_DRUMUP_LAN_KICK = '1'
# 이 터미널에서 평소의 HTTPS 개발 서버 명령 실행
```

Vite에서 직접 HTTPS를 제공하려면 Quest와 노트북이 신뢰하고 접속 주소가 SAN에 포함된 기존 인증서와 키를 지정합니다.

```powershell
$env:VITE_DRUMUP_LAN_KICK = '1'
$env:DRUMUP_TLS_CERT = 'C:\path\to\trusted-cert.pem'
$env:DRUMUP_TLS_KEY = 'C:\path\to\private-key.pem'
npm.cmd run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

기존 `start-site.cmd`의 기본 주소인 `127.0.0.1`에는 노트북에서만 접속할 수 있습니다. 직접 LAN으로 접속하는 경우 인증서가 유효한 노트북 LAN 주소 또는 호스트명을 사용하고, 필요한 경우 Windows 방화벽의 개인 네트워크에서만 해당 포트를 허용합니다. Quest에서 인증서 경고가 나오면 신뢰되는 인증서와 접속 주소부터 확인합니다. HTTPS 페이지는 자동으로 `wss://같은-호스트:포트/pedal`에 연결합니다.

## Quest 3에서 확인

1. Quest에서 `https://<개발서버주소>/#/vr`를 열고 **로컬 킥 테스트 → 로컬 연결 코드 만들기**를 선택합니다.
2. 노트북에서 같은 주소의 `/#/kick-test`를 열고 코드를 입력해 **VR에 연결**을 누릅니다.
3. Quest에서 **Enter VR**을 누릅니다. 사운드 준비가 끝난 뒤 노트북에서 **TEST KICK**을 한 번 클릭하고 **Space**를 한 번 길게 누릅니다.
4. 노트북 전송·실행 횟수가 각각 두 번 증가하고, Quest에서 킥 소리와 페달·비터 움직임이 한 번씩 발생하는지 확인합니다. 드럼 오른쪽의 **DRUM UP / LAN KICK** 패널에서 연결 상태, 수신 횟수, 마지막 입력 시각, 실행 여부를 확인합니다. 고개를 돌려도 패널은 같은 월드 위치에 남습니다.
5. 네트워크를 잠시 끊었다 연결한 뒤 다시 테스트합니다. 같은 서버 프로세스가 살아 있고 두 페이지를 유지하면 자동 재연결합니다. 서버 재시작이나 페이지 새로고침 후에는 새 코드를 발급합니다. 끊긴 동안의 입력은 재생하지 않습니다.

노트북이나 Quest 브라우저 개발자 콘솔에서 `[DRUM UP pedal]` 로그를 확인할 수 있습니다. 브라우저가 상세 원인을 제공하지 않는 WebSocket 오류는 서버 주소, 같은 Wi-Fi, TLS 신뢰와 프록시 업그레이드를 확인합니다.
