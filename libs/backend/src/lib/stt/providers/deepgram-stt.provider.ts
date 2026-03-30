import { WebSocket } from 'ws';
import type { SttProvider } from './stt-provider.interface.js';
import type { TranscriptSegment } from '@voxtape/shared-types';

export class DeepgramSttProvider implements SttProvider {
  readonly id = 'deepgram' as const;

  private ws: WebSocket | null = null;
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private segmentCallback: ((segment: TranscriptSegment) => void) | null = null;
  private partialCallback: ((text: string) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;

  start(apiKey: string, options: { language: string; model: string }): void {

    const params = new URLSearchParams({
      model: options.model || 'nova-3',
      language: options.language || 'en',
      sample_rate: '16000',
      encoding: 'linear16',
      channels: '1',
      interim_results: 'true',
      punctuate: 'true',
      smart_format: 'true',
    });

    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

    this.ws = new WebSocket(url, {
      headers: { Authorization: `Token ${apiKey}` },
    });

    this.ws.on('open', () => {
      console.log('[DeepgramStt] WebSocket connected');
      // KeepAlive every 8s to prevent timeout
      this.keepAliveInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
        }
      }, 8000);
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'Results') {
          this.handleResults(msg);
        }
      } catch {
        // Skip malformed messages
      }
    });

    this.ws.on('error', (err) => {
      console.error('[DeepgramStt] WebSocket error:', err.message);
      this.errorCallback?.(err);
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[DeepgramStt] WebSocket closed: ${code} ${reason.toString()}`);
      this.cleanup();
    });
  }

  private handleResults(msg: any): void {
    const channel = msg.channel;
    if (!channel?.alternatives?.length) return;

    const alt = channel.alternatives[0];
    const transcript = alt.transcript?.trim();
    if (!transcript) return;

    if (msg.is_final) {
      const startMs = Math.round((msg.start ?? 0) * 1000);
      const endMs = startMs + Math.round((msg.duration ?? 0) * 1000);

      const segment: TranscriptSegment = {
        id: `dg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: transcript,
        startTimeMs: startMs,
        endTimeMs: endMs,
        isFinal: true,
        source: 'mixed',
      };
      this.segmentCallback?.(segment);
    } else {
      this.partialCallback?.(transcript);
    }
  }

  feedAudio(chunk: Int16Array): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    // Convert Int16Array to Buffer and send as binary
    const buffer = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    this.ws.send(buffer);
  }

  stop(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Send CloseStream to flush final results
      this.ws.send(JSON.stringify({ type: 'CloseStream' }));
      // Give Deepgram time to flush, then close
      setTimeout(() => {
        this.ws?.close();
      }, 1000);
    } else {
      this.cleanup();
    }
  }

  onSegment(callback: (segment: TranscriptSegment) => void): void {
    this.segmentCallback = callback;
  }

  onPartial(callback: (text: string) => void): void {
    this.partialCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  destroy(): void {
    this.ws?.close();
    this.cleanup();
  }

  private cleanup(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    this.ws = null;
  }
}
