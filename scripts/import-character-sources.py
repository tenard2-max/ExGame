"""Extract character id→timestamp map from transcript; copy & rebuild sprites."""
from __future__ import annotations

import re
import shutil
from pathlib import Path

ASSETS = Path(r"C:\Users\lee\.cursor\projects\i-Cursor-ExGame\assets")
DEST = Path(r"I:\Cursor\ExGame\game\assets\textures\characters\_source")
TRANSCRIPT = Path(
    r"C:\Users\lee\.cursor\projects\i-Cursor-ExGame\agent-transcripts"
    r"\99cf1f0f-c25a-4faf-9e3f-81866bf0e8cc\99cf1f0f-c25a-4faf-9e3f-81866bf0e8cc.jsonl"
)

# Known stable mapping from previous import sessions (timestamp in ChatGPT filename).
KNOWN_MAP: dict[str, str] = {
    "rainbow_sword": "12_46_06",
    "pink_rogue": "12_55_50",
    "jade_mage": "01_02_34",
    "turquoise_priest": "01_03_09",
    "silver_noble": "01_17_18",
    "jade_staff": "01_01_32",
    "blossom_mage": "01_05_27",
    "gold_warrior": "01_15_26",
    "forest_axe": "01_17_31",
    "crimson_knight": "12_43_26",
    "scarlet_elf": "12_50_57",
    "aurora_mage": "01_11_27",
    "crimson_whip": "01_38_37",
    "scarlet_gunner": "01_33_46",
    "pink_halberd": "01_28_31",
    "ruby_glaive": "01_29_41",
    "peach_archer": "01_21_44",
    "rose_archer": "01_21_42",
    "golden_sniper": "01_36_00",
    "lotus_archer": "01_24_00",
    "holy_grimoire": "01_40_04",
    "crimson_bow": "01_27_03",
    "orange_grimoire": "01_50_36",
    "lavender_fencer": "01_46_11",
}


def find_by_pattern(pattern: str) -> Path | None:
    # Prefer newest matching upload (user re-uploaded originals).
    hits = sorted(
        ASSETS.glob(f"*{pattern}*"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    pngs = [h for h in hits if h.suffix.lower() == ".png"]
    return pngs[0] if pngs else None


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    missing: list[str] = []
    for char_id, pattern in KNOWN_MAP.items():
        src = find_by_pattern(pattern)
        if not src:
            missing.append(f"{char_id} ({pattern})")
            continue
        dest = DEST / f"{char_id}.png"
        shutil.copy2(src, dest)
        size = dest.stat().st_size
        print(f"OK {char_id:20s} <- {pattern} ({size:,} bytes) {src.name[-55:]}")
    if missing:
        raise SystemExit("MISSING:\n" + "\n".join(missing))
    print(f"copied {len(KNOWN_MAP)} sources -> {DEST}")


if __name__ == "__main__":
    main()
