declare module 'sherpa-onnx-node' {
  export class OfflineRecognizer {
    constructor(config: any);
    static createAsync(config: any): Promise<OfflineRecognizer>;
    createStream(): OfflineStream;
    decode(stream: OfflineStream): void;
    decodeAsync(stream: OfflineStream): Promise<any>;
    getResult(stream: OfflineStream): { text?: string; tokens?: string[]; timestamps?: number[] };
    setConfig(config: any): void;
  }

  export class OfflineStream {
    acceptWaveform(obj: { samples: Float32Array; sampleRate: number }): void;
  }

  export class Vad {
    constructor(config: any, bufferSizeInSeconds: number);
    acceptWaveform(samples: Float32Array): void;
    isEmpty(): boolean;
    isDetected(): boolean;
    front(enableExternalBuffer?: boolean): { samples: Float32Array; start: number };
    pop(): void;
    clear(): void;
    reset(): void;
    flush(): void;
  }

  export function readWave(filename: string): { samples: Float32Array; sampleRate: number };
  export function writeWave(filename: string, data: any): void;

  export const version: string;
  export const gitSha1: string;
  export const gitDate: string;
}
