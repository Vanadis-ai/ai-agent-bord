#!/bin/bash
# Vanadis Bord -- Linux uninstall script

set -e

rm -rf "$HOME/.local/share/vanadis-bord"
rm -f "$HOME/.local/share/applications/vanadis-bord.desktop"
for size in 128 256 512; do
    rm -f "$HOME/.local/share/icons/hicolor/${size}x${size}/apps/vanadis-bord.png"
done
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

echo "Vanadis Bord uninstalled."
echo "Settings remain in ~/.Vanadis/bord-settings.json (delete manually if needed)."
