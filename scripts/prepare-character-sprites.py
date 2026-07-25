"""캐릭터 원본 → 초상화(선택용) + 플레이 스프라이트(인게임)."""
from __future__ import annotations

import json
import shutil
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "assets" / "textures" / "characters" / "_source"
PORTRAIT_DIR = ROOT / "assets" / "textures" / "characters" / "portraits"
PLAY_DIR = ROOT / "assets" / "textures" / "characters" / "play"

PORTRAIT_MAX_HEIGHT = 1024  # 원본 해상도 유지(깨짐 방지). 축소하지 않음.
PLAY_MAX_HEIGHT = 160
OUTLINE_THICKNESS = 2
OUTLINE_COLOR = (245, 245, 250, 255)

CHARACTERS = [
    {"id": "rainbow_sword", "name": "무지개 검사"},
    {"id": "pink_rogue", "name": "핑크 도적"},
    {"id": "jade_mage", "name": "비취 마법사"},
    {"id": "turquoise_priest", "name": "청록 사제"},
    {"id": "silver_noble", "name": "은빛 귀족"},
    {"id": "jade_staff", "name": "비취 지팡이"},
    {"id": "blossom_mage", "name": "벚꽃 무녀"},
    {"id": "gold_warrior", "name": "황금 전사"},
    {"id": "forest_axe", "name": "숲의 도끼전사"},
    {"id": "crimson_knight", "name": "홍안 기사"},
    {"id": "scarlet_elf", "name": "진홍 엘프"},
    {"id": "aurora_mage", "name": "오로라 마법사"},
    {"id": "crimson_whip", "name": "진홍 채찍"},
    {"id": "scarlet_gunner", "name": "진홍 건슬링어"},
    {"id": "pink_halberd", "name": "분홍 극창"},
    {"id": "ruby_glaive", "name": "루비 창기사"},
    {"id": "peach_archer", "name": "복숭아 궁수"},
    {"id": "rose_archer", "name": "장미 궁수"},
    {"id": "golden_sniper", "name": "황금 저격수"},
    {"id": "lotus_archer", "name": "연꽃 궁수"},
    {"id": "holy_grimoire", "name": "성서의 사제"},
    {"id": "crimson_bow", "name": "진홍 은궁"},
    {"id": "orange_grimoire", "name": "주황 마도서"},
    {"id": "lavender_fencer", "name": "라벤더 펜서"},
]


def is_near_black(r: float, g: float, b: float, threshold: float = 22.0) -> bool:
    return (r + g + b) / 3.0 < threshold and max(r, g, b) < threshold + 8


def remove_black_background(rgba: np.ndarray, threshold: float = 22.0) -> np.ndarray:
    out = rgba.copy()
    if out.shape[2] == 3:
        alpha = np.full(out.shape[:2], 255, dtype=np.uint8)
        out = np.dstack([out, alpha])
    h, w = out.shape[:2]
    r = out[:, :, 0].astype(np.float32)
    g = out[:, :, 1].astype(np.float32)
    b = out[:, :, 2].astype(np.float32)
    mean = (r + g + b) / 3.0
    mx = np.maximum(np.maximum(r, g), b)
    bg = (mean < threshold) & (mx < threshold + 8)

    visited = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    edge_y = np.concatenate([np.zeros(w, dtype=np.int32), np.full(w, h - 1, dtype=np.int32)])
    edge_x = np.concatenate([np.arange(w, dtype=np.int32), np.arange(w, dtype=np.int32)])
    for y, x in zip(edge_y.tolist(), edge_x.tolist()):
        if bg[y, x] and not visited[y, x]:
            visited[y, x] = True
            q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if bg[y, x] and not visited[y, x]:
                visited[y, x] = True
                q.append((y, x))

    while q:
        y, x = q.popleft()
        out[y, x, 3] = 0
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if ny < 0 or ny >= h or nx < 0 or nx >= w:
                continue
            if visited[ny, nx] or not bg[ny, nx]:
                continue
            visited[ny, nx] = True
            q.append((ny, nx))
    return out


def trim_alpha(rgba: np.ndarray, pad: int = 2) -> np.ndarray:
    alpha = rgba[:, :, 3] > 8
    if not alpha.any():
        return rgba
    ys, xs = np.where(alpha)
    y0 = max(0, int(ys.min()) - pad)
    y1 = min(rgba.shape[0], int(ys.max()) + pad + 1)
    x0 = max(0, int(xs.min()) - pad)
    x1 = min(rgba.shape[1], int(xs.max()) + pad + 1)
    return rgba[y0:y1, x0:x1]


def keep_largest_opaque_component(rgba: np.ndarray) -> np.ndarray:
    out = rgba.copy()
    h, w = out.shape[:2]
    opaque = out[:, :, 3] > 8
    visited = np.zeros((h, w), dtype=bool)
    best_cells: list[tuple[int, int]] = []
    for y in range(h):
        for x in range(w):
            if not opaque[y, x] or visited[y, x]:
                continue
            q: deque[tuple[int, int]] = deque([(y, x)])
            visited[y, x] = True
            cells: list[tuple[int, int]] = []
            while q:
                cy, cx = q.popleft()
                cells.append((cy, cx))
                for ny, nx in (
                    (cy - 1, cx),
                    (cy + 1, cx),
                    (cy, cx - 1),
                    (cy, cx + 1),
                ):
                    if ny < 0 or ny >= h or nx < 0 or nx >= w:
                        continue
                    if visited[ny, nx] or not opaque[ny, nx]:
                        continue
                    visited[ny, nx] = True
                    q.append((ny, nx))
            if len(cells) > len(best_cells):
                best_cells = cells
    keep = np.zeros((h, w), dtype=bool)
    for y, x in best_cells:
        keep[y, x] = True
    out[~keep, 3] = 0
    return out


def fit_max_height(image: Image.Image, max_height: int) -> Image.Image:
    w, h = image.size
    if h <= max_height:
        return image
    scale = max_height / h
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    # 고해상도 일러스트는 LANCZOS 축소가 선명합니다.
    return image.resize((nw, nh), Image.Resampling.LANCZOS)


def save_png(image: Image.Image, path: Path) -> None:
    """압축만 하고 화질은 유지합니다."""
    image.save(path, format="PNG", optimize=True, compress_level=6)


def add_silhouette_outline(
    image: Image.Image,
    thickness: int = 2,
    color: tuple[int, int, int, int] = OUTLINE_COLOR,
) -> Image.Image:
    src = image.convert("RGBA")
    pad = thickness + 1
    canvas = Image.new(
        "RGBA",
        (src.width + pad * 2, src.height + pad * 2),
        (0, 0, 0, 0),
    )
    canvas.paste(src, (pad, pad), src)
    arr = np.asarray(canvas).copy()
    alpha = arr[:, :, 3] > 8
    h, w = alpha.shape
    outline = np.zeros((h, w), dtype=bool)
    for dy in range(-thickness, thickness + 1):
        for dx in range(-thickness, thickness + 1):
            if dx == 0 and dy == 0:
                continue
            if dx * dx + dy * dy > thickness * thickness + 1:
                continue
            shifted = np.zeros_like(alpha)
            y0 = max(0, dy)
            y1 = min(h, h + dy)
            x0 = max(0, dx)
            x1 = min(w, w + dx)
            sy0 = max(0, -dy)
            sy1 = sy0 + (y1 - y0)
            sx0 = max(0, -dx)
            sx1 = sx0 + (x1 - x0)
            shifted[y0:y1, x0:x1] = alpha[sy0:sy1, sx0:sx1]
            outline |= shifted
    outline &= ~alpha
    arr[outline, 0] = color[0]
    arr[outline, 1] = color[1]
    arr[outline, 2] = color[2]
    arr[outline, 3] = color[3]
    out = Image.fromarray(arr, "RGBA")
    out.paste(src, (pad, pad), src)
    return out


def process_one(character_id: str) -> dict:
    src = SRC_DIR / f"{character_id}.png"
    if not src.exists():
        raise FileNotFoundError(src)

    sheet = Image.open(src).convert("RGBA")

    # 선택 초상화: 원본을 그대로 둡니다.
    # (검정 키잉이 어두운 머리/갑옷까지 지워 '깨진' 이미지가 됩니다.)
    portrait = fit_max_height(sheet, PORTRAIT_MAX_HEIGHT)
    portrait_path = PORTRAIT_DIR / f"{character_id}.png"
    save_png(portrait, portrait_path)

    # 인게임 스프라이트만 배경 제거·외곽선 적용 (더 보수적인 임계값).
    rgba = remove_black_background(np.asarray(sheet), threshold=14.0)
    rgba = trim_alpha(rgba, pad=4)
    cleaned = Image.fromarray(rgba, "RGBA")
    play = fit_max_height(cleaned, PLAY_MAX_HEIGHT)
    play = add_silhouette_outline(play, OUTLINE_THICKNESS, OUTLINE_COLOR)
    play_path = PLAY_DIR / f"{character_id}.png"
    save_png(play, play_path)

    return {
        "id": character_id,
        "portrait": {"width": portrait.width, "height": portrait.height},
        "play": {"width": play.width, "height": play.height},
    }


def main() -> None:
    import sys

    force = "--force" in sys.argv
    if not SRC_DIR.exists():
        raise SystemExit(f"source dir missing: {SRC_DIR}")

    PORTRAIT_DIR.mkdir(parents=True, exist_ok=True)
    PLAY_DIR.mkdir(parents=True, exist_ok=True)

    catalog = []
    for entry in CHARACTERS:
        portrait_path = PORTRAIT_DIR / f"{entry['id']}.png"
        play_path = PLAY_DIR / f"{entry['id']}.png"
        if (
            not force
            and portrait_path.exists()
            and play_path.exists()
        ):
            portrait = Image.open(portrait_path)
            play = Image.open(play_path)
            meta = {
                "id": entry["id"],
                "portrait": {"width": portrait.width, "height": portrait.height},
                "play": {"width": play.width, "height": play.height},
            }
            catalog.append({**entry, **meta})
            print(f"{entry['id']}: skip (exists)")
            continue

        meta = process_one(entry["id"])
        catalog.append({**entry, **meta})
        print(f"{entry['id']}: portrait={meta['portrait']} play={meta['play']}")

    catalog_path = ROOT / "assets" / "textures" / "characters" / "catalog.json"
    catalog_path.write_text(
        json.dumps({"characters": catalog}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"catalog -> {catalog_path}")


if __name__ == "__main__":
    main()
