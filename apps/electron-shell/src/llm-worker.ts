/**
 * LLM Worker — runs as a child process with ELECTRON_RUN_AS_NODE=1
 *
 * Loads Mistral 7B GGUF via node-llama-cpp v3.
 * Receives prompts from the main process, streams tokens back.
 * LAZY loading: model is only loaded on first prompt or explicit initialize.
 */

import { join } from 'path';
import { existsSync } from 'fs';

let llama: any = null;
let model: any = null;
let context: any = null;
let contextSequence: any = null;
let abortController: AbortController | null = null;

/** Search for a model file across multiple directories */
function findModel(relativePath: string): string | null {
  const dirs = [
    process.env.SOURDINE_MODELS_DIR,
    join(__dirname, '..', '..', '..', 'models'),          // dev (project/models)
    join(__dirname, '..', '..', 'resources', 'models'),   // prod (app.asar.unpacked)
  ];
  for (const dir of dirs) {
    if (!dir) continue;
    const full = join(dir, relativePath);
    if (existsSync(full)) return full;
  }
  return null;
}

function findModelFile(): string | null {
  const fs = require('fs');
  const os = require('os');
  const dirs = [
    process.env.SOURDINE_MODELS_DIR,
    join(__dirname, '..', '..', '..', 'models'),
    join(__dirname, '..', '..', 'resources', 'models'),
  ];
  // Fallback: legacy Electron userData path (pre app.setName migration)
  if (process.platform === 'darwin') {
    dirs.push(join(os.homedir(), 'Library', 'Application Support', 'Electron', 'models'));
  }
  for (const dir of dirs) {
    if (!dir) continue;
    const llmDir = join(dir, 'llm');
    if (!existsSync(llmDir)) continue;
    const files: string[] = fs.readdirSync(llmDir);
    const ggufFile = files.find((f: string) => f.endsWith('.gguf'));
    if (ggufFile) return join(llmDir, ggufFile);
  }
  return null;
}

async function initialize(opts?: { contextSize?: number }): Promise<void> {
  if (model) {
    process.send?.({ type: 'status', data: 'ready' });
    return;
  }

  try {
    process.send?.({ type: 'status', data: 'loading' });
    console.log('[llm-worker] Loading node-llama-cpp...');

    const nodeLlamaCpp = await import('node-llama-cpp');
    const getLlama = nodeLlamaCpp.getLlama;
    llama = await getLlama();

    const modelPath = findModelFile();
    if (!modelPath) {
      throw new Error(
        'No LLM model (.gguf) found in models/llm/. Run "npm run download-llm-model" first.'
      );
    }

    const ctxSize = opts?.contextSize || 4096;
    console.log('[llm-worker] Loading model:', modelPath);
    model = await llama.loadModel({ modelPath });

    console.log(`[llm-worker] Creating context (size: ${ctxSize})...`);
    context = await model.createContext({ contextSize: ctxSize });
    contextSequence = context.getSequence();

    console.log('[llm-worker] Model ready');
    process.send?.({ type: 'status', data: 'ready' });
  } catch (err: any) {
    const message = err?.message || String(err);
    console.error('[llm-worker] Init error:', message);
    process.send?.({ type: 'status', data: 'error' });
    process.send?.({ type: 'error', data: { requestId: '__init__', error: message } });
  }
}

async function handlePrompt(payload: {
  requestId: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<void> {
  // Auto-initialize if not yet loaded
  if (!model) {
    await initialize();
    if (!model) {
      process.send?.({
        type: 'error',
        data: {
          requestId,
          error: 'Aucun modèle LLM disponible. Téléchargez un modèle dans les paramètres.',
        },
      });
      return;
    }
  }

  const { requestId, systemPrompt, userPrompt, maxTokens = 2048, temperature = 0.7 } = payload;

  process.send?.({ type: 'status', data: 'generating' });
  abortController = new AbortController();

  const startTime = Date.now();
  let fullText = '';
  let tokensGenerated = 0;

  const { LlamaChatSession } = await import('node-llama-cpp');
  let session: any = null;

  try {
    session = new LlamaChatSession({ contextSequence });

    // Set system prompt
    session.setChatHistory([
      { type: 'system', text: systemPrompt },
    ]);

    const response = await session.prompt(userPrompt, {
      maxTokens,
      temperature,
      signal: abortController.signal,
      onTextChunk: (token: string) => {
        fullText += token;
        tokensGenerated++;
        process.send?.({
          type: 'token',
          data: { requestId, token, isLast: false },
        });
      },
    });

    // Final token signal
    process.send?.({
      type: 'token',
      data: { requestId, token: '', isLast: true },
    });

    const durationMs = Date.now() - startTime;
    fullText = response || fullText;

    process.send?.({
      type: 'complete',
      data: { requestId, fullText, tokensGenerated, durationMs },
    });

    process.send?.({ type: 'status', data: 'ready' });
  } catch (err: any) {
    if (err?.name === 'AbortError' || abortController?.signal.aborted) {
      console.log('[llm-worker] Generation cancelled for request:', requestId);
      process.send?.({
        type: 'error',
        data: { requestId, error: 'Generation cancelled' },
      });
    } else {
      const message = err?.message || String(err);
      console.error('[llm-worker] Prompt error:', message);
      process.send?.({
        type: 'error',
        data: { requestId, error: message },
      });
    }
    process.send?.({ type: 'status', data: 'ready' });
  } finally {
    session?.dispose();
    abortController = null;
  }
}

function handleCancel(): void {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}

// Message handler
process.on('message', async (msg: any) => {
  switch (msg.type) {
    case 'initialize':
      await initialize(msg.data);
      break;
    case 'prompt':
      await handlePrompt(msg.data);
      break;
    case 'cancel':
      handleCancel();
      break;
    case 'shutdown':
      abortController?.abort();
      context = null;
      model = null;
      llama = null;
      process.exit(0);
      break;
  }
});
