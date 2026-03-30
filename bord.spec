"""PyInstaller spec for Vanadis Bord macOS app."""

import os

block_cipher = None
here = os.path.dirname(os.path.abspath(SPEC))

a = Analysis(
    ['bord.py'],
    pathex=[here],
    binaries=[],
    datas=[
        ('ui', 'ui'),
        ('assets/icon.png', 'assets'),
    ],
    hiddenimports=[
        'webview',
        'claude_agent_sdk',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Vanadis Bord',
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
    icon='assets/icon.icns',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='Vanadis Bord',
)

app = BUNDLE(
    coll,
    name='Vanadis Bord.app',
    icon='assets/icon.icns',
    bundle_identifier='ai.vanadis.bord',
    info_plist={
        'CFBundleDisplayName': 'Vanadis Bord',
        'CFBundleShortVersionString': '0.1.0',
        'NSHighResolutionCapable': True,
        'LSMinimumSystemVersion': '12.0',
    },
)
