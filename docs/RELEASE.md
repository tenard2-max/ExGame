# GitHub 릴리스 가이드

제3자가 **문서만으로** 다운로드 → 오프라인 플레이까지 완주할 수 있게 공개하는 절차입니다.

## 사전 조건

1. `game/` 디렉터리를 독립 GitHub 저장소로 연결합니다.
2. `main` 브랜치에 최신 커밋이 푸시되어 있어야 합니다.
3. 로컬에서 Web 빌드와 패키징이 성공해야 합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-web.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-release.ps1
```

산출물:

- `release/exgame-0.1.0/`
- `release/exgame-0.1.0.zip`

## Releases에 올릴 내용

권장 태그: `v0.1.0`

릴리스 본문 예시:

```markdown
## ExGame v0.1.0

Seed 기반 무한 월드 MVP입니다. 다운로드 후 인터넷 없이 플레이·저장할 수 있습니다.

### 설치
1. Assets의 `exgame-0.1.0.zip` 다운로드
2. 압축 해제
3. `run-offline.bat` 실행 (Python 필요)
4. 브라우저에서 플레이

### 포함 기능
- 결정적 월드 생성 (3×3 청크 스트리밍)
- 채굴·설치·광맥·인벤토리
- 몬스터·보물·NPC·던전·레벨
- IndexedDB 세이브 / JSON import·export

### 상세 문서
- OFFLINE.md
- SAVE_FORMAT.md
- PERFORMANCE.md
```

첨부 파일:

- `exgame-0.1.0.zip` (필수)
- 필요 시 `CHANGELOG.md` 링크

## NovelExplor 연결

NovelExplor의 **게임하기** 메뉴는 `docs/게임하기_소개.html`을 엽니다.  
실제 GitHub Releases URL이 생기면 소개 페이지의 다운로드 버튼 `href`를 Releases 주소로 교체하세요.

## 공개 전 검증

- [ ] 다른 PC(또는 새 브라우저 프로필)에서 ZIP만으로 실행된다
- [ ] 비행기 모드에서도 로드·플레이·저장된다
- [ ] README / OFFLINE.md / 소개 페이지만으로 설치가 가능하다
- [ ] 버전 번호이 `package.json`, ZIP 이름, 릴리스 태그와 일치한다
