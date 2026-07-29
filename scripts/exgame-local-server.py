#!/usr/bin/env python3
"""ExGame local static server + Media Editor MP4 export (ffmpeg.exe).

Export uses a single ffmpeg filter_complex pass for speed.
PNG overlays keep alpha when possible; quality CRF prefers PNG when present.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import shutil
import subprocess
import tempfile
import traceback
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def resolve_ffmpeg(extra_roots: list[Path]) -> Path | None:
    env = os.environ.get("FFMPEG_PATH", "").strip()
    if env:
        p = Path(env)
        if p.is_file():
            return p
    candidates: list[Path] = []
    for root in extra_roots:
        candidates.extend(
            [
                root / "tools" / "ffmpeg" / "ffmpeg.exe",
                root / "tools" / "ffmpeg" / "bin" / "ffmpeg.exe",
                root / "ffmpeg.exe",
            ]
        )
    which = shutil.which("ffmpeg")
    if which:
        candidates.append(Path(which))
    for path in candidates:
        if path.is_file():
            return path
    return None


def safe_name(name: str) -> str:
    base = Path(name).name
    return "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in base) or "file"


def parse_multipart(body: bytes, content_type: str) -> tuple[dict[str, str], dict[str, tuple[str, bytes]]]:
    if "boundary=" not in content_type:
        raise ValueError("multipart boundary missing")
    boundary = content_type.split("boundary=", 1)[1].strip().strip('"')
    delim = b"--" + boundary.encode("utf-8")
    fields: dict[str, str] = {}
    files: dict[str, tuple[str, bytes]] = {}
    for part in body.split(delim):
        if not part or part.startswith(b"--"):
            continue
        if part.startswith(b"\r\n"):
            part = part[2:]
        if part.endswith(b"\r\n"):
            part = part[:-2]
        header_blob, _, data = part.partition(b"\r\n\r\n")
        if data.endswith(b"\r\n"):
            data = data[:-2]
        headers: dict[str, str] = {}
        for line in header_blob.decode("utf-8", errors="replace").split("\r\n"):
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()
        disp = headers.get("content-disposition", "")
        name = None
        filename = None
        for item in disp.split(";"):
            item = item.strip()
            if item.startswith("name="):
                name = item.split("=", 1)[1].strip().strip('"')
            elif item.startswith("filename="):
                filename = item.split("=", 1)[1].strip().strip('"')
        if not name:
            continue
        if filename is not None:
            files[name] = (filename, data)
        else:
            fields[name] = data.decode("utf-8", errors="replace")
    return fields, files


def run(cmd: list[str]) -> None:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            "ffmpeg failed\nCMD: "
            + " ".join(cmd)
            + "\nSTDERR:\n"
            + (proc.stderr or "")[-4000:]
        )


def clip_prep_filters(
    input_idx: int,
    label: str,
    clip: dict,
    *,
    width: int,
    height: int,
    keep_alpha: bool,
) -> str:
    """Return filter chain that ends with labeled output, e.g. [v0]."""
    start = float(clip.get("startSec", 0))
    dur = float(clip.get("durationSec", 0))
    scale = float(clip.get("scale", 1) or 1)
    opacity = max(0.0, min(1.0, float(clip.get("opacity", 1) or 1)))
    fade_in = float(clip.get("fadeInSec", 0) or 0)
    fade_out = float(clip.get("fadeOutSec", 0) or 0)

    parts: list[str] = [
        f"[{input_idx}:v]",
        f"trim=duration={dur:.6f}",
        "setpts=PTS-STARTPTS",
        f"scale=iw*{scale}:ih*{scale}",
        f"scale={width}:{height}:force_original_aspect_ratio=decrease",
    ]
    if keep_alpha:
        parts += [
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
            "format=rgba",
            f"colorchannelmixer=aa={opacity}",
        ]
    else:
        parts += [
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black",
            "format=yuv420p",
        ]

    if fade_in > 0:
        alpha = ":alpha=1" if keep_alpha else ""
        parts.append(f"fade=t=in:st=0:d={fade_in:.6f}{alpha}")
    if fade_out > 0:
        st = max(0.0, dur - fade_out)
        alpha = ":alpha=1" if keep_alpha else ""
        parts.append(f"fade=t=out:st={st:.6f}:d={fade_out:.6f}{alpha}")

    # Delay onto master timeline, then pad/tpad silence not needed — overlay enable handles window.
    parts.append(f"setpts=PTS-STARTPTS+{start:.6f}/TB")
    # Join with commas but first tag is separate
    body = parts[0] + ",".join(parts[1:]) + f"[{label}]"
    return body


def build_export(job: dict, file_map: dict[str, Path], work: Path, ffmpeg: Path) -> Path:
    width, height = (int(x) for x in str(job.get("resolution", "1920x1080")).lower().split("x"))
    fps = int(job.get("fps", 30))
    master = float(job.get("masterDurationSec", 0))
    if master <= 0:
        raise ValueError("masterDurationSec must be > 0")

    audio_id = job.get("audioAssetId")
    if not audio_id or audio_id not in file_map:
        raise ValueError("master audio missing")

    video_clips = [c for c in (job.get("videoClips") or []) if float(c.get("durationSec", 0)) > 0]
    image_clips = [c for c in (job.get("imageClips") or []) if float(c.get("durationSec", 0)) > 0]
    has_png = len(image_clips) > 0
    # Quality: PNG present -> higher quality (lower CRF); else MP4 baseline
    crf = "17" if has_png else "20"
    preset = "veryfast"

    cmd: list[str] = [str(ffmpeg), "-y", "-hide_banner", "-loglevel", "error"]
    # 0: black base
    cmd += [
        "-f",
        "lavfi",
        "-i",
        f"color=c=black:s={width}x{height}:d={master:.6f}:r={fps}",
    ]
    # 1: master audio
    cmd += ["-i", str(file_map[audio_id])]

    clip_meta: list[tuple[int, dict, bool]] = []
    next_idx = 2

    for clip in video_clips:
        src = file_map.get(clip["assetId"])
        if not src:
            raise ValueError(f"asset missing: {clip['assetId']}")
        if bool(clip.get("loop", False)):
            cmd += ["-stream_loop", "-1"]
        cmd += ["-i", str(src)]
        clip_meta.append((next_idx, clip, False))
        next_idx += 1

    for clip in image_clips:
        src = file_map.get(clip["assetId"])
        if not src:
            raise ValueError(f"asset missing: {clip['assetId']}")
        cmd += ["-loop", "1", "-t", f"{float(clip.get('durationSec', 0)):.6f}", "-i", str(src)]
        clip_meta.append((next_idx, clip, True))
        next_idx += 1

    out = work / "output.mp4"

    if not clip_meta:
        # audio-only black video
        run(
            cmd
            + [
                "-map",
                "0:v:0",
                "-map",
                "1:a:0",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-preset",
                preset,
                "-crf",
                crf,
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-shortest",
                "-t",
                f"{master:.6f}",
                str(out),
            ]
        )
        return out

    filters: list[str] = []
    labels: list[tuple[str, dict, bool]] = []
    for i, (in_idx, clip, is_image) in enumerate(clip_meta):
        label = f"c{i}"
        filters.append(
            clip_prep_filters(
                in_idx,
                label,
                clip,
                width=width,
                height=height,
                keep_alpha=is_image,
            )
        )
        labels.append((label, clip, is_image))

    prev = "0:v"
    for i, (label, clip, is_image) in enumerate(labels):
        start = float(clip.get("startSec", 0))
        dur = float(clip.get("durationSec", 0))
        end = start + dur
        out_lab = f"b{i}"
        fmt = ":format=auto" if is_image else ""
        filters.append(
            f"[{prev}][{label}]overlay=0:0:enable='between(t\\,{start:.6f}\\,{end:.6f})'{fmt}[{out_lab}]"
        )
        prev = out_lab

    filter_complex = ";".join(filters)
    run(
        cmd
        + [
            "-filter_complex",
            filter_complex,
            "-map",
            f"[{prev}]",
            "-map",
            "1:a:0",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-preset",
            preset,
            "-crf",
            crf,
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            "-t",
            f"{master:.6f}",
            str(out),
        ]
    )
    return out


class Handler(BaseHTTPRequestHandler):
    server_version = "ExGameLocal/1.1"

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _no_cache(self) -> None:
        # Same URL path across ZIP versions (assets/main/index.js) is otherwise
        # reused from Edge/Chrome disk cache and hides newer UI like MP4 button.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self._no_cache()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] == "/api/media-export/status":
            ffmpeg = resolve_ffmpeg(self.server.ffmpeg_roots)  # type: ignore[attr-defined]
            payload = json.dumps(
                {"ok": True, "ffmpeg": str(ffmpeg) if ffmpeg else None, "ready": ffmpeg is not None}
            ).encode("utf-8")
            self.send_response(200)
            self._cors()
            self._no_cache()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        root: Path = self.server.game_root  # type: ignore[attr-defined]
        parsed = urllib.parse.urlparse(self.path)
        rel = urllib.parse.unquote(parsed.path)
        if rel.endswith("/"):
            rel += "index.html"
        if rel.startswith("/"):
            rel = rel[1:]
        target = (root / rel).resolve()
        if not str(target).startswith(str(root.resolve())):
            self.send_error(403)
            return
        if not target.is_file():
            self.send_error(404)
            return
        data = target.read_bytes()
        ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        self.send_response(200)
        self._cors()
        self._no_cache()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] != "/api/media-export":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length)
            fields, files = parse_multipart(body, self.headers.get("Content-Type", ""))
            job = json.loads(fields.get("job", "{}"))
            ffmpeg = resolve_ffmpeg(self.server.ffmpeg_roots)  # type: ignore[attr-defined]
            if not ffmpeg:
                raise FileNotFoundError(
                    "ffmpeg.exe not found. Place tools/ffmpeg/ffmpeg.exe or run scripts/fetch-ffmpeg.ps1"
                )
            with tempfile.TemporaryDirectory(prefix="exme_export_") as tmp:
                work = Path(tmp)
                file_map: dict[str, Path] = {}
                for key, (filename, data) in files.items():
                    asset_id = key[5:] if key.startswith("file_") else key
                    dest = work / f"{safe_name(asset_id)}_{safe_name(filename)}"
                    dest.write_bytes(data)
                    file_map[asset_id] = dest
                out = build_export(job, file_map, work, ffmpeg)
                payload = out.read_bytes()
            self.send_response(200)
            self._cors()
            self._no_cache()
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Disposition", 'attachment; filename="exgame-export.mp4"')
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as exc:  # noqa: BLE001
            payload = json.dumps(
                {"ok": False, "error": str(exc), "trace": traceback.format_exc()[-2000:]},
                ensure_ascii=False,
            ).encode("utf-8")
            self.send_response(500)
            self._cors()
            self._no_cache()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=7456)
    parser.add_argument("--directory", required=True)
    parser.add_argument("--bind", default="127.0.0.1")
    args = parser.parse_args()
    game_root = Path(args.directory).resolve()
    if not (game_root / "index.html").is_file():
        raise SystemExit(f"index.html not found in {game_root}")

    script_dir = Path(__file__).resolve().parent
    project_guess = script_dir.parent if script_dir.name == "scripts" else script_dir
    ffmpeg_roots = [game_root, project_guess, script_dir]

    server = ThreadingHTTPServer((args.bind, args.port), Handler)
    server.game_root = game_root  # type: ignore[attr-defined]
    server.ffmpeg_roots = ffmpeg_roots  # type: ignore[attr-defined]
    print(f"ExGame local server http://{args.bind}:{args.port}/")
    print(f"root={game_root}")
    ff = resolve_ffmpeg(ffmpeg_roots)
    print(f"ffmpeg={'READY ' + str(ff) if ff else 'MISSING - run scripts/fetch-ffmpeg.ps1'}")
    server.serve_forever()


if __name__ == "__main__":
    main()
