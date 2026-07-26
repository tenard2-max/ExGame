# Changelog

## 0.1.19 — 2026-07-26

### 추가
- 모바일(Android): 좌측 상단 `업데이트` 버튼 — GitHub 최신 APK 확인 후 브라우저로 다운로드

### 수정
- 불러오기/저장 목록: 모바일 터치 드래그 스크롤
## 0.1.18 — 2026-07-26

### 수정
- 몬스터 아틀라스 로드에 캐시 버스팅(?v=) 추가 — 구 atlas.png 재사용 방지
## 0.1.17 — 2026-07-26

### 변경
- 몬스터 아틀라스: 1536x1024 pixel-verified atlas.json/png 적용
- 몬스터 표시 크기: 최대 변 112px로 맞춤 (고해상도 원본 대비)
## 0.1.16 — 2026-07-26

### 수정
- 게임 설정 +/- 가 2씩 변하던 문제 (touch+mouse 이중 입력) — PC는 mouse만
- 게임 설정 패널 스크롤바 추가 (드래그/트랙 클릭)
- 게임 설정(설정 버튼) PC 전용 — 모바일은 오디오만
## 0.1.15 — 2026-07-26

### 수정
- index.html: head 안에 div 삽입으로 SystemJS 미기동되던 문제 수정
- 로딩 중 하얀 화면: Cocos 기본 style.css white 배경을 #05070c로 패치, 조기 로딩 문구
- 스플래시에 로딩 중 표시, Camera 누락 시에도 스플래시 종료 보장
## 0.1.14 — 2026-07-26

### 수정
- 설정 패널 +/-·기본값·닫기: getLocation→screenToWorld→버튼 world AABB 히트 (UI 수동 매핑 제거)
## 0.1.13 — 2026-07-26

### 수정
- 월드 히트: `getLocation`→`Camera.screenToWorld`→`getBoundingBoxToWorld` (렌더와 동일 공간)
- `screenToUiLocation` visibleOrigin 이중 가산 제거 (엔진 getUILocation과 일치)
- PC/Android 동일 히트 경로. Android APK versionCode 113

## 0.1.12 — 2026-07-26

### 수정
- 월드 히트: 스프라이트 UITransform→worldToScreen→UI AABB 통일 (`world-ui-hit.ts`)
- 경험식 zoom/screenToWorld 역산 제거. `?hitDebug=1` 로 AABB/터치 디버그

## 0.1.11 — 2026-07-26

### 수정
- 줌 클릭: 플레이어 근처 2×2 역변환 + NPC/몹/자원은 World→UI AABB 순방향 히트(역변환 의존 제거)

## 0.1.10 — 2026-07-26

### 수정
- 줌 후 클릭: World→UI(worldToScreen) 순방향 매핑을 프로브로 측정해 역변환 (screenToWorld 역경로 폐기)

## 0.1.9 — 2026-07-26

### 수정
- 0.1.8 클릭 전면 실패 복구: 줌 1.0은 기존 canvasLocal 히트 유지, 줌 시에만 Canvas AR→World UITransform 변환
- 저장된 월드 줌 1회 초기화(0.1.8 잔여 줌으로 클릭 불능이던 경우)

## 0.1.8 — 2026-07-26

### 수정
- 줌 후 클릭/터치 판정: canvasLocal÷World.scale 경로로 재수정 (휠·핀치 공통, PC/모바일 동일)

## Unreleased

### 변경
- GitHub Releases: `exgame-*-www.zip` / APK / version.json 업로드 중단 → PC `exgame-*.zip`(bat)만 등록

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
