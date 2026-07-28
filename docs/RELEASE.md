# ExGame 릴리스에 올리는 GitHub Releases 가이드

제3자가 **문서만으로** 다운로드 → PC 또는 폰에서 오프라인 플레이까지 완주할 수 있게 합니다.

## 사전 조건

1. ExGame(`game/`)을 GitHub 저장소에 연결합니다.
2. 로컬에서 웹 빌드·패키징이 성공해야 합니다.

```powershell
cd game
# 권장: Web 빌드 + PC ZIP → GitHub Releases 업로드 (PC bat 패키지만)
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\publish-github-release.ps1

# 업로드만 생략 (로컬 산출물)
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\publish-github-release.ps1 -SkipUpload
```

GitHub Releases에 올리는 파일:

| 파일 | 대상 |
|------|------|
| `exgame-*.zip` | PC 오프라인 (`auto-run.bat`) |
| `exgame-*-android.apk` | Android (고정 업로드 키 서명, 덮어설치 가능) |

로컬 메타:

| 파일 | 대상 |
|------|------|
| `version.json` | 로컬 메타 |

`exgame-*-www.zip` OTA 패키지는 **만들지 않으며** Releases에도 올리지 않습니다.  
폰은 Releases의 서명 APK(`exgame-*-android.apk`)로 설치합니다. → [`MOBILE.md`](./MOBILE.md)

## Releases에 올릴 내용

권장 태그: `v0.1.1` (package.json과 동일)

릴리스 본문 예시:

```markdown
## ExGame v0.1.0

Seed 기반 무한 월드 MVP. 다운로드 후 인터넷 없이 플레이·저장할 수 있습니다.

### PC
1. `exgame-0.1.0.zip` 다운로드 → 압축 해제
2. `auto-run.bat` 실행 (Python 필요)
3. `index.html` 더블클릭은 지원하지 않음
```

첨부:

- `exgame-0.1.0.zip` (필수, bat 포함 PC 패키지만)

## NovelExplor 연결

NovelExplor **게임하기** → `docs/게임하기_소개.html`  
공개 Releases URL이 생기면 소개 페이지 다운로드 버튼을 그 주소로 바꿉니다.

## 공개 전 검증

- [ ] 다른 PC에서 ZIP만으로 실행된다 (`auto-run.bat`)
- [ ] 비행기 모드에서 로드·플레이·저장된다
- [ ] 버전 문자열이 package.json · ZIP · 태그와 일치한다
- [ ] Releases에 www.zip이 올라가지 않는다
- [ ] APK가 고정 업로드 키로 서명되어 덮어설치된다
