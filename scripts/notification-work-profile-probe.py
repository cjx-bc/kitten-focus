"""Bounded ordinary-listener visibility probe in one newly created isolated managed QA profile."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import time
from datetime import datetime, timezone

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
args.output.mkdir(parents=True, exist_ok=True)
adb = ['D:/KittenFocus-Android/sdk/platform-tools/adb.exe', '-s', 'emulator-5580']
sender = 'com.xiaomao.focus.probe.sender'
observer = 'com.xiaomao.focus.probe.controller'
component = observer + '/.ProbeListener'
name = 'KittenFocusNotificationQA'
notice_id = 21220

def run(*values, timeout=60):
    result = subprocess.run([*adb, *map(str, values)], text=True, encoding='utf-8', errors='replace', capture_output=True, timeout=timeout)
    if result.returncode: raise RuntimeError(result.stdout + result.stderr)
    return result.stdout

def shell(*values, **kw): return run('shell', *values, **kw)

assert shell('getprop', 'ro.build.version.sdk').strip() == '36'
listeners = shell('settings', 'get', 'secure', 'enabled_notification_listeners').strip()
users = shell('cmd', 'user', 'list', '-v')
installed = {p: 'package:' + p in shell('pm', 'list', 'packages', p).splitlines() for p in (sender, observer)}
metadata = {'startedAtUtc': datetime.now(timezone.utc).isoformat(), 'api': 36, 'serial': 'emulator-5580', 'listenersBefore': listeners,
            'usersBefore': users, 'packagesPreviouslyInstalled': installed, 'profileName': name, 'status': 'limited'}
profile = None
try:
    if 'profile.MANAGED' in users or name in users:
        metadata['reason'] = 'Existing managed profile present; no profile was modified'
    else:
        created = shell('pm', 'create-user', '--profileOf', '0', '--managed', name)
        metadata['createResult'] = created
        match = re.search(r'Success: created user id (\d+)', created)
        if not match:
            metadata['reason'] = 'System did not permit an isolated managed profile'
        else:
            profile = int(match[1]); assert profile != 0
            metadata['profileId'] = profile
            shell('am', 'start-user', '-w', str(profile))
            run('install', '-r', '--user', str(profile), root / 'tools/probes/notification/sender/build/outputs/apk/debug/sender-debug.apk')
            run('install', '-r', root / 'tools/probes/notification/controller/build/outputs/apk/debug/controller-debug.apk')
            shell('pm', 'grant', '--user', str(profile), sender, 'android.permission.POST_NOTIFICATIONS')
            shell('cmd', 'notification', 'allow_listener', component)
            time.sleep(2)
            shell('am', 'broadcast', '--user', str(profile), '-n', sender + '/.CommandReceiver', '--es', 'op', 'post', '--ei', 'id', str(notice_id))
            deadline = time.monotonic() + 10
            seen = False
            while time.monotonic() < deadline:
                shell('am', 'broadcast', '-n', observer + '/.CommandReceiver', '--es', 'op', 'snapshot')
                events = shell('run-as', observer, 'cat', 'files/probe-events.jsonl')
                for line in events.splitlines():
                    if not line.startswith('{'): continue
                    event = json.loads(line)
                    if event.get('event') != 'snapshot': continue
                    for notification in event.get('details', {}).get('active', []):
                        if notification.get('id') == notice_id and notification.get('uid', 0) // 100000 == profile:
                            seen = True
                if seen: break
                time.sleep(1)
            metadata['visibleToOrdinaryPersonalListener'] = seen
            metadata['reason'] = 'Synthetic work-profile original was visible to the personal ordinary listener' if seen else 'Synthetic work-profile original was not visible to the personal ordinary listener within the bounded observation; no work-profile interception is claimed'
            metadata['status'] = 'observed' if seen else 'limited'
            metadata['observerEvents'] = events
            probe = shell('logcat', '-d', '-s', 'NotificationProbe:I', '*:S')
            metadata['senderMetadata'] = [line for line in probe.splitlines() if '"id":21220' in line and '"actorUid":' in line]
except Exception as error:
    metadata['status'] = 'limited'
    metadata['reason'] = type(error).__name__ + ': ' + str(error)
finally:
    if profile is not None:
        current = shell('pm', 'list', 'users')
        assert re.search(r'UserInfo\{' + str(profile) + ':' + name + ':', current), 'Do not remove an unverified profile'
        shell('am', 'broadcast', '--user', str(profile), '-n', sender + '/.CommandReceiver', '--es', 'op', 'withdraw', '--ei', 'id', str(notice_id))
        metadata['removeResult'] = shell('pm', 'remove-user', str(profile))
        assert str(profile) + ':' + name not in shell('pm', 'list', 'users')
    if not any(observer in value for value in listeners.split(':')):
        shell('cmd', 'notification', 'disallow_listener', component)
    for package, existed in installed.items():
        if not existed and 'package:' + package in shell('pm', 'list', 'packages', package).splitlines(): run('uninstall', package)
    metadata['listenersAfter'] = shell('settings', 'get', 'secure', 'enabled_notification_listeners').strip()
    metadata['usersAfter'] = shell('cmd', 'user', 'list', '-v')
    metadata['finishedAtUtc'] = datetime.now(timezone.utc).isoformat()
    (args.output / 'result.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({key: metadata.get(key) for key in ['status', 'reason', 'profileId', 'removeResult']}, ensure_ascii=False))
