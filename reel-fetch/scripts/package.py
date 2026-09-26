"""Create a portable source release without credentials or cached media."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib

root = Path(__file__).resolve().parent.parent
output = root.parent / 'reel-fetch-hosting.zip'
files = [root / name for name in (
    'server.mjs', 'lib.mjs', 'network.mjs', 'processing.mjs', 'runtime.mjs',
    'site.mjs', 'package.json', 'requirements.txt', 'README.md', 'DEPLOY.md',
    'Dockerfile', 'compose.yaml', 'Caddyfile', '.env.example', '.dockerignore', '.gitignore',
    'public/home.html', 'public/app.js', 'public/premium.css', 'public/favicon.svg',
    'public/assets/reel-covers.webp', 'public/assets/IMAGE-NOTES.md', 'scripts/package.py',
)]
files.extend(sorted((root / 'test').glob('*.mjs')))
with ZipFile(output, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
    for file in files:
        archive.write(file, 'reel-fetch/' + file.relative_to(root).as_posix())
with ZipFile(output) as archive:
    assert archive.testzip() is None
    assert len(archive.namelist()) == len(files)
    for name in archive.namelist():
        assert not any(part in {'.env', '.local-config.json', '.cache', '.vendor', '.git'} for part in Path(name).parts)
print(f'{output}\n{len(files)} files; {output.stat().st_size:,} bytes')
print('SHA256: ' + hashlib.sha256(output.read_bytes()).hexdigest())
