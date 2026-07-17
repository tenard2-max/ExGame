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

## 로컬 실행

Web 빌드 결과는 `file://`로 직접 열지 않습니다. 빌드 폴더에서 정적 서버를 실행합니다.

```powershell
py -m http.server 7456 --directory .\build\web-desktop
```

브라우저에서 `http://127.0.0.1:7456`을 엽니다.

## 소스 구조

```text
assets/
├─ scenes/       # Cocos 씬
└─ scripts/
   ├─ core/      # 부팅, 공통 수명주기
   ├─ world/     # Seed·Biome·Terrain·Chunk (3단계 이후)
   ├─ content/   # Ore·Dungeon·NPC·Treasure·Monster
   ├─ player/    # 플레이어 및 입력
   ├─ mining/    # 채굴·설치
   ├─ inventory/ # 아이템·장비
   ├─ save/      # IndexedDB 및 변경분 저장
   └─ ui/        # HUD·메뉴
```

현재는 **2단계 기반 구축만 완료**한 상태입니다. 월드 생성 및 게임 로직은 의도적으로 포함하지 않았습니다.
