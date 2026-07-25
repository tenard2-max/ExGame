"""플레이어 캐릭터 이미지: 검정 배경 제거 + 흰 실루엣 외곽선."""
from __future__ import annotations

import shutil
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(
    r"C:\Users\lee\.cursor\projects\i-Cursor-ExGame\assets"
    r"\c__Users_lee_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images"
    r"_ChatGPT_Image_2026__7__25_____12_39_19-00fdcf63-3eb3-47a6-88ba-3c3145a59ebc.png"
)
OUT_DIR = Path(r"I:\Cursor\ExGame\game\assets\textures\player")
# 타일 32px 기준 약 가로 2.5 · 세로 4칸
MAX_HEIGHT = 128
OUTLINE_THICKNESS = 2
OUTLINE_COLOR = (245, 245, 250, 255)


def is_near_black(r: float, g: float, b: float, threshold: float = 22.0) -> bool:
    return (r + g + b) / 3.0 < threshold and max(r, g, b) < threshold + 8


def remove_black_background(rgba: np.ndarray, threshold: float = 22.0) -> np.ndarray:
    """가장자리와 연결된 검정 배경만 flood-fill로 제거합니다."""
    out = rgba.copy()
    if out.shape[2] == 3:
        alpha = np.full(out.shape[:2], 255, dtype=np.uint8)
        out = np.dstack([out, alpha])
    h, w = out.shape[:2]
    r = out[:, :, 0].astype(np.float32)
    g = out[:, :, 1].astype(np.float32)
    b = out[:, :, 2].astype(np.float32)

    bg = np.zeros((h, w), dtype=bool)
    for y in range(h):
        for x in range(w):
            if is_near_black(r[y, x], g[y, x], b[y, x], threshold):
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
    """고아 세로줄·잡티를 버리고 본체(최대 연결 성분)만 남깁니다."""
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
    return image.resize((nw, nh), Image.Resampling.LANCZOS)


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


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"source not found: {SRC}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    source_dir = OUT_DIR / "_source"
    source_dir.mkdir(exist_ok=True)
    shutil.copy2(SRC, source_dir / "player_source.png")

    sheet = Image.open(SRC).convert("RGBA")
    rgba = remove_black_background(np.asarray(sheet))
    rgba = trim_alpha(rgba)
    rgba = keep_largest_opaque_component(rgba)
    rgba = trim_alpha(rgba)
    img = Image.fromarray(rgba, "RGBA")
    img = fit_max_height(img, MAX_HEIGHT)
    img = add_silhouette_outline(img, OUTLINE_THICKNESS, OUTLINE_COLOR)

    out_path = OUT_DIR / "player.png"
    img.save(out_path)
    meta = {
        "width": img.width,
        "height": img.height,
        "outline": "white",
        "maxHeight": MAX_HEIGHT,
    }
    (OUT_DIR / "player.json").write_text(
        __import__("json").dumps(meta, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"player: {img.size} -> {out_path}")


if __name__ == "__main__":
    main()
