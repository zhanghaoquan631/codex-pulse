"""Export a sanitized source snapshot without private history or runtime records."""
from pathlib import Path
import argparse
import json
import re
import subprocess
import importlib.util

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('bundles', ROOT / 'scripts/prepare-source-library.py')
bundles = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bundles)

def export(destination):
    destination = destination.resolve()
    if destination == ROOT or ROOT in destination.parents:
        raise ValueError('Use a separate export directory outside the production checkout')
    if destination.exists() and any(destination.iterdir()):
        raise ValueError('Export destination must be empty; never overwrite another project')
    destination.mkdir(parents=True, exist_ok=True)
    raw = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=ROOT)
    files = sorted(set(raw.decode('utf-8').split('\0')) - {''})
    omitted, written = [], []
    for name in files:
        path = ROOT / name
        if not bundles.included(path) or (name.startswith('public/edge-scenes/') and not name.endswith('SOURCE.md')):
            omitted.append(name)
            continue
        if path.is_symlink() or not path.is_file():
            continue
        if name.endswith(('.pyc', '.tsbuildinfo')) or '__pycache__' in path.parts:
            continue
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if name == '.openai/hosting.json':
            config = json.loads(path.read_text(encoding='utf-8'))
            config.pop('project_id', None)
            target.write_text(json.dumps(config, indent=2) + '\n', encoding='utf-8')
        else:
            data = bundles.source_bytes(path)
            if name == 'integration/local-apps/billing-profiles.mjs':
                text = data.decode('utf-8')
                text = re.sub(r"label: '[^']*'", "label: 'Example profile'", text)
                data = text.encode('utf-8')
            target.write_bytes(data)
        written.append(name)
    # The scene adapter still exists. An independently-authored empty scene keeps
    # the embed boundary working without republishing someone else's artwork.
    for scene in ['cat', 'town']:
        path = destination / f'public/edge-scenes/{scene}.html'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>可选装饰场景</title><body style="margin:0;background:transparent"><script>parent.postMessage({type:"pulse:scene-ready"},location.origin)</script></body></html>', encoding='utf-8')
    # Optional animal thumbnails must not issue thousands of missing local URLs.
    placeholder = destination / 'public/local-apps/chaoshan-atlas/adventure/assets/animal-placeholder.svg'
    placeholder.parent.mkdir(parents=True, exist_ok=True)
    placeholder.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="2" y="2" width="60" height="60" rx="10" fill="#edf0e8"/><text x="32" y="39" font-size="17" text-anchor="middle" fill="#536453">资源</text></svg>', encoding='utf-8')
    catalog = destination / 'public/local-apps/chaoshan-atlas/adventure/animal-catalog-data.mjs'
    if catalog.exists():
        text = catalog.read_text(encoding='utf-8')
        text = re.sub(r'assets/desktop-animals/[^/"\s]+/preview\.png', 'assets/animal-placeholder.svg', text)
        catalog.write_text(text, encoding='utf-8')
    report = {'writtenFiles': len(written), 'omittedFiles': omitted,
              'personalAccounts': 'Replaced with example.com accounts',
              'runtimeData': 'Not exported', 'history': 'Not exported',
              'siteBinding': 'Removed from public hosting manifest',
              'optionalCharacter': 'Default traveler retained; restricted external skin omitted',
              'optionalIllustrations': 'Attribution and interfaces retained; artwork omitted'}
    (destination / 'SOURCE-EXPORT.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'exportedFiles': len(written), 'excludedFiles': len(omitted), 'destination': str(destination)}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('destination')
    export(Path(parser.parse_args().destination))
