# ExGame Cocos Client

ExGame의 독립 Cocos Creator 클라이언트입니다. 기존 NovelExplor 웹앱과 코드·저장소·인증을 공유하지 않습니다.

## 고정 개발 환경

- Cocos Creator **3.8.8**
- TypeScript (`strict: true`)
- 2D 프로젝트
- Web Desktop(WebGL) 우선
- 기준 해상도 **2560×1440**, 가로형

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

## PC ZIP + Android APK 한 번에

```powershell
.\scripts\package-all.ps1
```

- PC: `release/exgame-<version>.zip`
- 폰: 웹 빌드를 `mobile/android/.../assets/www`에 동기화 후, Android Studio(또는 gradlew)로 APK

상세: [`docs/MOBILE.md`](./docs/MOBILE.md) · [`docs/RELEASE.md`](./docs/RELEASE.md)

## 오프라인 실행 (권장)

더블클릭:

| 파일 | 역할 |
|------|------|
| `ExGame.lnk` | 아이콘 바로가기 (없으면 `create-shortcut.bat`) |
| `auto-run.bat` | 아틀라스 동기화 → 서버 기동 → 브라우저 자동 실행 |
| `start-server.bat` | 로컬 서버만 기동 (이미 떠 있으면 브라우저만 염) |
| `create-shortcut.bat` | 바탕화면·폴더에 아이콘 바로가기 생성 |
| 저장소 루트 `게임실행.bat` | 자동 실행과 동일 |

아이콘 원본: `branding/exgame-icon-source.png` · Windows 아이콘: `branding/exgame.ico`

PowerShell:

```powershell
# Web 빌드 후 배포 패키지 생성
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-web.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-release.ps1

# 자동 실행 (권장)
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\auto-run.ps1

# 서버만 / 강제 재기동
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-server.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-server.ps1 -ForceRestart
```

배포 ZIP을 받은 경우에는 폴더 안의 `auto-run.bat`(또는 `run-offline.bat`)을 더블클릭하면 됩니다.  
자세한 내용은 [`docs/OFFLINE.md`](./docs/OFFLINE.md)를 참고하세요.

## 로컬 실행

Web 빌드 결과는 `file://`로 직접 열지 않습니다. `auto-run.bat` / `start-server.bat`을 쓰거나:

```powershell
py -m http.server 7456 --directory .\build\web-desktop
```

브라우저에서 `http://127.0.0.1:7456/?offline=1`을 엽니다.

## 현재 조작

- 키보드: `WASD` 또는 방향키
- 마우스: 왼쪽 버튼을 누른 채 이동할 방향으로 드래그
- 터치: 화면을 누른 채 이동할 방향으로 드래그
- 채집: 나무·바위·광석에 가까이 서서 **길게 누름**(이동하지 않음) — 진행 바 후 획득
- 설치: 빈 바닥을 짧게 탭 — 핫바에서 선택한 아이템(돌) 1개 소비
- 핫바: 숫자 키 `1`~`5` 또는 슬롯 터치/클릭으로 선택
- 전투: 몬스터를 짧게 탭 — 처치 시 경험치·드롭
- 상호작용: 보물 상자·던전 입구·주민(NPC)은 짧게 탭
- 설정(톱니): 좌상단 — 나무/돌 채집 시간, 몹(슬라임·늑대·골렘) 타격치 조정 (브라우저에 저장)
- 저장: `Ctrl+S` 저장, `Ctrl+L` 불러오기(슬롯 목록), `Ctrl+E` 내보내기(파일명 지정), `Ctrl+N` 새로 시작(캐릭터 선택)
- 자동 저장: 20초 간격 + 창 종료 직전 시도
- 상태: 좌상단에 **레벨**·HP·ATK·XP 표시
- 포션: `E` 메뉴, `ESC`로 닫기
- 인벤토리: `I` 창, `ESC`로 닫기
- 불러오기 목록: 세이브 1~30 + 원본세이브파일로드(파일 선택), 휠/방향키 스크롤, `ESC`로 닫기
- 새로 시작: 캐릭터 24종 초상화 선택 후 인게임 스프라이트로 시작

마우스와 터치는 같은 포인터 입력을 사용하며 hover에 의존하지 않습니다.
길게 누름은 채집, 짧은 탭은 전투·설치·상호작용으로 구분됩니다.

## 현재 월드

- 기본 Seed: `851294`
- 청크: 16×16 타일, 타일당 32px
- 플레이어 중심 5×5 청크만 생성·유지 (고해상도 맞춤)
- 지형: 월드 좌표 타일 영역(유기적 곡선) → 청크는 샘플 창 ([`docs/TILE_PRINCIPLES.md`](./docs/TILE_PRINCIPLES.md))
- 콘텐츠: 광석(석탄·철·아크) → 던전 → NPC → 보물 → 몬스터 순서로 생성
- 몬스터 티어(슬라임·늑대·골렘)는 원점에서 먼 청크일수록 상향
- 나무와 바위는 영역으로 군집하며 이동 충돌 대상
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

현재는 **12단계 GitHub 공개·릴리스 준비까지 완료**한 상태입니다.
실제 GitHub Releases 업로드는 원격 저장소 연결 후 [`docs/RELEASE.md`](./docs/RELEASE.md) 절차를 따르면 됩니다.
