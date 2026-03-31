# Vanadis Bord -- Development Guide

## Project Structure

```
bord/
  bord.py            -- Python backend (BordAPI, streaming, main)
  session_utils.py   -- Session JSONL parsing, custom title/model extraction
  bord.spec          -- PyInstaller build spec (macOS + Linux)
  requirements.txt   -- Python dependencies
  ui/
    index.html       -- Main HTML layout
    style.css        -- Themes, layout, components
    app.js           -- Core frontend logic (state, settings, sessions, tabs)
    render.js        -- Rendering (chat, tools, markdown, events)
  assets/
    icon.png         -- App icon source (512x512)
    icon.icns        -- macOS icon bundle
  linux/
    install.sh       -- Linux install script (app + .desktop entry)
    uninstall.sh     -- Linux uninstall script
    vanadis-bord.desktop -- Freedesktop .desktop template
```

## Prerequisites

### macOS

```bash
pip3 install pywebview pystray pillow claude-agent-sdk pyinstaller
```

### Linux (Ubuntu/Debian)

```bash
# System dependencies for PyWebView (GTK + WebKit)
sudo apt install python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-webkit2-4.1

# Python packages
pip3 install pywebview pystray pillow claude-agent-sdk pyinstaller
```

## Run in Development

```bash
cd bord/
python3 bord.py
```

Changes to `ui/` files (HTML, CSS, JS) take effect on app restart.

## Build

```bash
python3 -m PyInstaller bord.spec --noconfirm
```

Output:
- macOS: `dist/Vanadis Bord.app`
- Linux: `dist/Vanadis Bord/` (directory with executable)

## Install

### macOS

```bash
rm -rf ~/Applications/Vanadis\ Bord.app
cp -R "dist/Vanadis Bord.app" ~/Applications/
open ~/Applications/Vanadis\ Bord.app
```

Launch: Launchpad / Spotlight -> "Vanadis Bord"

### Linux

```bash
bash linux/install.sh
```

This will:
1. Build if not already built
2. Copy to `~/.local/share/vanadis-bord/`
3. Create `.desktop` entry in `~/.local/share/applications/`
4. Update desktop database

Launch: search "Vanadis Bord" in app launcher, or run `~/.local/share/vanadis-bord/Vanadis\ Bord`

Pin to dock: right-click running app in taskbar -> "Pin to favorites" / "Add to panel"

### Linux Uninstall

```bash
bash linux/uninstall.sh
```

## Full Rebuild Cycle

### macOS

```bash
pkill -f "Vanadis Bord" 2>/dev/null
pkill -f "claude.*stream-json" 2>/dev/null
python3 -m PyInstaller bord.spec --noconfirm
rm -rf ~/Applications/Vanadis\ Bord.app
cp -R "dist/Vanadis Bord.app" ~/Applications/
open ~/Applications/Vanadis\ Bord.app
```

### Linux

```bash
pkill -f "Vanadis Bord" 2>/dev/null
pkill -f "claude.*stream-json" 2>/dev/null
python3 -m PyInstaller bord.spec --noconfirm
bash linux/install.sh
~/.local/share/vanadis-bord/Vanadis\ Bord &
```

## Icon

Source: `Vanadis.AI/graphics/vanadis-logo.png` (gold V on dark background).

To regenerate icns from a new PNG (macOS only):

```bash
python3 -c "
from PIL import Image
import os
img = Image.open('assets/icon.png')
iconset = 'assets/icon.iconset'
os.makedirs(iconset, exist_ok=True)
for s in [16, 32, 64, 128, 256, 512, 1024]:
    img.resize((s, s), Image.LANCZOS).save(f'{iconset}/icon_{s}x{s}.png')
    if s <= 512:
        img.resize((s*2, s*2), Image.LANCZOS).save(f'{iconset}/icon_{s}x{s}@2x.png')
"
iconutil -c icns assets/icon.iconset -o assets/icon.icns
rm -rf assets/icon.iconset
```

## Architecture

- **bord.py**: PyWebView window + JS bridge API. Each query runs in its own thread.
- **session_utils.py**: JSONL parsing, custom title/model extraction (workaround for SDK limitations on large files).
- **ui/app.js**: Core frontend state, settings, sessions, tabs. No framework, vanilla JS with DOM API.
- **ui/render.js**: Chat rendering, markdown, tool panel, event handlers. Augments `bord` object from app.js.
- **ui/style.css**: CSS variables for theming. 5 themes: dark, light, blue, sand, dark-sand.
- **SDK**: `claude-agent-sdk` with `ClaudeSDKClient` for streaming + permission callbacks.

## Key Design Decisions

- Permission modes: Bypass, Accept edits, Ask (with inline permission cards), Plan
- Sessions are Claude Code native -- compatible with CLI sessions
- Each query in its own thread -- sessions are independent, one can't block another
- Auto-compact on "Prompt is too long" with retry and rate limit backoff
- Settings persisted in `~/.Vanadis/bord-settings.json` (cross-platform, survives reinstall)
- Model auto-detected per session from JSONL
- Child claude processes killed on app exit (atexit + SIGTERM)

## Bundle ID

`ai.vanadis.bord` -- used in bord.spec for macOS app bundle.
