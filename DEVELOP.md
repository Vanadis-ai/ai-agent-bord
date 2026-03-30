# Vanadis Bord -- Development Guide

## Prerequisites

```bash
pip3 install pywebview pystray pillow claude-agent-sdk pyinstaller
```

## Project Structure

```
bord/
  bord.py           -- Python backend (SDK, session management, events)
  bord.spec         -- PyInstaller build spec
  requirements.txt  -- Python dependencies
  ui/
    index.html      -- Main HTML layout
    style.css       -- Themes, layout, components
    app.js          -- Frontend logic (sessions, chat, tools, events)
  assets/
    icon.png        -- App icon source (512x512)
    icon.icns       -- macOS icon bundle
```

## Run in Development

```bash
cd /Users/alter/Workspace/Vanadis/.code.nosync/Vanadis.AI/bord
python3 bord.py
```

Changes to `ui/` files (HTML, CSS, JS) take effect on app restart.
Changes to `bord.py` require restart.

## Build macOS App

```bash
python3 -m PyInstaller bord.spec --noconfirm
```

Output: `dist/Vanadis Bord.app` (~48 MB)

## Install

```bash
rm -rf ~/Applications/Vanadis\ Bord.app
cp -R "dist/Vanadis Bord.app" ~/Applications/
```

## Launch

```bash
open ~/Applications/Vanadis\ Bord.app
```

Or from Launchpad / Spotlight: search "Vanadis Bord".

## Full Rebuild Cycle (dev -> install)

```bash
# Kill running instances
pkill -f "Vanadis Bord" 2>/dev/null
pkill -f "claude.*stream-json" 2>/dev/null

# Build
python3 -m PyInstaller bord.spec --noconfirm

# Install
rm -rf ~/Applications/Vanadis\ Bord.app
cp -R "dist/Vanadis Bord.app" ~/Applications/

# Launch
open ~/Applications/Vanadis\ Bord.app
```

## Commit and Deploy

```bash
pkill -f "Vanadis Bord" 2>/dev/null
pkill -f "claude.*stream-json" 2>/dev/null
git add -A
git commit -m "description"
git push origin main
python3 -m PyInstaller bord.spec --noconfirm
rm -rf ~/Applications/Vanadis\ Bord.app
cp -R "dist/Vanadis Bord.app" ~/Applications/
open ~/Applications/Vanadis\ Bord.app
```

## Icon

Source: `Vanadis.AI/graphics/vanadis-logo.png` (gold V on dark background).

To regenerate icns from a new PNG:

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

- **bord.py**: PyWebView window + JS bridge API. Async event loop for SDK queries.
- **ui/app.js**: All frontend state and rendering. No framework, vanilla JS with DOM API.
- **ui/style.css**: CSS variables for theming. 5 themes: dark, light, blue, sand, dark-sand.
- **SDK**: `claude-agent-sdk` Python package. `query()` for streaming, `list_sessions()` / `get_session_messages()` for history.

## Key Design Decisions

- `bypassPermissions` mode by default (all tool operations allowed)
- Sessions are Claude Code native -- compatible with CLI sessions
- Auto-compact on "Prompt is too long" with retry and rate limit backoff
- Input draft saved per tab on switch
- Theme, font size, model, open tabs persisted in localStorage
- Child claude processes killed on app exit (atexit + SIGTERM)

## Bundle ID

`ai.vanadis.bord` -- used in bord.spec for macOS app bundle.
