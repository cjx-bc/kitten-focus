"""Install and test the separate QA package on an explicitly selected emulator."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess


def main():
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', default=os.environ.get('ANDROID_SERIAL'))
    parser.add_argument('--class-name', required=True)
    parser.add_argument('--app-apk', type=Path, default=root / 'android/app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--test-apk', type=Path, default=root / 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if not args.serial or not re.fullmatch(r'(?:emulator-\d+|127\.0\.0\.1:\d+)', args.serial):
        parser.error('Specify an emulator serial using --serial or ANDROID_SERIAL')
    adb = Path(os.environ.get('ADB', root / '.tools/android-sdk/platform-tools/adb.exe'))
    aapt = root / '.tools/android-sdk/build-tools/36.0.0/aapt.exe'

    def run(command, timeout=90):
        return subprocess.run([str(x) for x in command], capture_output=True, text=True,
                              encoding='utf-8', errors='replace', timeout=timeout, check=True).stdout

    info = run([aapt, 'dump', 'badging', args.app_apk])
    match = re.search(r"package: name='([^']+)'", info)
    if not match or not match[1].endswith('.qa'):
        raise RuntimeError('Refusing to install an APK without the isolated .qa application id')
    package = match[1]
    test_info = run([aapt, 'dump', 'xmltree', args.test_apk, 'AndroidManifest.xml'])
    if package not in test_info or 'androidx.test.runner.AndroidJUnitRunner' not in test_info:
        raise RuntimeError('Instrumentation does not target the isolated QA installation')
    device = [adb, '-s', args.serial]
    assert run([*device, 'get-state']).strip() == 'device', 'Emulator is not online'
    args.output.mkdir(parents=True, exist_ok=True)
    metadata = {
        'serial': args.serial, 'package': package,
        'class': args.class_name, 'startedAtUtc': datetime.now(timezone.utc).isoformat(),
        'appSha256': hashlib.sha256(args.app_apk.read_bytes()).hexdigest(),
        'testSha256': hashlib.sha256(args.test_apk.read_bytes()).hexdigest(),
        'protectedOriginalPackage': 'com.xiaomao.focus',
    }
    for label, apk in [('app', args.app_apk), ('test', args.test_apk)]:
        result = run([*device, 'install', '-r', apk])
        (args.output / (label + '-install.txt')).write_text(result, encoding='utf-8')
    result = run([*device, 'shell', 'am', 'instrument', '-w', '-r', '-e', 'class',
                  args.class_name, package + '.test/androidx.test.runner.AndroidJUnitRunner'], timeout=180)
    (args.output / 'instrumentation.txt').write_text(result, encoding='utf-8')
    metadata['passed'] = bool(re.search(r'OK \(\d+ tests?\)', result)) and 'FAILURES!!!' not in result
    metadata['finishedAtUtc'] = datetime.now(timezone.utc).isoformat()
    (args.output / 'result.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    print(result[-2200:])
    if not metadata['passed']:
        raise RuntimeError('QA instrumentation failed; see ' + str(args.output))
    print('Verified isolated package:', package)
    print('Evidence:', args.output)


if __name__ == '__main__':
    main()
