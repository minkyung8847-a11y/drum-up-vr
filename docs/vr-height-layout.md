# VR 높이·원근 경로·패널 방향

2026-11-09 추가 수정. 사용자 확인에 따라 현재 8개 레인과 색상/악기 순서를 유지한다.

## 기본 높이와 실시간 조절

최근 키트 root에 추가한 -12cm를 제거해 그 이전 기본 높이로 복구한다. 앉은 사용자 rig/eyeLift/카메라/악기 크기·각도는 바꾸지 않는다.

SETTINGS → DRUM HEIGHT에서 LOWER / RAISE / RESET HEIGHT를 실제 UV raycast/Trigger로 조작한다. 2cm 단위, 기본 0, 범위 -30~+30cm. 저장 키는 drumup.vr.drum-height.v1, JSON number(미터)다. 저장 실패 시 SESSION ONLY를 표시하며 잘못된 값은 기본값으로 처리한다. RESET은 현재 복구한 기본 높이 0을 저장한다.

높이는 authored base에 대한 절대 오프셋이므로 XR 재진입 때 누적되지 않는다. 초기에는 collision/note 캡처 전에 적용한다. 실시간 변경 시 root 전체/고정 hit surface 행렬/assisted collision 캐시/컨트롤러 이전 샘플을 갱신한다. 레인·하나의 판정선·활성 노트·효과 origin/target도 동일 delta로 즉시 이동한다. PAUSE 중에도 이동하지만 노트 진행률/점수/판정 상태/오디오 시계는 바꾸지 않는다. 플레이어와 사용자가 옮긴 패널은 월드 고정을 유지한다.

하이햇 X 조정값은 -.12m에서 -.08m로 변경해 심벌·스탠드·발판을 함께 4cm 오른쪽으로 이동한다. 높이/각도/OPEN·CLOSED/흔들림/Grip 경로는 유지한다.

## 원근 노트 경로

이전 farDepth=7m, farRise=1.25m를 복구한다. 현재 8개 판정선 교차점은 유지하고 먼 공통점으로 수렴시킨다. progress=remaining/travel, progress=0에서 노트 중심이 판정선에 도착한다. 노트 실제 크기는 유지하고 깊이 투영으로 멀리서는 작게, 가까워지면서 크게 보인다. 전체 985개 noteHitTime/offset/calibration/audio epoch 및 MP3/JSON은 변경하지 않는다.

## 네온

주 링 폭은 반지름 .946~1.018(.072R)에서 .958~1.006(.048R)로 약 33% 감소한다. 공유 alphaMap으로 가장자리를 흐리게 하고 idle opacity .78→.38, 타격 .70으로 선명한 선보다 글로우를 강조한다. 더 넓고 강한 컬러 halo/spread와 타격 pulse, GPU angular sparkle을 더한다. 입자/텍스처를 매 프레임 생성하지 않는다. 기존 색 변화·파동은 유지하며 wave에는 새 링 alphaMap을 적용하지 않는다. 네온은 각 시각용 헤드/심벌의 자식이다.

## 공통 패널

하단 핸들을 Trigger로 잡은 상태에서 위(축 Y 음수)=멀리, 아래=가까이. 좌/우=축소/확대. dpad도 같은 방향이다. 잡지 않으면 입력은 무시한다. 기존 크기 .55~1.75배, 거리 .70~4.5m, 위치/크기 저장과 손 이동 드래그를 유지한다. 통합 UI/음악 플레이어가 같은 모듈을 사용한다.

## 검증

- npm run test:vr:height: 실제 SETTINGS 레이/Trigger 버튼, 제한/저장/새로고침 복원, 동일 delta 판정선 이동, 새 높이의 실제 스틱 충돌, 하이햇 스탠드 정렬, 패널 위/아래 거리·좌/우 크기·잡지 않은 상태 차단.
- npm run test:vr:rhythm-ui: 원근 경로/투영 크기, 비영 보정값의 중심 도착, PAUSE 높이 이동, 실제 MP3 정지 상태의 SETTINGS 높이/RESET 후 음악·점수·채움 유지, 기존 플레이어·패널 조작.
- 전체 985개 노트 도착, 심벌 모션·Grip, 풋페달/스틱 동시 타격, VR/AR 회귀 검사.

Windows Edge + 실제 Three/WebGL/Web Audio + 모의 XR 결과다. Quest 3 실기 시야·프레임 안정성·USB/컨트롤러 체감은 검증하지 않았다.
