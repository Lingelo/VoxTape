mod resampler;

use std::ffi::{c_void, CStr};
use std::os::raw::c_char;
use std::sync::{Arc, Mutex, OnceLock};

use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;

use resampler::Resampler;

// ── Global capture state ────────────────────────────────────────────────────

/// Tracks which capture backend is active.
enum CaptureBackend {
    /// ScreenCaptureKit SCStream (primary, works on macOS 26+)
    Sck,
}

struct CaptureState {
    backend: CaptureBackend,
}

static CAPTURE_STATE: OnceLock<Mutex<Option<CaptureState>>> = OnceLock::new();

fn state_mutex() -> &'static Mutex<Option<CaptureState>> {
    CAPTURE_STATE.get_or_init(|| Mutex::new(None))
}

/// Shared context passed to the SCK audio callback via user_data pointer.
struct CallbackContext {
    callback: ThreadsafeFunction<Buffer>,
    resampler: Mutex<Resampler>,
}

unsafe impl Send for CallbackContext {}
unsafe impl Sync for CallbackContext {}

static CALLBACK_CONTEXT: OnceLock<Mutex<Option<Arc<CallbackContext>>>> = OnceLock::new();

fn context_mutex() -> &'static Mutex<Option<Arc<CallbackContext>>> {
    CALLBACK_CONTEXT.get_or_init(|| Mutex::new(None))
}

// ── SCK Audio Callback ─────────────────────────────────────────────────────

/// C callback invoked by the ObjC SCStream delegate.
/// Receives float32 interleaved PCM data, resamples to 16kHz mono Int16,
/// and sends to JS via ThreadsafeFunction.
unsafe extern "C" fn sck_audio_callback(
    data: *const f32,
    frame_count: u32,
    channels: u32,
    sample_rate: u32,
    user_data: *mut c_void,
) {
    if data.is_null() || user_data.is_null() || frame_count == 0 {
        return;
    }

    let ctx = &*(user_data as *const CallbackContext);

    let total_samples = (frame_count * channels) as usize;
    let float_slice = std::slice::from_raw_parts(data, total_samples);

    // Resample to 16kHz mono Int16
    let int16_samples = {
        let mut resampler = match ctx.resampler.lock() {
            Ok(r) => r,
            Err(_) => return,
        };
        resampler.process(float_slice, channels, sample_rate)
    };

    if int16_samples.is_empty() {
        return;
    }

    // Convert Int16 slice to bytes for the Buffer
    let byte_len = int16_samples.len() * 2;
    let byte_slice =
        std::slice::from_raw_parts(int16_samples.as_ptr() as *const u8, byte_len);

    let buffer = Buffer::from(byte_slice);

    // Non-blocking call to JS
    ctx.callback.call(Ok(buffer), ThreadsafeFunctionCallMode::NonBlocking);
}

// ── FFI declarations for ObjC bridge ────────────────────────────────────────

type SckAudioCallback = unsafe extern "C" fn(
    data: *const f32,
    frame_count: u32,
    channels: u32,
    sample_rate: u32,
    user_data: *mut c_void,
);

extern "C" {
    fn sourdine_sck_start_capture(
        callback: SckAudioCallback,
        user_data: *mut c_void,
    ) -> i32;

    fn sourdine_sck_stop_capture();

    fn sourdine_has_screen_capture_access() -> i32;
    fn sourdine_request_screen_capture_access() -> i32;
    fn sourdine_request_sck_permission() -> i32;
}

// ── Exported API ────────────────────────────────────────────────────────────

/// Check if system audio capture is supported on this platform.
/// Requires macOS 14.2+ (Sonoma).
#[napi]
pub fn is_supported() -> bool {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let output = Command::new("sw_vers")
            .arg("-productVersion")
            .output();

        match output {
            Ok(out) => {
                let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
                let parts: Vec<u32> = version
                    .split('.')
                    .filter_map(|p| p.parse().ok())
                    .collect();
                // macOS 14.2+
                if parts.len() >= 2 {
                    parts[0] > 14 || (parts[0] == 14 && parts[1] >= 2)
                } else if parts.len() == 1 {
                    parts[0] > 14
                } else {
                    false
                }
            }
            Err(_) => false,
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

/// Check if the app has Screen Capture (Screen Recording) access.
#[napi]
pub fn has_screen_capture_access() -> bool {
    #[cfg(target_os = "macos")]
    unsafe {
        sourdine_has_screen_capture_access() != 0
    }
    #[cfg(not(target_os = "macos"))]
    false
}

/// Request Screen Capture access (triggers macOS permission dialog).
#[napi]
pub fn request_screen_capture_access() -> bool {
    #[cfg(target_os = "macos")]
    unsafe {
        sourdine_request_screen_capture_access() != 0
    }
    #[cfg(not(target_os = "macos"))]
    false
}

/// Request Screen & System Audio Recording permission via ScreenCaptureKit.
#[napi]
pub fn request_audio_capture_permission() -> bool {
    #[cfg(target_os = "macos")]
    unsafe {
        sourdine_request_sck_permission() != 0
    }
    #[cfg(not(target_os = "macos"))]
    false
}

/// Start capturing system audio via ScreenCaptureKit.
/// The callback receives Buffer chunks of 16kHz mono Int16 PCM data.
#[napi]
pub fn start_capture(
    callback: ThreadsafeFunction<Buffer>,
) -> Result<()> {
    // Check if already capturing
    {
        let state = state_mutex().lock().map_err(|e| {
            Error::from_reason(format!("Failed to acquire state lock: {}", e))
        })?;
        if state.is_some() {
            return Err(Error::from_reason("Already capturing system audio"));
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        return Err(Error::from_reason("System audio capture is only supported on macOS 14.2+"));
    }

    #[cfg(target_os = "macos")]
    unsafe {
        // Create the callback context
        let ctx = Arc::new(CallbackContext {
            callback,
            resampler: Mutex::new(Resampler::new()),
        });

        // Store context globally so it stays alive
        {
            let mut ctx_guard = context_mutex().lock().map_err(|e| {
                Error::from_reason(format!("Failed to acquire context lock: {}", e))
            })?;
            *ctx_guard = Some(Arc::clone(&ctx));
        }

        let user_data = Arc::as_ptr(&ctx) as *mut c_void;

        eprintln!("[native-audio] Starting SCK capture...");

        let result = sourdine_sck_start_capture(sck_audio_callback, user_data);

        if result != 0 {
            // Cleanup context on failure
            if let Ok(mut ctx_guard) = context_mutex().lock() {
                *ctx_guard = None;
            }
            return Err(Error::from_reason(format!(
                "SCK start capture failed with code {}",
                result
            )));
        }

        // Store state
        {
            let mut state = state_mutex().lock().map_err(|e| {
                Error::from_reason(format!("Failed to acquire state lock: {}", e))
            })?;
            *state = Some(CaptureState {
                backend: CaptureBackend::Sck,
            });
        }

        eprintln!("[native-audio] SCK capture active — 48kHz stereo → 16kHz mono Int16");
        Ok(())
    }
}

/// Stop capturing system audio. Cleans up all resources.
#[napi]
pub fn stop_capture() -> Result<()> {
    let capture = {
        let mut state = state_mutex().lock().map_err(|e| {
            Error::from_reason(format!("Failed to acquire state lock: {}", e))
        })?;
        state.take()
    };

    // Clear the callback context
    {
        if let Ok(mut ctx) = context_mutex().lock() {
            *ctx = None;
        }
    }

    let Some(capture) = capture else {
        return Ok(()); // Not capturing, nothing to do
    };

    #[cfg(target_os = "macos")]
    unsafe {
        match capture.backend {
            CaptureBackend::Sck => {
                sourdine_sck_stop_capture();
                eprintln!("[native-audio] SCK capture stopped");
            }
        }
    }

    Ok(())
}

// ── Meeting App Detection ───────────────────────────────────────────────────

/// FFI struct for meeting app info from ObjC
#[repr(C)]
struct CMeetingAppInfo {
    bundle_id: *const c_char,
    name: *const c_char,
    pid: i32,
    is_active: i32,
}

extern "C" {
    fn sourdine_get_running_meeting_apps(out_count: *mut i32) -> *mut CMeetingAppInfo;
    fn sourdine_free_meeting_apps(apps: *mut CMeetingAppInfo, count: i32);
}

/// Information about a detected meeting application
#[napi(object)]
pub struct MeetingAppInfo {
    /// Bundle identifier (e.g., "us.zoom.xos")
    pub bundle_id: String,
    /// Human-readable app name (e.g., "Zoom")
    pub name: String,
    /// Process ID
    pub pid: i32,
    /// Whether the app window is currently active/frontmost
    pub is_active: bool,
}

/// Get list of currently running meeting applications.
/// Returns an array of MeetingAppInfo for any detected meeting apps.
#[napi]
pub fn get_running_meeting_apps() -> Vec<MeetingAppInfo> {
    #[cfg(target_os = "macos")]
    unsafe {
        let mut count: i32 = 0;
        let apps_ptr = sourdine_get_running_meeting_apps(&mut count);

        if apps_ptr.is_null() || count == 0 {
            return Vec::new();
        }

        let mut result = Vec::with_capacity(count as usize);

        for i in 0..count {
            let app = apps_ptr.add(i as usize);

            let bundle_id = if (*app).bundle_id.is_null() {
                String::new()
            } else {
                CStr::from_ptr((*app).bundle_id)
                    .to_string_lossy()
                    .into_owned()
            };

            let name = if (*app).name.is_null() {
                String::new()
            } else {
                CStr::from_ptr((*app).name).to_string_lossy().into_owned()
            };

            result.push(MeetingAppInfo {
                bundle_id,
                name,
                pid: (*app).pid,
                is_active: (*app).is_active != 0,
            });
        }

        sourdine_free_meeting_apps(apps_ptr, count);
        result
    }

    #[cfg(not(target_os = "macos"))]
    {
        Vec::new()
    }
}
