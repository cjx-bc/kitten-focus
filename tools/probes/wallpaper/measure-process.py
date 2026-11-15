"""Ordinary-UID process-death control; run only under the shared exclusive device lease."""
import argparse
import json
import pathlib
import re
import subprocess
import time

PACKAGE = "com.xiaomao.focus.wallpaperprobe"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--adb", required=True)
parser.add_argument("--serial", required=True)
parser.add_argument("--user", required=True, type=int)
parser.add_argument("--condition", required=True, choices=["selected", "unselected"])
parser.add_argument("--seconds", type=int, default=15)
parser.add_argument("--out", required=True, type=pathlib.Path)
args = parser.parse_args()
if args.user <= 0 or args.serial != "emulator-5580" or not 5 <= args.seconds <= 60:
    parser.error("Requires the exact disposable secondary user, approved serial, and 5..60 seconds")
args.out.mkdir(parents=True, exist_ok=True)
base = [args.adb, "-s", args.serial]

def adb(*command, binary=False):
    result = subprocess.run(base + list(command), capture_output=True, timeout=25)
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors="replace") or result.stdout.decode(errors="replace"))
    return result.stdout if binary else result.stdout.decode(errors="replace").strip()

def shell(*command):
    return adb("shell", *command)

def own(*command):
    return shell("run-as", PACKAGE, "--user", str(args.user), *command)

def pid():
    result = subprocess.run(base + ["shell", "pidof", PACKAGE], capture_output=True, timeout=10)
    value = result.stdout.decode().strip()
    if value and not value.isdigit():
        raise RuntimeError("Expected one exact main-process PID, found: " + value)
    return int(value) if value else None

def events():
    return [json.loads(line) for line in own("cat", "files/wallpaper-probe/events.jsonl").splitlines() if line]

if shell("am", "get-current-user") != str(args.user):
    raise RuntimeError("Current user differs from the recorded disposable user")
state = own("cat", "files/wallpaper-probe/session.properties")
selected = "status=ACTIVE" in state and "unresolved=true" in state
if selected != (args.condition == "selected"):
    raise RuntimeError("Journal does not match requested control condition")
wallpaper = shell("dumpsys", "wallpaper")
user_wallpaper = re.search(r"User " + str(args.user) + r":.*?(?=\r?\n\s*(?:User \d+:|Lock wallpaper state:))", wallpaper, re.S)
if user_wallpaper is None or ("ProbeWallpaperService}" in user_wallpaper.group()) != selected:
    raise RuntimeError("Actual user wallpaper differs from requested condition")
shell("am", "start", "--user", str(args.user), "-a", "android.intent.action.MAIN", "-c", "android.intent.category.HOME")
time.sleep(2)
before_pid = pid()
if before_pid is None:
    raise RuntimeError("Open the probe once, then background it, before measuring actual death")
before = events()
args.out.joinpath("before-events.jsonl").write_text("\n".join(json.dumps(e) for e in before), encoding="utf-8")
args.out.joinpath("before-state.properties").write_text(state, encoding="utf-8")
args.out.joinpath("before-wallpaper.txt").write_text(shell("dumpsys", "wallpaper"), encoding="utf-8")
args.out.joinpath("before.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
started = time.monotonic()
own("kill", "-9", str(before_pid))
samples = []
while time.monotonic() - started < args.seconds:
    samples.append({"seconds": round(time.monotonic() - started, 3), "pid": pid()})
    time.sleep(.25)
after = events()
new_events = after[len(before):]
new_service = [e for e in new_events if e["event"] == "service_create" and e["pid"] != before_pid]
selected_engine = [e for e in new_events if e["event"] == "engine_create" and e["detail"] == "preview=false" and e["pid"] != before_pid]
new_activity = [e for e in new_events if e["event"] == "activity_create"]
result = {
    "condition": args.condition, "api": shell("getprop", "ro.build.version.sdk"),
    "user": args.user, "seconds": args.seconds, "beforePid": before_pid,
    "oldPidGone": samples[-1]["pid"] != before_pid,
    "firstOldPidDisappearanceSeconds": next((s["seconds"] for s in samples if s["pid"] != before_pid), None),
    "samples": samples,
    "newServiceBeforeManualActivity": bool(new_service and selected_engine and not new_activity),
    "newActivityEvents": new_activity, "newLifecycleEvents": new_events,
}
args.out.joinpath("result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
args.out.joinpath("after-events.jsonl").write_text("\n".join(json.dumps(e) for e in after), encoding="utf-8")
args.out.joinpath("after-wallpaper.txt").write_text(shell("dumpsys", "wallpaper"), encoding="utf-8")
args.out.joinpath("after.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
print(json.dumps({k: v for k, v in result.items() if k not in ["samples", "newLifecycleEvents"]}, indent=2))
