#!/usr/bin/env python3
"""ExGame local static server + Media Editor MP4 export (ffmpeg.exe)."""

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


def render_segment(
    ffmpeg: Path,
    src: Path,
    out: Path,
    *,
    duration: float,
    width: int,
    height: int,
    fps: int,
    scale: float,
    opacity: float,
    fade_in: float,
    fade_out: float,
    loop: bool,
    keep_alpha: bool,
) -> None:
    vf = [
        f"scale=iw*{scale}:ih*{scale}",
        f"scale={width}:{height}:force_original_aspect_ratio=decrease",
    ]
    if keep_alpha:
        vf += [
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
            "format=rgba",
            f"colorchannelmixer=aa={max(0.0, min(1.0, opacity))}",
        ]
    else:
        vf += [
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black",
            "format=yuv420p",
        ]
    if fade_in > 0:
        vf.append(
            f"fade=t=in:st=0:d={fade_in:.6f}"
            + (":alpha=1" if keep_alpha else "")
        )
    if fade_out > 0:
        st = max(0.0, duration - fade_out)
        vf.append(
            f"fade=t=out:st={st:.6f}:d={fade_out:.6f}"
            + (":alpha=1" if keep_alpha else "")
        )

    cmd = [str(ffmpeg), "-y"]
    if loop:
        cmd += ["-stream_loop", "-1"]
    cmd += ["-i", str(src), "-t", f"{duration:.6f}", "-r", str(fps), "-vf", ",".join(vf), "-an"]
    if keep_alpha:
        cmd += ["-c:v", "png", str(out)]
    else:
        cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", str(out)]
    run(cmd)


def overlay_segment(
    ffmpeg: Path,
    base: Path,
    seg: Path,
    out: Path,
    *,
    start: float,
    duration: float,
    master: float,
    has_alpha: bool,
) -> None:
    end = start + duration
    if has_alpha:
        fc = f"[0:v][1:v]overlay=0:0:enable='between(t,{start:.6f},{end:.6f})':format=auto[v]"
    else:
        fc = f"[0:v][1:v]overlay=0:0:enable='between(t,{start:.6f},{end:.6f})'[v]"
    run(
        [
            str(ffmpeg),
            "-y",
            "-i",
            str(base),
            "-i",
            str(seg),
            "-filter_complex",
            fc,
            "-map",
            "[v]",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-t",
            f"{master:.6f}",
            str(out),
        ]
    )


def build_export(job: dict, file_map: dict[str, Path], work: Path, ffmpeg: Path) -> Path:
    width, height = (int(x) for x in str(job.get("resolution", "1920x1080")).lower().split("x"))
    fps = int(job.get("fps", 30))
    master = float(job.get("masterDurationSec", 0))
    if master <= 0:
        raise ValueError("masterDurationSec must be > 0")

    audio_id = job.get("audioAssetId")
    if not audio_id or audio_id not in file_map:
        raise ValueError("master audio missing")

    current = work / "base.mp4"
    run(
        [
            str(ffmpeg),
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=black:s={width}x{height}:d={master:.6f}:r={fps}",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-t",
            f"{master:.6f}",
            str(current),
        ]
    )

    def apply_clips(clips: list, *, images: bool) -> None:
        nonlocal current
        for index, clip in enumerate(clips):
            asset_id = clip["assetId"]
            src = file_map.get(asset_id)
            if not src:
                raise ValueError(f"asset missing: {asset_id}")
            start = float(clip.get("startSec", 0))
            dur = float(clip.get("durationSec", 0))
            if dur <= 0:
                continue
            keep_alpha = images
            seg = work / (f"seg_img_{index}.mov" if images else f"seg_vid_{index}.mp4")
            try:
                render_segment(
                    ffmpeg,
                    src,
                    seg,
                    duration=dur,
                    width=width,
                    height=height,
                    fps=fps,
                    scale=float(clip.get("scale", 1) or 1),
                    opacity=float(clip.get("opacity", 1) or 1),
                    fade_in=float(clip.get("fadeInSec", 0) or 0),
                    fade_out=float(clip.get("fadeOutSec", 0) or 0),
                    loop=bool(clip.get("loop", images)),
                    keep_alpha=keep_alpha,
                )
            except RuntimeError:
                if not keep_alpha:
                    raise
                # PNG alpha 코덱 실패 시 opaque fallback
                seg = work / f"seg_img_{index}.mp4"
                render_segment(
                    ffmpeg,
                    src,
                    seg,
                    duration=dur,
                    width=width,
                    height=height,
                    fps=fps,
                    scale=float(clip.get("scale", 1) or 1),
                    opacity=float(clip.get("opacity", 1) or 1),
                    fade_in=float(clip.get("fadeInSec", 0) or 0),
                    fade_out=float(clip.get("fadeOutSec", 0) or 0),
                    loop=True,
                    keep_alpha=False,
                )
                keep_alpha = False
            out = work / f"layer_{'i' if images else 'v'}_{index}.mp4"
            overlay_segment(
                ffmpeg,
                current,
                seg,
                out,
                start=start,
                duration=dur,
                master=master,
                has_alpha=keep_alpha,
            )
            current = out

    apply_clips(list(job.get("videoClips") or []), images=False)
    apply_clips(list(job.get("imageClips") or []), images=True)

    out = work / "output.mp4"
    run(
        [
            str(ffmpeg),
            "-y",
            "-i",
            str(current),
            "-i",
            str(file_map[audio_id]),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "copy",
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
    server_version = "ExGameLocal/1.0"

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] == "/api/media-export/status":
            ffmpeg = resolve_ffmpeg(self.server.ffmpeg_roots)  # type: ignore[attr-defined]
            payload = json.dumps(
                {"ok": True, "ffmpeg": str(ffmpeg) if ffmpeg else None, "ready": ffmpeg is not None}
            ).encode("utf-8")
            self.send_response(200)
            self._cors()
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
                    "ffmpeg.exe를 찾을 수 없습니다. tools/ffmpeg/ffmpeg.exe 를 두거나 "
                    "scripts/fetch-ffmpeg.ps1 을 실행하세요."
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
    print(f"ffmpeg={'READY ' + str(ff) if ff else 'MISSING — run scripts/fetch-ffmpeg.ps1'}")
    server.serve_forever()


if __name__ == "__main__":
    main()
