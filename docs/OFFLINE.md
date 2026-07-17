# 오프라인 실행 가이드

ExGame Web 빌드는 **인터넷 없이** 로컬에서 실행·플레이·저장할 수 있습니다.

## 왜 로컬 서버가 필요한가

브라우저 보안 정책 때문에 `index.html`을 파일로 더블클릭(`file://`)하면 모듈 로딩이 실패할 수 있습니다.  
그래서 같은 PC 안에서만 동작하는 `127.0.0.1` HTTP 서버를 띄웁니다. 외부 네트워크는 사용하지 않습니다.

## 배포 패키지 만들기 (개발자)

```powershell
# 1) Web 빌드
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-web.ps1

# 2) release/exgame-<version> 폴더와 ZIP 생성
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-release.ps1
```

결과물:

- `release/exgame-0.1.0/` — 실행 가능한 폴더
- `release/exgame-0.1.0.zip` — 배포용 압축 파일

## 플레이어 실행 방법

1. ZIP을 풀어 `exgame-0.1.0` 폴더를 연다.
2. `run-offline.bat`을 더블클릭한다. (Python 필요: `py` 또는 `python`)
3. 브라우저가 `http://127.0.0.1:7456`으로 열린다.
4. 종료하려면 서버 창에서 `Ctrl+C`.

개발 트리에서는 다음도 동일합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-offline.ps1
```

## 오프라인 검증 체크리스트

- [ ] PC의 Wi-Fi/이더넷을 끈 상태(또는 비행기 모드)에서 실행된다
- [ ] 게임이 로드되고 이동·채굴·전투가 된다
- [ ] `S`로 저장한 뒤 브라우저를 닫고 다시 실행해도 상태가 복원된다
- [ ] 개발자 도구 Network에 외부 CDN 요청이 없다 (로컬 `127.0.0.1`만 사용)

## 저장 위치

세이브는 브라우저 IndexedDB(`exgame-saves`)에 남습니다.  
원본 맵은 저장되지 않으며 Seed + 변경분 + 플레이어 상태만 보관됩니다.
