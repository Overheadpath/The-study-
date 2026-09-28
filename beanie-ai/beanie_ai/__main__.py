"""Start Beanie AI:  python -m beanie_ai  [--port N] [--no-browser] [--selftest]"""

import argparse
import json
import os
import sys
import tempfile
import threading
import urllib.request
import webbrowser

from . import APP_NAME, VERSION, config


def _console_safe():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass


def _already_running(port):
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(f"http://127.0.0.1:{port}/api/status", timeout=2) as r:
            return json.loads(r.read().decode("utf-8")).get("app") == APP_NAME
    except Exception:
        return False


def selftest():
    """Make a test clip, edit it, render it, and poke the web server. Exit code 0 = all good."""
    os.environ["BEANIE_AI_HOME"] = tempfile.mkdtemp(prefix="beanie-selftest-")
    from . import ffmpeg_tools as ff
    from . import plan as P
    from . import server

    print(f"ffmpeg: {ff.ffmpeg_exe()} ({ff.ffmpeg_version()}), video encoder: {ff.h264_args('export')[1]}")
    work = tempfile.mkdtemp(prefix="beanie-selftest-clip-")
    clip = os.path.join(work, "Roblox 2026-01-01 12-00-00.mp4")
    ff.run(["-f", "lavfi", "-i", "color=c=black:s=1280x720:r=60:d=1.5",
            "-f", "lavfi", "-i", "testsrc2=s=1280x720:r=60:d=8",
            "-f", "lavfi", "-i", "anoisesrc=d=9.5:c=pink:a=0.02:r=48000",
            "-f", "lavfi", "-i", "aevalsrc='0.8*sin(2*PI*880*t)*between(t,5,5.3)':d=9.5:s=48000",
            "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0,format=yuv420p[v];[2:a][3:a]amix=inputs=2:normalize=0[a]",
            "-map", "[v]", "-map", "[a]", "-c:v", ff.h264_args("draft")[1], "-c:a", "aac", clip])
    srv, app = server.make_server(port=7519, tries=50)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    done = threading.Event()
    project = app.store.create(src_path=clip, filename=os.path.basename(clip), on_ready=lambda p: done.set())
    if not done.wait(120) or project.data["status"] != "ready":
        print("FAILED: analysis", project.data.get("error"))
        return 1
    print("analysis:", json.dumps({k: project.analysis[k] for k in ("highlight", "dead_start", "dead_end")}))
    result = project.apply([{"do": "apply_skill", "skill": "steal_w"}, {"do": "sticker", "emoji": "💀", "at": 3}])
    print("edit:", "; ".join(result.done), "| warnings:", result.warnings)
    for o in P.overlays(project.plan):
        ff.run(["-f", "lavfi", "-i", "color=c=red@0.8:s=400x160:d=0.04,format=rgba", "-frames:v", "1",
                str(project.overlay_dir / f"{o['key']}.png")])

    base = f"http://127.0.0.1:{app.port}"
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    status = json.loads(opener.open(base + "/api/status", timeout=30).read())
    page = opener.open(base + "/", timeout=10).read()
    assert status["app"] == APP_NAME and b"Beanie" in page, "server check"
    for quality in ("preview", "export"):
        req = urllib.request.Request(base + f"/api/projects/{project.id}/render", method="POST",
                                     data=json.dumps({"quality": quality}).encode(),
                                     headers={"X-Beanie": "1", "Content-Type": "application/json"})
        events = [json.loads(line) for line in opener.open(req, timeout=600).read().decode().splitlines() if line]
        last = events[-1]
        if last.get("type") != "done":
            print("FAILED: render", quality, last)
            return 1
        print(f"{quality}: {last['file']} {last['details']['width']}x{last['details']['height']} "
              f"{last['details']['duration']}s {last['details']['fps']}fps warnings={last['details']['warnings']}")
    srv.shutdown()
    print("SELFTEST OK")
    return 0


def main(argv=None):
    _console_safe()
    ap = argparse.ArgumentParser(prog="beanie_ai", description=f"{APP_NAME} {VERSION}")
    ap.add_argument("--port", type=int, default=config.DEFAULT_PORT)
    ap.add_argument("--no-browser", action="store_true", help="don't open the browser")
    ap.add_argument("--selftest", action="store_true", help="check that everything works, then quit")
    args = ap.parse_args(argv)
    if args.selftest:
        return selftest()

    from . import ffmpeg_tools as ff
    from . import server

    print(f"\n  {APP_NAME} {VERSION}")
    print("  ----------------")
    if _already_running(args.port):
        url = f"http://127.0.0.1:{args.port}"
        print(f"  Already running. Opening {url}")
        if not args.no_browser:
            webbrowser.open(url)
        return 0
    try:
        print(f"  Video tools: ffmpeg {ff.ffmpeg_version()}")
    except ff.FFmpegError as e:
        print(f"  PROBLEM: {e}")
        return 1
    srv, app = server.make_server(args.port)
    url = f"http://127.0.0.1:{app.port}"
    print(f"  Your videos go to: {config.exports_dir()}")
    print(f"\n  Beanie AI is running at {url}")
    print("  Keep this window open while you edit. Close it (or press Ctrl+C) to quit.\n")
    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        print("  Bye!")
    finally:
        srv.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
