#!/usr/bin/env python3
"""ExGame local static server + Media Editor MP4 export (ffmpeg.exe).

Export jobs run asynchronously with progress polling so the UI stays responsive.
Work files stay under {game_root}/exports/.work (not C: Temp) to avoid filling system drive.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import shutil
import subprocess
import tempfile
import threading
import time
import traceback
import urllib.parse
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()


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


def work_root(game_root: Path) -> Path:
    root = game_root / "exports" / ".work"
    root.mkdir(parents=True, exist_ok=True)
    return root


def cleanup_stale_work(game_root: Path, max_age_sec: float = 3600.0) -> None:
    """Remove leftover export work dirs and old C:\\Temp\\exme_* leftovers."""
    now = time.time()
    roots = [work_root(game_root), Path(tempfile.gettempdir())]
    for base in roots:
        try:
            entries = list(base.glob("exme_*"))
        except OSError:
            continue
        for path in entries:
            try:
                age = now - path.stat().st_mtime
                if age < max_age_sec and base == work_root(game_root):
                    continue
                if path.is_dir():
                    shutil.rmtree(path, ignore_errors=True)
                else:
                    path.unlink(missing_ok=True)
                print(f"Cleaned temp: {path}")
            except OSError:
                pass


def parse_multipart_to_disk(
    body_path: Path,
    content_type: str,
    dest_dir: Path,
) -> tuple[dict[str, str], dict[str, Path]]:
    """Parse multipart file on disk into text fields + file paths (no giant RAM copies of media)."""
    if "boundary=" not in content_type:
        raise ValueError("multipart boundary missing")
    boundary = content_type.split("boundary=", 1)[1].strip().strip('"')
    delim = b"--" + boundary.encode("utf-8")
    raw = body_path.read_bytes()
    try:
        body_path.unlink(missing_ok=True)
    except OSError:
        pass
    fields: dict[str, str] = {}
    files: dict[str, Path] = {}
    for part in raw.split(delim):
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
            asset_id = name[5:] if name.startswith("file_") else name
            dest = dest_dir / f"{safe_name(asset_id)}_{safe_name(filename)}"
            dest.write_bytes(data)
            files[asset_id] = dest
        else:
            fields[name] = data.decode("utf-8", errors="replace")
    del raw
    return fields, files


def clip_scale_pad(
    input_idx: int,
    label: str,
    clip: dict,
    width: int,
    height: int,
    dur: float,
    *,
    is_image: bool,
    video_speed: float,
    fps: int,
) -> str:
    scale = float(clip.get("scale", 1) or 1)
    opacity = max(0.0, min(1.0, float(clip.get("opacity", 1) or 1)))
    fade_in = float(clip.get("fadeInSec", 0) or 0)
    fade_out = float(clip.get("fadeOutSec", 0) or 0)
    speed = max(0.2, min(1.0, float(video_speed or 1.0)))
    # Timeline length stays `dur`. Slow MP4 (speed<1) consumes dur*speed of source, then stretches.
    if is_image or abs(speed - 1.0) < 1e-6:
        trim_dur = dur
        setpts = "setpts=PTS-STARTPTS"
    else:
        trim_dur = max(0.05, dur * speed)
        setpts = f"setpts=(PTS-STARTPTS)/{speed:.6f}"
    parts = [
        f"[{input_idx}:v]",
        f"trim=duration={trim_dur:.6f}",
        setpts,
        f"fps={int(fps)}",
        f"scale=iw*{scale}:ih*{scale}",
        f"scale={width}:{height}:force_original_aspect_ratio=decrease",
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black",
        "format=yuv420p",
        "setsar=1",
    ]
    if opacity < 0.999:
        # Flatten semi-transparent clip onto black (sequential timeline, no overlap).
        parts.append(f"colorchannelmixer=aa={opacity}")
        parts.append("format=yuv420p")
    if fade_in > 0:
        parts.append(f"fade=t=in:st=0:d={fade_in:.6f}")
    if fade_out > 0:
        st = max(0.0, dur - fade_out)
        parts.append(f"fade=t=out:st={st:.6f}:d={fade_out:.6f}")
    return parts[0] + ",".join(parts[1:]) + f"[{label}]"


def build_export(
    job: dict,
    file_map: dict[str, Path],
    work: Path,
    ffmpeg: Path,
    progress_cb=None,
) -> Path:
    """Sequential concat export (MP4/PNG do not share time). Much lighter than full-timeline overlay."""
    width, height = (int(x) for x in str(job.get("resolution", "1280x720")).lower().split("x"))
    fps = int(job.get("fps", 30))
    master = float(job.get("masterDurationSec", 0))
    if master <= 0:
        raise ValueError("masterDurationSec must be > 0")

    audio_id = job.get("audioAssetId")
    if not audio_id or audio_id not in file_map:
        raise ValueError("master audio missing")

    video_clips = [c for c in (job.get("videoClips") or []) if float(c.get("durationSec", 0)) > 0]
    image_clips = [c for c in (job.get("imageClips") or []) if float(c.get("durationSec", 0)) > 0]
    visual: list[tuple[dict, bool]] = [(c, False) for c in video_clips] + [(c, True) for c in image_clips]
    visual.sort(key=lambda item: float(item[0].get("startSec", 0)))

    has_png = len(image_clips) > 0
    crf = "20" if has_png else "22"
    preset = "ultrafast"  # UI responsiveness / disk temperature first

    video_speed = max(0.2, min(1.0, float(job.get("videoSpeed", 1) or 1)))

    # Build non-overlapping coverage [0, master]
    segments: list[tuple] = []
    cursor = 0.0
    for clip, is_image in visual:
        start = float(clip.get("startSec", 0))
        dur = float(clip.get("durationSec", 0))
        if start < cursor:
            dur -= cursor - start
            start = cursor
        if dur <= 0.001:
            continue
        if start > cursor + 0.001:
            segments.append(("black", start - cursor))
            cursor = start
        segments.append(("clip", clip, is_image, dur))
        cursor = start + dur
    if cursor < master - 0.001:
        segments.append(("black", master - cursor))
    if not segments:
        segments = [("black", master)]

    if progress_cb:
        progress_cb(5, "세그먼트 준비…")

    cmd: list[str] = [str(ffmpeg), "-y", "-hide_banner", "-loglevel", "error", "-progress", "pipe:1"]
    cmd += ["-i", str(file_map[audio_id])]  # 0: audio

    input_meta: list[tuple[int, str, dict | None, float, bool]] = []
    next_idx = 1
    for seg in segments:
        if seg[0] == "black":
            dur = float(seg[1])
            cmd += [
                "-f",
                "lavfi",
                "-i",
                f"color=c=black:s={width}x{height}:d={dur:.6f}:r={fps}",
            ]
            input_meta.append((next_idx, "black", None, dur, False))
            next_idx += 1
        else:
            _, clip, is_image, dur = seg
            src = file_map.get(clip["assetId"])
            if not src:
                raise ValueError(f"asset missing: {clip['assetId']}")
            if is_image:
                cmd += ["-loop", "1", "-t", f"{dur:.6f}", "-i", str(src)]
            else:
                src_need = max(0.05, dur * video_speed)
                if bool(clip.get("loop", False)):
                    cmd += ["-stream_loop", "-1"]
                cmd += ["-t", f"{src_need:.6f}", "-i", str(src)]
            input_meta.append((next_idx, "clip", clip, dur, is_image))
            next_idx += 1

    filters: list[str] = []
    labels: list[str] = []
    for i, (in_idx, kind, clip, dur, is_image) in enumerate(input_meta):
        lab = f"s{i}"
        if kind == "black":
            filters.append(f"[{in_idx}:v]format=yuv420p,setsar=1[{lab}]")
        else:
            assert clip is not None
            filters.append(
                clip_scale_pad(
                    in_idx,
                    lab,
                    clip,
                    width,
                    height,
                    dur,
                    is_image=is_image,
                    video_speed=video_speed,
                    fps=fps,
                )
            )
        labels.append(lab)

    concat_in = "".join(f"[{lab}]" for lab in labels)
    filters.append(f"{concat_in}concat=n={len(labels)}:v=1:a=0[vout]")
    filter_complex = ";".join(filters)

    out = work / "output.mp4"
    cmd += [
        "-filter_complex",
        filter_complex,
        "-map",
        "[vout]",
        "-map",
        "0:a:0",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        preset,
        "-crf",
        crf,
        "-threads",
        "0",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-t",
        f"{master:.6f}",
        str(out),
    ]

    if progress_cb:
        progress_cb(10, "ffmpeg 인코딩 시작…")

    run_ffmpeg_progress(cmd, master, progress_cb)
    if not out.is_file() or out.stat().st_size < 32:
        raise RuntimeError("ffmpeg output missing or empty")
    if progress_cb:
        progress_cb(97, "파일 저장 중…")
    return out


def run_ffmpeg_progress(cmd: list[str], master_sec: float, progress_cb=None) -> None:
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    assert proc.stdout is not None
    last_pct = 10
    try:
        for line in proc.stdout:
            line = line.strip()
            if not line.startswith("out_time_ms="):
                continue
            try:
                ms = int(line.split("=", 1)[1])
            except ValueError:
                continue
            if master_sec <= 0:
                continue
            pct = 10 + int(max(0.0, min(1.0, (ms / 1000.0) / master_sec)) * 85)
            if pct >= last_pct + 1:
                last_pct = pct
                if progress_cb:
                    progress_cb(pct, f"인코딩 {pct}%…")
        code = proc.wait(timeout=10)
    except Exception:
        proc.kill()
        raise
    err = ""
    if proc.stderr is not None:
        err = proc.stderr.read()[-4000:]
    if code != 0:
        raise RuntimeError("ffmpeg failed\nCMD: " + " ".join(cmd) + "\nSTDERR:\n" + err)


def update_job(job_id: str, **fields) -> None:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            return
        job.update(fields)
        job["updatedAt"] = time.time()


def run_export_job(
    job_id: str,
    job: dict,
    file_map: dict[str, Path],
    work: Path,
    ffmpeg: Path,
    exports_dir: Path,
) -> None:
    def progress_cb(pct: int, message: str) -> None:
        update_job(job_id, state="running", progress=int(pct), message=message)

    try:
        update_job(job_id, state="running", progress=3, message="ffmpeg 준비…")
        out = build_export(job, file_map, work, ffmpeg, progress_cb)
        exports_dir.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y%m%d-%H%M%S")
        saved = exports_dir / f"exgame-export-{stamp}.mp4"
        shutil.copy2(out, saved)
        size = saved.stat().st_size
        update_job(
            job_id,
            state="done",
            progress=100,
            message="완료",
            path=str(saved),
            bytes=size,
        )
        print(f"Export saved: {saved} ({size} bytes)")
    except Exception as exc:  # noqa: BLE001
        print(f"Export job ERROR {job_id}: {exc}")
        print(traceback.format_exc()[-2000:])
        update_job(job_id, state="error", progress=100, message=str(exc), error=str(exc))
    finally:
        try:
            shutil.rmtree(work, ignore_errors=True)
        except OSError:
            pass


class Handler(BaseHTTPRequestHandler):
    server_version = "ExGameLocal/1.2"

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _no_cache(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")

    def _json(self, code: int, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self._no_cache()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self._no_cache()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path == "/api/media-export/status":
            ffmpeg = resolve_ffmpeg(self.server.ffmpeg_roots)  # type: ignore[attr-defined]
            self._json(
                200,
                {"ok": True, "ffmpeg": str(ffmpeg) if ffmpeg else None, "ready": ffmpeg is not None},
            )
            return

        if path == "/api/media-export/job":
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            job_id = (qs.get("id") or [""])[0]
            with JOBS_LOCK:
                job = JOBS.get(job_id)
                if not job:
                    self._json(404, {"ok": False, "error": "job not found"})
                    return
                snapshot = {
                    "ok": True,
                    "id": job_id,
                    "state": job.get("state"),
                    "progress": job.get("progress", 0),
                    "message": job.get("message", ""),
                    "path": job.get("path"),
                    "bytes": job.get("bytes"),
                    "error": job.get("error"),
                }
            self._json(200, snapshot)
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
        game_root: Path = self.server.game_root  # type: ignore[attr-defined]
        work = None
        body_path = None
        try:
            length = int(self.headers.get("Content-Length", "0"))
            print(f"Export POST start bytes={length}")
            if length <= 0:
                raise ValueError("empty upload")
            if length > 2_500_000_000:
                raise ValueError("upload too large (>2.5GB)")

            job_id = uuid.uuid4().hex[:12]
            work = work_root(game_root) / f"exme_{job_id}"
            work.mkdir(parents=True, exist_ok=True)
            body_path = work / "upload.bin"

            remaining = length
            with body_path.open("wb") as out:
                while remaining > 0:
                    chunk = self.rfile.read(min(1024 * 1024, remaining))
                    if not chunk:
                        break
                    out.write(chunk)
                    remaining -= len(chunk)

            fields, file_map = parse_multipart_to_disk(
                body_path,
                self.headers.get("Content-Type", ""),
                work,
            )
            try:
                body_path.unlink(missing_ok=True)
            except OSError:
                pass
            body_path = None

            job = json.loads(fields.get("job", "{}"))
            ffmpeg = resolve_ffmpeg(self.server.ffmpeg_roots)  # type: ignore[attr-defined]
            if not ffmpeg:
                raise FileNotFoundError(
                    "ffmpeg.exe not found. Place tools/ffmpeg/ffmpeg.exe or run scripts/fetch-ffmpeg.ps1"
                )
            if not file_map:
                raise ValueError("no media files uploaded")

            with JOBS_LOCK:
                JOBS[job_id] = {
                    "state": "queued",
                    "progress": 1,
                    "message": "대기열…",
                    "path": None,
                    "bytes": None,
                    "error": None,
                    "createdAt": time.time(),
                    "updatedAt": time.time(),
                }

            exports_dir = game_root / "exports"
            thread = threading.Thread(
                target=run_export_job,
                args=(job_id, job, file_map, work, ffmpeg, exports_dir),
                daemon=True,
                name=f"exme-export-{job_id}",
            )
            # Ownership of work dir moves to the worker thread.
            work = None
            thread.start()
            print(f"Export job started id={job_id}")
            self._json(
                200,
                {
                    "ok": True,
                    "jobId": job_id,
                    "message": "Export 시작. /api/media-export/job?id= 로 진행률 확인",
                },
            )
        except Exception as exc:  # noqa: BLE001
            print(f"Export ERROR: {exc}")
            print(traceback.format_exc()[-2000:])
            if body_path is not None:
                try:
                    body_path.unlink(missing_ok=True)
                except OSError:
                    pass
            if work is not None:
                shutil.rmtree(work, ignore_errors=True)
            self._json(500, {"ok": False, "error": str(exc), "trace": traceback.format_exc()[-2000:]})


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

    cleanup_stale_work(game_root, max_age_sec=0)  # wipe leftovers on start

    server = ThreadingHTTPServer((args.bind, args.port), Handler)
    server.game_root = game_root  # type: ignore[attr-defined]
    server.ffmpeg_roots = ffmpeg_roots  # type: ignore[attr-defined]
    print(f"ExGame local server http://{args.bind}:{args.port}/")
    print(f"root={game_root}")
    print(f"export work={work_root(game_root)} (not system Temp)")
    ff = resolve_ffmpeg(ffmpeg_roots)
    print(f"ffmpeg={'READY ' + str(ff) if ff else 'MISSING - run scripts/fetch-ffmpeg.ps1'}")
    server.serve_forever()


if __name__ == "__main__":
    main()
