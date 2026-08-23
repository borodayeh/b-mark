//! WebView2 Runtime detection.
//!
//! B mark renders through the Microsoft Edge WebView2 Runtime rather than
//! shipping a browser engine. That is what keeps the executable at ~8 MB, and
//! it is why Persian text shapes correctly — WebView2 brings Chromium's
//! HarfBuzz and Unicode bidi implementation with it.
//!
//! WebView2 is present on Windows 11 and on current Windows 10. When it is
//! missing, Tauri simply fails to create a window and the user sees nothing at
//! all. This module detects that case *before* the window is created and shows
//! a plain native message box in Persian and English.
//!
//! What this module deliberately does NOT do: download or install anything.
//! Silent runtime fetching is exactly the behaviour that gets an application
//! flagged, and users are entitled to install their own system components.

#![cfg(windows)]

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;

use windows_sys::Win32::Foundation::{ERROR_SUCCESS, HANDLE};
use windows_sys::Win32::System::Registry::{
    RegCloseKey, RegGetValueW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE,
    KEY_READ, KEY_WOW64_32KEY, RRF_RT_REG_SZ,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    MessageBoxW, MB_ICONERROR, MB_OK, MB_SETFOREGROUND, MB_TOPMOST,
};

/// The Evergreen WebView2 Runtime's Edge Update client GUID.
const CLIENT_KEY: &str =
    r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

fn wide(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

/// True when the `pv` (product version) value exists and is not "0.0.0.0".
fn has_version(root: HKEY, subkey: &str, extra_flags: u32) -> bool {
    let sub = wide(subkey);
    let mut key: HKEY = std::ptr::null_mut::<std::ffi::c_void>() as HKEY;

    let opened = unsafe {
        RegOpenKeyExW(
            root,
            sub.as_ptr(),
            0,
            KEY_READ | extra_flags,
            &mut key as *mut HKEY,
        )
    };
    if opened != ERROR_SUCCESS {
        return false;
    }

    let name = wide("pv");
    let mut buffer = [0u16; 64];
    let mut size = (buffer.len() * std::mem::size_of::<u16>()) as u32;

    let read = unsafe {
        RegGetValueW(
            key,
            std::ptr::null(),
            name.as_ptr(),
            RRF_RT_REG_SZ,
            std::ptr::null_mut(),
            buffer.as_mut_ptr().cast(),
            &mut size,
        )
    };
    unsafe { RegCloseKey(key) };

    if read != ERROR_SUCCESS {
        return false;
    }

    let end = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
    let version = String::from_utf16_lossy(&buffer[..end]);
    !version.is_empty() && version != "0.0.0.0"
}

/// Is the WebView2 Runtime installed for this machine or this user?
pub fn is_installed() -> bool {
    // Per-machine installs land under the 32-bit registry view on x64.
    has_version(HKEY_LOCAL_MACHINE, CLIENT_KEY, KEY_WOW64_32KEY)
        || has_version(HKEY_LOCAL_MACHINE, CLIENT_KEY, 0)
        // Per-user installs.
        || has_version(HKEY_CURRENT_USER, CLIENT_KEY, 0)
}

/// Bilingual, because a user who cannot read the message cannot fix the
/// problem. Persian first: this application's primary audience.
const MESSAGE: &str = concat!(
    "به WebView2 Runtime نیاز است\r\n\r\n",
    "برنامهٔ B mark از طریق Microsoft Edge WebView2 Runtime نمایش داده می‌شود، ",
    "که معمولاً بخشی از ویندوز است. روی این دستگاه نصب نیست.\r\n\r\n",
    "آن را از صفحهٔ رسمی مایکروسافت نصب کنید و دوباره B mark را اجرا کنید:\r\n",
    "https://developer.microsoft.com/microsoft-edge/webview2/\r\n\r\n",
    "B mark خودش چیزی دانلود یا نصب نمی‌کند.\r\n",
    "\r\n----------------------------------------\r\n\r\n",
    "WebView2 Runtime is required\r\n\r\n",
    "B mark renders through the Microsoft Edge WebView2 Runtime, which is ",
    "normally part of Windows. It is not installed on this machine.\r\n\r\n",
    "Install it from Microsoft's official page, then start B mark again:\r\n",
    "https://developer.microsoft.com/microsoft-edge/webview2/\r\n\r\n",
    "B mark will not download or install anything on its own."
);

pub fn show_missing_dialog() {
    let text = wide(MESSAGE);
    let caption = wide("B mark");
    unsafe {
        MessageBoxW(
            std::ptr::null_mut::<std::ffi::c_void>() as HANDLE,
            text.as_ptr(),
            caption.as_ptr(),
            MB_OK | MB_ICONERROR | MB_SETFOREGROUND | MB_TOPMOST,
        );
    }
}

/// Returns false when the app must not continue.
pub fn ensure_available() -> bool {
    if is_installed() {
        return true;
    }
    show_missing_dialog();
    false
}
