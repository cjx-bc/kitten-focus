"""Print the final QA instrumentation selectors and counts from checked-out source. No device IO."""
import argparse
import json
from pathlib import Path
import re

CORE = [
    'FocusControlTest', 'CatFocusControlBridgeTest', 'FocusEngineTest', 'LockControlTest',
    'TemporaryAccessControlTest', 'RecoveryControlTest', 'FocusDndTest', 'FocusNotificationTest',
    'RecentTasksControlTest', 'MainEntryControlTest', 'AntiCloseControlTest', 'LauncherControlTest',
    'BackupProtectionTest', 'UpdateProtectionTest',
]
STUDY = 'StudyProtectionBridgeTest'
GROUPS = {
    'core': CORE,
    'final': CORE + ['WallpaperControlTest'],
    'study-policy': [STUDY + '#' + name for name in [
        'storedSettingsOverrideForgedClientPolicyAndOwnAppRemainsFixed',
        'savedCustomItemPolicyOverridesGlobalAndClientThenRemainsFrozen',
        'applicationPickerRetainsUninstalledPackagesFromIndependentItems',
    ]],
    'study-denied': [STUDY + '#rejectedAuthorizationNeverStartsAnUnprotectedStudySession'],
    'study-enabled': [STUDY + '#globalPolicyStaysFrozenAcrossSettingsChangesAndPauseThenReleasesAtRest'],
    'legacy-ui': ['ScrollLayoutTest', 'SwipeNavigationTest'],
    'notification-original': ['FocusNotificationTest', 'FocusNotificationDeviceTest'],
    'notification-lifecycle': ['FocusNotificationTest', 'FocusNotificationLifecycleDeviceTest'],
    'notification-reboot': ['FocusNotificationRebootDeviceTest'],
}


def plan(group, root):
    entries = []
    for selector in GROUPS[group]:
        class_name, _, method = selector.partition('#')
        source = root / 'android/app/src/androidTest/java/com/xiaomao/focus' / (class_name + '.java')
        if not source.is_file():
            raise ValueError(f'{class_name} is absent; merge its product source before final acceptance')
        text = source.read_text(encoding='utf-8')
        methods = re.findall(r'@Test\s+public\s+void\s+(\w+)\s*\(', text)
        if not methods or (method and method not in methods):
            raise ValueError(f'Test selector no longer exists: {selector}')
        if group in ('core', 'final') and re.search(r'\b(?:assumeTrue|assumeFalse|assumeNotNull|assumeNoException)\s*\(', text):
            raise ValueError(f'Permission/opt-in assumption must be run in its own prepared group: {class_name}')
        entries.append({'selector': 'com.xiaomao.focus.' + selector,
                        'tests': [method] if method else methods})
    return {'group': group, 'className': ','.join(e['selector'] for e in entries),
            'expectedTests': sum(len(e['tests']) for e in entries), 'entries': entries,
            'status': 'source inventory only; no tests have been executed'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--group', choices=GROUPS, default='final')
    parser.add_argument('--format', choices=['json', 'classes', 'count'], default='json')
    args = parser.parse_args()
    try:
        result = plan(args.group, Path(__file__).resolve().parent.parent)
    except ValueError as error:
        parser.error(str(error))
    print(result['className'] if args.format == 'classes' else result['expectedTests']
          if args.format == 'count' else json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
