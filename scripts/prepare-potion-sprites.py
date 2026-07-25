"""포션 원본 → 초급(흐림) / 중급(보통) / 고급(진한) 아틀라스 생성."""
from __future__ import annotations

import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(r"I:\Cursor\ExGame\game\assets\textures\potions\_source\potion-source.png")
OUT_DIR = Path(r"I:\Cursor\ExGame\game\assets\textures\potions")
ICON_SIZE = 48
PAD = 2


def is_background(r: float, g: float, b: float) -> bool:
    """연한 회색·흰색 체커 배경."""
    mx = max(r, g, b)
    mn = min(r, g, b)
    if mx < 200:
        return False
    return (mx - mn) < 18 and mx > 210


def remove_background(rgba: np.ndarray) -> np.ndarray:
    out = rgba.copy()
    h, w = out.shape[:2]
    bg = np.zeros((h, w), dtype=bool)
    for y in range(h):
        for x in range(w):
            r, g, b = out[y, x, :3].astype(np.float32)
            if is_background(r, g, b):
                bg[y, x] = True

    visited = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
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


def trim_alpha(rgba: np.ndarray, pad: int = 4) -> np.ndarray:
    alpha = rgba[:, :, 3] > 8
    if not alpha.any():
        return rgba
    ys, xs = np.where(alpha)
    y0 = max(0, int(ys.min()) - pad)
    y1 = min(rgba.shape[0], int(ys.max()) + pad + 1)
    x0 = max(0, int(xs.min()) - pad)
    x1 = min(rgba.shape[1], int(xs.max()) + pad + 1)
    return rgba[y0:y1, x0:x1]


def resize_square(rgba: np.ndarray, size: int) -> np.ndarray:
    im = Image.fromarray(rgba, "RGBA")
    im.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = (size - im.width) // 2
    oy = (size - im.height) // 2
    canvas.paste(im, (ox, oy), im)
    return np.array(canvas)


def is_reddish(r: float, g: float, b: float) -> bool:
    return r > 80 and r > g * 1.15 and r > b * 1.15


def variant_basic(rgba: np.ndarray) -> np.ndarray:
    """초급: 채도·대비를 낮춰 흐리게."""
    out = rgba.astype(np.float32)
    a = out[:, :, 3:4] / 255.0
    rgb = out[:, :, :3]
    gray = rgb.mean(axis=2, keepdims=True)
    faded = rgb * 0.45 + gray * 0.35 + 180.0 * 0.20
    # 빨간 액체만 더 옅게
    for y in range(out.shape[0]):
        for x in range(out.shape[1]):
            if out[y, x, 3] < 8:
                continue
            r, g, b = rgb[y, x]
            if is_reddish(r, g, b):
                faded[y, x] = rgb[y, x] * 0.35 + np.array([220, 170, 170]) * 0.65
    out[:, :, :3] = np.clip(faded, 0, 255)
    out[:, :, 3:4] = np.clip(a * 200.0, 0, 255)
    return out.astype(np.uint8)


def variant_mid(rgba: np.ndarray) -> np.ndarray:
    """중급: 원본 그대로."""
    return rgba.copy()


def variant_high(rgba: np.ndarray) -> np.ndarray:
    """고급: 빨간 액체를 진하고 선명하게."""
    out = rgba.astype(np.float32)
    for y in range(out.shape[0]):
        for x in range(out.shape[1]):
            if out[y, x, 3] < 8:
                continue
            r, g, b = out[y, x, :3]
            if is_reddish(r, g, b):
                # 진한 선홍·암적 (채도↑, 명도↓)
                nr = min(255.0, r * 0.85 + 40)
                ng = max(0.0, g * 0.25)
                nb = max(0.0, b * 0.18)
                out[y, x, 0] = nr
                out[y, x, 1] = ng
                out[y, x, 2] = nb
            else:
                out[y, x, :3] = np.clip(out[y, x, :3] * 1.08, 0, 255)
    return out.astype(np.uint8)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    raw = np.array(Image.open(SRC).convert("RGBA"))
    cut = trim_alpha(remove_background(raw))
    base = resize_square(cut, ICON_SIZE)

    variants = [
        ("potion-basic", variant_basic(base)),
        ("potion-mid", variant_mid(base)),
        ("potion-high", variant_high(base)),
    ]

    atlas_w = ICON_SIZE * len(variants) + PAD * (len(variants) + 1)
    atlas_h = ICON_SIZE + PAD * 2
    atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
    frames = []
    x = PAD
    for type_id, arr in variants:
        tile = Image.fromarray(arr, "RGBA")
        atlas.paste(tile, (x, PAD), tile)
        single_path = OUT_DIR / f"{type_id}.png"
        tile.save(single_path)
        frames.append({
            "name": type_id,
            "typeId": type_id,
            "x": x,
            "y": PAD,
            "w": ICON_SIZE,
            "h": ICON_SIZE,
        })
        print(f"{type_id}: {single_path}")
        x += ICON_SIZE + PAD

    atlas_path = OUT_DIR / "atlas.png"
    atlas.save(atlas_path)
    meta = {
        "width": atlas_w,
        "height": atlas_h,
        "tileSize": ICON_SIZE,
        "frames": frames,
    }
    (OUT_DIR / "atlas.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"atlas {atlas.size} -> {atlas_path}")


if __name__ == "__main__":
    main()
