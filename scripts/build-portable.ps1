<#
.SYNOPSIS
    Builds the portable "B mark.exe" for Windows.

.DESCRIPTION
    Produces an unsigned, portable executable in release/.
    Requires: Node.js 20+, Rust (MSVC toolchain), and the Tauri prerequisites.

.PARAMETER Arch
    x64 (default) or arm64. ARM64 is only produced when the Rust target is
    actually installed; see BUILD.md.

.PARAMETER Sign
    Path to a PFX certificate. When omitted the executable is left UNSIGNED
    and the script says so explicitly — it never pretends otherwise.

.EXAMPLE
    .\scripts\build-portable.ps1
    .\scripts\build-portable.ps1 -Arch arm64
    .\scripts\build-portable.ps1 -RegenerateIcons   # only after editing an SVG
#>
[CmdletBinding()]
param(
    [ValidateSet('x64', 'arm64')]
    [string]$Arch = 'x64',

    # Regenerate the PNG/ICO from the SVG masters. Off by default: the icons are
    # committed, so a normal build must not depend on cairosvg - which needs the
    # native Cairo library that a stock Windows machine (and the GitHub Windows
    # runner image) does not have. Turn this on only after editing an SVG, and
    # only on a machine where `pip install cairosvg pillow` already works.
    [switch]$RegenerateIcons,

    [string]$Sign,
    [string]$SignPassword,
    [string]$TimestampUrl = 'http://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

try {
    $target = if ($Arch -eq 'arm64') { 'aarch64-pc-windows-msvc' } else { 'x86_64-pc-windows-msvc' }

    Write-Host "== B mark portable build ==" -ForegroundColor Cyan
    Write-Host "   target : $target"

    # --- toolchain check -----------------------------------------------------
    foreach ($tool in @('node', 'npm', 'cargo', 'rustc')) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
            throw "$tool was not found on PATH. See BUILD.md."
        }
    }
    if (-not (rustup target list --installed | Select-String -SimpleMatch $target)) {
        throw "Rust target '$target' is not installed. Run: rustup target add $target"
    }

    # --- frontend ------------------------------------------------------------
    Write-Host "-> installing dependencies" -ForegroundColor Yellow
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }

    if ($RegenerateIcons) {
        Write-Host "-> regenerating branding from the SVG masters" -ForegroundColor Yellow
        # Preflight instead of a traceback half-way through a build: cairosvg
        # imports the native Cairo library, and without it the script dies on
        # `import cairosvg` after npm ci has already run.
        python -c "import cairosvg, PIL" 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw "cairosvg/Pillow are not usable here (they need the native Cairo library). Install them, or drop -RegenerateIcons: the icons in src-tauri/icons are committed and current."
        }
        python scripts/generate-branding.py
        if ($LASTEXITCODE -ne 0) { throw 'icon regeneration failed' }
    } else {
        Write-Host "-> using the committed icons (pass -RegenerateIcons to rebuild them)" -ForegroundColor DarkGray
    }

    Write-Host "-> typecheck and tests" -ForegroundColor Yellow
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw 'typecheck failed' }
    npm test
    if ($LASTEXITCODE -ne 0) { throw 'tests failed' }

    # --- bundle --------------------------------------------------------------
    Write-Host "-> cargo/tauri release build" -ForegroundColor Yellow
    npm run tauri -- build --target $target --bundles none
    if ($LASTEXITCODE -ne 0) { throw 'tauri build failed' }

    $built = Join-Path $root "src-tauri\target\$target\release\b-mark.exe"
    if (-not (Test-Path $built)) { throw "expected binary not found: $built" }

    $releaseDir = Join-Path $root 'release'
    New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
    $out = Join-Path $releaseDir 'B mark.exe'
    Copy-Item $built $out -Force

    # --- optional signing ----------------------------------------------------
    if ($Sign) {
        Write-Host "-> signing with $Sign" -ForegroundColor Yellow
        $signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
        if (-not $signtool) { throw 'signtool.exe not found (install the Windows SDK).' }
        $args = @('sign', '/fd', 'SHA256', '/f', $Sign, '/tr', $TimestampUrl, '/td', 'SHA256')
        if ($SignPassword) { $args += @('/p', $SignPassword) }
        $args += $out
        & $signtool.Source @args
        if ($LASTEXITCODE -ne 0) { throw 'signing failed' }
        Write-Host "   signed and timestamped." -ForegroundColor Green
    }
    else {
        Write-Host "   NOTE: this executable is UNSIGNED." -ForegroundColor DarkYellow
        Write-Host "   Windows SmartScreen may warn about it, and some antivirus" -ForegroundColor DarkYellow
        Write-Host "   engines may flag unsigned binaries as suspicious. See" -ForegroundColor DarkYellow
        Write-Host "   SECURITY.md for what we do and do not claim about this." -ForegroundColor DarkYellow
    }

    # --- hash ----------------------------------------------------------------
    $hash = (Get-FileHash $out -Algorithm SHA256).Hash.ToLower()
    $size = [math]::Round((Get-Item $out).Length / 1MB, 2)
    "$hash  B mark.exe" | Set-Content (Join-Path $releaseDir 'SHA256SUMS.txt') -Encoding ascii

    Write-Host ""
    Write-Host "== done ==" -ForegroundColor Green
    Write-Host "   file   : $out"
    Write-Host "   size   : $size MB"
    Write-Host "   sha256 : $hash"
    Write-Host ""
    Write-Host "   Requires the Microsoft Edge WebView2 Runtime, which ships with"
    Write-Host "   Windows 11 and current Windows 10. See README.md."
}
finally {
    Pop-Location
}
