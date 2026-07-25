"""Slice sword icons into items atlas."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(
    r"C:\Users\lee\.cursor\projects\i-Cursor-ExGame\assets"
    r"\c__Users_lee_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images"
    r"_ChatGPT_Image_2026__7__25_____04_30_54-13e1e67b-02df-48c0-bf82-4531e6e9aa5f.png"
)
OUT_ROOT = Path(r"I:\Cursor\ExGame\game\assets\textures\items")
NAMES = ["weapon-iron-sword", "weapon-mithril-sword", "weapon-orichalcum-sword"]
MAX_SIDE = 48


def find_body_segments(mask: np.ndarray, min_width: int = 40) -> list[tuple[int, int]]:
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


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing source: {SRC}")
    if OUT_ROOT.exists():
        shutil.rmtree(OUT_ROOT)
    OUT_ROOT.mkdir(parents=True)
    (OUT_ROOT / "_source").mkdir()
    shutil.copy2(SRC, OUT_ROOT / "_source" / "swords_sheet.png")

    sheet = Image.open(SRC).convert("RGBA")
    arr = np.asarray(sheet)
    bri = arr[:, :, :3].mean(axis=2)
    mask = bri > 18
    segs = find_body_segments(mask, min_width=40)
    if len(segs) < 3:
        raise SystemExit(f"expected 3 swords, found {segs}")
    segs = sorted(segs, key=lambda s: s[1] - s[0], reverse=True)[:3]
    segs = sorted(segs, key=lambda s: s[0])
    print("sword segments", segs)

    frames_meta: dict[str, dict] = {}
    atlas_images: list[tuple[str, Image.Image]] = []
    for name, (x0, x1) in zip(NAMES, segs):
        pad = 6
        crop = sheet.crop((max(0, x0 - pad), 0, min(sheet.width, x1 + pad + 1), sheet.height))
        rgba = remove_black(np.asarray(crop))
        rgba = trim_alpha(rgba)
        img = fit_max(Image.fromarray(rgba, "RGBA"), MAX_SIDE)
        img.save(OUT_ROOT / f"{name}.png")
        frames_meta[name] = {
            "file": f"{name}.png",
            "width": img.width,
            "height": img.height,
            "itemId": name,
        }
        atlas_images.append((name, img))
        print(f"{name}: {img.size}")

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
                "itemId": name,
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
        json.dumps({"items": frames_meta}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print("atlas", atlas.size)


if __name__ == "__main__":
    main()
