"""Observe the two debug APKs through their exported command/event contracts.

No install, permission grant, setting mutation, reflection, cancel/repost recovery,
or access to notification text. Requires an already authorized isolated device.
"""
import argparse
import json
from pathlib import Path
import subprocess
import time
import re
import xml.etree.ElementTree as ET

SENDER = "com.xiaomao.focus.probe.sender"
CONTROLLER = "com.xiaomao.focus.probe.controller"


class Probe:
    def __init__(self, adb, serial, tap_position=None):
        self.prefix = [adb, "-s", serial]
        self.report = []
        self.tap_position = tap_position

    def shell(self, *args, check=True):
        return subprocess.run(self.prefix + ["shell", *map(str, args)],
                              text=True, capture_output=True, check=check).stdout

    def command(self, package, operation, **values):
        args = ["am", "broadcast", "-n", package + "/.CommandReceiver", "--es", "op", operation]
        for key, value in values.items():
            args.extend(["--el" if key == "duration_ms" else "--ei" if isinstance(value, int) else "--es",
                         key, str(value)])
        self.shell(*args)

    def rows(self, package=CONTROLLER):
        text = self.shell("run-as", package, "cat", "files/probe-events.jsonl", check=False)
        rows = []
        for line in text.splitlines():
            try:
                row = json.loads(line)
                if row.get("schema") == 1:
                    rows.append(row)
            except (ValueError, AttributeError):
                pass
        return rows

    def wait(self, predicate, timeout=12):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            result = predicate()
            if result:
                return result
            time.sleep(0.25)
        raise AssertionError("Timed out waiting for observed probe event/state")

    def event(self, name, notification_id, start=0):
        for row in self.rows()[start:]:
            details = row["details"]
            meta = details.get("notification", details)
            if row["event"] == name and meta.get("id") == notification_id:
                return row
        return None

    def snapshot(self):
        before = len(self.rows())
        self.command(CONTROLLER, "snapshot")
        return self.wait(lambda: next((r["details"] for r in self.rows()[before:]
                                      if r["event"] == "snapshot"), None))

    def post(self, notification_id, revision=1, kind="normal"):
        before = len(self.rows())
        self.command(SENDER, "post", id=notification_id, revision=revision, kind=kind)
        self.wait(lambda: self.event("notification_posted", notification_id, before))

    def hold(self, notification_id, duration=4000):
        start = len(self.rows())
        self.command(CONTROLLER, "hold", id=notification_id, duration_ms=duration)
        return self.wait(lambda: self.event("snooze_requested", notification_id, start))

    def snoozed(self, notification_id):
        self.wait(lambda: any(n["id"] == notification_id for n in self.snapshot()["snoozed"]))

    def result(self, name, **details):
        self.report.append({"scenario": name, "status": "observed", **details})
        print(json.dumps(self.report[-1], ensure_ascii=False), flush=True)

    def tap_original_notification(self, notification_id):
        # Only tap the unique synthetic title. Never persist or print shade text.
        self.shell("cmd", "statusbar", "expand-notifications")
        time.sleep(0.5)
        if self.tap_position:
            self.shell("input", "tap", *self.tap_position)
            return
        path = "/data/local/tmp/notification-probe-ui.xml"
        self.shell("uiautomator", "dump", path)
        root = ET.fromstring(self.shell("cat", path))
        title = f"Synthetic probe #{notification_id}"
        for node in root.iter("node"):
            if node.get("text") == title:
                values = list(map(int, re.findall(r"\d+", node.get("bounds", ""))))
                if len(values) == 4:
                    self.shell("input", "tap", (values[0] + values[2]) // 2, (values[1] + values[3]) // 2)
                    return
        raise AssertionError("Synthetic notification title not found in expanded shade")

    def normal(self):
        self.post(1101)
        before = len(self.rows())
        self.hold(1101)
        self.snoozed(1101)
        restored = self.wait(lambda: self.event("notification_reappeared", 1101, before))
        data = restored["details"]
        assert data["identityPreserved"] is True
        assert data["samePendingIntentInProcess"] is True
        assert data["notification"]["contentIntentCreatorPackage"] == SENDER
        sender_start = len(self.rows(SENDER))
        self.tap_original_notification(1101)
        click = self.wait(lambda: next((r for r in self.rows(SENDER)[sender_start:]
                                       if r["event"] == "content_intent_opened"
                                       and r["details"]["id"] == 1101), None))
        self.result("normal", delayFromPlannedMs=data["delayFromPlannedMs"],
                    originalIdentityAndClickObserved=True, click=click["details"])

    def early(self):
        self.post(1102)
        before = len(self.rows())
        self.hold(1102, 7000)
        self.snoozed(1102)
        self.command(CONTROLLER, "early_release", id=1102)
        self.wait(lambda: self.event("early_release_unavailable", 1102, before))
        assert any(n["id"] == 1102 for n in self.snapshot()["snoozed"])
        self.command(CONTROLLER, "resnooze_short", id=1102)
        time.sleep(0.5)
        shortly = self.snapshot()
        restored = self.wait(lambda: self.event("notification_reappeared", 1102, before))
        attempt = next(r for r in self.rows()[before:] if r["event"] == "resnooze_short_requested")
        assert restored["details"]["identityPreserved"] is True
        assert restored["details"]["samePendingIntentInProcess"] is True
        self.result("early", publicEarlyReleaseSupported=False,
                    snoozedAfterShortResnooze=any(n["id"] == 1102 for n in shortly["snoozed"]),
                    delayFromPlannedMs=restored["details"]["delayFromPlannedMs"],
                    delayFromShortResnoozeMs=restored["elapsedMs"]-attempt["elapsedMs"],
                    identityAndPendingIntentPreserved=True)

    def update(self):
        self.post(1103)
        before = len(self.rows())
        self.hold(1103, 5000)
        self.snoozed(1103)
        self.command(SENDER, "update", id=1103, revision=2)
        restored = self.wait(lambda: self.event("notification_reappeared", 1103, before))
        assert restored["details"]["notification"]["revision"] == 2
        self.result("update", restoredRevision=2,
                    identityPreserved=restored["details"]["identityPreserved"])

    def withdraw(self):
        self.post(1104)
        before = len(self.rows())
        self.hold(1104)
        self.snoozed(1104)
        self.command(SENDER, "withdraw", id=1104)
        time.sleep(4.5)
        state = self.snapshot()
        assert not any(n["id"] == 1104 for n in state["active"] + state["snoozed"])
        assert self.event("notification_reappeared", 1104, before) is None
        self.result("withdraw", withdrawnNotificationDidNotReappear=True)

    def group(self):
        start = len(self.rows())
        self.command(SENDER, "group", revision=1)
        for notification_id in (200, 201, 202):
            self.wait(lambda n=notification_id: self.event("notification_posted", n, start))
            self.command(CONTROLLER, "hold", id=notification_id, duration_ms=4000)
        time.sleep(5)
        state = self.snapshot()
        self.result("group", active=[n for n in state["active"] if n["id"] in (200, 201, 202)],
                    snoozed=[n for n in state["snoozed"] if n["id"] in (200, 201, 202)],
                    note="Grouping may cause system co-snooze or summary removal; inspect lifecycle events")

    def duplicate(self):
        self.command(SENDER, "duplicate", id=1105, revision=1)
        self.wait(lambda: any(n["id"] == 1105 and n["revision"] == 2 for n in self.snapshot()["active"]))
        state = self.snapshot()
        assert sum(n["id"] == 1105 for n in state["active"]) == 1
        self.hold(1105)
        self.snoozed(1105)
        before = len(self.rows())
        self.command(CONTROLLER, "hold", id=1105, duration_ms=4000)
        rejected = self.wait(lambda: self.event("hold_rejected", 1105, before))
        assert rejected["details"]["reason"] == "target_not_active"
        self.wait(lambda: any(n["id"] == 1105 for n in self.snapshot()["active"]))
        self.result("duplicate", oneActiveKey=True, secondHoldRejectedWhileSnoozed=True)

    def exceptions(self):
        for notification_id, kind in ((1401, "ongoing"), (1402, "call"), (1403, "alarm"), (1404, "full_screen")):
            self.post(notification_id, kind=kind)
            before = len(self.rows())
            self.command(CONTROLLER, "hold", id=notification_id, duration_ms=4000)
            rejected = self.wait(lambda: self.event("hold_rejected", notification_id, before))
            assert rejected["details"]["reason"] == "necessary_exception"
        self.command(CONTROLLER, "no_deadline", id=1401)
        self.wait(lambda: any(r["event"] == "hold_rejected" and r["details"].get("reason")
                             == "unsupported_no_deadline" for r in self.rows()))
        self.result("exceptions", ongoingCallAlarmAndFullScreenSkipped=True, noDeadlineRejected=True)

    def disconnect(self):
        self.post(1106)
        self.hold(1106, 4000)
        self.snoozed(1106)
        before = len(self.rows())
        self.command(CONTROLLER, "disconnect")
        self.command(CONTROLLER, "snapshot")
        self.wait(lambda: any(r["event"] == "command_rejected" and r["details"].get("reason")
                             == "listener_disconnected" for r in self.rows()[before:]))
        time.sleep(5)
        self.command(CONTROLLER, "rebind")
        self.wait(lambda: any(r["event"] == "listener_connected" for r in self.rows()[before:]))
        state = self.snapshot()
        assert any(n["id"] == 1106 for n in state["active"])
        assert not any(n["id"] == 1106 for n in state["snoozed"])
        self.result("disconnect", activeAfterRebind=True,
                    exactReappearanceTime="unobserved_while_listener_disconnected")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", required=True)
    parser.add_argument("--serial", required=True)
    cases = ("normal", "early", "update", "withdraw", "group", "duplicate", "exceptions", "disconnect")
    parser.add_argument("--case", choices=("all", *cases), default="all")
    parser.add_argument("--tap-position", nargs=2, type=int, metavar=("X", "Y"),
                        help="Fallback only after visually confirming the synthetic #1101 title at these shade coordinates")
    parser.add_argument("--output", type=Path, default=Path(__file__).parent / "results/device-run.json")
    args = parser.parse_args()
    probe = Probe(args.adb, args.serial, args.tap_position)
    failed = None
    try:
        probe.snapshot()  # Fails clearly if access has not been granted/connected.
        for name in cases if args.case == "all" else (args.case,):
            try:
                getattr(probe, name)()
            except Exception as error:
                failed = error
                probe.report.append({"scenario": name, "status": "failed",
                                     "exception": type(error).__name__, "message": str(error)})
                print(json.dumps(probe.report[-1], ensure_ascii=False), flush=True)
    except Exception as error:
        failed = error
        probe.report.append({"status": "failed", "exception": type(error).__name__, "message": str(error)})
    finally:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps({"results": probe.report,
            "senderEvents": probe.rows(SENDER), "controllerEvents": probe.rows()}, ensure_ascii=False, indent=2), encoding="utf-8")
    if failed:
        raise failed


if __name__ == "__main__":
    main()
