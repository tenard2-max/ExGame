"""NPC 원본 → 투명 배경 + 노란 실루엣 외곽선 (지형 타일이 비치도록)."""
from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "textures" / "npcs"
TILE = 32
OUTLINE_THICKNESS = 2
OUTLINE_COLOR = (255, 220, 48, 255)

NPCS = (
    {
        "id": "blacksmith",
        "source": "blacksmith-source.png",
        "out": "blacksmith.png",
        "footprint": (3, 6),
        "bg": "light",
    },
    {
        "id": "teleporter",
        "source": "teleporter-source.png",
        "out": "teleporter.png",
        "footprint": (3, 5),
        "bg": "dark",
    },
    {
        "id": "merchant",
        "source": "merchant-source.png",
        "out": "merchant.png",
        "footprint": (4, 5),
        "bg": "dark",
    },
    {
        "id": "banker",
        "source": "banker-source.png",
        "out": "banker.png",
        "footprint": (4, 5),
        "bg": "dark",
    },
)


def remove_edge_background(rgba: np.ndarray, mode: str) -> np.ndarray:
    """가장자리와 연결된 스튜디오 배경만 제거합니다."""
    out = rgba.copy()
    if out.shape[2] == 3:
        out = np.dstack([out, np.full(out.shape[:2], 255, dtype=np.uint8)])
    h, w = out.shape[:2]
    r = out[:, :, 0].astype(np.float32)
    g = out[:, :, 1].astype(np.float32)
    b = out[:, :, 2].astype(np.float32)

    avg = (r + g + b) / 3.0
    chroma = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    if mode == "light":
        bg = (avg >= 200) & ((chroma < 45) | ((avg > 230) & (chroma < 70)))
    else:
        bg = (avg < 28.0) & (np.maximum(np.maximum(r, g), b) < 40.0)

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


def fit_to_footprint(image: Image.Image, tw: int, th: int) -> Image.Image:
    """비율 유지 축소 후 footprint 캔버스에 하단 중앙 배치."""
    img = image.convert("RGBA")
    img.thumbnail((tw, th), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    x = (tw - img.width) // 2
    y = th - img.height
    canvas.paste(img, (x, y), img)
    return canvas


def add_silhouette_outline(
    image: Image.Image,
    thickness: int = OUTLINE_THICKNESS,
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
    # footprint 크기로 다시 맞춤 (패드로 살짝 커진 분)
    return fit_to_footprint(out, src.width, src.height)


def process_one(spec: dict) -> None:
    src_path = OUT_DIR / spec["source"]
    if not src_path.exists():
        raise FileNotFoundError(src_path)
    fw, fh = spec["footprint"]
    tw, th = fw * TILE, fh * TILE

    sheet = Image.open(src_path).convert("RGBA")
    rgba = remove_edge_background(np.asarray(sheet), spec["bg"])
    rgba = trim_alpha(rgba, pad=4)
    rgba = keep_largest_opaque_component(rgba)
    rgba = trim_alpha(rgba, pad=2)
    img = Image.fromarray(rgba, "RGBA")
    img = fit_to_footprint(img, tw, th)
    img = add_silhouette_outline(img)

    out_path = OUT_DIR / spec["out"]
    img.save(out_path)
    arr = np.asarray(img)
    opaque = int((arr[:, :, 3] > 8).sum())
    transparent = int((arr[:, :, 3] == 0).sum())
    total = arr.shape[0] * arr.shape[1]
    print(
        f"{spec['id']}: {img.size} opaque={opaque/total:.1%} "
        f"transparent={transparent/total:.1%} -> {out_path.name}"
    )


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for spec in NPCS:
        process_one(spec)


if __name__ == "__main__":
    main()
