import sys
from pathlib import Path


repo_root = Path(SPEC).resolve().parents[2]
service_src = repo_root / 'apps' / 'service' / 'src'
frontend_dist = repo_root / 'apps' / 'chatbot' / 'dist'
prompts_dir = service_src / 'prompts'
generated_icon_path = repo_root / 'build' / 'CyberCat' / 'CyberCat.ico'
icon_path = generated_icon_path

# Ensure the correct OpenSSL DLLs are bundled (from Python's DLLs dir,
# NOT from Git-for-Windows or other locations on PATH).
python_dlls_dir = Path(sys.base_prefix) / 'DLLs'
_ssl_override = {}
for dll_name in ('libssl-3-x64.dll', 'libcrypto-3-x64.dll'):
    dll_path = python_dlls_dir / dll_name
    if dll_path.exists():
        _ssl_override[dll_name.lower()] = str(dll_path)


def collect_tree(source_dir: Path, dest_root: str):
    if not source_dir.exists():
        return []

    return [
        (str(path), str(Path(dest_root) / path.relative_to(source_dir).parent))
        for path in source_dir.rglob('*')
        if path.is_file()
    ]


datas = collect_tree(frontend_dist, 'frontend') + collect_tree(prompts_dir, 'prompts')

a = Analysis(
    [str(service_src / 'main.py')],
    pathex=[str(service_src)],
    binaries=[],
    datas=datas,
    hiddenimports=[
        'PySide6.QtWebChannel',
        'PySide6.QtWebEngineCore',
        'PySide6.QtWebEngineWidgets',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

# Replace OpenSSL DLLs that PyInstaller found on PATH (e.g. Git-for-Windows)
# with the ones from Python's own DLLs directory.
_fixed = []
for name, src, typ in a.binaries:
    key = Path(name).name.lower()
    if key in _ssl_override:
        print(f'  [SSL fix] {name}: {src} -> {_ssl_override[key]}')
        _fixed.append((name, _ssl_override[key], typ))
    else:
        _fixed.append((name, src, typ))
a.binaries = _fixed

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='CyberCat',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(icon_path) if icon_path.exists() else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='CyberCat',
)