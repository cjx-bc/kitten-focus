"""Validate a locally built APK and create the server's release description."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SIGNER = 'dac507ed579b5fd68cd294c91759e60bdef23da30e427070d7e69e3100123cfe'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apk', required=True, type=Path)
    parser.add_argument('--notes-file', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    sdk = Path(os.environ.get('ANDROID_HOME', ROOT / '.tools/android-sdk'))
    build_tools = sdk / 'build-tools/35.0.0'
    badging = subprocess.check_output([str(build_tools / ('aapt.exe' if os.name == 'nt' else 'aapt')), 'dump', 'badging', str(args.apk)], text=True, encoding='utf-8')
    package = re.search(r"package: name='([^']+)' versionCode='([0-9]+)' versionName='([^']+)'", badging)
    if not package or package[1] != 'com.xiaomao.focus':
        raise SystemExit('Unexpected application ID')
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?', package[3]):
        raise SystemExit('Unexpected version name')
    signature = subprocess.check_output([str(build_tools / ('apksigner.bat' if os.name == 'nt' else 'apksigner')), 'verify', '--print-certs', str(args.apk)], text=True, encoding='utf-8')
    certificate = re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-f]+)', signature)
    if not certificate or certificate[1] != SIGNER:
        raise SystemExit('APK signing identity does not match existing installations')
    notes = args.notes_file.read_text(encoding='utf-8-sig').strip()
    if len(notes) > 6000:
        raise SystemExit('Release notes too long')
    filename = f'xiaomao-focus-{package[3]}.apk'
    release = {
        'applicationId': package[1], 'versionCode': int(package[2]), 'versionName': package[3],
        'minSdk': int(re.search(r"sdkVersion:'([0-9]+)'", badging)[1]),
        'url': f'https://47.251.9.162/releases/{filename}',
        'size': args.apk.stat().st_size, 'sha256': hashlib.sha256(args.apk.read_bytes()).hexdigest(), 'notes': notes,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({'schemaVersion': 1, 'release': release}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Validated {package[3]} / code {package[2]} / {release["size"]} bytes; release description saved.')


if __name__ == '__main__':
    main()
