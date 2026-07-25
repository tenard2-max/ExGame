"""Slice tilesheet PNGs into clean 32x32 tiles by category."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

ASSETS = Path(r"C:\Users\lee\.cursor\projects\i-Cursor-ExGame\assets")
SRC_SHEETS = [
    next(ASSETS.glob("*0e4fbb9e-7407-481c-b20f-5f82dd6d4f76.png")),
    next(ASSETS.glob("*c859b3f9-8542-4c45-b57d-072341ae96d4.png")),
]

OUT_ROOT = Path(r"I:\Cursor\ExGame\game\assets\textures\tiles")
TILE_SIZE = 32


def trim_black(tile: Image.Image, threshold: float = 18.0) -> Image.Image:
    array = np.asarray(tile.convert("RGB"))
    brightness = array.mean(axis=2)
    mask = brightness > threshold
    if not mask.any():
        return tile
    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    trimmed = tile.crop((int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1))
    # drop thin residual black strips on edges (< 12% width/height dark)
    arr = np.asarray(trimmed.convert("RGB"))
    bri = arr.mean(axis=2)
    h, w = bri.shape
    left = 0
    right = w - 1
    top = 0
    bottom = h - 1
    while left < right and (bri[:, left] <= threshold).mean() > 0.55:
        left += 1
    while right > left and (bri[:, right] <= threshold).mean() > 0.55:
        right -= 1
    while top < bottom and (bri[top, :] <= threshold).mean() > 0.55:
        top += 1
    while bottom > top and (bri[bottom, :] <= threshold).mean() > 0.55:
        bottom -= 1
    return trimmed.crop((left, top, right + 1, bottom + 1))


def remove_frame(tile: Image.Image, max_frame: int = 4) -> Image.Image:
    """원본 통파일의 검정 칸 테두리를 안쪽으로 조금 더 잘라 냅니다."""
    array = np.asarray(tile.convert("RGB"))
    brightness = array.mean(axis=2)
    h, w = brightness.shape
    left = 0
    right = w - 1
    top = 0
    bottom = h - 1
    for _ in range(max_frame):
        if left < right and (brightness[:, left] < 25).mean() > 0.35:
            left += 1
        if right > left and (brightness[:, right] < 25).mean() > 0.35:
            right -= 1
        if top < bottom and (brightness[top, :] < 25).mean() > 0.35:
            top += 1
        if bottom > top and (brightness[bottom, :] < 25).mean() > 0.35:
            bottom -= 1
    if right - left < 8 or bottom - top < 8:
        return tile
    return tile.crop((left, top, right + 1, bottom + 1))


def almost_empty(tile: Image.Image) -> bool:
    arr = np.asarray(tile.convert("RGB"))
    return float(arr.mean()) < 14.0


def finalize_tile(raw: Image.Image) -> Image.Image | None:
    """검정 테두리·칸 구분선을 최대한 제거한 뒤 32×32로 맞춥니다."""
    cleaned = remove_frame(trim_black(raw, threshold=16), max_frame=8)
    if cleaned.width < 10 or cleaned.height < 10 or almost_empty(cleaned):
        return None

    # 내용이 있는 핵심 정사각 영역만 남깁니다.
    arr = np.asarray(cleaned.convert("RGB"))
    bri = arr.mean(axis=2)
    mask = bri > 22
    if not mask.any():
        return None
    ys, xs = np.where(mask)
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    # 약간 안쪽으로 더 줄여 테두리 잔상 제거
    pad = max(1, min((x1 - x0), (y1 - y0)) // 16)
    x0 = min(x1 - 8, x0 + pad)
    y0 = min(y1 - 8, y0 + pad)
    x1 = max(x0 + 8, x1 - pad)
    y1 = max(y0 + 8, y1 - pad)
    core = cleaned.crop((x0, y0, x1 + 1, y1 + 1))

    # 정사각 패딩(검정 대신 가장자리 색 확장)
    side = max(core.width, core.height)
    square = Image.new("RGB", (side, side))
    # 평균 색으로 채운 뒤 중앙에 붙임
    mean_color = tuple(int(v) for v in np.asarray(core).reshape(-1, 3).mean(axis=0))
    square.paste(mean_color, (0, 0, side, side))
    ox = (side - core.width) // 2
    oy = (side - core.height) // 2
    square.paste(core, (ox, oy))

    tile = square.resize((TILE_SIZE, TILE_SIZE), Image.Resampling.NEAREST)
    # 최종 테두리 보정: 완전 검정이면 안쪽 픽셀로 채움
    data = np.asarray(tile).copy()
    for _ in range(2):
        dark = data.mean(axis=2) < 18
        if not dark.any():
            break
        for y in range(TILE_SIZE):
            for x in range(TILE_SIZE):
                if not dark[y, x]:
                    continue
                # nearest non-dark neighbor
                found = False
                for radius in range(1, 5):
                    for ny in range(max(0, y - radius), min(TILE_SIZE, y + radius + 1)):
                        for nx in range(max(0, x - radius), min(TILE_SIZE, x + radius + 1)):
                            if data[ny, nx].mean() >= 18:
                                data[y, x] = data[ny, nx]
                                found = True
                                break
                        if found:
                            break
                    if found:
                        break
    return Image.fromarray(data)
    arr = np.asarray(tile.convert("RGB"))
    return float(arr.mean()) < 14.0


def equal_split(start: int, end: int, count: int, inset: int = 3) -> list[tuple[int, int]]:
    span = end - start
    cells: list[tuple[int, int]] = []
    for i in range(count):
        a = start + int(i * span / count) + inset
        b = start + int((i + 1) * span / count) - inset - 1
        if b > a:
            cells.append((a, b))
    return cells


def detect_body_top(brightness: np.ndarray) -> int:
    """Skip label header; return y where tile grid roughly starts."""
    row_energy = (brightness > 22).mean(axis=1)
    # Find first strong sustained band after a dip (header -> black -> tiles)
    for y in range(20, min(160, len(row_energy) - 40)):
        if row_energy[y] > 0.2 and row_energy[y:y + 30].mean() > 0.25:
            # ensure this isn't still header text (narrowish)
            return max(0, y - 2)
    return 50


def detect_content_x_range(brightness: np.ndarray, body_top: int) -> tuple[int, int]:
    body = brightness[body_top:, :]
    col_energy = (body > 18).mean(axis=0)
    cols = np.where(col_energy > 0.05)[0]
    if len(cols) == 0:
        return 0, brightness.shape[1] - 1
    return int(cols[0]), int(cols[-1])


def detect_content_y_range(brightness: np.ndarray, body_top: int) -> tuple[int, int]:
    body = brightness[body_top:, :]
    row_energy = (body > 18).mean(axis=1)
    rows = np.where(row_energy > 0.08)[0]
    if len(rows) == 0:
        return body_top, brightness.shape[0] - 1
    return body_top + int(rows[0]), body_top + int(rows[-1])


def slice_sheet(
    path: Path,
    categories: list[str],
    cols_per_category: int,
    rows: int,
    sheet_id: int,
) -> list[dict]:
    image = Image.open(path).convert("RGB")
    brightness = np.asarray(image).mean(axis=2)
    body_top = detect_body_top(brightness)
    x0, x1 = detect_content_x_range(brightness, body_top)
    y0, y1 = detect_content_y_range(brightness, body_top)

    total_cols = len(categories) * cols_per_category
    x_cells = equal_split(x0, x1 + 1, total_cols, inset=8)
    y_cells = equal_split(y0, y1 + 1, rows, inset=7)

    print(
        f"sheet{sheet_id}: body_top={body_top} x={x0}-{x1} y={y0}-{y1} "
        f"cols={len(x_cells)} rows={len(y_cells)}"
    )

    records: list[dict] = []
    for cat_index, category in enumerate(categories):
        out_dir = OUT_ROOT / category
        out_dir.mkdir(parents=True, exist_ok=True)
        col_indices = list(
            range(
                cat_index * cols_per_category,
                (cat_index + 1) * cols_per_category,
            )
        )
        tile_index = 0
        for row_i, (ty0, ty1) in enumerate(y_cells):
            for col_i in col_indices:
                if col_i >= len(x_cells):
                    continue
                tx0, tx1 = x_cells[col_i]
                raw = image.crop((tx0, ty0, tx1 + 1, ty1 + 1))
                tile = finalize_tile(raw)
                if tile is None:
                    continue

                filename = f"{category}_{sheet_id:02d}_{tile_index:03d}.png"
                out_path = out_dir / filename
                tile.save(out_path)
                records.append(
                    {
                        "file": f"assets/textures/tiles/{category}/{filename}",
                        "category": category,
                        "sheet": sheet_id,
                        "index": tile_index,
                        "row": row_i,
                        "col": col_i,
                    }
                )
                tile_index += 1
        print(f"  {category}: {tile_index} tiles")
    return records


def build_preview(records: list[dict], out_path: Path) -> None:
    cats = ["tree", "rock", "water", "dirt", "grass"]
    cols = 16
    preview = Image.new("RGB", (cols * TILE_SIZE, len(cats) * TILE_SIZE), (10, 10, 10))
    by_cat: dict[str, list[dict]] = {}
    for rec in records:
        by_cat.setdefault(rec["category"], []).append(rec)
    for row, cat in enumerate(cats):
        for col, item in enumerate(by_cat.get(cat, [])[:cols]):
            tile = Image.open(Path(r"I:\Cursor\ExGame\game") / item["file"])
            preview.paste(tile, (col * TILE_SIZE, row * TILE_SIZE))
    preview.save(out_path)


def main() -> None:
    if OUT_ROOT.exists():
        shutil.rmtree(OUT_ROOT)
    OUT_ROOT.mkdir(parents=True)
    source_dir = OUT_ROOT / "_source"
    source_dir.mkdir()
    for index, src in enumerate(SRC_SHEETS, start=1):
        shutil.copy2(src, source_dir / f"sheet{index}.png")

    all_records: list[dict] = []
    all_records.extend(
        slice_sheet(
            SRC_SHEETS[0],
            categories=["tree", "rock", "water", "dirt"],
            cols_per_category=3,
            rows=7,
            sheet_id=1,
        )
    )
    all_records.extend(
        slice_sheet(
            SRC_SHEETS[1],
            categories=["water", "rock", "tree", "grass", "dirt"],
            cols_per_category=2,
            rows=7,
            sheet_id=2,
        )
    )

    counts: dict[str, int] = {}
    for rec in all_records:
        counts[rec["category"]] = counts.get(rec["category"], 0) + 1

    manifest = {
        "tileSize": TILE_SIZE,
        "categories": counts,
        "blockHints": {
            "tree": "tree",
            "rock": "rock",
            "water": "water",
            "dirt": "mud",
            "grass": "grass",
        },
        "tiles": all_records,
        "notes": [
            "sheet1: 오토타일형(나무/돌산/호수/흙) 3열×7행",
            "sheet2: 물/돌/나무오브젝트/풀/흙 2열×7행",
            "게임 연동 전 미리보기(preview.png)로 검수",
        ],
    }
    (OUT_ROOT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    build_preview(all_records, OUT_ROOT / "preview.png")
    (OUT_ROOT / "README.md").write_text(
        "\n".join(
            [
                "# ExGame 타일 텍스처",
                "",
                "통파일에서 추출한 **32×32** 타일입니다.",
                "",
                "| 폴더 | 용도(예정) | 개수 |",
                "|------|------------|------|",
                f"| `tree/` | 나무/숲 | {counts.get('tree', 0)} |",
                f"| `rock/` | 돌/바위 | {counts.get('rock', 0)} |",
                f"| `water/` | 물/호수 | {counts.get('water', 0)} |",
                f"| `dirt/` | 흙(mud) | {counts.get('dirt', 0)} |",
                f"| `grass/` | 풀밭 | {counts.get('grass', 0)} |",
                "",
                "- `preview.png` — 종류별 미리보기",
                "- `manifest.json` — 파일 목록·블록 힌트",
                "- `_source/` — 원본 통파일 복사본",
                "",
                "재추출: `py game/scripts/slice-tilesets.py`",
                "",
            ]
        ),
        encoding="utf-8",
    )
    print("total", len(all_records), counts)


if __name__ == "__main__":
    main()
