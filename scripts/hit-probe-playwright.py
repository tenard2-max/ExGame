"""ExGame hit-coordinate probe via Playwright."""
from __future__ import annotations

import json
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:7457/?offline=1&hitTrace=1"
OUT = Path(r"I:\Cursor\ExGame\game\release\hit-probe-report.json")


def wait_debug(page, timeout_s=90):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        ready = page.evaluate(
            """() => !!(window.__EXGAME_DEBUG__ && window.__EXGAME_DEBUG__.probeHit)"""
        )
        if ready:
            return True
        time.sleep(0.5)
    return False


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_timeout(2000)
        # splash: click to start
        page.mouse.click(700, 450)
        page.wait_for_timeout(5000)
        # may need second click after splash min duration
        page.mouse.click(700, 450)
        page.wait_for_timeout(2000)

        if not wait_debug(page):
            body = page.evaluate("() => document.body && document.body.innerText")
            raise SystemExit(f"debug API not ready. body={body!r}")

        report = {"probes": {}, "clicks": {}}

        for zoom in [1.0, 1.12, 0.55, 1.75, 2.75]:
            probe = page.evaluate("(z) => window.__EXGAME_DEBUG__.probeHit(z)", zoom)
            report["probes"][str(zoom)] = probe
            page.wait_for_timeout(300)

        # Click verification at mid zoom: click visual screen mapped to canvas CSS
        mid = report["probes"].get("1.12") or {}
        if isinstance(mid, dict) and mid.get("screenClickForBrowser"):
            sx = mid["screenClickForBrowser"]["x"]
            sy = mid["screenClickForBrowser"]["y"]
            # Cocos canvas may be scaled; map framebuffer → CSS via canvas metrics
            click_xy = page.evaluate(
                """([sx, sy]) => {
                  const c = document.querySelector('canvas');
                  if (!c) return null;
                  const rect = c.getBoundingClientRect();
                  const x = rect.left + (sx / c.width) * rect.width;
                  const y = rect.top + ((c.height - sy) / c.height) * rect.height;
                  // Cocos Y: screen often bottom-left origin → flip
                  const yTop = rect.top + (sy / c.height) * rect.height;
                  return {
                    cssFlipY: {x, y},
                    cssNoFlip: {x: rect.left + (sx/c.width)*rect.width, y: yTop},
                    canvas: {w:c.width,h:c.height,cw:rect.width,ch:rect.height,left:rect.left,top:rect.top}
                  };
                }""",
                [sx, sy],
            )
            report["clickMapping"] = click_xy
            # Try both Y conventions
            for name, pt in [
                ("noFlip", click_xy["cssNoFlip"]),
                ("flipY", click_xy["cssFlipY"]),
            ]:
                page.evaluate("(z) => window.__EXGAME_DEBUG__.setZoom(z)", 1.12)
                page.wait_for_timeout(200)
                before = page.evaluate(
                    """() => {
                      const d = window.__EXGAME_DEBUG__;
                      return d && d.probeHit ? d.probeHit() : null;
                    }"""
                )
                page.mouse.click(pt["x"], pt["y"])
                page.wait_for_timeout(400)
                taps = page.evaluate(
                    """() => {
                      // last console not available; return zoom + harvest via probe worldSpaceHit
                      const d = window.__EXGAME_DEBUG__;
                      return {
                        zoom: d.getZoom(),
                        probe: d.probeHit(),
                      };
                    }"""
                )
                report["clicks"][name] = {"point": pt, "before": before, "after": taps}

        # Actual hit-path check: call findHarvestable with world point at ore center
        report["worldHitAtOreCenters"] = page.evaluate(
            """() => {
              const d = window.__EXGAME_DEBUG__;
              const results = {};
              for (const z of [0.55, 1.0, 1.12, 1.75, 2.75]) {
                d.setZoom(z);
                const p = d.probeHit();
                results[String(z)] = {
                  worldSpaceHit: p && p.worldSpaceHit,
                  legacyUiHit: p && p.legacyUiHit_withOriginBounds,
                  delta: p && p.delta_touch_minus_legacyCenter,
                  origin: p && p.visibleOrigin,
                  typeId: p && p.typeId,
                };
              }
              return results;
            }"""
        )

        OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print(OUT.read_text(encoding="utf-8")[:8000])
        browser.close()


if __name__ == "__main__":
    main()
