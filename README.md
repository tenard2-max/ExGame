# ExGame Cocos Client

ExGame의 독립 Cocos Creator 클라이언트입니다. 기존 NovelExplor 웹앱과 코드·저장소·인증을 공유하지 않습니다.

## 고정 개발 환경

- Cocos Creator **3.8.8**
- TypeScript (`strict: true`)
- 2D 프로젝트
- Web Desktop(WebGL) 우선
- 기준 해상도 **1280×720**, 가로형

## 프로젝트 열기

1. Cocos Dashboard에서 Creator 3.8.8을 설치합니다.
2. 프로젝트 경로로 이 `game/` 폴더를 선택합니다.
3. `assets/scenes/Main.scene`을 엽니다.

## 빌드

Cocos Creator에서 `프로젝트 > 빌드`를 열고 플랫폼을 **Web Desktop**으로 선택합니다.

Windows 명령줄 빌드:

```powershell
.\scripts\build-web.ps1
```

기본 설치 경로가 다르면:

```powershell
.\scripts\build-web.ps1 -CreatorPath "D:\Cocos\3.8.8\CocosCreator.exe"
```

출력은 `build/web-desktop/`에 생성되며 Git에는 포함하지 않습니다.
빌드 설정은 `build-config/web-desktop.json`에 고정되어 있습니다.

## 오프라인 실행 (권장)

```powershell
# Web 빌드 후 배포 패키지 생성
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-web.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-release.ps1

# 또는 개발 빌드를 바로 오프라인 실행
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-offline.ps1
```

배포 ZIP을 받은 경우에는 폴더 안의 `run-offline.bat`을 더블클릭하면 됩니다.  
자세한 내용은 [`docs/OFFLINE.md`](./docs/OFFLINE.md)를 참고하세요.

## 로컬 실행

Web 빌드 결과는 `file://`로 직접 열지 않습니다. 빌드 폴더에서 정적 서버를 실행합니다.

```powershell
py -m http.server 7456 --directory .\build\web-desktop
```

브라우저에서 `http://127.0.0.1:7456`을 엽니다.

## 현재 조작

- 키보드: `WASD` 또는 방향키
- 마우스: 왼쪽 버튼을 누른 채 이동할 방향으로 드래그
- 터치: 화면을 누른 채 이동할 방향으로 드래그
- 채굴: 가까운 블록·광맥을 짧게 탭(클릭) — 바위 2회, 나무 1회, 석탄 1회, 철 2회, 아크 3회
- 설치: 빈 바닥을 짧게 탭 — 핫바에서 선택한 아이템(돌) 1개 소비
- 핫바: 숫자 키 `1`~`5` 또는 슬롯 터치/클릭으로 선택
- 전투: 몬스터를 탭해 공격 — 처치 시 경험치·드롭, 반격당하면 체력 감소
- 상호작용: 보물 상자·던전 입구는 탭으로 개봉, 주민(NPC)은 대화
- 저장: `S` 수동 저장, `L` 불러오기, `E` JSON 내보내기, `I` JSON 가져오기
- 자동 저장: 20초 간격 + 창 종료 직전 시도

마우스와 터치는 같은 포인터 입력을 사용하며 hover에 의존하지 않습니다.
드래그는 이동, 짧은 탭은 채굴·설치로 구분됩니다.

## 현재 월드

- 기본 Seed: `851294`
- 청크: 16×16 타일, 타일당 32px
- 플레이어 중심 3×3 청크만 생성·유지
- 지형: Biome → Terrain → River → Forest
- 콘텐츠: 광석(석탄·철·아크) → 던전 → NPC → 보물 → 몬스터 순서로 생성
- 몬스터 티어(슬라임·늑대·골렘)는 원점에서 먼 청크일수록 상향
- 나무와 바위는 이동 충돌 대상으로 처리
- 플레이어 상태와 변경분(delta)은 IndexedDB에 저장, 원본 지형은 Seed로 재계산
- 세이브 포맷: [`docs/SAVE_FORMAT.md`](./docs/SAVE_FORMAT.md)
- 성능·호환성: [`docs/PERFORMANCE.md`](./docs/PERFORMANCE.md)

## 소스 구조

```text
assets/
├─ scenes/       # Cocos 씬
└─ scripts/
   ├─ core/      # 부팅, 공통 수명주기
   ├─ input/     # 키보드·마우스·터치 통합 입력
   ├─ world/     # Seed·Biome·Terrain·Chunk (3단계 이후)
   ├─ content/   # Ore·Dungeon·NPC·Treasure·Monster
   ├─ player/    # 플레이어 및 입력
   ├─ mining/    # 채굴·설치
   ├─ inventory/ # 아이템·장비
   ├─ save/      # IndexedDB 및 변경분 저장
   └─ ui/        # HUD·메뉴
```

핵심 계약과 불변식은 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)를 참고하세요.

현재는 **11단계 로컬 배포·오프라인 실행까지 완료**한 상태입니다. `run-offline` 런처와 release ZIP 패키징이 준비되어 있습니다.
