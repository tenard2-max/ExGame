"""Convert branding PNG into a multi-resolution Windows .ico."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "branding" / "exgame-icon-source.png"
ICO = ROOT / "branding" / "exgame.ico"
SIZES = [(16, 16), (32, 32), (48, 48), (256, 256)]


def main() -> None:
    img = Image.open(SRC).convert("RGBA")
    width, height = img.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    img = img.crop((left, top, left + side, top + side))
    img.save(ICO, format="ICO", sizes=SIZES)
    print(f"wrote {ICO} ({ICO.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
