#!/bin/bash
# Vanadis Bord -- Linux install script
# Installs built app to ~/.local/share/vanadis-bord/ and adds .desktop entry

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BORD_DIR="$SCRIPT_DIR/.."
DIST_DIR="$BORD_DIR/dist/vanadis-bord"
INSTALL_DIR="$HOME/.local/share/vanadis-bord"
DESKTOP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor"

if [ ! -d "$DIST_DIR" ]; then
    echo "Build not found at $DIST_DIR. Run pyinstaller first."
    exit 1
fi

echo "Installing to $INSTALL_DIR..."
rm -rf "$INSTALL_DIR"
cp -r "$DIST_DIR" "$INSTALL_DIR"
chmod +x "$INSTALL_DIR/vanadis-bord"

echo "Installing icons..."
for size in 48 128 256 512; do
    dest="$ICON_DIR/${size}x${size}/apps"
    mkdir -p "$dest"
    src="$BORD_DIR/assets/icon_${size}.png"
    if [ -f "$src" ]; then
        cp "$src" "$dest/vanadis-bord.png"
    else
        cp "$BORD_DIR/assets/icon.png" "$dest/vanadis-bord.png"
    fi
done
# SVG for scalable
mkdir -p "$ICON_DIR/scalable/apps"
cp "$BORD_DIR/assets/icon.svg" "$ICON_DIR/scalable/apps/vanadis-bord.svg" 2>/dev/null || true
# Fallback next to the binary
cp "$BORD_DIR/assets/icon.png" "$INSTALL_DIR/vanadis-bord.png"
# Ensure icons are world-readable
chmod 644 "$ICON_DIR"/*/apps/vanadis-bord.* 2>/dev/null || true

# Ensure hicolor index.theme exists (needed for gtk-update-icon-cache)
if [ ! -f "$ICON_DIR/index.theme" ]; then
    cat > "$ICON_DIR/index.theme" << 'THEME'
[Icon Theme]
Name=Hicolor
Comment=Fallback Icon Theme
Hidden=true
Directories=48x48/apps,128x128/apps,256x256/apps,512x512/apps,scalable/apps

[48x48/apps]
Size=48
Context=Applications
Type=Fixed

[128x128/apps]
Size=128
Context=Applications
Type=Fixed

[256x256/apps]
Size=256
Context=Applications
Type=Fixed

[512x512/apps]
Size=512
Context=Applications
Type=Fixed

[scalable/apps]
Size=128
Context=Applications
Type=Scalable
MinSize=16
MaxSize=1024
THEME
fi

echo "Creating desktop entry..."
mkdir -p "$DESKTOP_DIR"
sed "s|\$HOME|$HOME|g" "$SCRIPT_DIR/vanadis-bord.desktop" > "$DESKTOP_DIR/vanadis-bord.desktop"

echo "Updating caches..."
update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
gtk-update-icon-cache -f "$ICON_DIR" 2>/dev/null || true

echo ""
echo "Installed! You can now:"
echo "  - Search 'Vanadis Bord' in your app launcher"
echo "  - Pin it to your dock/favorites"
echo "  - Or run: $INSTALL_DIR/vanadis-bord"
