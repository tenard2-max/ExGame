"""Slice orc sheet into orc / orc-warrior / hero-orc and rebuild monster atlas."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(
    r"C:\Users\lee\.cursor\projects\i-Cursor-ExGame\assets"
    r"\c__Users_lee_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images"
    r"_ChatGPT_Image_2026__7__25_____03_42_13-484d2ba3-1e1f-472f-9635-53a01f1ec309.png"
)
OUT_ROOT = Path(r"I:\Cursor\ExGame\game\assets\textures\monsters")
ORC_NAMES = ["orc", "orc-warrior", "hero-orc"]
TYPE_IDS = {
    "slime": "monster-slime",
    "wolf": "monster-wolf",
    "golem": "monster-golem",
    "orc": "monster-orc",
    "orc-warrior": "monster-orc-warrior",
    "hero-orc": "monster-hero-orc",
}
MAX_SIZES = {
    "orc": 80,
    "orc-warrior": 96,
    "hero-orc": 112,
}
# Existing monsters keep their files; atlas order for packing.
ATLAS_ORDER = ["slime", "wolf", "golem", "orc", "orc-warrior", "hero-orc"]


def find_body_segments(mask: np.ndarray, min_width: int = 60) -> list[tuple[int, int]]:
    col = mask.mean(axis=0) > 0.01
    segs: list[tuple[int, int]] = []
    start: int | None = None
    for i, on in enumerate(col):
        if on and start is None:
            start = i
        if not on and start is not None:
            if i - start >= min_width:
                segs.append((start, i - 1))
            start = None
    if start is not None and len(col) - start >= min_width:
        segs.append((start, len(col) - 1))
    return segs


def remove_black(rgba: np.ndarray, threshold: float = 18.0) -> np.ndarray:
    out = rgba.copy()
    bri = out[:, :, :3].mean(axis=2)
    out[bri < threshold, 3] = 0
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


def fit_max(image: Image.Image, max_side: int) -> Image.Image:
    w, h = image.size
    scale = min(max_side / max(w, h), 1.0)
    if scale >= 0.999:
        return image
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    return image.resize((nw, nh), Image.Resampling.NEAREST)


def close_alpha_holes(rgba: np.ndarray, iterations: int = 2) -> np.ndarray:
    out = rgba.copy()
    alpha = out[:, :, 3] > 8
    h, w = alpha.shape
    for _ in range(iterations):
        dilated = alpha.copy()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
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
                dilated |= shifted
        fill = dilated & ~alpha
        ys, xs = np.where(fill)
        for y, x in zip(ys, xs):
            samples = []
            for ny in range(max(0, y - 1), min(h, y + 2)):
                for nx in range(max(0, x - 1), min(w, x + 2)):
                    if alpha[ny, nx]:
                        samples.append(out[ny, nx])
            if samples:
                mean = np.mean(samples, axis=0).astype(np.uint8)
                out[y, x] = mean
                out[y, x, 3] = 255
        alpha = out[:, :, 3] > 8
    return out


def add_red_silhouette_outline(
    image: Image.Image,
    thickness: int = 2,
    color: tuple[int, int, int, int] = (220, 35, 35, 255),
) -> Image.Image:
    src = Image.fromarray(close_alpha_holes(np.asarray(image.convert("RGBA"))), "RGBA")
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


def slice_orcs() -> dict[str, Image.Image]:
    if not SRC.exists():
        raise SystemExit(f"missing source sheet: {SRC}")

    source_dir = OUT_ROOT / "_source"
    source_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SRC, source_dir / "orcs_sheet.png")

    sheet = Image.open(SRC).convert("RGBA")
    arr = np.asarray(sheet)
    bri = arr[:, :, :3].mean(axis=2)
    mask = bri > 18
    segs = find_body_segments(mask, min_width=60)
    if len(segs) < 3:
        raise SystemExit(f"expected 3 orcs, found {segs}")
    segs = sorted(segs, key=lambda s: s[1] - s[0], reverse=True)[:3]
    segs = sorted(segs, key=lambda s: s[0])
    print("orc segments", segs, "sheet", sheet.size)

    result: dict[str, Image.Image] = {}
    for name, (x0, x1) in zip(ORC_NAMES, segs):
        pad = 8
        crop = sheet.crop((max(0, x0 - pad), 0, min(sheet.width, x1 + pad + 1), sheet.height))
        rgba = remove_black(np.asarray(crop))
        rgba = trim_alpha(rgba)
        img = Image.fromarray(rgba, "RGBA")
        img = fit_max(img, MAX_SIZES[name])
        img = add_red_silhouette_outline(img, thickness=2)
        out_path = OUT_ROOT / f"{name}.png"
        img.save(out_path)
        result[name] = img
        print(f"{name}: {img.size} -> {out_path}")
    return result


def rebuild_atlas() -> None:
    frames_meta: dict[str, dict] = {}
    atlas_images: list[tuple[str, Image.Image]] = []
    for name in ATLAS_ORDER:
        path = OUT_ROOT / f"{name}.png"
        if not path.exists():
            raise SystemExit(f"missing monster sprite: {path}")
        img = Image.open(path).convert("RGBA")
        atlas_images.append((name, img))
        frames_meta[name] = {
            "file": f"{name}.png",
            "width": img.width,
            "height": img.height,
            "typeId": TYPE_IDS[name],
        }

    gap = 4
    atlas_w = sum(im.width for _, im in atlas_images) + gap * (len(atlas_images) - 1)
    atlas_h = max(im.height for _, im in atlas_images)
    atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
    atlas_frames = []
    x = 0
    for name, im in atlas_images:
        y = atlas_h - im.height
        atlas.paste(im, (x, y), im)
        atlas_frames.append(
            {
                "name": name,
                "typeId": TYPE_IDS[name],
                "x": x,
                "y": y,
                "w": im.width,
                "h": im.height,
            }
        )
        x += im.width + gap

    atlas.save(OUT_ROOT / "atlas.png")
    (OUT_ROOT / "atlas.json").write_text(
        json.dumps(
            {"width": atlas_w, "height": atlas_h, "frames": atlas_frames},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    (OUT_ROOT / "manifest.json").write_text(
        json.dumps({"monsters": frames_meta}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print("atlas", atlas.size)


def main() -> None:
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    slice_orcs()
    rebuild_atlas()


if __name__ == "__main__":
    main()
