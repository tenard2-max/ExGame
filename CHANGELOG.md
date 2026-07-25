# Changelog

## 0.1.7 — 2026-07-26

### 수정
- 핀치 줌 후 NPC/자원 터치 판정: UI→Camera.screenToWorld→World.inverseTransformPoint 로 월드 로컬 좌표 변환 (hitbox 스케일 변조 없음)

## 0.1.6 — 2026-07-26

### 수정
- PC 패키지: 로컬 서버를 **먼저** 기동한 뒤 브라우저 오픈 (「이 페이지가 작동하지 않습니다」 수정)
- start/run/auto-run.bat: Python 미설치 시 안내, 오류 코드 표시

## 0.1.5 — 2026-07-26

### 수정
- NPC 대화: 초상화 경로(Android WebView 상대경로), 우측 패널 폭 축소·모바일 레이아웃
- 모바일 오디오/설정 버튼 폭 +60% (텍스트 잘림)
- 시작 아이템: 초급 포션 10개만 (매 부팅 장비 100개 지급 제거)
- Android WebView 파일 선택(오디오 불러오기) — 저장소 권한 없이 시스템 피커

## 0.1.4 — 2026-07-26

### 추가
- 두 손가락 핀치 확대/축소 (월드). 모바일 +/- 버튼, PC 마우스 휠. 배율 저장.

## 0.1.3 — 2026-07-26

### 수정
- Android: 게임은 APK 내장으로 즉시 실행, OTA는 백그라운드·다음 실행용. 깨진 OTA 캐시 1회 삭제. 단일 스레드 future 대기 제거.

## 0.1.2 — 2026-07-25

### 수정
- Android OTA: PAT 미사용(공개 URL). 동일 버전 재다운로드 제거, 리다이렉트/타임아웃, BOM 파싱, 12초 후 내장 버전 진입

## 0.1.1 — 2026-07-25

### 추가
- Android: GitHub Releases `version.json` / `www.zip` 자동 업데이트(OTA)
- 모바일 UI: 헤더 제거, 설정·저장 축소, 아이템/물약·십자 패드
- `scripts/publish-github-release.ps1` 릴리스 빌드·업로드

### 변경
- 버전 `0.1.1` (versionCode 101)

## 0.1.0 — 2026-07-17

### 추가
- Cocos Creator 3.8.8 Web Desktop 클라이언트
- Seed 기반 결정적 월드 생성과 5×5 청크 스트리밍
- 키보드·마우스·터치 통합 이동 / 탭 상호작용
- 채굴·설치, 광맥(석탄·철·아크), 핫바 인벤토리
- 몬스터·보물·NPC·던전, 레벨·체력·경험치
- IndexedDB 세이브 슬롯, 수동/자동 저장, JSON import/export
- 오프라인 로컬 런처(`run-offline`)와 release ZIP 패키징

### 문서
- ARCHITECTURE.md, SAVE_FORMAT.md, PERFORMANCE.md, OFFLINE.md, RELEASE.md
