"""Run the opt-in original-notification dual-app fixtures on the explicitly selected isolated QA emulator."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import threading
import time


def main():
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--adb', type=Path, default=Path('D:/KittenFocus-Android/sdk/platform-tools/adb.exe'))
    parser.add_argument('--serial', default='emulator-5580')
    parser.add_argument('--aapt', type=Path, default=Path('E:/codexseeson/fanqiezhong/.tools/android-sdk/build-tools/36.0.0/aapt.exe'))
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--reboot', action='store_true', help='Run explicit prepare/verify phases around a real isolated-emulator reboot')
    parser.add_argument('--classes', default='com.xiaomao.focus.FocusNotificationTest,com.xiaomao.focus.FocusNotificationDeviceTest')
    parser.add_argument('--lifecycle', action='store_true', help='Enable isolated QA accessibility and opt into lifecycle original-notification fixture')
    parser.add_argument('--timeout', type=int, default=180)
    parser.add_argument('--expected-tests', type=int, default=23,
                        help='Exact seam plus opt-in device case count for this checkout')
    parser.add_argument('--observed-tap', help='Optional x,y tap coordinates after visually inspecting the synthetic original card in the shade screenshot')
    args = parser.parse_args()
    if args.expected_tests < 1:
        parser.error('--expected-tests must be positive')
    if args.observed_tap is not None and not re.fullmatch(r'\d+,\d+', args.observed_tap):
        parser.error('--observed-tap must be x,y integer coordinates')
    if not re.fullmatch(r'emulator-\d+', args.serial):
        parser.error('Choose an explicit emulator serial')
    output = args.output
    output.mkdir(parents=True, exist_ok=True)
    device = [str(args.adb), '-s', args.serial]
    qa = 'com.xiaomao.focus.qa'
    sender = 'com.xiaomao.focus.probe.sender'
    listener = qa + '/com.xiaomao.focus.FocusNotificationListener'
    observer = 'com.xiaomao.focus.probe.controller'
    observer_listener = observer + '/.ProbeListener'
    artifacts = {
        qa: root / 'android/app/build/outputs/apk/debug/app-debug.apk',
        qa + '.test': root / 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
        sender: root / 'tools/probes/notification/sender/build/outputs/apk/debug/sender-debug.apk',
    }

    if args.lifecycle:
        artifacts[observer] = root / 'tools/probes/notification/controller/build/outputs/apk/debug/controller-debug.apk'

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
    baseline_accessibility = shell('settings', 'get', 'secure', 'enabled_accessibility_services').strip()
    baseline_accessibility_enabled = shell('settings', 'get', 'secure', 'accessibility_enabled').strip()
    accessibility = qa + '/com.xiaomao.focus.FocusAccessibilityService'
    observer_installed = 'package:' + observer in shell('pm', 'list', 'packages', observer).splitlines()
    observer_was_enabled = any(observer in value for value in baseline_listeners.split(':'))
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
        'observerPreviouslyInstalled': observer_installed, 'observerListenerPreviouslyEnabled': observer_was_enabled,
        'listenerBaseline': baseline_listeners, 'accessibilityBaseline': baseline_accessibility,
        'accessibilityEnabledBaseline': baseline_accessibility_enabled,
        'expectedTests': args.expected_tests,
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
        if args.lifecycle:
            if not observer_was_enabled: shell('cmd', 'notification', 'allow_listener', observer_listener)
            current = [] if baseline_accessibility in ('null', '') else baseline_accessibility.split(':')
            if accessibility not in current:
                shell('settings', 'put', 'secure', 'enabled_accessibility_services', ':'.join([*current, accessibility]))
            shell('settings', 'put', 'secure', 'accessibility_enabled', '1')
        shell('am', 'start', '-n', qa + '/com.xiaomao.focus.MainActivity')
        command = [*device, 'shell', 'am', 'instrument', '-w', '-r', '-e', 'class',
                   args.classes,
                   '-e', 'runNotificationDeviceFixture', 'true']
        if args.lifecycle:
            command += ['-e', 'runNotificationLifecycleFixture', 'true']
        if args.reboot:
            command += ['-e', 'runNotificationRebootPhase', 'prepare']
        if args.observed_tap:
            command += ['-e', 'notificationObservedTap', args.observed_tap]
        command += [qa + '.test/androidx.test.runner.AndroidJUnitRunner']
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                   text=True, encoding='utf-8', errors='replace')
        timer = threading.Timer(args.timeout, process.kill)
        timer.start()
        lines = []
        reconnected = False
        diagnostic = None
        def capture_shade():
            result = subprocess.run([*device, 'exec-out', 'screencap', '-p'], capture_output=True, timeout=10)
            if result.returncode == 0:
                (output / 'original-notification-shade.png').write_bytes(result.stdout)
        try:
            for line in process.stdout:
                lines.append(line)
                if ('test=originalNotificationReturnsAtDeadlineAndActualShadeClickOpensSender' in line or 'test=earlyFinishRestoresUpdatedOriginalAndRealShadeClick' in line) and diagnostic is None:
                    diagnostic = threading.Timer(4 if args.lifecycle else 10, capture_shade)
                    diagnostic.start()
                if not reconnected and line.strip() == 'INSTRUMENTATION_STATUS_CODE: 1':
                    # Instrumentation restarts the target process. Rebind this exact component after it exists.
                    shell('cmd', 'notification', 'disallow_listener', listener)
                    shell('cmd', 'notification', 'allow_listener', listener)
                    if args.lifecycle:
                        current = shell('settings', 'get', 'secure', 'enabled_accessibility_services').strip().split(':')
                        remaining = ':'.join(value for value in current if value != accessibility)
                        if remaining: shell('settings', 'put', 'secure', 'enabled_accessibility_services', remaining)
                        else: shell('settings', 'delete', 'secure', 'enabled_accessibility_services')
                        shell('settings', 'put', 'secure', 'enabled_accessibility_services', ':'.join(current))
                    reconnected = True
            process.wait(timeout=5)
        finally:
            timer.cancel()
            if diagnostic is not None:
                diagnostic.join(timeout=12)
        result = ''.join(lines)
        (output / 'instrumentation.txt').write_text(result, encoding='utf-8')
        passed = bool(re.search(r'OK \(' + str(args.expected_tests) + r' tests?\)', result)) and 'FAILURES!!!' not in result and 'INSTRUMENTATION_STATUS_CODE: -4' not in result
        print(result[-6000:])
        if args.reboot and passed:
            metadata['rebootRequestedAtUtc'] = datetime.now(timezone.utc).isoformat()
            run([*device, 'reboot'])
            run([*device, 'wait-for-device'], timeout=120)
            deadline = time.monotonic() + 120
            while shell('getprop', 'sys.boot_completed').strip() != '1':
                if time.monotonic() >= deadline: raise RuntimeError('Reboot did not finish')
                time.sleep(1)
            shell('input', 'keyevent', 'WAKEUP')
            shell('wm', 'dismiss-keyguard')
            shell('am', 'start', '-n', qa + '/com.xiaomao.focus.MainActivity')
            verify_command = [value if value != 'prepare' else 'verify' for value in command]
            verify = subprocess.Popen(verify_command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
            reboot_timer = threading.Timer(120, verify.kill); reboot_timer.start()
            verify_lines = []; reconnected = False
            try:
                for line in verify.stdout:
                    verify_lines.append(line)
                    if not reconnected and line.strip() == 'INSTRUMENTATION_STATUS_CODE: 1':
                        shell('cmd', 'notification', 'disallow_listener', listener)
                        shell('cmd', 'notification', 'allow_listener', listener)
                        reconnected = True
                verify.wait(timeout=5)
            finally: reboot_timer.cancel()
            verification = ''.join(verify_lines)
            (output / 'post-reboot-instrumentation.txt').write_text(verification, encoding='utf-8')
            passed = 'OK (1 test)' in verification and 'FAILURES!!!' not in verification and 'INSTRUMENTATION_STATUS_CODE: -4' not in verification
            print(verification[-6000:])
            metadata['rebootVerifiedAtUtc'] = datetime.now(timezone.utc).isoformat()

    finally:
        # Sender withdraws its own synthetic fixture; the controller never cancels another app's notification.
        try:
            shell('am', 'broadcast', '-n', sender + '/.CommandReceiver', '--es', 'op', 'withdraw', '--ei', 'id', '21101')
            shell('am', 'broadcast', '-n', sender + '/.CommandReceiver', '--es', 'op', 'withdraw', '--ei', 'id', '21201')
            shell('am', 'broadcast', '-n', sender + '/.CommandReceiver', '--es', 'op', 'withdraw', '--ei', 'id', '21209')
            if args.lifecycle:
                if not observer_was_enabled: shell('cmd', 'notification', 'disallow_listener', observer_listener)
                if not observer_installed: run([*device, 'uninstall', observer])
                for key, value in [('enabled_accessibility_services', baseline_accessibility), ('accessibility_enabled', baseline_accessibility_enabled)]:
                    if value == 'null': shell('settings', 'delete', 'secure', key)
                    else: shell('settings', 'put', 'secure', key, value)
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
            cutoff = datetime.fromisoformat(metadata['startedAtUtc']).strftime('%m-%d %H:%M:%S')
            logs = shell('logcat', '-d', '-s', 'FocusNotificationDeviceTest:I', 'FocusNotificationLifecycleDeviceTest:I', 'FocusNotificationRebootDeviceTest:I', '*:S')
            metadata['fixtureMetadata'] = '\n'.join(line for line in logs.splitlines() if line[:14] >= cutoff)
            metadata['listenerAfterCleanup'] = shell('settings', 'get', 'secure', 'enabled_notification_listeners').strip()
            metadata['accessibilityAfterCleanup'] = shell('settings', 'get', 'secure', 'enabled_accessibility_services').strip()
            metadata['accessibilityEnabledAfterCleanup'] = shell('settings', 'get', 'secure', 'accessibility_enabled').strip()
            metadata['cleanupCompleted'] = True
        finally:
            metadata['passed'] = passed
            metadata['finishedAtUtc'] = datetime.now(timezone.utc).isoformat()
            (output / 'result.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    if not passed:
        raise RuntimeError('Notification fixture failed; evidence: ' + str(output))


if __name__ == '__main__':
    main()
