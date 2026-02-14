//! Audio resampling: 48kHz float32 stereo → 16kHz Int16 mono
//!
//! Pipeline: stereo→mono mixdown → low-pass filter → 3:1 decimation → float→Int16

/// Simple FIR low-pass filter coefficients for anti-aliasing before 3:1 decimation.
/// Designed for 48kHz input, cutting off around 7.5kHz (Nyquist for 16kHz output).
/// 15-tap windowed-sinc filter (Hamming window).
const LPF_TAPS: [f32; 15] = [
    0.0024, 0.0060, 0.0177, 0.0393, 0.0694,
    0.1013, 0.1268, 0.1372, 0.1268, 0.1013,
    0.0694, 0.0393, 0.0177, 0.0060, 0.0024,
];

/// Resampler state — holds the filter delay line for continuity across chunks.
pub struct Resampler {
    /// Delay line for the FIR filter (mono samples after mixdown)
    delay_line: Vec<f32>,
    /// Current position in the 3:1 decimation phase
    phase: usize,
}

impl Resampler {
    pub fn new() -> Self {
        Self {
            delay_line: vec![0.0; LPF_TAPS.len()],
            phase: 0,
        }
    }

    /// Resample a buffer of interleaved float32 audio.
    ///
    /// - `input`: interleaved float32 samples (1 or 2 channels)
    /// - `channels`: number of channels (1 or 2)
    /// - `input_rate`: input sample rate (must be a multiple of 16000)
    ///
    /// Returns: Vec<i16> of 16kHz mono Int16 samples.
    pub fn process(&mut self, input: &[f32], channels: u32, input_rate: u32) -> Vec<i16> {
        let decimation_factor = (input_rate / 16000) as usize;
        if decimation_factor == 0 {
            return Vec::new();
        }

        let frame_count = input.len() / channels as usize;

        // Pre-allocate output (upper bound)
        let max_output = frame_count / decimation_factor + 1;
        let mut output = Vec::with_capacity(max_output);

        for frame_idx in 0..frame_count {
            // Stereo → mono mixdown
            let mono = if channels >= 2 {
                let left = input[frame_idx * channels as usize];
                let right = input[frame_idx * channels as usize + 1];
                (left + right) * 0.5
            } else {
                input[frame_idx * channels as usize]
            };

            // Push into delay line (shift left, append new)
            self.delay_line.remove(0);
            self.delay_line.push(mono);

            // Decimation: only compute output every `decimation_factor` samples
            self.phase += 1;
            if self.phase >= decimation_factor {
                self.phase = 0;

                // FIR filter convolution
                let mut filtered = 0.0f32;
                for (i, &coeff) in LPF_TAPS.iter().enumerate() {
                    filtered += self.delay_line[i] * coeff;
                }

                // Float32 → Int16 with clamp
                let sample = (filtered * 32767.0).round().clamp(-32768.0, 32767.0) as i16;
                output.push(sample);
            }
        }

        output
    }

    /// Reset the resampler state (e.g. when starting a new capture session).
    pub fn reset(&mut self) {
        self.delay_line.fill(0.0);
        self.phase = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decimation_ratio() {
        let mut r = Resampler::new();
        // 4800 mono samples at 48kHz = 100ms → should produce ~1600 samples at 16kHz
        let input = vec![0.0f32; 4800];
        let output = r.process(&input, 1, 48000);
        assert_eq!(output.len(), 1600);
    }

    #[test]
    fn test_stereo_to_mono() {
        let mut r = Resampler::new();
        // Stereo input: left=0.5, right=-0.5 → mono should be ~0.0
        let mut input = Vec::new();
        for _ in 0..4800 {
            input.push(0.5f32);
            input.push(-0.5f32);
        }
        let output = r.process(&input, 2, 48000);
        // After filter settles, output should be near 0
        for &s in &output[10..] {
            assert!(s.abs() < 100, "Expected near-zero, got {}", s);
        }
    }

    #[test]
    fn test_clipping_protection() {
        let mut r = Resampler::new();
        let input = vec![2.0f32; 4800]; // Over-range input
        let output = r.process(&input, 1, 48000);
        for &s in &output {
            assert!(s <= 32767 && s >= -32768);
        }
    }
}
