"""Stage an APK; --publish atomically changes the selected update channel after approval."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import subprocess
import urllib.request

SSH = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=yes', '-o', 'HostKeyAlgorithms=ssh-ed25519', 'myserver']


def remote(source):
    return subprocess.check_output(SSH + ['python3 -'], input=source.encode('utf-8')).decode('utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apk', required=True, type=Path)
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--channel', default='stable')
    parser.add_argument('--publish', action='store_true', help='Only use after release approval; otherwise stage privately')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9-]+', args.channel):
        raise SystemExit('Invalid channel')
    manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
    release = manifest['release']
    filename = release['url'].split('/')[-1]
    if not re.fullmatch(r'xiaomao-focus-[a-zA-Z0-9.-]+\.apk', filename) or release['url'] != 'https://47.251.9.162/releases/' + filename:
        raise SystemExit('Unexpected download URL')
    if hashlib.sha256(args.apk.read_bytes()).hexdigest() != release['sha256'] or args.apk.stat().st_size != release['size']:
        raise SystemExit('APK changed after verification')
    remote("import os; os.makedirs('/opt/kitten-focus/candidates',exist_ok=True)\n")
    subprocess.check_call(['scp', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', str(args.apk), f'myserver:/opt/kitten-focus/candidates/{filename}.upload'])
    encoded = base64.b64encode(json.dumps(manifest, ensure_ascii=False).encode()).decode()
    source = """
import base64,json,hashlib,os,shutil
manifest=json.loads(base64.b64decode('%s').decode('utf-8'))
release=manifest['release']
name=release['url'].rsplit('/',1)[1]
source='/opt/kitten-focus/candidates/'+name+'.upload'
with open(source,'rb') as stream: digest=hashlib.sha256(stream.read()).hexdigest()
if digest!=release['sha256'] or os.path.getsize(source)!=release['size']:
    raise RuntimeError('Remote APK verification failed')
target='/opt/kitten-focus/candidates/'+name
os.replace(source,target)
print('Candidate staged and verified: '+name)
""" % encoded
    print(remote(source).strip())
    if not args.publish:
        print('No public update channel changed. Await release approval.')
        return
    source = """
import base64,json,hashlib,os,shutil,datetime
manifest=json.loads(base64.b64decode('%s').decode('utf-8'))
release=manifest['release']
name=release['url'].rsplit('/',1)[1]
source='/opt/kitten-focus/candidates/'+name
target='/opt/kitten-focus/public/releases/'+name
if os.path.exists(target):
    with open(target,'rb') as f: existing=hashlib.sha256(f.read()).hexdigest()
    if existing!=release['sha256']: raise RuntimeError('Published APK is immutable')
else:
    shutil.copyfile(source,target+'.part')
    os.replace(target+'.part',target)
""" % encoded
    remote(source)
    # Verify the publicly served bytes before advertising the release.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(release['url'], timeout=45) as response:
        data = response.read()
    if len(data) != release['size'] or hashlib.sha256(data).hexdigest() != release['sha256']:
        raise SystemExit('Public download verification failed; channel unchanged')
    source = """
import base64,json,os,datetime,shutil
manifest=json.loads(base64.b64decode('%s').decode('utf-8'))
path='/opt/kitten-focus/public/updates/%s.json'
archive='/opt/kitten-focus/manifest-history'
os.makedirs(archive,exist_ok=True)
if os.path.exists(path): shutil.copyfile(path,archive+'/%s-'+datetime.datetime.utcnow().strftime('%%Y%%m%%d%%H%%M%%S%%f')+'.json')
if os.path.exists(path):
    with open(path) as f: old=json.load(f).get('release')
    if old and old['versionCode']>manifest['release']['versionCode']: raise RuntimeError('Cannot publish a downgrade')
with open(path+'.part','w') as f:
    json.dump(manifest,f,ensure_ascii=False,indent=2)
    f.flush(); os.fsync(f.fileno())
os.replace(path+'.part',path)
print('Published channel: %s')
""" % (encoded, args.channel, args.channel, args.channel)
    print(remote(source).strip())
    with opener.open(f'https://47.251.9.162/updates/{args.channel}.json', timeout=15) as response:
        served = json.load(response)
    if served != manifest:
        raise SystemExit('Served manifest differs')
    print('HTTPS channel and APK verified.')


if __name__ == '__main__':
    main()
