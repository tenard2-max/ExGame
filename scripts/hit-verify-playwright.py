"""Verify world-space harvest hit at multiple zooms via Playwright."""
from __future__ import annotations

import json
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:7457/?offline=1&hitTrace=1"
OUT = Path(r"I:\Cursor\ExGame\game\release\hit-verify-report.json")


def wait_ready(page, timeout_s=90):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if page.evaluate("() => !!(window.__EXGAME_DEBUG__ && window.__EXGAME_DEBUG__.probeHit)"):
            return True
        time.sleep(0.4)
    return False


VERIFY_JS = """
([zoom]) => {
  const d = window.__EXGAME_DEBUG__;
  d.setZoom(zoom);
  const camera = d.cameraNode.getComponent('cc.Camera');
  const probe = d.probeHit();
  if (!probe || probe.error) return { error: probe };

  // screen of ore → world (new path)
  const screen = probe.visualScreen;
  const world = new cc.Vec3();
  camera.screenToWorld(new cc.Vec3(screen.x, screen.y, 0), world);

  const player = d.playerNode;
  const hit = d.chunkManager.findHarvestableTileAtUiLocation(
    { x: world.x, y: world.y },
    camera,
    player.position.x,
    player.position.y,
    (blockId) => true,
    (typeId) => typeId.startsWith('ore-'),
  );

  // Compare getUILocation formula candidates for the same screen point
  const view = cc.view;
  const vp = view.getViewportRect();
  const ox = view.getVisibleOrigin().x;
  const oy = view.getVisibleOrigin().y;
  const sx = view.getScaleX() || 1;
  const sy = view.getScaleY() || 1;
  const uiNoOrigin = {
    x: (screen.x - vp.x) / sx,
    y: (screen.y - vp.y) / sy,
  };
  const uiWithOrigin = { x: uiNoOrigin.x + ox, y: uiNoOrigin.y + oy };
  const uiScreenDivScale = { x: screen.x / sx, y: screen.y / sy };

  // OLD broken path: UI touch (noOrigin≈getUILocation) vs legacy withOrigin AABB
  const legacy = probe.hitTestBoundsUI_legacyWithOrigin;
  const pad = 2;
  const legacyHit = legacy &&
    uiNoOrigin.x >= legacy.minX - pad && uiNoOrigin.x <= legacy.maxX + pad &&
    uiNoOrigin.y >= legacy.minY - pad && uiNoOrigin.y <= legacy.maxY + pad;

  // Wrong compare: UI touch vs WORLD bounds (space mismatch) — zoom-sensitive
  const wb = probe.hitTestBoundsWorld;
  const uiVsWorld = wb &&
    uiNoOrigin.x >= wb.minX - pad && uiNoOrigin.x <= wb.maxX + pad &&
    uiNoOrigin.y >= wb.minY - pad && uiNoOrigin.y <= wb.maxY + pad;

  return {
    zoom,
    typeId: probe.typeId,
    harvestHit: !!hit,
    harvestTile: hit ? hit.tile : null,
    worldSpaceHit: probe.worldSpaceHit,
    legacyUiHit: legacyHit,
    uiTouchVsWorldBounds: !!uiVsWorld,
    visibleOrigin: { x: ox, y: oy },
    viewport: { x: vp.x, y: vp.y, w: vp.width, h: vp.height },
    uiNoOrigin,
    uiWithOrigin,
    uiScreenDivScale,
    delta_uiNoOrigin_minus_worldCenter: wb ? {
      x: +(uiNoOrigin.x - wb.centerX).toFixed(2),
      y: +(uiNoOrigin.y - wb.centerY).toFixed(2),
    } : null,
    worldCenter: wb ? { x: wb.centerX, y: wb.centerY } : null,
    visualScreen: screen,
  };
}
"""


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_timeout(2500)
        page.mouse.click(700, 450)
        page.wait_for_timeout(5000)
        page.mouse.click(700, 450)
        page.wait_for_timeout(2500)
        if not wait_ready(page):
            raise SystemExit("not ready")

        # expose cc
        page.evaluate("() => { window.cc = window.cc || cc; }")

        results = {}
        for z in [0.55, 1.0, 1.12, 1.75, 2.75]:
            results[str(z)] = page.evaluate(VERIFY_JS, [z])
            page.wait_for_timeout(200)

        # Real mouse click at ore screen pos for zoom 1.12 and 1.0
        click_results = {}
        for z in [1.0, 1.12, 0.55, 2.75]:
            page.evaluate("(z) => window.__EXGAME_DEBUG__.setZoom(z)", z)
            page.wait_for_timeout(250)
            probe = page.evaluate("() => window.__EXGAME_DEBUG__.probeHit()")
            sx = probe["visualScreen"]["x"]
            sy = probe["visualScreen"]["y"]
            mapping = page.evaluate(
                """([sx, sy]) => {
                  const c = document.querySelector('canvas');
                  const r = c.getBoundingClientRect();
                  // Cocos screen Y is bottom-up in some builds; try framebuffer Y from top
                  return {
                    topOrigin: {
                      x: r.left + sx * (r.width / c.width),
                      y: r.top + sy * (r.height / c.height),
                    },
                    bottomOrigin: {
                      x: r.left + sx * (r.width / c.width),
                      y: r.top + (c.height - sy) * (r.height / c.height),
                    },
                    canvas: { w: c.width, h: c.height },
                  };
                }""",
                [sx, sy],
            )
            # Prefer topOrigin first (CDP/browser usually top-left)
            pt = mapping["topOrigin"]
            page.mouse.click(pt["x"], pt["y"])
            page.wait_for_timeout(500)
            # Capture last TAP log if any via custom hook
            tap = page.evaluate(
                """() => {
                  const d = window.__EXGAME_DEBUG__;
                  return {
                    zoom: d.getZoom(),
                    probe: d.probeHit(),
                    lastTap: d.lastTap || null,
                  };
                }"""
            )
            click_results[str(z)] = {
                "mapping": mapping,
                "clicked": pt,
                "after": tap,
                "probeScreen": {"x": sx, "y": sy},
            }

        OUT.write_text(
            json.dumps({"verify": results, "clicks": click_results}, indent=2),
            encoding="utf-8",
        )
        print(json.dumps({"verify": results}, indent=2)[:6000])
        browser.close()


if __name__ == "__main__":
    main()
