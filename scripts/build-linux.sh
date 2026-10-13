#!/usr/bin/env bash
#
# Build the Linux packages for B mark on Ubuntu (or Debian):
#
#   release/B mark <ver>... .deb          ← installs with apt / double-click
#   release/B mark <ver>... .AppImage     ← portable, runs without installing
#   release/SHA256SUMS-linux-x64.txt
#
# The same Tauri release binary goes into both, so they behave identically.
#
# Usage:
#   ./scripts/build-linux.sh              # install missing system packages (sudo)
#   SKIP_APT=1 ./scripts/build-linux.sh   # do not touch apt; just check
#
# Requirements (the script checks for them and says what is missing):
#   Node.js 20+ and npm, Rust (stable, via rustup), and the Tauri system
#   libraries listed below. Building needs roughly 4 GB of RAM and ~5 GB of
#   disk for the Rust build cache.
#
# The official Linux build is .github/workflows/build-linux.yml on
# ubuntu-22.04. Build on 22.04 (or older) if you want the package to run on the
# widest range of Ubuntu releases: a binary needs the glibc of the machine it
# was built on or newer.
set -euo pipefail

cd "$(dirname "$0")/.."

say() { printf '\n== %s\n' "$*"; }
die() { printf '\nerror: %s\n' "$*" >&2; exit 1; }

# Ubuntu's Tauri dependencies. libfuse2 is what linuxdeploy (the AppImage
# builder) needs to mount itself; its package name changed in 24.04.
APT_PKGS=(
  build-essential curl wget file patchelf pkg-config
  libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev
  libssl-dev libxdo-dev libayatana-appindicator3-dev
)
fuse_pkg() {
  if apt-cache show libfuse2t64 >/dev/null 2>&1; then echo libfuse2t64; else echo libfuse2; fi
}

say "B mark Linux build"
if [ -r /etc/os-release ]; then
  . /etc/os-release
  echo "   system  : ${PRETTY_NAME:-unknown}"
  case "${ID:-}${ID_LIKE:-}" in
    *ubuntu*|*debian*) ;;
    *) echo "   warning : this script targets Ubuntu/Debian; other distros may need different packages" ;;
  esac
fi
echo "   version : $(node -p "require('./package.json').version" 2>/dev/null || echo '?')"

# --- system packages --------------------------------------------------------
if [ "${SKIP_APT:-0}" != "1" ] && command -v apt-get >/dev/null; then
  FUSE="$(fuse_pkg)"
  MISSING=()
  for p in "${APT_PKGS[@]}" "$FUSE"; do
    dpkg -s "$p" >/dev/null 2>&1 || MISSING+=("$p")
  done
  if [ "${#MISSING[@]}" -gt 0 ]; then
    say "installing system packages: ${MISSING[*]}"
    sudo apt-get update -qq
    sudo apt-get install -y --no-install-recommends "${MISSING[@]}"
  else
    echo "-> system packages already installed"
  fi
fi

# --- toolchain checks -------------------------------------------------------
command -v node  >/dev/null || die "node not found. Install Node.js 20 LTS or newer (https://nodejs.org/)."
command -v npm   >/dev/null || die "npm not found."
command -v cargo >/dev/null || die "cargo not found. Install Rust with rustup: https://rustup.rs/ (then open a new terminal)."
command -v pkg-config >/dev/null || die "pkg-config not found: sudo apt install pkg-config"
pkg-config --exists webkit2gtk-4.1 || die "webkit2gtk-4.1 is not visible to pkg-config. Install libwebkit2gtk-4.1-dev."

# --- build ------------------------------------------------------------------
say "frontend: install, typecheck, test"
npm ci
npm run typecheck
npm test

say "packages: tauri build (deb + AppImage)"
# tauri.linux.conf.json selects deb and AppImage; --bundles makes it explicit.
# NO_STRIP: linuxdeploy's bundled strip cannot read newer ELF relocation
# sections, which would otherwise fail the AppImage step.
NO_STRIP=true npm run tauri -- build --bundles deb,appimage

say "collect artifacts"
mkdir -p release
find src-tauri/target/release/bundle \( -name '*.deb' -o -name '*.AppImage' \) \
  -exec cp {} release/ \;

DEB="$(ls release/*.deb 2>/dev/null | head -n1 || true)"
APP="$(ls release/*.AppImage 2>/dev/null | head -n1 || true)"
[ -n "$DEB" ] || die "no .deb produced — see the tauri output above"
[ -n "$APP" ] || die "no AppImage produced — see the tauri output above"

(cd release && sha256sum "$(basename "$DEB")" "$(basename "$APP")" > SHA256SUMS-linux-x64.txt)

say "verify the .deb"
dpkg-deb --contents "$DEB" | grep -q 'usr/bin/b-mark$' \
  || die "the .deb does not contain usr/bin/b-mark"
echo "   ok: binary, desktop entry and icons are inside the package"

say "done"
echo "   deb      : $DEB ($(du -h "$DEB" | cut -f1))"
echo "   AppImage : $APP ($(du -h "$APP" | cut -f1))"
echo "   sha256   :"
sed 's/^/     /' release/SHA256SUMS-linux-x64.txt
echo
echo "   Install the .deb:  sudo apt install ./\"$(basename "$DEB")\""
echo "   Run the AppImage:  chmod +x ./\"$(basename "$APP")\" && ./\"$(basename "$APP")\""
