# ExGame 타일 텍스처

통파일에서 추출한 **32×32** 타일입니다.

| 폴더 | 용도(예정) | 개수 |
|------|------------|------|
| `tree/` | 나무/숲 | 35 |
| `rock/` | 돌/바위 | 35 |
| `water/` | 물/호수 | 35 |
| `dirt/` | 흙(mud) | 35 |
| `grass/` | 풀밭 | 14 |

- `preview.png` — 종류별 미리보기
- `manifest.json` — 파일 목록·블록 힌트
- `atlas.png` / `atlas.json` — 런타임 스프라이트 아틀라스
- `_source/` — 원본 통파일 복사본

재추출: `py game/scripts/slice-tilesets.py`  
아틀라스: `py game/scripts/build-tile-atlas.py`
