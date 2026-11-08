"""Zip the built runtime folder for a manual release; output stays in .backup-scratch.

Sine installs from the repository folder, so this ZIP is optional. It contains
exactly the files of <repo>/context-menu-editor/ after `node build.mjs --check`.
"""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import zipfile

ROOT = Path(__file__).absolute().parent.parent
RUNTIME = ROOT.parents[1] / 'context-menu-editor'


def main():
    subprocess.run(['node', 'build.mjs', '--check'], cwd=ROOT, check=True)
    manifest = json.loads((RUNTIME / 'theme.json').read_text(encoding='utf-8'))
    version = manifest['version']
    if manifest['id'] != 'context-menu-editor' or not version.replace('.', '').isdigit():
        raise ValueError('Unexpected package identity')
    files = sorted(path for path in RUNTIME.rglob('*') if path.is_file())
    output_folder = ROOT / '.backup-scratch' / 'releases'
    output_folder.mkdir(parents=True, exist_ok=True)
    staging = output_folder / 'context-menu-editor.zip.part'
    output = output_folder / ('context-menu-editor-' + version + '.zip')
    with zipfile.ZipFile(staging, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            name = path.relative_to(RUNTIME).as_posix()
            if path.is_symlink() or name.startswith(('.', '/')) or '..' in name.split('/'):
                raise ValueError('Unsafe archive path: ' + name)
            entry = zipfile.ZipInfo(name, date_time=(2026, 10, 13, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, path.read_bytes())
    with zipfile.ZipFile(staging) as archive:
        if archive.testzip() is not None or len(archive.namelist()) != len(files):
            raise ValueError('Archive integrity check failed')
    os.replace(staging, output)
    print(json.dumps({'package': str(output), 'files': len(files), 'bytes': output.stat().st_size,
        'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}))


if __name__ == '__main__':
    main()
