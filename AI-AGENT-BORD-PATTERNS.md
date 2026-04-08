---
name: ai-agent-bord-patterns
description: Coding patterns extracted from ai-agent-bord repository
version: 1.0.0
source: local-git-analysis
analyzed_commits: 22
generated: 2026-04-01
---

# AI Agent Bord Patterns

Desktop Claude Code GUI application built with Python + PyWebView + vanilla JavaScript.

## Commit Conventions

This project uses **conventional commits** with the following distribution:

- `fix:` (45%) - Bug fixes, error handling, UI fixes
- `feat:` (41%) - New features, UI components, functionality
- `refactor:` (5%) - Code restructuring
- `docs:` (5%) - Documentation updates
- `chore:` (4%) - Maintenance, licensing, tooling

### Examples from Repository

```
feat: permission modes, independent sessions, resizable panels, session management
fix: bypassPermissions by default, save input draft per tab
refactor: move controls to toolbar in top bar, free up input area
docs: development guide -- build, install, deploy, architecture
chore: MIT license, rename to ai-agent-bord
```

### Commit Message Format

- **Prefix**: Type followed by colon (`feat:`, `fix:`, etc.)
- **Summary**: Concise description, often with multiple items comma-separated
- **Details**: Use `--` for additional context (e.g., `docs: development guide -- build, install, deploy, architecture`)
- **Multi-feature**: Combine related changes in one commit (e.g., `feat: 5 themes (dark, light, blue, sand, dark-sand) + font size controls, persisted in localStorage`)

## Code Architecture

```
bord/
├── bord.py              -- Python backend (PyWebView + claude-agent-sdk)
├── session_utils.py     -- JSONL parsing, session metadata extraction
├── bord.spec            -- PyInstaller build specification
├── requirements.txt     -- Python dependencies
├── ui/
│   ├── index.html       -- Main HTML layout
│   ├── style.css        -- Themes, CSS variables, component styles
│   ├── app.js           -- Core frontend (state, settings, sessions, tabs)
│   ├── render.js        -- Rendering (chat, tools, markdown, events)
│   └── resize.js        -- Panel resizing logic
├── assets/
│   ├── icon.png         -- Source icon (512x512)
│   └── icon.icns        -- macOS icon bundle
└── linux/
    ├── install.sh       -- Linux install script
    ├── uninstall.sh     -- Linux uninstall script
    └── vanadis-bord.desktop  -- Freedesktop .desktop entry
```

### File Organization Patterns

- **Backend**: Python files in root (`bord.py`, `session_utils.py`)
- **Frontend**: All UI files under `ui/` directory
- **Build**: Platform-specific files under `linux/`
- **Assets**: Icons and resources under `assets/`
- **Distribution**: Built apps in `dist/` (gitignored)

### Technology Stack

- **Backend**: Python 3, PyWebView (native window), claude-agent-sdk
- **Frontend**: Vanilla JavaScript (no framework), DOM API
- **Styling**: CSS variables for theming
- **Build**: PyInstaller for macOS (.app) and Linux (standalone)
- **Dependencies**: pywebview, pystray, pillow, claude-agent-sdk

## Workflows

### Adding a New Feature

**Pattern observed**: UI features typically touch 3-4 files together:

1. Modify `ui/app.js` (core logic, state management)
2. Update `ui/index.html` (if UI structure changes)
3. Style in `ui/style.css` (theming, layout)
4. Backend support in `bord.py` (if API needed)

**Example from commit history**:
```
feat: 5 themes + font size controls, persisted in localStorage
  - ui/app.js      (state + localStorage)
  - ui/index.html  (controls)
  - ui/style.css   (theme CSS variables)
```

### Fixing Bugs

**Pattern**: Bug fixes often touch fewer files than features:

1. Fix logic in `bord.py` or `ui/app.js`
2. Update `ui/style.css` if UI-related

**Example**:
```
fix: sidebar and tool panel font size scales with global setting
  - ui/style.css
```

### Refactoring

**Pattern**: Move functionality, clean up architecture, maintain same behavior:

```
refactor: move controls to toolbar in top bar, free up input area
  - ui/app.js
  - ui/index.html
  - ui/style.css
```

### Documentation

**Pattern**: Comprehensive docs go in `DEVELOP.md`:

```
docs: development guide -- build, install, deploy, architecture
  - DEVELOP.md
```

### Build & Deploy

**Pattern**: Build changes touch `bord.spec` and platform-specific files:

```
feat: macOS app bundle with Vanadis icon, PyInstaller spec, cleanup on exit
  - .gitignore
  - assets/icon.icns
  - assets/icon.png
  - bord.spec
```

## File Co-Change Patterns

Based on commit analysis, files that frequently change together:

| Primary File | Co-Changes With | Frequency |
|--------------|----------------|-----------|
| `ui/app.js` | `ui/style.css`, `ui/index.html` | 80% |
| `ui/style.css` | `ui/app.js`, `ui/index.html` | 75% |
| `ui/index.html` | `ui/app.js`, `ui/style.css` | 70% |
| `bord.py` | `ui/app.js` | 40% |
| `bord.spec` | `linux/install.sh`, `linux/uninstall.sh` | 100% |

**Insight**: Frontend changes almost always involve multiple UI files. Backend (`bord.py`) and frontend (`ui/app.js`) are relatively independent.

## Testing Patterns

**Current state**: No automated tests detected in git history.

**Testing approach** (inferred from development pattern):
- Manual testing on macOS and Linux
- Full rebuild cycle for integration testing
- Process cleanup tested with `atexit` + `SIGTERM` handlers

## Code Style Patterns

### Python (`bord.py`, `session_utils.py`)

- **Imports**: Grouped by stdlib, third-party, local (PEP 8)
- **Logging**: Module-level logger with name `"bord"`
- **Async**: Uses `asyncio` for SDK streaming
- **Threading**: Each query in its own thread for session independence
- **Error handling**: Explicit error messages, retry with backoff on rate limits

### JavaScript (`ui/app.js`, `ui/render.js`)

- **No framework**: Vanilla JS with DOM API
- **State management**: Single `bord` global object
- **Settings persistence**: `localStorage` for user preferences
- **Modularity**: `app.js` (core) + `render.js` (presentation)
- **ES6+**: Template literals, arrow functions, destructuring

### CSS (`ui/style.css`)

- **Theming**: CSS variables (e.g., `--bg-primary`, `--text-primary`)
- **5 themes**: dark, light, blue, sand, dark-sand
- **Responsive**: Font scaling with global controls
- **Layout**: Flexbox for panels, grid for tool cards

## Key Design Decisions

From `DEVELOP.md` and commit messages:

1. **Permission modes**: Bypass, Accept edits, Ask, Plan
2. **Session compatibility**: Uses Claude Code native sessions (CLI-compatible)
3. **Thread isolation**: Each query runs in separate thread
4. **Auto-compact**: Retry on "Prompt is too long" error with backoff
5. **Settings location**: `~/.Vanadis/bord-settings.json` (cross-platform, survives reinstall)
6. **Model detection**: Auto-detected from session JSONL
7. **Process cleanup**: Kill child claude processes on app exit

## Development Workflow

### Local Development

```bash
python3 bord.py
```

Changes to `ui/` files require app restart.

### Full Rebuild Cycle (macOS)

```bash
pkill -f "Vanadis Bord" 2>/dev/null
pkill -f "claude.*stream-json" 2>/dev/null
python3 -m PyInstaller bord.spec --noconfirm
rm -rf ~/Applications/Vanadis\ Bord.app
cp -R "dist/Vanadis Bord.app" ~/Applications/
open ~/Applications/Vanadis\ Bord.app
```

### Full Rebuild Cycle (Linux)

```bash
pkill -f "Vanadis Bord" 2>/dev/null
pkill -f "claude.*stream-json" 2>/dev/null
python3 -m PyInstaller bord.spec --noconfirm
bash linux/install.sh
~/.local/share/vanadis-bord/Vanadis\ Bord &
```

## Bundle ID

`ai.vanadis.bord` -- used in `bord.spec` for macOS app bundle.

## Icon Generation

From `DEVELOP.md`:

1. Source: `assets/icon.png` (512x512)
2. Generate iconset with Pillow (16-1024px, with @2x variants)
3. Convert to `.icns` with `iconutil` (macOS only)

---

## Summary

**ai-agent-bord** is a rapid-iteration desktop application with:
- 22 commits over 2 days (MVP sprint)
- Conventional commit style (feat/fix dominant)
- Frontend changes touch multiple files together (`ui/app.js`, `ui/style.css`, `ui/index.html`)
- No framework dependencies (vanilla JS, Python stdlib + minimal deps)
- Cross-platform build with PyInstaller
- Settings persistence, theming, session management
- Independent thread-per-session architecture
