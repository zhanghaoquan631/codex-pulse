"""Prepare reviewable code bundles from explicit project files, never runtime data."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TEXT = {'.js', '.mjs', '.cjs', '.ts', '.tsx', '.css', '.html', '.md', '.txt', '.json', '.svg', '.sql', '.py', '.ps1', '.cmd', '.sh', '.yml', '.yaml'}
CODE = {'.js', '.mjs', '.cjs', '.ts', '.tsx', '.css', '.html'}
NAMES = {'README.md', 'package.json', 'LICENSE', 'LICENSE.md', 'LICENSES.md', 'SOURCE-NOTES.md', 'REFERENCE-LICENSES.txt'}
EXCLUDED = {'node_modules', '.git', '.cache', 'qa', 'outputs', 'work', '.wrangler', '.sites-runtime', 'RECON', 'yae-miko', '__pycache__'}

def private_emails():
    path = ROOT / 'lib/account-query.ts'
    line = next((line for line in path.read_text(encoding='utf-8').splitlines() if line.startswith('export const queryAccounts=')), '')
    return sorted(set(re.findall(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}', line)))

def sanitize(text):
    for index, email in enumerate(private_emails(), 1):
        text = text.replace(email, f'account{index}@example.com')
    # Remove personal absolute paths, including JSON-escaped Windows paths.
    text = re.sub(r'C:([/\\]+)Users([/\\]+)[^/\\\s"\']+', lambda m: 'C:' + m[1] + 'Users' + m[2] + 'your-user', text, flags=re.I)
    return text

def import_map(source, name):
    source = Path(source).resolve()
    if not (source / 'app.js').is_file() or not (source / 'package.json').is_file():
        raise ValueError(f'Not an editable map project: {source.name}')
    target = ROOT / 'examples' / name
    target.mkdir(parents=True, exist_ok=True)
    paths = [p for p in source.iterdir() if p.is_file() and p.suffix in {'.js', '.mjs', '.css', '.html', '.json'}]
    paths += [p for folder in ['public', 'scripts'] for p in (source / folder).rglob('*') if p.is_file()]
    paths += [p for p in [source / 'README.md'] if p.is_file()]
    for path in paths:
        relative = path.relative_to(source)
        if set(relative.parts) & EXCLUDED or path.suffix in {'.log', '.zip', '.sqlite', '.db'}:
            continue
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if path.suffix in TEXT:
            destination.write_text(sanitize(path.read_text(encoding='utf-8-sig')), encoding='utf-8')
        else:
            shutil.copyfile(path, destination)
    (target / 'SOURCE-NOTES.md').write_text(
        '# Editable map source\n\nThis is the separately maintained editable map snapshot imported on 2026-09-30. '
        'The exact deployed Codex Pulse map runtime remains under public/local-apps/chaoshan-atlas; '
        'do not automatically replace its reviewed runtime with this example.\n\n'
        'Install with npm ci, then npm run dev or npm run build. Cached geographic preparation inputs '
        'are not bundled; the already prepared public/data snapshot is included.\n\n'
        'The base atlas renderer/style was adapted from Seoul 3D Atlas; no blanket relicense is asserted. '
        'Keep REFERENCE-LICENSES.txt, photo credits and all source notices. See repository LICENSES.md.\n', encoding='utf-8')

def included(path):
    relative = path.relative_to(ROOT)
    if relative.as_posix() == 'collector/config.json' or relative.as_posix().startswith('collector/data/'):
        return False
    if set(relative.parts) & EXCLUDED or path.name.startswith('.env') or path.suffix in {'.log', '.sqlite', '.db', '.jsonl', '.dpapi', '.pem', '.pyc'} or path.name == 'appearance-yae-miko.png':
        return False
    # These image collections have provenance but no repository redistribution grant.
    if 'opc-images' in relative.parts or ('desktop-animals' in relative.parts and path.suffix.lower() in {'.png', '.webp', '.jpg', '.jpeg', '.gif'}):
        return False
    return path.is_file()

def project_files(identifier):
    if identifier == 'chaoshan-map':
        folders = ['examples/chaoshan-3d-map', 'integration/chaoshan-atlas', 'integration/chaoshan-community', 'integration/atlas-lighting', 'public/local-apps/chaoshan-atlas']
    elif identifier == 'chaoshan-adventure':
        folders = ['public/local-apps/chaoshan-atlas/adventure']
    elif identifier == 'rooster-rush':
        folders = ['public/games/rooster-rush']
    else:
        folders = ['examples/xiamen-3d-map']
    result = []
    for folder in folders:
        for path in (ROOT / folder).rglob('*'):
            if not included(path):
                continue
            rel = path.relative_to(ROOT).as_posix()
            if identifier == 'chaoshan-map' and '/adventure/' in rel:
                continue
            if path.name.endswith(('report.json', 'verification.json', '-qa.json')):
                continue
            result.append(path)
    return sorted(set(result))

def source_bytes(path):
    if path.suffix not in TEXT:
        return path.read_bytes()
    text = sanitize(path.read_text(encoding='utf-8-sig'))
    if path.name == 'player-appearance.mjs':
        text = re.sub(r"\s*Object\.freeze\(\{\s*id: 'yae-miko',.*?\}\),", '', text, flags=re.S)
    if path.name == 'animal-catalog-data.mjs':
        text = re.sub(r'assets/desktop-animals/[^/"\s]+/preview\.png', 'assets/animal-placeholder.svg', text)
    if path.name == 'appearance-panel.mjs':
        text = re.sub(r"^\s*\{id: 'yae-miko'.*?\},\s*$", '', text, flags=re.M)
        text = re.sub(r'<small class="appearance-credit">.*?</small>', '', text)
    return text.encode('utf-8')

def bundle(identifier):
    files = project_files(identifier)
    destination = ROOT / 'public/source-library'
    destination.mkdir(parents=True, exist_ok=True)
    archive_dir = ROOT / 'work/source-packages'
    archive_dir.mkdir(parents=True, exist_ok=True)
    instructions = (
        '# Codex Pulse source bundle\n\nProject: ' + identifier + '\n\n'
        'The sections below contain actual editable code, not a repository URL. Restore the relative paths '
        'after each ===== FILE: marker. Download the ZIP to preserve file boundaries and data.\n\n'
        'The original map examples and the deployed runtime are both retained and identified separately. '
        'Geographic data and binary assets are in the ZIP, not this clipboard text. '
        'Restricted character assets and unlicensed image collections are not redistributed. '
        'The default traveler remains playable; third-party sprite providers can be configured independently.\n\n'
        'Run the hosted static game from the ZIP root using python -m http.server 8080, then open '
        'the project path below. Map examples: cd examples/<map>; npm ci; npm run dev.\n'
    )
    code_sections = [instructions]
    hashes = []
    with zipfile.ZipFile(archive_dir / (identifier + '.zip'), 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        archive.writestr('README-SOURCE.txt', instructions)
        archive.writestr('LICENSES.md', (ROOT / 'LICENSES.md').read_bytes())
        archive.writestr('licenses/SOURCE-ACTIONS-MIT.txt', (ROOT / 'licenses/SOURCE-ACTIONS-MIT.txt').read_bytes())
        if identifier == 'chaoshan-adventure':
            archive.writestr('public/local-apps/chaoshan-atlas/adventure/assets/animal-placeholder.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#edf0e8"/><text x="32" y="39" text-anchor="middle" font-size="17" fill="#536453">资源</text></svg>')
        for path in files:
            name = path.relative_to(ROOT).as_posix()
            data = source_bytes(path)
            archive.writestr(name, data)
            hashes.append({'path': name, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})
            # Vendor code remains in the ZIP; clipboard text focuses on application modules.
            if (path.suffix in CODE or path.name in NAMES) and 'vendor' not in path.parts:
                code_sections.append(f'\n\n===== FILE: {name} =====\n' + data.decode('utf-8'))
        archive.writestr('FILES.json', json.dumps(hashes, ensure_ascii=False, indent=2))
    text = '\n'.join(code_sections)
    (destination / (identifier + '.txt')).write_text(text, encoding='utf-8')
    size = (archive_dir / (identifier + '.zip')).stat().st_size
    if len(text.encode('utf-8')) >= 25 * 1024 * 1024:
        raise ValueError(f'{identifier} clipboard text exceeds hosting asset size')
    return {'id': identifier, 'files': len(files), 'textBytes': len(text.encode('utf-8')), 'zipBytes': size}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--chaoshan')
    parser.add_argument('--xiamen')
    args = parser.parse_args()
    if args.chaoshan: import_map(args.chaoshan, 'chaoshan-3d-map')
    if args.xiamen: import_map(args.xiamen, 'xiamen-3d-map')
    result = [bundle(identifier) for identifier in ['chaoshan-map', 'chaoshan-adventure', 'rooster-rush', 'xiamen-map']]
    (ROOT / 'public/source-library/manifest.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result))
