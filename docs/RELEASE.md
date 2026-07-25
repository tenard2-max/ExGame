# ExGame 릴리스에 올리는 GitHub Releases 가이드

제3자가 **문서만으로** 다운로드 → PC 또는 폰에서 오프라인 플레이까지 완주할 수 있게 합니다.

## 사전 조건

1. ExGame(`game/`)을 GitHub 저장소에 연결합니다.
2. 로컬에서 웹 빌드·패키징이 성공해야 합니다.

```powershell
cd game
# 권장: 빌드 + version.json/www zip + GitHub Releases 업로드
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\publish-github-release.ps1

# 업로드만 생략 (로컬 산출물)
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\publish-github-release.ps1 -SkipUpload
```

산출물 (`release/`):

| 파일 | 대상 |
|------|------|
| `version.json` | 폰 자동 업데이트 체크 |
| `exgame-*-www.zip` | 폰 OTA |
| `exgame-*.zip` | PC 오프라인 |
| `exgame-*-android-debug.apk` | 안드로이드 최초 설치 |

APK가 안 나왔다면 Android Studio로 `mobile/android`를 연 뒤 APK를 빌드하세요. → [`MOBILE.md`](./MOBILE.md)

## Releases에 올릴 내용

권장 태그: `v0.1.1` (package.json과 동일)

릴리스 본문 예시:

```markdown
## ExGame v0.1.0

Seed 기반 무한 월드 MVP. 다운로드 후 인터넷 없이 플레이·저장할 수 있습니다.

### PC
1. `exgame-0.1.0.zip` 다운로드 → 압축 해제
2. `auto-run.bat` 실행 (Python 필요)
3. 브라우저에서 플레이

### Android
1. `exgame-*-android-*.apk` 다운로드
2. 설치 허용 후 ExGame 실행 (가로 화면)
3. PC와 세이브는 공유되지 않습니다

### 문서
- OFFLINE.md (PC)
- MOBILE.md (Android)
```

첨부:

- `exgame-0.1.0.zip` (필수)
- `exgame-0.1.0-android-*.apk` (권장)
- 필요 시 CHANGELOG

## NovelExplor 연결

NovelExplor **게임하기** → `docs/게임하기_소개.html`  
공개 Releases URL이 생기면 소개 페이지 다운로드 버튼을 그 주소로 바꿉니다.

## 공개 전 검증

- [ ] 다른 PC에서 ZIP만으로 실행된다
- [ ] 비행기 모드에서 로드·플레이·저장된다
- [ ] 폰에 APK 설치 후 가로 화면으로 플레이된다
- [ ] 버전 문자열이 package.json · ZIP · APK · 태그와 일치한다
