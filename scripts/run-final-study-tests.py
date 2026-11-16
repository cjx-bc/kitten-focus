"""Run source-selected QA study or legacy tests, preserving exact accessibility settings."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import threading

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--group', required=True, choices=['study-policy', 'study-denied', 'study-enabled', 'legacy-ui'])
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
device = [os.environ['ADB'], '-s', os.environ['ANDROID_SERIAL']]
assert device[-1] == 'emulator-5580'
component = 'com.xiaomao.focus.qa/com.xiaomao.focus.FocusAccessibilityService'
args.output.mkdir(parents=True, exist_ok=True)

def run(*command):
    return subprocess.check_output([*device, *command], text=True, encoding='utf8', errors='replace', timeout=30)

def setting(key):
    return run('shell', 'settings', 'get', 'secure', key).strip()

def restore(key, value):
    run('shell', 'settings', 'delete' if value == 'null' else 'put', 'secure', key, *([] if value == 'null' else [value]))

baseline = {key: setting(key) for key in ['enabled_accessibility_services', 'accessibility_enabled']}
plan = json.loads(subprocess.check_output(['python', str(root / 'scripts/final-native-plan.py'), '--group', args.group], encoding='utf8'))
metadata = {'group': args.group, 'expectedTests': plan['expectedTests'], 'baseline': baseline}
try:
    existing = [] if baseline['enabled_accessibility_services'] in ['', 'null'] else baseline['enabled_accessibility_services'].split(':')
    other = [value for value in existing if value not in [component, 'com.xiaomao.focus.qa/.FocusAccessibilityService']]
    enabled = args.group == 'study-enabled'
    selected = [*other, component] if enabled else other
    restore('enabled_accessibility_services', ':'.join(selected) if selected else 'null')
    restore('accessibility_enabled', '1' if selected else '0')
    command = [*device, 'shell', 'am', 'instrument', '-w', '-r', '-e', 'class', plan['className'],
               'com.xiaomao.focus.qa.test/androidx.test.runner.AndroidJUnitRunner']
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf8', errors='replace')
    timer = threading.Timer(180, process.kill); timer.start()
    lines = []; rebound = False
    try:
        for line in process.stdout:
            lines.append(line)
            if enabled and not rebound and line.strip() == 'INSTRUMENTATION_STATUS_CODE: 1':
                # Exact QA component only; process restart must produce a real bound service.
                restore('enabled_accessibility_services', ':'.join(other) if other else 'null')
                restore('enabled_accessibility_services', ':'.join([*other, component]))
                restore('accessibility_enabled', '1'); rebound = True
        process.wait(timeout=5)
    finally:
        timer.cancel()
    result = ''.join(lines)
    (args.output / 'instrumentation.txt').write_text(result, encoding='utf8')
    metadata['skipped'] = len(re.findall(r'INSTRUMENTATION_STATUS_CODE: -[34]\b', result))
    metadata['passed'] = f"OK ({plan['expectedTests']} test" in result and 'FAILURES!!!' not in result and metadata['skipped'] == 0
    metadata['accessibilityReboundAfterInstrumentationStart'] = rebound
    print(result[-2500:])
finally:
    for key, value in baseline.items(): restore(key, value)
    metadata['afterCleanup'] = {key: setting(key) for key in baseline}
    metadata['cleanupCompleted'] = metadata['afterCleanup'] == baseline
    (args.output / 'result.json').write_text(json.dumps(metadata, indent=2), encoding='utf8')
assert metadata.get('passed') and metadata['cleanupCompleted'], 'QA group failed; inspect retained evidence'
