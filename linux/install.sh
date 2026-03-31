#!/bin/bash
# Vanadis Bord -- Linux install script
# Installs built app to ~/.local/share/vanadis-bord/ and adds .desktop entry

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BORD_DIR="$SCRIPT_DIR/.."
DIST_DIR="$BORD_DIR/dist/Vanadis Bord"
INSTALL_DIR="$HOME/.local/share/vanadis-bord"
DESKTOP_DIR="$HOME/.local/share/applications"

if [ ! -d "$DIST_DIR" ]; then
    echo "Build not found. Building..."
    cd "$BORD_DIR"
    python3 -m PyInstaller bord.spec --noconfirm
fi

echo "Installing to $INSTALL_DIR..."
rm -rf "$INSTALL_DIR"
cp -r "$DIST_DIR" "$INSTALL_DIR"
cp "$BORD_DIR/assets/icon.png" "$INSTALL_DIR/icon.png"
chmod +x "$INSTALL_DIR/Vanadis Bord"

echo "Creating desktop entry..."
mkdir -p "$DESKTOP_DIR"
sed "s|\$HOME|$HOME|g" "$SCRIPT_DIR/vanadis-bord.desktop" > "$DESKTOP_DIR/vanadis-bord.desktop"

echo "Updating desktop database..."
update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true

echo ""
echo "Installed. Launch:"
echo "  - Search 'Vanadis Bord' in app launcher"
echo "  - Or run: $INSTALL_DIR/Vanadis\ Bord"
echo ""
echo "To pin to dock: right-click the app in taskbar -> 'Pin to favorites' / 'Add to dock'"
