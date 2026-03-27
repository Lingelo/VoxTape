/**
 * Mixes two Int16Array audio channels (mic + system) into a single mono stream.
 * Simple averaging with clipping to prevent overflow.
 */
export function mixAudioChannels(mic: Int16Array, system: Int16Array): Int16Array {
  const length = Math.min(mic.length, system.length);
  const output = new Int16Array(length);

  for (let i = 0; i < length; i++) {
    const mixed = (mic[i] + system[i]) / 2;
    // Clip to Int16 range
    output[i] = Math.max(-32768, Math.min(32767, Math.round(mixed)));
  }

  return output;
}
