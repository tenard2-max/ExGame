# ExGame Android (WebView) 앱

PC용 웹 빌드와 **같은 Cocos 산출물**을 APK에 넣어, 폰에서 오프라인으로 실행합니다.

## 이 PC에서 확인된 경로 (2026-07-25)

| 항목 | 경로 |
|------|------|
| Android Studio | `I:\Program Files\Android\Android Studio` |
| JDK (Studio JBR) | `I:\Program Files\Android\Android Studio\jbr` |
| Android SDK | `C:\Users\lee\AppData\Local\Android\Sdk` |
| 디버그 APK 산출물 | `game/release/exgame-0.1.0-android-debug.apk` |

`local.properties`의 `sdk.dir`은 위 SDK 경로를 가리킵니다. (Git에 올리지 않음)

## 구조

- `mobile/android` — Android Studio 프로젝트
- `app/src/main/assets/www` — `build/web-desktop` 복사본 (게임 본체)
- `MainActivity` — `WebViewAssetLoader`로 로컬 https 호스트에서 로드

## 사전 준비 (개발 PC)

1. [Android Studio](https://developer.android.com/studio) 설치
2. SDK 34, JDK 17 확인
3. 이 폴더를 Android Studio에서 **Open** (`game/mobile/android`)
4. 처음 열면 Gradle Wrapper가 생성·동기화됩니다

## 빌드 절차

```powershell
cd game

# 웹 빌드 + PC ZIP + www 동기화 (+ gradlew 있으면 APK)
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-all.ps1

# 또는 단계별
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-web.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-android-www.ps1
```

Android Studio:

1. `mobile/android` 열기
2. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
3. debug APK 경로 예: `app/build/outputs/apk/debug/app-debug.apk`
4. 릴리스용은 **Generate Signed Bundle / APK**로 서명

산출물을 `release/exgame-<version>-android-debug.apk` 등으로 복사해 GitHub Releases에 PC ZIP과 함께 올립니다.

## 폰 설치

1. Releases에서 APK 다운로드
2. “알 수 없는 앱 설치” 허용 후 설치
3. ExGame 실행 (가로 화면)

PC 세이브와 폰 세이브는 **기기가 달라 IndexedDB가 공유되지 않습니다.**

## 업데이트 흐름

GitHub Releases에는 **PC ZIP(`auto-run.bat`)만** 올립니다.  
`www.zip` OTA / Releases용 APK는 사용하지 않습니다. 폰은 APK에 내장된 `assets/www`로 실행합니다.

```powershell
cd game
# APK만 로컬 빌드 (GitHub 업로드 안 함)
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-all.ps1
# 또는
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-apk.ps1
```

저장소 owner/repo는 `mobile/android/app/src/main/res/values/update_config.xml` 참고 (레거시 OTA 설정).

## 문제 해결

| 증상 | 확인 |
|------|------|
| 흰 화면 | `assets/www/index.html` 존재 여부, sync 스크립트 재실행 |
| 모듈/WASM 오류 | `WebViewAssetLoader` URL 사용 여부 (file:// 금지) |
| 세로로만 나옴 | 기기 회전 잠금 해제, manifest `sensorLandscape` |
| Gradle 실패 | Android Studio로 프로젝트 열어 Sync |
