"""Run the opt-in T11 dual-app fixture on the explicitly selected isolated QA emulator."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import threading


def main():
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--adb', type=Path, default=Path('D:/KittenFocus-Android/sdk/platform-tools/adb.exe'))
    parser.add_argument('--serial', default='emulator-5580')
    parser.add_argument('--aapt', type=Path, default=Path('E:/codexseeson/fanqiezhong/.tools/android-sdk/build-tools/36.0.0/aapt.exe'))
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if not re.fullmatch(r'emulator-\d+', args.serial):
        parser.error('Choose an explicit emulator serial')
    output = args.output
    output.mkdir(parents=True, exist_ok=True)
    device = [str(args.adb), '-s', args.serial]
    qa = 'com.xiaomao.focus.qa'
    sender = 'com.xiaomao.focus.probe.sender'
    listener = qa + '/com.xiaomao.focus.FocusNotificationListener'
    artifacts = {
        qa: root / 'android/app/build/outputs/apk/debug/app-debug.apk',
        qa + '.test': root / 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
        sender: root / 'tools/probes/notification/sender/build/outputs/apk/debug/sender-debug.apk',
    }

    def run(command, timeout=90):
        result = subprocess.run([str(value) for value in command], capture_output=True, text=True,
                                encoding='utf-8', errors='replace', timeout=timeout)
        if result.returncode:
            raise RuntimeError(result.stdout + result.stderr)
        return result.stdout

    def shell(*command, timeout=90):
        return run([*device, 'shell', *command], timeout=timeout)

    assert run([*device, 'get-state']).strip() == 'device'
    assert shell('getprop', 'ro.build.version.sdk').strip() == '36', 'This result must describe the API36 target'
    for package, apk in artifacts.items():
        info = run([args.aapt, 'dump', 'badging', apk])
        match = re.search(r"package: name='([^']+)'", info)
        assert match and match[1] == package, 'Refusing unexpected package identity: ' + str(apk)
    baseline_listeners = shell('settings', 'get', 'secure', 'enabled_notification_listeners').strip()
    sender_installed = 'package:' + sender in shell('pm', 'list', 'packages', sender).splitlines()
    sender_permission = shell('pm', 'check-permission', 'android.permission.POST_NOTIFICATIONS', sender).strip() == 'granted' if sender_installed else False
    listener_was_enabled = any(value in baseline_listeners.split(':') for value in
                               [listener, qa + '/.FocusNotificationListener'])
    metadata = {
        'startedAtUtc': datetime.now(timezone.utc).isoformat(), 'serial': args.serial,
        'api': 36, 'package': qa, 'sender': sender,
        'sha256': {package: hashlib.sha256(apk.read_bytes()).hexdigest() for package, apk in artifacts.items()},
        'listenerPreviouslyEnabled': listener_was_enabled, 'senderPreviouslyInstalled': sender_installed,
        'senderPermissionPreviouslyGranted': sender_permission,
    }
    (output / 'baseline.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    passed = False
    try:
        for package, apk in artifacts.items():
            (output / (package + '-install.txt')).write_text(run([*device, 'install', '-r', apk]), encoding='utf-8')
        if not sender_permission:
            shell('pm', 'grant', sender, 'android.permission.POST_NOTIFICATIONS')
        if not listener_was_enabled:
            shell('cmd', 'notification', 'allow_listener', listener)
        shell('am', 'start', '-n', qa + '/com.xiaomao.focus.MainActivity')
        command = [*device, 'shell', 'am', 'instrument', '-w', '-r', '-e', 'class',
                   'com.xiaomao.focus.FocusNotificationTest,com.xiaomao.focus.FocusNotificationDeviceTest',
                   '-e', 'runNotificationDeviceFixture', 'true', qa + '.test/androidx.test.runner.AndroidJUnitRunner']
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                   text=True, encoding='utf-8', errors='replace')
        timer = threading.Timer(180, process.kill)
        timer.start()
        lines = []
        reconnected = False
        try:
            for line in process.stdout:
                lines.append(line)
                if not reconnected and line.strip() == 'INSTRUMENTATION_STATUS_CODE: 1':
                    # Instrumentation restarts the target process. Rebind this exact component after it exists.
                    shell('cmd', 'notification', 'disallow_listener', listener)
                    shell('cmd', 'notification', 'allow_listener', listener)
                    reconnected = True
            process.wait(timeout=5)
        finally:
            timer.cancel()
        result = ''.join(lines)
        (output / 'instrumentation.txt').write_text(result, encoding='utf-8')
        passed = bool(re.search(r'OK \(8 tests\)', result)) and 'FAILURES!!!' not in result and 'INSTRUMENTATION_STATUS_CODE: -4' not in result
        print(result[-6000:])
    finally:
        # Sender withdraws its own synthetic fixture; the controller never cancels another app's notification.
        try:
            shell('am', 'broadcast', '-n', sender + '/.CommandReceiver', '--es', 'op', 'withdraw', '--ei', 'id', '21101')
            if not listener_was_enabled:
                shell('cmd', 'notification', 'disallow_listener', listener)
            if sender_installed and not sender_permission:
                shell('pm', 'revoke', sender, 'android.permission.POST_NOTIFICATIONS')
            if not sender_installed:
                run([*device, 'uninstall', sender])
            current = shell('settings', 'get', 'secure', 'enabled_notification_listeners').strip()
            # Android may replace null with an empty value after removing the last listener.
            if baseline_listeners == 'null' and not current:
                shell('settings', 'delete', 'secure', 'enabled_notification_listeners')
            metadata['listenerAfterCleanup'] = shell('settings', 'get', 'secure', 'enabled_notification_listeners').strip()
            metadata['cleanupCompleted'] = True
        finally:
            metadata['passed'] = passed
            metadata['finishedAtUtc'] = datetime.now(timezone.utc).isoformat()
            (output / 'result.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    if not passed:
        raise RuntimeError('Notification fixture failed; evidence: ' + str(output))


if __name__ == '__main__':
    main()
