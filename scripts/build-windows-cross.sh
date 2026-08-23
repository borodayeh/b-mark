#!/usr/bin/env bash
#
# Cross-compile "B mark.exe" for Windows x64 from Linux.
#
# Uses cargo-xwin, which downloads Microsoft's own MSVC headers, import
# libraries and CRT from their public CDN and links with clang-cl/lld-link.
# The result is a genuine MSVC-target PE — not a MinGW build — so it behaves
# the same as one produced on Windows.
#
# This exists because not everyone has a Windows machine. The canonical
# release is still built by .github/workflows/build-windows.yml on
# windows-latest; this script is for local iteration and for contributors on
# Linux or macOS.
#
# Requirements:
#   rustup, clang, lld, node 20+, python3 (for icon regeneration)
#   ~4 GB of RAM or 2 GB plus swap; ~6 GB of disk for the toolchain cache
#
# Usage:
#   ./scripts/build-windows-cross.sh            # full LTO release
#   PROFILE=release-lowmem ./scripts/build-windows-cross.sh   # low-memory
set -euo pipefail

cd "$(dirname "$0")/.."
PROFILE="${PROFILE:-release}"
TARGET=x86_64-pc-windows-msvc

echo "== B mark cross-build =="
echo "   target  : $TARGET"
echo "   profile : $PROFILE"

for tool in rustup cargo clang lld-link node npm; do
  command -v "$tool" >/dev/null || { echo "missing: $tool"; exit 1; }
done

if ! command -v cargo-xwin >/dev/null; then
  echo "-> installing cargo-xwin"
  cargo install cargo-xwin --locked
fi

rustup target add "$TARGET"

echo "-> frontend"
npm ci
npm run typecheck
npm test
npm run build            # MUST run before cargo: the assets are baked in at
                         # compile time by tauri::generate_context!()

if command -v python3 >/dev/null; then
  echo "-> branding"
  python3 scripts/generate-branding.py
fi

echo "-> cargo xwin"
cd src-tauri
# Static CRT so the portable exe does not require the Visual C++
# Redistributable on the target machine.
export CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS="-C target-feature=+crt-static"
# One job: LTO on a small container will otherwise be OOM-killed.
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-1}"

if [ "$PROFILE" = "release" ]; then
  cargo xwin build --release --target "$TARGET" -j "$CARGO_BUILD_JOBS"
else
  cargo xwin build --profile "$PROFILE" --target "$TARGET" -j "$CARGO_BUILD_JOBS"
fi
cd ..

BUILT="src-tauri/target/$TARGET/$PROFILE/b-mark.exe"
[ -f "$BUILT" ] || { echo "expected binary not found: $BUILT"; exit 1; }

mkdir -p release
cp "$BUILT" "release/B mark.exe"

HASH=$(sha256sum "release/B mark.exe" | cut -d' ' -f1)
printf '%s  B mark.exe\n' "$HASH" > release/SHA256SUMS.txt

SIZE=$(du -h "release/B mark.exe" | cut -f1)
echo
echo "== done =="
echo "   file   : release/B mark.exe"
echo "   size   : $SIZE"
echo "   sha256 : $HASH"
echo
echo "   UNSIGNED. Windows SmartScreen may warn on first run, and some"
echo "   antivirus engines flag unsigned, low-prevalence binaries. See"
echo "   SECURITY.md — we do not claim this can be prevented."
echo "   Requires the Microsoft Edge WebView2 Runtime (part of Windows 11"
echo "   and current Windows 10)."
