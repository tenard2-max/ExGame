# Changelog

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
