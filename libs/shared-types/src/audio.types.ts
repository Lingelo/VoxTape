export interface AudioDevice {
  deviceId: string;
  label: string;
  isDefault: boolean;
}

export interface AudioChunkPayload {
  /** Int16 PCM samples, 16kHz mono */
  samples: Int16Array;
  sampleRate: number;
}
