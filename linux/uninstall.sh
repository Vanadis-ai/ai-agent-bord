#!/bin/bash
# Vanadis Bord -- Linux uninstall script

set -e

rm -rf "$HOME/.local/share/vanadis-bord"
rm -f "$HOME/.local/share/applications/vanadis-bord.desktop"
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true

echo "Vanadis Bord uninstalled."
echo "Settings remain in ~/.Vanadis/bord-settings.json (delete manually if needed)."
