<#
.SYNOPSIS
    Validate the staged binaries and produce the release assets. Windows
    counterpart of scripts/prepare-release.sh — no WSL, no Git Bash needed.

.DESCRIPTION
    Expects the two Windows executables to have been copied into
    dist-release\v<version>\ . See dist-release\README.md.

    Works from any directory: paths are resolved from the script's own
    location, not the current one.

.EXAMPLE
    .\scripts\prepare-release.ps1 0.1.2

.NOTES
    Written for Windows PowerShell 5.1 as well as PowerShell 7, so it avoids
    7-only syntax. This file is saved UTF-8 with a BOM on purpose: without one,
    5.1 reads .ps1 files as ANSI and mangles the Persian strings below.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Version
)

$ErrorActionPreference = 'Stop'

function Write-Ok   { param($m) Write-Host 'ok     ' -ForegroundColor Green -NoNewline; Write-Host $m }
function Write-Fail { param($m) Write-Host 'ERROR  ' -ForegroundColor Red   -NoNewline; Write-Host $m; exit 1 }

$root = Split-Path -Parent $PSScriptRoot
$dir  = Join-Path (Join-Path $root 'dist-release') ("v" + $Version)

$portable = "B mark $Version Portable.exe"
$setup    = "B mark $Version setup.exe"

# --- the version in package.json must match, or the installer name, the tag
# --- and the updater manifest will disagree with each other.
$pkg = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
if ($pkg.version -ne $Version) {
    Write-Fail "package.json says version $($pkg.version) but you asked for $Version. Bump one of them."
}
Write-Ok "version $Version matches package.json"

if (-not (Test-Path -LiteralPath $dir)) {
    Write-Fail "$dir does not exist. Create it and copy the two .exe files in (see dist-release\README.md)."
}

# The build produces "B mark.exe"; the published asset carries the version so
# two downloads in one Downloads folder can never be confused for each other.
$plain = Join-Path $dir 'B mark.exe'
if ((-not (Test-Path -LiteralPath (Join-Path $dir $portable))) -and (Test-Path -LiteralPath $plain)) {
    Move-Item -LiteralPath $plain -Destination (Join-Path $dir $portable)
    Write-Ok "renamed B mark.exe -> $portable"
}

foreach ($name in @($portable, $setup)) {
    $path = Join-Path $dir $name
    if (-not (Test-Path -LiteralPath $path)) {
        Write-Fail "missing: dist-release\v$Version\$name"
    }

    # A truncated or half-copied file is a real failure mode: check the DOS
    # header and that the PE header it points at is actually there.
    $fs = [System.IO.File]::OpenRead($path)
    try {
        $head = New-Object byte[] 2
        [void]$fs.Read($head, 0, 2)
        if ($head[0] -ne 0x4D -or $head[1] -ne 0x5A) {
            Write-Fail "$name does not start with 'MZ' — not a Windows executable?"
        }
        [void]$fs.Seek(0x3C, 'Begin')
        $off = New-Object byte[] 4
        [void]$fs.Read($off, 0, 4)
        [void]$fs.Seek([BitConverter]::ToUInt32($off, 0), 'Begin')
        $sig = New-Object byte[] 4
        [void]$fs.Read($sig, 0, 4)
        if ($sig[0] -ne 0x50 -or $sig[1] -ne 0x45 -or $sig[2] -ne 0 -or $sig[3] -ne 0) {
            Write-Fail "$name has no valid PE header"
        }
    } finally {
        $fs.Dispose()
    }

    $size = (Get-Item -LiteralPath $path).Length
    if ($size -lt 1000000) { Write-Fail "$name is only $size bytes — suspiciously small." }
    Write-Ok ("{0}  ({1:N1} MB)" -f $name, ($size / 1MB))
}

# --- checksums -------------------------------------------------------------
$hashPortable = (Get-FileHash -LiteralPath (Join-Path $dir $portable) -Algorithm SHA256).Hash.ToLower()
$hashSetup    = (Get-FileHash -LiteralPath (Join-Path $dir $setup)    -Algorithm SHA256).Hash.ToLower()

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$sums = "$hashPortable  $portable`n$hashSetup  $setup`n"
[System.IO.File]::WriteAllText((Join-Path $dir 'SHA256SUMS.txt'), $sums, $utf8NoBom)
Write-Ok 'SHA256SUMS.txt written'

# --- release notes ---------------------------------------------------------
$date = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')

$notes = @"
## B mark $Version — $date

<div align="right">

### دانلود

| فایل | توضیح |
|---|---|
| ``$portable`` | نسخهٔ پرتابل. بدون نصب، بدون دسترسی مدیر. |
| ``$setup`` | نصب‌کنندهٔ تک‌کاربره در ``%LOCALAPPDATA%\Programs``؛ میان‌بر منوی استارت و ثبت پسوند ``.md``. بدون UAC، بدون نوشتن در HKLM. زبان نصب (فارسی/انگلیسی) در ابتدا پرسیده می‌شود. |

### پیش‌نیاز

**Microsoft Edge WebView2 Runtime** لازم است؛ روی ویندوز ۱۱ و ویندوز ۱۰ به‌روز
از پیش نصب است. B mark هرگز آن را بی‌اطلاع شما دانلود نمی‌کند؛ اگر نبود، پیام
دوزبانه می‌دهد و لینک رسمی مایکروسافت را نشان می‌دهد.

### هشدار صادقانه

این فایل‌ها **امضای دیجیتال ندارند**. SmartScreen ممکن است بار اول اخطار بدهد و
بعضی آنتی‌ویروس‌ها به فایل‌های اجرایی امضانشده حساس‌اند. چک‌سام زیر را با
``SHA256SUMS.txt`` مقایسه کنید. جزئیات در ``SECURITY.fa.md``.

</div>

### Downloads

| File | Notes |
|---|---|
| ``$portable`` | Portable. No installation, no Administrator. |
| ``$setup`` | Per-user installer into ``%LOCALAPPDATA%\Programs``, Start Menu entry, ``.md`` association. No UAC, nothing in HKLM. Asks for the installer language (Persian/English) on every run. |

**Requires the Microsoft Edge WebView2 Runtime**, present on Windows 11 and
current Windows 10. B mark never downloads it silently.

**These binaries are not code-signed.** SmartScreen may warn on first run and
some antivirus engines flag unsigned executables. Verify the SHA-256 below.
See ``SECURITY.md`` for exactly what is and is not claimed.

### سازنده / Author

B mark را **مسعود برودایه** با کمک Arena ساخته است. ساختش هزینه‌ای نداشت، پس
رایگان هم منتشر می‌شود — تحت مجوز MIT.

Built by **Masoud Borodayeh** with help from Arena. It cost nothing to make,
so it is released free of charge under the MIT licence.

### SHA-256

``````
$hashPortable  $portable
$hashSetup  $setup
``````
"@

[System.IO.File]::WriteAllText((Join-Path $dir 'RELEASE-NOTES.md'), $notes, $utf8NoBom)
Write-Ok 'RELEASE-NOTES.md written'

Write-Host ''
Write-Host "Assets ready in dist-release\v$Version :"
Get-ChildItem -LiteralPath $dir -File | ForEach-Object { Write-Host "  $($_.Name)" }
Write-Host ''
Write-Host @"
Next:

  git tag -a v$Version -m "B mark $Version"
  git push origin main --tags

  gh release create v$Version ``
    "$dir\$portable" ``
    "$dir\$setup" ``
    "$dir\SHA256SUMS.txt" ``
    --title "B mark $Version" ``
    --notes-file "$dir\RELEASE-NOTES.md"

No gh CLI? Open https://github.com/borodayeh/b-mark/releases/new , choose the
tag, drag the three files onto the page, and paste RELEASE-NOTES.md into the
description box.
"@
