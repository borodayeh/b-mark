#!/usr/bin/env bash
# prepare-release.sh — validate staged binaries and produce the release assets.
#
#   bash scripts/prepare-release.sh 0.1.0
#
# Expects the two Windows executables to have been copied into
# dist-release/v<version>/ (see dist-release/README.md).
set -euo pipefail

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "usage: bash scripts/prepare-release.sh <version>   e.g. 0.1.0" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/dist-release/v$VERSION"
PORTABLE="B mark $VERSION Portable.exe"
SETUP="B mark $VERSION setup.exe"

fail() { printf '\033[31mERROR\033[0m  %s\n' "$1" >&2; exit 1; }
ok()   { printf '\033[32mok\033[0m     %s\n' "$1"; }

# --- the version in package.json must match, otherwise the installer name,
# --- the tag and the updater manifest will disagree with each other.
PKG_VERSION="$(node -p "require('$ROOT/package.json').version" 2>/dev/null || echo '?')"
[[ "$PKG_VERSION" == "$VERSION" ]] \
  || fail "package.json says version $PKG_VERSION but you asked for $VERSION. Bump one of them."
ok "version $VERSION matches package.json"

[[ -d "$DIR" ]] || fail "$DIR does not exist. Create it and copy the two .exe files in (see dist-release/README.md)."

# The build produces "B mark.exe"; the published asset carries the version so
# two downloads in a Downloads folder can never be confused for each other.
if [[ ! -f "$DIR/$PORTABLE" && -f "$DIR/B mark.exe" ]]; then
  mv "$DIR/B mark.exe" "$DIR/$PORTABLE"
  ok "renamed B mark.exe -> $PORTABLE"
fi

for f in "$PORTABLE" "$SETUP"; do
  path="$DIR/$f"
  [[ -f "$path" ]] || fail "missing: dist-release/v$VERSION/$f"
  # A truncated or half-copied download is a real failure mode; check the
  # DOS header and that the PE header it points at is present.
  head -c2 "$path" | grep -q '^MZ' || fail "$f does not start with 'MZ' — not a Windows executable?"
  python3 - "$path" <<'PY' || fail "$f has no valid PE header"
import struct, sys
with open(sys.argv[1], 'rb') as fh:
    fh.seek(0x3C)
    off = struct.unpack('<I', fh.read(4))[0]
    fh.seek(off)
    sys.exit(0 if fh.read(4) == b'PE\0\0' else 1)
PY
  size=$(stat -c%s "$path")
  (( size > 1000000 )) || fail "$f is only $size bytes — suspiciously small."
  ok "$f  ($(numfmt --to=iec --suffix=B "$size" 2>/dev/null || echo "$size bytes"))"
done

# --- checksums -------------------------------------------------------------
( cd "$DIR" && sha256sum "$PORTABLE" "$SETUP" > SHA256SUMS.txt )
ok "SHA256SUMS.txt written"

SHA_PORTABLE="$(cd "$DIR" && sha256sum "$PORTABLE" | cut -d' ' -f1)"
SHA_SETUP="$(cd "$DIR" && sha256sum "$SETUP" | cut -d' ' -f1)"
DATE="$(date -u +%Y-%m-%d)"

# --- release notes ---------------------------------------------------------
cat > "$DIR/RELEASE-NOTES.md" <<EOF
## B mark $VERSION — $DATE

<div align="right">

### دانلود

| فایل | توضیح |
|---|---|
| \`$PORTABLE\` | نسخهٔ پرتابل. بدون نصب، بدون دسترسی مدیر. |
| \`B mark $VERSION setup.exe\` | نصب‌کنندهٔ تک‌کاربره در \`%LOCALAPPDATA%\\Programs\`؛ میان‌بر منوی استارت و ثبت پسوند \`.md\`. بدون UAC، بدون نوشتن در HKLM. زبان نصب (فارسی/انگلیسی) در ابتدا پرسیده می‌شود. |

### پیش‌نیاز

**Microsoft Edge WebView2 Runtime** لازم است؛ روی ویندوز ۱۱ و ویندوز ۱۰ به‌روز
از پیش نصب است. B mark هرگز آن را بی‌اطلاع شما دانلود نمی‌کند؛ اگر نبود، پیام
دوزبانه می‌دهد و لینک رسمی مایکروسافت را نشان می‌دهد.

### هشدار صادقانه

این فایل‌ها **امضای دیجیتال ندارند**. SmartScreen ممکن است بار اول اخطار بدهد و
بعضی آنتی‌ویروس‌ها به فایل‌های اجرایی امضانشده حساس‌اند. چک‌سام زیر را با
\`SHA256SUMS.txt\` مقایسه کنید. جزئیات در \`SECURITY.md\`.

</div>

### Downloads

| File | Notes |
|---|---|
| \`$PORTABLE\` | Portable. No installation, no Administrator. |
| \`B mark $VERSION setup.exe\` | Per-user installer into \`%LOCALAPPDATA%\\Programs\`, Start Menu entry, \`.md\` association. No UAC, nothing in HKLM. Asks for the installer language (Persian/English) on every run. |

**Requires the Microsoft Edge WebView2 Runtime**, present on Windows 11 and
current Windows 10. B mark never downloads it silently.

**These binaries are not code-signed.** SmartScreen may warn on first run and
some antivirus engines flag unsigned executables. Verify the SHA-256 below.
See \`SECURITY.md\` for exactly what is and is not claimed.

### سازنده / Author

B mark را **مسعود برودایه** با کمک Arena ساخته است. ساختش هزینه‌ای نداشت، پس
رایگان هم منتشر می‌شود — تحت مجوز MIT.

Built by **Masoud Borodayeh** with help from Arena. It cost nothing to make,
so it is released free of charge under the MIT licence.

### SHA-256

\`\`\`
$SHA_PORTABLE  $PORTABLE
$SHA_SETUP  $SETUP
\`\`\`
EOF
ok "RELEASE-NOTES.md written"

echo
echo "Assets ready in dist-release/v$VERSION:"
ls -1 "$DIR"
echo
cat <<EOF
Next:

  git tag -a v$VERSION -m "B mark $VERSION"
  git push origin main --tags

  gh release create v$VERSION \\
    "$DIR/$PORTABLE" \\
    "$DIR/$SETUP" \\
    "$DIR/SHA256SUMS.txt" \\
    --title "B mark $VERSION" \\
    --notes-file "$DIR/RELEASE-NOTES.md"

(Pushing the tag also triggers .github/workflows/build-windows.yml, which
builds x64 + ARM64 on GitHub's own runners and attaches its artifacts to the
same release. If you only want your locally built files published, run the
gh command above and skip the tag push, or delete the workflow's release job.)
EOF
