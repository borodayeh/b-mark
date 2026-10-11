; ============================================================================
;  B mark — per-user Windows installer
; ============================================================================
;
;  Design constraints, all of them deliberate:
;
;    * NO ADMINISTRATOR.  `RequestExecutionLevel user` means Windows never
;      shows a UAC prompt. Everything is written under the current user's
;      profile: files to %LOCALAPPDATA%\Programs, registry to HKCU. Nothing
;      touches Program Files, HKLM, or any other user's account.
;
;    * FILE ASSOCIATIONS, HONESTLY.  Since Windows 8, an installer cannot
;      silently make itself the default handler for a file type — Microsoft
;      moved that decision to the user on purpose, and anything that tries to
;      force it is either broken or malware-shaped. So this registers a ProgID
;      and adds it to `OpenWithProgids`, which puts "B mark" in the Open With
;      list and in Default Apps. The first time you double-click a .md file
;      Windows asks you to choose; pick B mark and tick "Always". After that it
;      opens automatically, which is what you actually wanted.
;
;    * NO BUNDLED RUNTIME.  B mark needs the Edge WebView2 Runtime, which ships
;      with Windows. The installer checks for it and warns if it is missing,
;      but it will not download or install anything on your behalf.
;
;  Build:  makensis -DVERSION=0.1.0 installer/b-mark.nsi
;  or:     ./scripts/build-installer.sh
; ============================================================================

Unicode true
ManifestDPIAware true

; 64-bit installer. B mark itself is x64-only, so there is nothing to gain
; from a 32-bit stub, and a native installer writes to the 64-bit registry
; view without any SetRegView juggling.
Target amd64-unicode

!ifndef VERSION
  !define VERSION "0.1.0"
!endif
!ifndef SRCEXE
  ; Which executable to package. The portable build is copied to a versioned
  ; name and the original deleted, and the order of those two steps in the
  ; workflow is not something this script can rely on — it broke the build once
  ; already. So: prefer the plain name, and fall back to the versioned copy,
  ; which is a byte-for-byte copy of the same build. Either way the installer
  ; contains the same executable, and no ordering mistake can produce a broken
  ; one.
  !if /FileExists "..\release\B mark.exe"
    !define SRCEXE "..\release\B mark.exe"
  !else
    !define SRCEXE "..\release\B mark ${VERSION} Portable.exe"
  !endif
!endif
!ifndef OUTFILE
  !define OUTFILE "..\release\B mark ${VERSION} setup.exe"
!endif

!define APPNAME      "B mark"
!define EXENAME      "B mark.exe"
!define PUBLISHER    "Masoud Borodayeh"
!define HOMEPAGE     "https://github.com/borodayeh/b-mark"
!define PROGID       "BMark.Markdown"
!define REGUNINST    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
!define REGAPP       "Software\${APPNAME}"

Name "${APPNAME}"
OutFile "${OUTFILE}"
BrandingText "${APPNAME} ${VERSION}"
SetCompressor /SOLID lzma
XPStyle on

; Per-user install. This single line is what removes the UAC prompt.
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"
InstallDirRegKey HKCU "${REGAPP}" "InstallDir"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName"     "${APPNAME}"
VIAddVersionKey /LANG=1033 "FileDescription" "${APPNAME} installer"
VIAddVersionKey /LANG=1033 "FileVersion"     "${VERSION}"
VIAddVersionKey /LANG=1033 "ProductVersion"  "${VERSION}"
VIAddVersionKey /LANG=1033 "CompanyName"     "${PUBLISHER}"
VIAddVersionKey /LANG=1033 "LegalCopyright"  "Copyright (c) 2026 ${PUBLISHER}"

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "WinCore.nsh"

!define MUI_ICON   "..\src-tauri\icons\icon.ico"
!define MUI_UNICON "..\src-tauri\icons\icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXENAME}"
; Page text is resolved at run time, so a LangString works here (unlike in
; .onInit, where $(...) resolved to English regardless of $LANGUAGE).
!define MUI_FINISHPAGE_TEXT "$(FinishText)"
; --- Always ask, every time ---
;
; MUI remembers the choice in HKCU and then silently skips the dialog on every
; later run. For a single-language product that is a kindness; for a bilingual
; one it means a user who picked the wrong language once, or who is installing
; for someone else, can never get back to the prompt. This is a two-language
; product whose whole point is that both are first class, so it asks each time.
!define MUI_LANGDLL_ALWAYSSHOW

; The prompt is the one dialog shown *before* a language exists, so it cannot
; be in only one of them.
!define MUI_LANGDLL_WINDOWTITLE "B mark — Language / زبان"
!define MUI_LANGDLL_INFO "Please select a language:$\r$\nزبان نصب را انتخاب کنید:"
!define MUI_LANGDLL_ALLLANGUAGES
!define MUI_LANGDLL_REGISTRY_ROOT "HKCU"
!define MUI_LANGDLL_REGISTRY_KEY "${REGAPP}"
!define MUI_LANGDLL_REGISTRY_VALUENAME "InstallerLanguage"

!insertmacro MUI_PAGE_LICENSE "..\LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Farsi"

; ---------------------------------------------------------------- strings --

LangString SecCore_Name     ${LANG_ENGLISH} "B mark (required)"
LangString SecCore_Name     ${LANG_FARSI}   "B mark (الزامی)"
LangString SecCore_Desc     ${LANG_ENGLISH} "The application itself."
LangString SecCore_Desc     ${LANG_FARSI}   "خود برنامه."

LangString SecStart_Name    ${LANG_ENGLISH} "Start Menu shortcut"
LangString SecStart_Name    ${LANG_FARSI}   "میانبر منوی استارت"
LangString SecStart_Desc    ${LANG_ENGLISH} "Add B mark to the Start Menu."
LangString SecStart_Desc    ${LANG_FARSI}   "افزودن B mark به منوی استارت."

LangString SecDesktop_Name  ${LANG_ENGLISH} "Desktop shortcut"
LangString SecDesktop_Name  ${LANG_FARSI}   "میانبر دسکتاپ"
LangString SecDesktop_Desc  ${LANG_ENGLISH} "Put a shortcut on the desktop."
LangString SecDesktop_Desc  ${LANG_FARSI}   "قرار دادن یک میانبر روی دسکتاپ."

LangString SecAssoc_Name    ${LANG_ENGLISH} "Open Markdown files with B mark"
LangString SecAssoc_Name    ${LANG_FARSI}   "باز کردن فایل‌های مارک‌داون با B mark"
LangString SecAssoc_Desc    ${LANG_ENGLISH} "Register .md, .markdown, .mdown, .mkd, .mdwn and .mdtxt so B mark appears in Open With and in Default Apps. Windows will ask you to confirm the first time you open one."
LangString SecAssoc_Desc    ${LANG_FARSI}   "ثبت پسوندهای .md و .markdown و .mdown و .mkd و .mdwn و .mdtxt تا B mark در فهرست «Open with» و «Default Apps» ظاهر شود. اولین باری که چنین فایلی را باز کنید، ویندوز از شما تأیید می‌خواهد."

; --- Bilingual by construction, not by language table ---
;
; This message is shown from `.onInit`, before the user has meaningfully
; chosen anything, and a language table lookup there proved unreliable: with
; $LANGUAGE correctly set to 1065 the Farsi table was still not selected, so a
; Persian user got an English wall of text at the one moment they most need to
; understand it. Carrying both languages in one string removes the dependency
; on the lookup entirely — which is also exactly what the application itself
; does for the same message (see src-tauri/src/webview2.rs).
!define WV2_FA "به WebView2 Runtime نیاز است$\r$\n$\r$\nمؤلفهٔ Microsoft Edge WebView2 Runtime روی این دستگاه پیدا نشد. B mark از طریق آن نمایش داده می‌شود، پس تا نصب نشود برنامه اجرا نخواهد شد.$\r$\n$\r$\nاین یک مؤلفهٔ رایگان مایکروسافت است و روی ویندوز ۱۱ و ویندوز ۱۰ به‌روز از پیش نصب است. از این نشانی نصبش کنید:$\r$\nhttps://developer.microsoft.com/microsoft-edge/webview2/$\r$\n$\r$\nنصب ادامه پیدا می‌کند. B mark خودش چیزی دانلود نمی‌کند.$\r$\n$\r$\nادامه می‌دهید؟"
!define WV2_EN "WebView2 Runtime is required$\r$\n$\r$\nThe Microsoft Edge WebView2 Runtime was not found on this machine. B mark renders through it, so the application will not start until it is installed.$\r$\n$\r$\nIt is a free Microsoft component, already present on Windows 11 and current Windows 10. Install it from:$\r$\nhttps://developer.microsoft.com/microsoft-edge/webview2/$\r$\n$\r$\nThe installation will continue. B mark will not download anything on its own.$\r$\n$\r$\nContinue?"
!define MSG_NO_WEBVIEW2 "${WV2_FA}$\r$\n$\r$\n----------------------------------------$\r$\n$\r$\n${WV2_EN}"

LangString MsgRunning       ${LANG_ENGLISH} "B mark is running. Please close it and try again."

LangString MsgRunning       ${LANG_FARSI}   "B mark در حال اجراست. لطفاً ببندیدش و دوباره تلاش کنید."

LangString FinishText       ${LANG_ENGLISH} "B mark has been installed.$\r$\n$\r$\nBuilt by Masoud Borodayeh with help from Arena. It cost nothing to make, so it is free: free to use, copy and change under the MIT licence."
LangString FinishText       ${LANG_FARSI}   "B mark نصب شد.$\r$\n$\r$\nساختهٔ مسعود برودایه با کمک Arena. ساختش هزینه‌ای نداشت، پس رایگان است: استفاده، کپی و تغییرش تحت مجوز MIT آزاد است."

LangString TypeName         ${LANG_ENGLISH} "Markdown Document"
LangString TypeName         ${LANG_FARSI}   "سند مارک‌داون"

; --------------------------------------------------------------- helpers --

; Registers one extension: point OpenWithProgids at our ProgID and leave the
; user's existing default alone.
!macro RegisterExt EXT
  WriteRegStr HKCU "Software\Classes\${EXT}\OpenWithProgids" "${PROGID}" ""
  WriteRegStr HKCU "Software\Classes\Applications\${EXENAME}\SupportedTypes" "${EXT}" ""
!macroend

!macro UnregisterExt EXT
  DeleteRegValue HKCU "Software\Classes\${EXT}\OpenWithProgids" "${PROGID}"
  DeleteRegValue HKCU "Software\Classes\Applications\${EXENAME}\SupportedTypes" "${EXT}"
!macroend

Function .onInit
  !insertmacro MUI_LANGDLL_DISPLAY

  ; WebView2 lives under the Edge Update client key. Check both the per-machine
  ; (32-bit view) and per-user locations, exactly as the app itself does.
  StrCpy $0 ""
  SetRegView 32
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  SetRegView lastused
  ${If} $0 == ""
    ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${EndIf}
  ${If} $0 == ""
  ${OrIf} $0 == "0.0.0.0"
    ; /SD IDYES: in a silent or unattended install there is nobody to answer,
    ; and a missing runtime is a warning rather than a reason to refuse to
    ; install — the user can add WebView2 afterwards. Without this the
    ; installer blocks forever on `setup.exe /S`.
    MessageBox MB_YESNO|MB_ICONEXCLAMATION "${MSG_NO_WEBVIEW2}" /SD IDYES IDYES +2
      Abort
  ${EndIf}
FunctionEnd

; ---------------------------------------------------------------- install --

Section "$(SecCore_Name)" SecCore
  SectionIn RO
  SetOutPath "$INSTDIR"

  ; Refuse to overwrite a running executable rather than half-installing.
  ClearErrors
  Delete "$INSTDIR\${EXENAME}"
  ${If} ${Errors}
  ${AndIf} ${FileExists} "$INSTDIR\${EXENAME}"
    MessageBox MB_OK|MB_ICONSTOP "$(MsgRunning)" /SD IDOK
    Abort
  ${EndIf}

  File "/oname=${EXENAME}" "${SRCEXE}"
  File "/oname=LICENSE.txt" "..\LICENSE"
  File "/oname=Vazirmatn-OFL.txt" "..\assets\fonts\Vazirmatn-OFL.txt"

  WriteRegStr HKCU "${REGAPP}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${REGAPP}" "Version" "${VERSION}"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Add/Remove Programs entry — HKCU, so it appears for this user only.
  WriteRegStr   HKCU "${REGUNINST}" "DisplayName"     "${APPNAME}"
  WriteRegStr   HKCU "${REGUNINST}" "DisplayVersion"  "${VERSION}"
  WriteRegStr   HKCU "${REGUNINST}" "DisplayIcon"     "$INSTDIR\${EXENAME},0"
  WriteRegStr   HKCU "${REGUNINST}" "Publisher"       "${PUBLISHER}"
  WriteRegStr   HKCU "${REGUNINST}" "URLInfoAbout"    "${HOMEPAGE}"
  WriteRegStr   HKCU "${REGUNINST}" "InstallLocation" "$INSTDIR"
  WriteRegStr   HKCU "${REGUNINST}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr   HKCU "${REGUNINST}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${REGUNINST}" "NoModify" 1
  WriteRegDWORD HKCU "${REGUNINST}" "NoRepair" 1

  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${REGUNINST}" "EstimatedSize" "$0"
SectionEnd

Section "$(SecStart_Name)" SecStart
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Uninstall ${APPNAME}.lnk" "$INSTDIR\Uninstall.exe"
SectionEnd

Section /o "$(SecDesktop_Name)" SecDesktop
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0
SectionEnd

Section "$(SecAssoc_Name)" SecAssoc
  ; --- the ProgID: what Windows shows and how it launches us ---
  WriteRegStr HKCU "Software\Classes\${PROGID}" "" "$(TypeName)"
  WriteRegStr HKCU "Software\Classes\${PROGID}" "FriendlyTypeName" "$(TypeName)"
  WriteRegStr HKCU "Software\Classes\${PROGID}\DefaultIcon" "" "$INSTDIR\${EXENAME},0"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell\open" "" "Open with ${APPNAME}"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell\open\command" "" '"$INSTDIR\${EXENAME}" "%1"'

  ; --- the application entry: puts us in the Open With list ---
  WriteRegStr HKCU "Software\Classes\Applications\${EXENAME}" "FriendlyAppName" "${APPNAME}"
  WriteRegStr HKCU "Software\Classes\Applications\${EXENAME}\DefaultIcon" "" "$INSTDIR\${EXENAME},0"
  WriteRegStr HKCU "Software\Classes\Applications\${EXENAME}\shell\open\command" "" '"$INSTDIR\${EXENAME}" "%1"'

  ; --- RegisteredApplications: makes us selectable in Settings > Default Apps ---
  WriteRegStr HKCU "Software\Classes\Applications\${EXENAME}\shell\open" "FriendlyAppName" "${APPNAME}"
  WriteRegStr HKCU "Software\${APPNAME}\Capabilities" "ApplicationName" "${APPNAME}"
  WriteRegStr HKCU "Software\${APPNAME}\Capabilities" "ApplicationDescription" "Markdown viewer with first-class Persian and RTL support"
  WriteRegStr HKCU "Software\${APPNAME}\Capabilities\FileAssociations" ".md" "${PROGID}"
  WriteRegStr HKCU "Software\${APPNAME}\Capabilities\FileAssociations" ".markdown" "${PROGID}"
  WriteRegStr HKCU "Software\${APPNAME}\Capabilities\FileAssociations" ".mdown" "${PROGID}"
  WriteRegStr HKCU "Software\${APPNAME}\Capabilities\FileAssociations" ".mkd" "${PROGID}"
  WriteRegStr HKCU "Software\${APPNAME}\Capabilities\FileAssociations" ".mdwn" "${PROGID}"
  WriteRegStr HKCU "Software\${APPNAME}\Capabilities\FileAssociations" ".mdtxt" "${PROGID}"
  WriteRegStr HKCU "Software\RegisteredApplications" "${APPNAME}" "Software\${APPNAME}\Capabilities"

  ; --- the extensions themselves ---
  !insertmacro RegisterExt ".md"
  !insertmacro RegisterExt ".markdown"
  !insertmacro RegisterExt ".mdown"
  !insertmacro RegisterExt ".mkd"
  !insertmacro RegisterExt ".mdwn"
  !insertmacro RegisterExt ".mdtxt"

  ; Tell Explorer to re-read the association tables now, so the new entry
  ; shows up without a sign-out. SHCNE_ASSOCCHANGED = 0x08000000.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecCore}    "$(SecCore_Desc)"
  !insertmacro MUI_DESCRIPTION_TEXT ${SecStart}   "$(SecStart_Desc)"
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} "$(SecDesktop_Desc)"
  !insertmacro MUI_DESCRIPTION_TEXT ${SecAssoc}   "$(SecAssoc_Desc)"
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; -------------------------------------------------------------- uninstall --

Function un.onInit
  !insertmacro MUI_UNGETLANGUAGE
FunctionEnd

Section "Uninstall"
  Delete "$INSTDIR\${EXENAME}"
  Delete "$INSTDIR\LICENSE.txt"
  Delete "$INSTDIR\Vazirmatn-OFL.txt"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"

  Delete "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${APPNAME}\Uninstall ${APPNAME}.lnk"
  RMDir  "$SMPROGRAMS\${APPNAME}"
  Delete "$DESKTOP\${APPNAME}.lnk"

  !insertmacro UnregisterExt ".md"
  !insertmacro UnregisterExt ".markdown"
  !insertmacro UnregisterExt ".mdown"
  !insertmacro UnregisterExt ".mkd"
  !insertmacro UnregisterExt ".mdwn"
  !insertmacro UnregisterExt ".mdtxt"

  DeleteRegKey HKCU "Software\Classes\${PROGID}"
  DeleteRegKey HKCU "Software\Classes\Applications\${EXENAME}"
  DeleteRegValue HKCU "Software\RegisteredApplications" "${APPNAME}"
  DeleteRegKey HKCU "Software\${APPNAME}\Capabilities"
  DeleteRegKey HKCU "${REGUNINST}"
  DeleteRegKey /ifempty HKCU "${REGAPP}"

  ; User settings are left in %APPDATA%\app.bmark.viewer on purpose: an
  ; uninstall should not silently destroy configuration the user may want back
  ; after reinstalling. Delete that folder by hand if you want a clean slate.

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
SectionEnd
