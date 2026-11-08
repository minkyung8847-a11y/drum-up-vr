# VR/AR 반투명 네온과 타원 노트

2026-11-09. 레인 개수/매핑/간격은 현재 확정된 8개를 유지한다. 모델·배치·높이·수평 판정선은 변경하지 않는다.

## 드럼 네온

vrNeonStyle.ts에서 기존 악기별 hue/lightness를 유지하고 sRGB HSL 채도만 25% 줄인다. 원래 팔레트와 instrument ID는 바꾸지 않는다.

vrDrumFeedback.ts의 두 레이어: Core는 실제 보이는 헤드 geometry 반지름의 .938~.962(중심 .95), opacity .62(타격 .82), 공유 soft alphaMap. Outer Glow는 같은 중심에서 부드럽게 사라지는 낮은 opacity 셰이더다. 기존 강한 시간 기반 sparkle/glitter는 제거했다. 새 글로우 면적은 이전 3.6R 사각형에서 2.7R로 감소한다. 드럼은 실제 local face Y, 심벌은 링 반지름의 라스 프로파일 높이에 1.5mm만 더한다. 드럼 크기·형상은 바꾸지 않는다.

두 레이어 모두 시각용 헤드/심벌의 자식이며 하이햇 닫힘/크래시 흔들림을 그대로 따라간다. 240ms 타격 pulse, 기존 컬러 반응/파동은 유지한다. 전역 bloom, 파티클 및 프레임별 새 메시/텍스처가 없다.

## 긴 직선 레인

각 레인은 기존 교차점 X를 먼 시작점에서도 그대로 유지한다. 깊이 7m, 높이 차 1.25m인 같은 방향의 평행 직선이다. 공통 소실점으로 강제 모으지 않는다. start/end 월드 좌표와 remaining/travel로 계산하며 progress=0은 기존 판정선 중심이다. 자연스러운 크기 변화는 3D 카메라 투영을 사용한다.

레인 전체 코어/글로우를 하나의 quad batch와 셰이더로 그린다. VR은 약 4mm 화이트 코어와 약한 화이트 글로우, AR은 차콜 .84 불투명도와 글로우 0이다. setPassthrough가 mode uniform을 바꾸며 원래 선/교차점/노트 경로는 유지한다. 먼 얇은 선의 aliasing을 줄이기 위해 fwidth를 사용한다. 기존 LineSegments geometry는 경로 검사와 계층/표시 상태용으로 유지하고 material.visible=false로 이중 렌더링을 방지한다.

## 타원 노트

같은 중심, 가로 크기를 유지하고 세로를 1/1.6로 줄인다. 링 opacity .76~.80, 내부 채움 .35~.50, 외곽 glow .10. 반지름 .615*sqrt(fill)로 중앙부터 면적이 확장되고 fill=1에서 링 안쪽까지 채운다. fill=clamp(1-remaining/travel,0,1)는 기존 식이다. 성공 ghost/ripple도 같은 타원 비율이며 제거/판정/200ms 성공·160ms MISS 시간은 유지한다.

AudioContext, chartOffsetSeconds, calibrationOffsetMs, MP3 시작 오프셋, JSON, countdown, 타격 윈도/점수는 수정하지 않는다.

## 검증

- test:vr:neon: 실제 GPU 픽셀 VR white/glow ↔ AR charcoal/no-glow, 전환 복원, 모든 링의 실제 반지름 대비 5% 안쪽/채도 25% 감소/1.5mm lift, 독립 7m 경로, 96회 타격·180프레임 동안 객체 및 GPU 자원 수 불변.
- test:vr:rhythm-ui: 중심 도착, 타원 비율/채움 픽셀, PERFECT/GREAT/MISS 제거/효과, MP3·pause·높이 조절·플레이어·패널 회귀.
- 전체 985개 노트 싱크, 실제 VR/AR 패널 전환 재질, 심벌/Grip, 페달 동시 타격 회귀.

Windows Edge의 실제 Three/WebGL/Web Audio와 모의 XR 결과다. Quest 3 실기 FPS/스테레오 체감/실제 카메라 배경 위 시인성은 확인하지 않았다.


## 추가 미세 조정: 레인 연장/원거리 페이드/링/판정 글자

- 평행 경로의 farDepth 7→10.5m, farRise 1.25→1.875m. 기존 경사·X 간격·판정선 위치·도착 시각 식은 유지한다. VR/AR 모두 UV 경로 진행률 .45~1 구간에 smoothstep alpha fade를 적용해 먼 끝에서 0으로 사라진다.
- 링 중심 반지름 .95→.90, 폭 .024R→.030R(25% 증가). 추가 5% 안쪽 이동이며 총 10% 안쪽이다. soft alphaMap과 외곽 glow 중심, 심벌의 해당 반지름 표면 높이도 함께 맞춘다. opacity/채도/타격 pulse는 그대로다.
- 기존 하나의 판정선 셰이더에서 core/glow를 조금 강화하고 96개 고정 셀의 작고 희미한 반짝임을 계산한다. 입자/객체 생성 없이 time uniform만 갱신한다. 판정선의 위치/크기/판정 시간은 그대로다.
- VR_JUDGMENT_COLORS: MISS #ff565f, GREAT #50d987, PERFECT #f2c45c. 월드 효과 라벨 및 기존 패널 판정 글자에 같은 색을 적용한다. 골드 글로우 10px, 나머지 6px. 기존 글자 위치/폰트/표시/제거 타이밍은 유지하고 라벨 텍스처에 sRGB를 지정한다.
- GPU 검사: VR 원거리 alpha 194→190→70→0, AR 214→210→77→0. 판정선 반짝임의 시간별 픽셀 변화, 자원 수 불변을 확인했다. 실제 캔버스 픽셀로 빨강/초록/골드 라벨을 검사하고 전체 985개 노트 도착·실제 MP3/높이/플레이어 회귀를 통과했다. Quest 3 실기 FPS는 측정하지 않았다.
