"""Build a single tile atlas PNG + JSON for runtime loading."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

TILES_ROOT = Path(r"I:\Cursor\ExGame\game\assets\textures\tiles")
OUT_ATLAS = TILES_ROOT / "atlas.png"
OUT_JSON = TILES_ROOT / "atlas.json"
TILE = 32

# 게임 BlockId → 폴더 / 파일 필터
MAPPING = {
    "grass": {"folder": "grass", "prefer_prefix": None},
    "mud": {"folder": "dirt", "prefer_prefix": None},
    "water": {"folder": "water", "prefer_prefix": None},
    "rock": {"folder": "rock", "prefer_prefix": None},
    # 숲 캐노피(sheet1)를 우선하고, 개별 나무(sheet2)는 뒤에
    "tree": {"folder": "tree", "prefer_prefix": "tree_01_"},
}


def collect_files(folder: Path, prefer_prefix: str | None) -> list[Path]:
    files = sorted(folder.glob("*.png"))
    if prefer_prefix:
        preferred = [f for f in files if f.name.startswith(prefer_prefix)]
        others = [f for f in files if not f.name.startswith(prefer_prefix)]
        return preferred + others
    return files


def main() -> None:
    frames: list[dict] = []
    images: list[Image.Image] = []
    by_block: dict[str, list[int]] = {}

    for block_id, rule in MAPPING.items():
        folder = TILES_ROOT / rule["folder"]
        files = collect_files(folder, rule["prefer_prefix"])
        indices: list[int] = []
        for path in files:
            img = Image.open(path).convert("RGBA")
            if img.size != (TILE, TILE):
                img = img.resize((TILE, TILE), Image.Resampling.NEAREST)
            indices.append(len(images))
            images.append(img)
            frames.append(
                {
                    "index": len(images) - 1,
                    "blockId": block_id,
                    "file": path.name,
                }
            )
        by_block[block_id] = indices
        print(f"{block_id}: {len(indices)} frames")

    if not images:
        raise SystemExit("no tiles found")

    cols = 16
    rows = (len(images) + cols - 1) // cols
    atlas = Image.new("RGBA", (cols * TILE, rows * TILE), (0, 0, 0, 0))
    for index, img in enumerate(images):
        x = (index % cols) * TILE
        y = (index // cols) * TILE
        atlas.paste(img, (x, y))
        frames[index]["x"] = x
        frames[index]["y"] = y
        frames[index]["w"] = TILE
        frames[index]["h"] = TILE

    atlas.save(OUT_ATLAS)
    payload = {
        "tileSize": TILE,
        "atlasWidth": atlas.width,
        "atlasHeight": atlas.height,
        "columns": cols,
        "frames": frames,
        "byBlockId": by_block,
    }
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", OUT_ATLAS, atlas.size)
    print("wrote", OUT_JSON)


if __name__ == "__main__":
    main()
