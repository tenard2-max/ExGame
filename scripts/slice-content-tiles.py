"""석탄 / 아크 / 철광석 / 보물상자 시트를 분리해 content 타일 아틀라스를 만듭니다."""
from __future__ import annotations

import json
import shutil
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(
    r"C:\Users\lee\.cursor\projects\i-Cursor-ExGame\assets"
    r"\c__Users_lee_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images"
    r"_ChatGPT_Image_2026__7__25_____01_07_51-a00a995a-5d8e-4147-a60b-ef82fa9ca689.png"
)
OUT_ROOT = Path(r"I:\Cursor\ExGame\game\assets\textures\content")
MAX_SIDE = 36

CELLS: list[tuple[str, str]] = [
    ("coal", "ore-coal"),
    ("ark", "ore-ark"),
    ("iron", "ore-iron"),
    ("treasure", "treasure-chest"),
]


def is_background_pixel(r: float, g: float, b: float, a: float) -> bool:
    """시트 배경(밝은 회색·흰색·거의 투명) 판정."""
    if a < 12:
        return True
    # 체커/흰 배경
    if r > 230 and g > 230 and b > 230:
        return True
    if abs(r - g) < 12 and abs(g - b) < 12 and r > 200:
        return True
    return False


def remove_background(rgba: np.ndarray) -> np.ndarray:
    """가장자리와 연결된 배경만 제거해 지형 타일이 비치도록 합니다."""
    out = rgba.copy()
    if out.shape[2] == 3:
        alpha = np.full(out.shape[:2], 255, dtype=np.uint8)
        out = np.dstack([out, alpha])
    h, w = out.shape[:2]
    r = out[:, :, 0].astype(np.float32)
    g = out[:, :, 1].astype(np.float32)
    b = out[:, :, 2].astype(np.float32)
    a = out[:, :, 3].astype(np.float32)

    bg = np.zeros((h, w), dtype=bool)
    for y in range(h):
        for x in range(w):
            if is_background_pixel(r[y, x], g[y, x], b[y, x], a[y, x]):
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


def trim_alpha(rgba: np.ndarray, pad: int = 1) -> np.ndarray:
    alpha = rgba[:, :, 3] > 8
    if not alpha.any():
        return rgba
    ys, xs = np.where(alpha)
    y0 = max(0, int(ys.min()) - pad)
    y1 = min(rgba.shape[0], int(ys.max()) + pad + 1)
    x0 = max(0, int(xs.min()) - pad)
    x1 = min(rgba.shape[1], int(xs.max()) + pad + 1)
    return rgba[y0:y1, x0:x1]


def fit_max(image: Image.Image, max_side: int) -> Image.Image:
    w, h = image.size
    scale = min(max_side / max(w, h), 1.0)
    if scale >= 0.999:
        return image
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    return image.resize((nw, nh), Image.Resampling.NEAREST)


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"source not found: {SRC}")

    if OUT_ROOT.exists():
        shutil.rmtree(OUT_ROOT)
    OUT_ROOT.mkdir(parents=True)
    source_dir = OUT_ROOT / "_source"
    source_dir.mkdir()
    shutil.copy2(SRC, source_dir / "content_sheet.png")

    sheet = Image.open(SRC).convert("RGBA")
    w, h = sheet.size
    mid_x, mid_y = w // 2, h // 2
    quads = [
        (0, 0, mid_x, mid_y),
        (mid_x, 0, w, mid_y),
        (0, mid_y, mid_x, h),
        (mid_x, mid_y, w, h),
    ]

    atlas_images: list[tuple[str, str, Image.Image]] = []
    for (name, type_id), box in zip(CELLS, quads):
        crop = sheet.crop(box)
        rgba = remove_background(np.asarray(crop))
        rgba = trim_alpha(rgba)
        img = fit_max(Image.fromarray(rgba, "RGBA"), MAX_SIDE)
        out_path = OUT_ROOT / f"{name}.png"
        img.save(out_path)
        atlas_images.append((name, type_id, img))
        opaque = (np.asarray(img)[:, :, 3] > 8).mean()
        print(f"{name} ({type_id}): {img.size} opaque={opaque:.1%} -> {out_path}")

    gap = 2
    atlas_w = sum(im.width for _, _, im in atlas_images) + gap * (len(atlas_images) - 1)
    atlas_h = max(im.height for _, _, im in atlas_images)
    atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
    frames = []
    x = 0
    for name, type_id, im in atlas_images:
        y = atlas_h - im.height
        atlas.paste(im, (x, y), im)
        frames.append(
            {
                "name": name,
                "typeId": type_id,
                "x": x,
                "y": y,
                "w": im.width,
                "h": im.height,
            }
        )
        x += im.width + gap

    atlas.save(OUT_ROOT / "atlas.png")
    meta = {"width": atlas_w, "height": atlas_h, "frames": frames}
    (OUT_ROOT / "atlas.json").write_text(
        json.dumps(meta, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"atlas ({atlas_w}, {atlas_h})")


if __name__ == "__main__":
    main()
