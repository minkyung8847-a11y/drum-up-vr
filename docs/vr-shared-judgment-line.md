# VR 공통 판정선과 고정 음악 플레이어

2026-11-08. 악기 모델/배치, 스틱/Grip/USB 페달 입력, 사운드/진동, 음원/JSON, 저장된 싱크값과 카운트다운은 변경하지 않았다.

## 위치와 노트 경로

`vrNoteHighway.ts`의 `VR_JUDGMENT_LINE`에서 선의 두께/여백/높이/깊이와 레인의 먼 쪽 높이를 조절한다. 초기 드럼 hit surface의 월드 좌표와 반지름으로 키트 범위를 구한다. 모든 악기의 도착점은 같은 Y와 Z를 사용하며 X만 다르다. 하나의 `vr-judgment-line` 메시가 전체 키트를 가로지른다. 중앙 코어와 낮은 알파의 화이트 헤일로 및 양 끝 페이드를 한 셰이더 안에서 그린다. 배경판은 없다.

레인은 악기별 ID를 유지한다. 진행률 0이 판정선 교차점이고 1이 먼 시작점이다. 모든 노트가 `positionAt(remaining / travel)`을 사용하므로 서로 다른 레인에서도 remaining=0일 때 중심이 공통 선과 정확히 만난다. 키트가 생성된 뒤의 고정 좌표를 쓰며 고개 이동에 따라 바뀌지 않는다. 노트 레인의 시작 높이는 기존 통합 패널을 가리지 않도록 검증했다.

## 보존한 시간식

- 도착 시각(ms) = 기존 전달된 note.time × 1000 + 기존 noteSyncMs
- 현재 악보 시각(ms) = (기존 audio.currentTime − 기존 media.offset) × 1000
- remaining = 도착 시각 − 현재 악보 시각
- 사랑으로 전달 note.time은 기존 JSON 시간 + 기존 chartOffsetSeconds 그대로다.
- 사랑으로 media.offset은 기존 LOVE_COUNT_IN = 4 × 60 / 62다.
- 기존 기본 곡 오프셋 2.90초, 사용자 저장 곡 오프셋, 보정값, MP3 예약 시작의 0.035초, 출력 지연 보정은 그대로다.
- MUSIC 이동 시간 NOTE_TRAVEL_TIME=2.0초, 기존 데모 이동 시간 3.0초를 유지한다.

`vrMusicSong.ts`, `vrNoteSync.ts`, `songPracticeTiming.ts`, MP3/JSON을 수정하지 않았다. 새로운 높이를 맞추기 위해 타이밍 수치를 보정하지 않는다.

## 성공/MISS와 일시정지

기존 악기 ID 및 Perfect/Great 허용 범위로 판단하며 resolved 플래그를 한 번만 설정한다. 성공한 원본 노트는 즉시 활성 레인과 장면에서 제거한다. 별도의 고정 풀(16개)에서 흰 노트 잔상/확산 링/선의 국소 플래시/판정 텍스트를 200ms 동안 표시한다. 잔상은 낙하하지 않고 타격 당시 중심에 고정되어 축소·페이드한다. MISS는 더 약한 잔상/텍스트로 짧게 페이드한다. 성공과 MISS 모두 기존 정확도/집계식을 유지한다.

효과의 나이도 악보/오디오 시계로 계산한다. PAUSE에서는 노트 위치·효과·타격 판정·자동 MISS를 갱신하지 않는다. PLAY는 기존 transport의 동일 위치에서 재개한다. 물리 드럼의 사운드/애니메이션은 연주 입력 경로를 그대로 유지한다.

## 음악 플레이어

`vrMusicPlayer.ts`의 `VR_MUSIC_PLAYER`에 크기/위치를 둔다. 플레이어는 scene의 직접 자식이며 카메라, XR rig, 이동 가능한 통합 패널의 자식이 아니다. 키트에서 만든 판정선의 중앙 X, 선보다 0.48m 높은 Y, 선보다 0.12m 앞인 Z에 한 번 배치한다.

앨범 커버, 곡명/아티스트, 재생·일시정지, 경과/전체 시간과 진행 바를 표시한다. 플레이어 시간은 `transport.currentTime − transport.preroll`이며 전체 길이는 실제 디코딩된 MP3 buffer.duration이다. chartOffset/noteSync를 진행률에 넣지 않는다. 기존 카운트다운 중에는 숨기고 종료 뒤 표시하며 곡 종료/이탈 시 숨긴다. 캔버스는 최대 10Hz로 갱신하고 정지 상태에서는 다시 그리지 않는다.

재생 버튼은 기존 통합 패널의 컨트롤러 레이/Trigger 이벤트 경로에 연결했다. 해당 버튼을 가리키는 손의 드럼 충돌은 기존 패널과 동일하게 잠깐 제외한다. VR/AR 전환과 패널 이동은 기존 경로를 사용한다.

## 검증

- `npm run test:vr:rhythm-ui`: 공통 선 1개, 동일 Y/Z 도착, 비영 보정값으로 중심 도착, 다른 악기 무시, 약간 이른 Great, 즉시 제거, 성공/MISS 효과 종료, PAUSE에서 노트/효과/점수/시간 정지, 기존 키트/저장값 보존. 실제 MP3 시작 이후 플레이어 Trigger PAUSE/PLAY, 고개 이동 시 월드 고정, 진행률과 MP3 시각 일치.
- `node scripts/check-vr-love-full-song.mjs`: 기존 전체 985개 노트의 중심 도착·오프셋·230ms 보정·음악 epoch·결과 집계 유지.
- `node scripts/check-vr-love-song.mjs`: 기존 실제 MP3/차트 로딩, 프리뷰, 3→2→1→GO, 싱크 설정, 곡 종료 결과 유지.
- `node scripts/check-vr-unified-panel.mjs`: 통합 패널의 가림/탭/스크롤/Grip/진동 유지.
- `npm run test:pedal:usb`, `npm run test:vr:pedal-chords`: 기존 USB 킥, 누름 유지, 양손 동시 연주 및 MUSIC 판정 유지.

Windows Edge에서 실제 Three/Web Audio와 모의 XR 장치를 사용한 결과다. Quest 3의 실제 USB/컨트롤러/렌더링 성능과 체감 싱크는 실기 확인이 필요하다. 스크린샷은 테스트가 생성하는 임시 폴더의 drum-up-shared-line-world.png 및 drum-up-music-player.png에서 확인할 수 있다.
