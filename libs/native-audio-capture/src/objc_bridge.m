#import <Foundation/Foundation.h>
#import <CoreAudio/CoreAudio.h>
#import <CoreGraphics/CoreGraphics.h>
#import <CoreMedia/CoreMedia.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <objc/runtime.h>
#import <objc/message.h>

// ── CATapDescription (CoreAudio tap, kept for reference/fallback) ──────────

void *sourdine_create_global_tap_description(void) {
    @try {
        Class cls = NSClassFromString(@"CATapDescription");
        if (!cls) {
            NSLog(@"[native-audio] CATapDescription class not found");
            return NULL;
        }
        id instance = ((id (*)(Class, SEL))objc_msgSend)(cls, sel_registerName("alloc"));
        if (!instance) return NULL;
        NSArray *emptyArray = @[];
        id tapDesc = ((id (*)(id, SEL, id))objc_msgSend)(
            instance, sel_registerName("initStereoGlobalTapButExcludeProcesses:"), emptyArray
        );
        if (!tapDesc) return NULL;
        return (__bridge_retained void *)tapDesc;
    }
    @catch (NSException *exception) {
        NSLog(@"[native-audio] Exception creating tap description: %@", exception);
        return NULL;
    }
}

void sourdine_release_tap_description(void *desc) {
    if (desc) {
        id obj = (__bridge_transfer id)desc;
        obj = nil;
    }
}

// ── Permission helpers ─────────────────────────────────────────────────────

int sourdine_has_screen_capture_access(void) {
    return CGPreflightScreenCaptureAccess() ? 1 : 0;
}

int sourdine_request_screen_capture_access(void) {
    bool result = CGRequestScreenCaptureAccess();
    return result ? 1 : 0;
}

int sourdine_request_sck_permission(void) {
    __block int result = 0;
    dispatch_semaphore_t sem = dispatch_semaphore_create(0);
    [SCShareableContent getShareableContentExcludingDesktopWindows:NO
                                                onScreenWindowsOnly:NO
                                                  completionHandler:^(SCShareableContent *content, NSError *error) {
        if (error) {
            NSLog(@"[native-audio] SCK permission error: %@ (code=%ld)", error.localizedDescription, (long)error.code);
            result = 0;
        } else {
            NSLog(@"[native-audio] SCK permission granted (displays=%lu, windows=%lu)",
                  (unsigned long)content.displays.count, (unsigned long)content.windows.count);
            result = 1;
        }
        dispatch_semaphore_signal(sem);
    }];
    long w = dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 30LL * NSEC_PER_SEC));
    return (w == 0) ? result : 0;
}

// ── ScreenCaptureKit SCStream audio capture ────────────────────────────────

/// C callback type: receives float32 PCM audio data
typedef void (*sourdine_audio_callback_t)(
    const float *data,
    uint32_t frame_count,
    uint32_t channels,
    uint32_t sample_rate,
    void *user_data
);

/// SCStreamOutput delegate that forwards audio to a C callback
@interface SourdineAudioDelegate : NSObject <SCStreamOutput>
@property (nonatomic, assign) sourdine_audio_callback_t callback;
@property (nonatomic, assign) void *userData;
@property (nonatomic, assign) uint64_t chunkCount;
@end

@implementation SourdineAudioDelegate

- (void)stream:(SCStream *)stream didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer ofType:(SCStreamOutputType)type {
    if (type != SCStreamOutputTypeAudio) return;
    if (!CMSampleBufferDataIsReady(sampleBuffer)) return;

    // Get the audio buffer list
    CMBlockBufferRef blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer);
    if (!blockBuffer) return;

    // Get format description
    CMFormatDescriptionRef formatDesc = CMSampleBufferGetFormatDescription(sampleBuffer);
    if (!formatDesc) return;

    const AudioStreamBasicDescription *asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc);
    if (!asbd) return;

    // Get raw data pointer
    size_t totalLength = 0;
    char *dataPointer = NULL;
    OSStatus status = CMBlockBufferGetDataPointer(blockBuffer, 0, NULL, &totalLength, &dataPointer);
    if (status != noErr || !dataPointer || totalLength == 0) return;

    uint32_t channels = asbd->mChannelsPerFrame;
    uint32_t sampleRate = (uint32_t)asbd->mSampleRate;
    uint32_t frameCount = (uint32_t)(totalLength / asbd->mBytesPerFrame);

    self.chunkCount++;

    // Log periodically — include format details for debugging
    if (self.chunkCount % 500 == 1) {
        // Compute peak
        const float *samples = (const float *)dataPointer;
        uint32_t sampleCount = (uint32_t)(totalLength / sizeof(float));
        float peak = 0;
        for (uint32_t i = 0; i < sampleCount; i++) {
            float abs_val = samples[i] < 0 ? -samples[i] : samples[i];
            if (abs_val > peak) peak = abs_val;
        }
        NSLog(@"[native-audio] SCK chunk #%llu: %u frames, %u ch, %u Hz, peak=%.4f, formatID=0x%08X flags=0x%08X bpf=%u bpc=%u",
              self.chunkCount, frameCount, channels, sampleRate, peak,
              (unsigned int)asbd->mFormatID, (unsigned int)asbd->mFormatFlags,
              (unsigned int)asbd->mBytesPerFrame, (unsigned int)asbd->mBitsPerChannel);
    }

    // Get the actual number of sample frames (correct regardless of interleaving)
    CMItemCount numFrames = CMSampleBufferGetNumSamples(sampleBuffer);
    const float *src = (const float *)dataPointer;

    // Check if non-interleaved (planar): data is [ch0_0..ch0_N, ch1_0..ch1_N]
    BOOL isNonInterleaved = (asbd->mFormatFlags & kAudioFormatFlagIsNonInterleaved) != 0;

    if (self.callback) {
        if (isNonInterleaved && channels > 1) {
            // Convert planar to mono by averaging channels directly
            // This avoids the need for the resampler to handle non-interleaved data
            float *mono = (float *)malloc((size_t)numFrames * sizeof(float));
            if (mono) {
                for (CMItemCount i = 0; i < numFrames; i++) {
                    float sum = 0;
                    for (uint32_t ch = 0; ch < channels; ch++) {
                        sum += src[ch * numFrames + i];
                    }
                    mono[i] = sum / (float)channels;
                }
                self.callback(mono, (uint32_t)numFrames, 1, sampleRate, self.userData);
                free(mono);
            }
        } else {
            // Interleaved or mono — pass directly
            self.callback(src, (uint32_t)numFrames, channels, sampleRate, self.userData);
        }
    }
}

@end

// Global SCStream state
static SCStream *g_sck_stream = nil;
static SourdineAudioDelegate *g_sck_delegate = nil;

/// Start capturing system audio via ScreenCaptureKit SCStream.
/// Returns 0 on success, negative on error.
/// The callback receives float32 interleaved PCM audio data.
int sourdine_sck_start_capture(sourdine_audio_callback_t callback, void *user_data) {
    if (g_sck_stream) {
        NSLog(@"[native-audio] SCK capture already active");
        return -1;
    }

    __block int result = 0;
    __block SCStream *capturedStream = nil;
    __block SourdineAudioDelegate *capturedDelegate = nil;
    dispatch_semaphore_t sem = dispatch_semaphore_create(0);

    NSLog(@"[native-audio] SCK: Getting shareable content...");

    [SCShareableContent getShareableContentExcludingDesktopWindows:NO
                                                onScreenWindowsOnly:NO
                                                  completionHandler:^(SCShareableContent *content, NSError *error) {
        if (error || !content) {
            NSLog(@"[native-audio] SCK: Failed to get content: %@", error);
            result = -2;
            dispatch_semaphore_signal(sem);
            return;
        }

        if (content.displays.count == 0) {
            NSLog(@"[native-audio] SCK: No displays found");
            result = -3;
            dispatch_semaphore_signal(sem);
            return;
        }

        NSLog(@"[native-audio] SCK: Got %lu displays, %lu windows",
              (unsigned long)content.displays.count, (unsigned long)content.windows.count);

        // Use main display as filter (captures all system audio)
        SCDisplay *mainDisplay = content.displays.firstObject;
        SCContentFilter *filter = [[SCContentFilter alloc] initWithDisplay:mainDisplay excludingWindows:@[]];

        // Configure for audio capture with minimal video
        SCStreamConfiguration *config = [[SCStreamConfiguration alloc] init];
        config.capturesAudio = YES;
        config.excludesCurrentProcessAudio = YES;
        config.sampleRate = 48000;
        config.channelCount = 2;

        // Minimal video to avoid overhead (SCStream requires video config)
        config.width = 2;
        config.height = 2;
        config.minimumFrameInterval = CMTimeMake(1, 1); // 1 fps
        config.showsCursor = NO;

        NSLog(@"[native-audio] SCK: Creating stream (48kHz 2ch audio, minimal video)...");

        // Create stream
        SCStream *stream = [[SCStream alloc] initWithFilter:filter configuration:config delegate:nil];

        // Create and configure delegate
        SourdineAudioDelegate *delegate = [[SourdineAudioDelegate alloc] init];
        delegate.callback = callback;
        delegate.userData = user_data;
        delegate.chunkCount = 0;

        // Add audio output handler
        NSError *addErr = nil;
        BOOL added = [stream addStreamOutput:delegate
                                        type:SCStreamOutputTypeAudio
                          sampleHandlerQueue:dispatch_get_global_queue(QOS_CLASS_USER_INTERACTIVE, 0)
                                       error:&addErr];
        if (!added || addErr) {
            NSLog(@"[native-audio] SCK: Failed to add audio output: %@", addErr);
            result = -4;
            dispatch_semaphore_signal(sem);
            return;
        }

        // Start capture
        [stream startCaptureWithCompletionHandler:^(NSError *startErr) {
            if (startErr) {
                NSLog(@"[native-audio] SCK: Start capture failed: %@ (code=%ld)",
                      startErr.localizedDescription, (long)startErr.code);
                result = -5;
            } else {
                NSLog(@"[native-audio] SCK: Capture started successfully!");
                capturedStream = stream;
                capturedDelegate = delegate;
                result = 0;
            }
            dispatch_semaphore_signal(sem);
        }];
    }];

    long waitResult = dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 30LL * NSEC_PER_SEC));
    if (waitResult != 0) {
        NSLog(@"[native-audio] SCK: Start capture timed out");
        return -6;
    }

    if (result == 0) {
        g_sck_stream = capturedStream;
        g_sck_delegate = capturedDelegate;
    }

    return result;
}

/// Stop SCStream capture and clean up.
void sourdine_sck_stop_capture(void) {
    if (!g_sck_stream) return;

    dispatch_semaphore_t sem = dispatch_semaphore_create(0);
    [g_sck_stream stopCaptureWithCompletionHandler:^(NSError *error) {
        if (error) {
            NSLog(@"[native-audio] SCK: Stop error: %@", error);
        }
        dispatch_semaphore_signal(sem);
    }];
    dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 5LL * NSEC_PER_SEC));

    g_sck_stream = nil;
    g_sck_delegate = nil;
    NSLog(@"[native-audio] SCK: Capture stopped");
}
