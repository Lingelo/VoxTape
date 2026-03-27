/**
 * Mixes two Int16Array audio channels (mic + system) into a single mono stream.
 * Averaging two Int16 values cannot overflow Int16 range, so no clipping needed.
 */
export function mixAudioChannels(mic: Int16Array, system: Int16Array): Int16Array {
  const length = Math.min(mic.length, system.length);
  const output = new Int16Array(length);

  for (let i = 0; i < length; i++) {
    output[i] = (mic[i] + system[i]) >> 1;
  }

  return output;
}
