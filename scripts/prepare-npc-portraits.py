"""NPC 대화용 고화질 초상화: 검정 배경 제거."""
from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "textures" / "ui" / "portraits"
CHAT_ASSETS = Path(
    r"C:\Users\lee\.cursor\projects\i-Cursor-ExGame\assets"
)
MAX_HEIGHT = 900

SOURCES = (
    (
        "blacksmith",
        "c__Users_lee_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_"
        "ChatGPT_Image_2026__7__25_____04_43_26-149a4e5b-26e9-43e4-8983-bf92641f47bb.png",
    ),
    (
        "merchant",
        "c__Users_lee_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_"
        "ChatGPT_Image_2026__7__25_____04_02_39-a2e7a5b2-6fa1-450b-947b-01330b876059.png",
    ),
    (
        "teleporter",
        "c__Users_lee_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_"
        "ChatGPT_Image_2026__7__25_____04_53_08-59b7b3e2-226c-4d8b-a71d-3df45b0c5b46.png",
    ),
    (
        "banker",
        "c__Users_lee_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_"
        "ChatGPT_Image_2026__7__25_____04_58_13-0eaca23c-bcea-4125-aa84-a10761f09b90.png",
    ),
)


def remove_black_background(rgba: np.ndarray, threshold: float = 26.0) -> np.ndarray:
    out = rgba.copy()
    h, w = out.shape[:2]
    r = out[:, :, 0].astype(np.float32)
    g = out[:, :, 1].astype(np.float32)
    b = out[:, :, 2].astype(np.float32)
    avg = (r + g + b) / 3.0
    bg = (avg < threshold) & (np.maximum(np.maximum(r, g), b) < threshold + 12)
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


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, filename in SOURCES:
        src = CHAT_ASSETS / filename
        if not src.exists():
            raise FileNotFoundError(src)
        sheet = Image.open(src).convert("RGBA")
        rgba = trim_alpha(remove_black_background(np.asarray(sheet)))
        img = Image.fromarray(rgba, "RGBA")
        if img.height > MAX_HEIGHT:
            scale = MAX_HEIGHT / img.height
            img = img.resize(
                (max(1, int(img.width * scale)), MAX_HEIGHT),
                Image.Resampling.LANCZOS,
            )
        dest = OUT_DIR / f"{name}.png"
        img.save(dest)
        arr = np.asarray(img)
        print(
            f"{name}: {img.size} transparent={(arr[:, :, 3] == 0).mean():.1%} -> {dest}"
        )


if __name__ == "__main__":
    main()
