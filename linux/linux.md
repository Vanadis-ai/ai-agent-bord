# Vanadis Bord -- Linux Setup

## 1. System dependencies

```bash
sudo apt install python3-pip python3-venv python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-webkit2-4.1
```

## 2. Python packages

```bash
pip3 install pywebview pystray pillow claude-agent-sdk pyinstaller
```

## 3. Claude Code CLI

```bash
npm install -g @anthropic-ai/claude-code
```

Verify: `claude --version`

## 4. Clone and build

```bash
cd ~/code  # or wherever
git clone git@github.com:vanadis-ai/bord.git
cd bord
python3 -m PyInstaller bord.spec --noconfirm
```

## 5. Install

```bash
bash linux/install.sh
```

Creates:
- `~/.local/share/vanadis-bord/` -- app binary + UI files
- `~/.local/share/applications/vanadis-bord.desktop` -- launcher entry

## 6. Launch

```bash
~/.local/share/vanadis-bord/Vanadis\ Bord
```

Or search "Vanadis Bord" in app launcher (Activities / app menu).

## 7. Pin to dock

- GNOME: right-click running app icon in taskbar -> "Pin to Dash"
- KDE: right-click -> "Pin to Task Manager"
- XFCE: right-click panel -> "Add New Items" -> "Launcher", point to vanadis-bord.desktop

## 8. Rebuild after update

```bash
cd ~/code/bord
git pull
pkill -f "Vanadis Bord" 2>/dev/null
python3 -m PyInstaller bord.spec --noconfirm
bash linux/install.sh
```

## 9. Uninstall

```bash
bash linux/uninstall.sh
```

Settings in `~/.Vanadis/bord-settings.json` are kept.

## Troubleshooting

**PyWebView window is blank**: missing WebKit. Run:
```bash
sudo apt install gir1.2-webkit2-4.1
```

**"claude not found"**: Claude Code CLI not in PATH. Check:
```bash
which claude
# If missing: export PATH="$HOME/.npm-global/bin:$PATH"
# Add to ~/.bashrc or ~/.zshrc
```

**App not in launcher**: update desktop database:
```bash
update-desktop-database ~/.local/share/applications
```
