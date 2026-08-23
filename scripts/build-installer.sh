#!/usr/bin/env bash
#
# Build the per-user Windows installer from an already-built "B mark.exe".
#
#   ./scripts/build-windows-cross.sh    # produces release/B mark.exe
#   ./scripts/build-installer.sh        # produces release/B mark <ver> setup.exe
#
# Requires makensis (Debian/Ubuntu: `sudo apt install nsis`).
#
# The installer script itself is installer/b-mark.nsi — hand-written rather
# than generated, so every registry write it performs is visible and
# reviewable in one file.
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")
EXE="release/B mark.exe"
OUT="release/B mark ${VERSION} setup.exe"

command -v makensis >/dev/null || { echo "makensis not found — apt install nsis"; exit 1; }
[ -f "$EXE" ] || { echo "missing $EXE — run scripts/build-windows-cross.sh first"; exit 1; }

echo "== B mark installer =="
echo "   version : $VERSION"

makensis -V2 -DVERSION="$VERSION" installer/b-mark.nsi

[ -f "$OUT" ] || { echo "makensis did not produce $OUT"; exit 1; }

HASH=$(sha256sum "$OUT" | cut -d' ' -f1)
{
  sha256sum "$EXE" | sed "s|release/||"
  echo "$HASH  $(basename "$OUT")"
} > release/SHA256SUMS.txt

echo
echo "== done =="
echo "   file   : $OUT"
echo "   size   : $(du -h "$OUT" | cut -f1)"
echo "   sha256 : $HASH"
echo
echo "   Installs to %LOCALAPPDATA%\\Programs\\B mark for the current user."
echo "   No Administrator, no UAC prompt, nothing written to HKLM."
