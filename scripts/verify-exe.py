#!/usr/bin/env python3
"""
Post-build verification for release/B mark.exe.

Catches the failure modes that produce a binary which looks fine but is not:
a console window in release, a missing icon, an unembedded frontend (blank
window), or a hidden dependency on the Visual C++ Redistributable.

    pip install pefile
    python scripts/verify-exe.py "release/B mark.exe"
"""

from __future__ import annotations

import os
import struct
import sys
from pathlib import Path

try:
    import pefile
except ImportError:
    sys.exit("pefile is required:  pip install pefile")

ROOT = Path(__file__).resolve().parent.parent

# DLLs a Markdown viewer has any business importing. Anything else is worth a
# second look — both for correctness and because unusual imports are exactly
# what antivirus heuristics react to.
EXPECTED_DLL_PREFIXES = (
    "kernel32", "user32", "advapi32", "ole32", "oleaut32", "shell32",
    "shlwapi", "gdi32", "comctl32", "dwmapi", "ntdll", "bcrypt",
    "api-ms-win-core", "version", "userenv", "ws2_32", "crypt32",
    "propsys", "uxtheme", "imm32", "dbghelp", "windowscodecs",
)

failures: list[str] = []
warnings: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{'  ' + detail if detail else ''}")
    if not ok:
        failures.append(label)


def main() -> int:
    exe = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "release" / "B mark.exe")
    if not exe.is_file():
        sys.exit(f"not found: {exe}")

    data = exe.read_bytes()
    pe = pefile.PE(str(exe))

    print(f"== verifying {exe.name} ({len(data) / 1024 / 1024:.2f} MB) ==\n")

    print("-- format --")
    check("PE32+ executable", data[:2] == b"MZ" and data[struct.unpack_from("<I", data, 0x3C)[0]:][:4] == b"PE\0\0")
    check("x86-64 machine type", pe.FILE_HEADER.Machine == 0x8664, hex(pe.FILE_HEADER.Machine))
    # Subsystem 2 = Windows GUI. Subsystem 3 would flash a console window.
    check("Windows GUI subsystem (no console window)", pe.OPTIONAL_HEADER.Subsystem == 2)

    print("\n-- resources --")
    res = {}
    if hasattr(pe, "DIRECTORY_ENTRY_RESOURCE"):
        res = {e.id: len(e.directory.entries) for e in pe.DIRECTORY_ENTRY_RESOURCE.entries}
    check("application icon embedded", res.get(3, 0) > 0, f"{res.get(3, 0)} sizes")
    check("icon group present", res.get(14, 0) > 0)
    check("version resource present", res.get(16, 0) > 0)
    check("application manifest present", res.get(24, 0) > 0)

    print("\n-- version info --")
    fields: dict[str, str] = {}
    for fi in getattr(pe, "FileInfo", []):
        for entry in fi:
            for st in getattr(entry, "StringTable", []):
                fields.update({k.decode(): v.decode() for k, v in st.entries.items()})
    for key in ("ProductName", "FileDescription", "FileVersion", "CompanyName", "LegalCopyright"):
        check(f"{key} set", bool(fields.get(key)), fields.get(key, ""))

    print("\n-- embedded frontend --")
    dist = ROOT / "dist" / "assets"
    if dist.is_dir():
        names = sorted(os.listdir(dist))
        embedded = [n for n in names if b"/assets/" + n.encode() in data]
        # Without the `custom-protocol` feature Tauri expects a dev server and
        # the release binary opens a blank window.
        check("all frontend assets embedded", len(embedded) == len(names), f"{len(embedded)}/{len(names)}")
        check("index.html embedded", b"/index.html" in data)
        fonts = [n for n in embedded if n.endswith(".woff2")]
        check("Vazirmatn shipped inside the exe", len(fonts) >= 9, f"{len(fonts)} weights")
    else:
        warnings.append("dist/ not present — run `npm run build` before verifying")

    print("\n-- runtime dependencies --")
    dlls = [d.dll.decode().lower() for d in pe.DIRECTORY_ENTRY_IMPORT]
    vcrt = [d for d in dlls if "vcruntime" in d or "msvcp" in d or "api-ms-win-crt" in d]
    check("no Visual C++ Redistributable dependency", not vcrt, ", ".join(vcrt))
    unexpected = [d for d in dlls if not d.startswith(EXPECTED_DLL_PREFIXES)]
    check("no unexpected DLL imports", not unexpected, ", ".join(unexpected))
    print(f"        imports {len(dlls)} system DLLs")

    print("\n-- integrity --")
    import hashlib
    digest = hashlib.sha256(data).hexdigest()
    print(f"        sha256  {digest}")

    if warnings:
        print("\n-- warnings --")
        for w in warnings:
            print(f"  WARN  {w}")

    print()
    if failures:
        print(f"FAILED: {len(failures)} check(s) — " + "; ".join(failures))
        return 1
    print("ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
