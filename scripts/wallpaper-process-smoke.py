"""Measure production wallpaper association without reopening its Activity after death.

Requires an exclusive device lease, approved emulator and recorded disposable
secondary user. The known original must already be saved through the product UI.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

PACKAGE = "com.xiaomao.focus.qa"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--adb", required=True)
parser.add_argument("--serial", required=True)
parser.add_argument("--user", type=int, required=True)
parser.add_argument("--condition", choices=["unselected", "selected"], required=True)
parser.add_argument("--session-id", default="")
parser.add_argument("--seconds", type=int, default=15)
parser.add_argument("--out", type=Path, required=True)
args = parser.parse_args()
if args.serial != "emulator-5580" or args.user <= 0 or not 5 <= args.seconds <= 60:
    parser.error("Requires approved emulator, disposable secondary user and 5..60 seconds")
if args.condition == "selected" and not args.session_id:
    parser.error("Selected measurement requires the existing native session ID")
args.out.mkdir(parents=True, exist_ok=True)
base = [args.adb, "-s", args.serial]


def adb(*command, binary=False, check=True):
    result = subprocess.run(base + list(command), capture_output=True, timeout=30)
    if check and result.returncode:
        raise RuntimeError(result.stderr.decode(errors="replace") or result.stdout.decode(errors="replace"))
    return result.stdout if binary else result.stdout.decode(errors="replace").strip()


def shell(*command, **options):
    return adb("shell", *command, **options)


def own(*command):
    return shell("run-as", PACKAGE, "--user", str(args.user), *command)


def preferences(name, field, default):
    raw = own("cat", "shared_prefs/" + name + ".xml")
    element = next((row for row in ET.fromstring(raw) if row.attrib.get("name") == field), None)
    return json.loads(element.text) if element is not None else default


def events():
    return preferences("catfocus-wallpaper-lifecycle", "events", [])


def pid():
    matches = []
    for row in shell("ps", "-A", "-o", "USER,PID,NAME").splitlines()[1:]:
        parts = row.split()
        if len(parts) == 3 and parts[0].startswith("u" + str(args.user) + "_") and parts[2] == PACKAGE:
            matches.append(int(parts[1]))
    if len(matches) > 1:
        raise RuntimeError("Expected exactly one selected user's QA main process")
    return matches[0] if matches else None


if shell("am", "get-current-user") != str(args.user):
    raise RuntimeError("Current user differs from the recorded disposable user")
journal = preferences("catfocus-wallpaper-xiaomao-focus.db", "journal", {})
wallpaper = shell("dumpsys", "wallpaper")
section = re.search(r"User " + str(args.user) + r":.*?(?=\r?\n\s*(?:User \d+:|Lock wallpaper state:))", wallpaper, re.S)
selected = bool(section and "com.xiaomao.focus.FocusWallpaperService}" in section.group())
if selected != (args.condition == "selected"):
    raise RuntimeError("Actual home wallpaper differs from requested measurement")
if selected and (journal.get("phase") != "active" or journal.get("sessionId") != args.session_id or journal.get("withdrawn")):
    raise RuntimeError("Journal is not associated with the supplied existing active session")
shell("am", "start", "--user", str(args.user), "-a", "android.intent.action.MAIN", "-c", "android.intent.category.HOME")
time.sleep(2)
before_pid = pid()
if before_pid is None:
    raise RuntimeError("Open the product once and background it before the measurement")
before = events()
before_epoch = max((event.get("epochMs", 0) for event in before), default=0)
args.out.joinpath("before-events.json").write_text(json.dumps(before, indent=2), encoding="utf-8")
args.out.joinpath("before-journal.json").write_text(json.dumps(journal, indent=2), encoding="utf-8")
args.out.joinpath("before-wallpaper.txt").write_text(wallpaper, encoding="utf-8")
args.out.joinpath("before.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
started = time.monotonic()
own("kill", "-9", str(before_pid))
samples = []
while time.monotonic() - started < args.seconds:
    samples.append({"seconds": round(time.monotonic() - started, 3), "pid": pid()})
    time.sleep(.25)
after = events()
new = [event for event in after if event.get("epochMs", 0) > before_epoch and event.get("pid") != before_pid]
service = [event for event in new if event["event"] == "service_create"]
engine = [event for event in new if event["event"] == "engine_create" and event.get("preview") is False]
association = [event for event in new if event["event"] == "existing_session_reconciled" and event.get("sessionId") == args.session_id]
activity = [event for event in new if event["event"] == "activity_create"]
result = {
    "serial": args.serial, "user": args.user, "condition": args.condition,
    "api": shell("getprop", "ro.build.version.sdk"), "beforePid": before_pid,
    "existingSessionId": args.session_id, "oldPidGone": samples[-1]["pid"] != before_pid,
    "samples": samples, "newEvents": new,
    "serviceAndSelectedEngineBeforeActivity": bool(service and engine and not activity),
    "sameNativeSessionReconciledBeforeActivity": bool(service and engine and association and not activity),
    "forceStopClaim": False,
}
args.out.joinpath("result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
args.out.joinpath("after-events.json").write_text(json.dumps(after, indent=2), encoding="utf-8")
args.out.joinpath("after-wallpaper.txt").write_text(shell("dumpsys", "wallpaper"), encoding="utf-8")
args.out.joinpath("after.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
assert result["oldPidGone"], "The original process did not die"
if selected:
    assert result["sameNativeSessionReconciledBeforeActivity"], "No measured existing-session association before Activity"
else:
    assert not service and not engine and not association and not activity, "Unselected control unexpectedly revived; inspect evidence"
print(json.dumps({key: value for key, value in result.items() if key not in ["samples", "newEvents"]}, indent=2))
