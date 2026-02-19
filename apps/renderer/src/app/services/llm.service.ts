import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import type {
  LlmStatus,
  LlmTokenPayload,
  LlmCompletePayload,
  LlmErrorPayload,
} from '@voxtape/shared-types';

interface VoxTapeApi {
  llm: {
    initialize(): void;
    prompt(payload: {
      requestId: string;
      systemPrompt: string;
      userPrompt: string;
      maxTokens?: number;
      temperature?: number;
    }): void;
    cancel(): void;
    onToken(cb: (payload: LlmTokenPayload) => void): () => void;
    onComplete(cb: (payload: LlmCompletePayload) => void): () => void;
    onError(cb: (payload: LlmErrorPayload) => void): () => void;
    onStatus(cb: (status: LlmStatus) => void): () => void;
  };
}

@Injectable({ providedIn: 'root' })
export class LlmService implements OnDestroy {
  private readonly api: VoxTapeApi['llm'] | undefined;
  private requestCounter = 0;
  private cleanups: (() => void)[] = [];

  private readonly _status$ = new BehaviorSubject<LlmStatus>('idle');
  private readonly _token$ = new Subject<LlmTokenPayload>();
  private readonly _streamedText$ = new BehaviorSubject<string>('');
  private readonly _complete$ = new Subject<LlmCompletePayload>();
  private readonly _error$ = new Subject<LlmErrorPayload>();
  private readonly _initError$ = new BehaviorSubject<string | null>(null);

  readonly status$: Observable<LlmStatus> = this._status$.asObservable();
  readonly token$: Observable<LlmTokenPayload> = this._token$.asObservable();
  readonly streamedText$: Observable<string> = this._streamedText$.asObservable();
  readonly complete$: Observable<LlmCompletePayload> = this._complete$.asObservable();
  readonly error$: Observable<LlmErrorPayload> = this._error$.asObservable();
  /** Emits initialization error message, null if no error */
  readonly initError$: Observable<string | null> = this._initError$.asObservable();

  private readonly ngZone = inject(NgZone);

  constructor() {
    this.api = (window as Window & { voxtape?: { llm?: VoxTapeApi['llm'] } }).voxtape?.llm;
    if (!this.api) return;

    this.cleanups.push(
      this.api.onStatus((status) => {
        this.ngZone.run(() => this._status$.next(status));
      }),
      this.api.onToken((payload) => {
        this.ngZone.run(() => {
          this._token$.next(payload);
          if (!payload.isLast) {
            this._streamedText$.next(this._streamedText$.value + payload.token);
          }
        });
      }),
      this.api.onComplete((payload) => {
        this.ngZone.run(() => this._complete$.next(payload));
      }),
      this.api.onError((payload) => {
        this.ngZone.run(() => {
          // Handle initialization errors specially
          if (payload.requestId === '__init__') {
            this._initError$.next(payload.error);
          } else {
            this._error$.next(payload);
          }
        });
      })
    );
  }

  get isAvailable(): boolean {
    return !!this.api;
  }

  initialize(): void {
    // Clear any previous init error before attempting
    this._initError$.next(null);
    this.api?.initialize();
  }

  /** Get current initialization error, if any */
  get initError(): string | null {
    return this._initError$.value;
  }

  enhance(notes: string, transcript: string): string {
    const requestId = `enhance-${++this.requestCounter}`;
    this._streamedText$.next('');
    this.api?.prompt({
      requestId,
      systemPrompt: ENHANCE_SYSTEM_PROMPT,
      userPrompt: `### Mes notes:\n${notes}\n\n### Transcription:\n${transcript}`,
      maxTokens: 2048,
      temperature: 0.3,
    });
    return requestId;
  }

  chat(message: string, context: string): string {
    const requestId = `chat-${++this.requestCounter}`;
    this._streamedText$.next('');
    this.api?.prompt({
      requestId,
      systemPrompt: CHAT_SYSTEM_PROMPT,
      userPrompt: `### Contexte de la conversation:\n${context}\n\n### Question:\n${message}`,
      maxTokens: 2048,
      temperature: 0.4,
    });
    return requestId;
  }

  cancel(): void {
    this.api?.cancel();
  }

  ngOnDestroy(): void {
    this.cleanups.forEach((fn) => fn());
  }
}

const ENHANCE_SYSTEM_PROMPT = `Tu es un assistant expert en synthèse de réunions. Tu produis des résumés précis et structurés.

CONSIGNES STRICTES:
1. Utilise UNIQUEMENT les informations présentes dans la transcription
2. N'invente JAMAIS de noms, chiffres, dates ou détails
3. Si la transcription est incomplète ou confuse, signale-le
4. Les notes utilisateur sont prioritaires sur la transcription

FORMAT DE SORTIE:

Titre: [Sujet principal en 5-8 mots]

## Résumé
[2-4 phrases résumant l'essentiel. Sois factuel et concis.]

## Points clés
- [Point 1]
- [Point 2]
[Ajoute autant de points que nécessaire]

## Décisions & Actions
- [Décision ou action identifiée]
[Omets cette section si aucune décision/action mentionnée]

## Informations clés
- [Noms, dates, chiffres, lieux explicitement mentionnés]
[Omets cette section si aucune information notable]`;

const CHAT_SYSTEM_PROMPT = `Tu es un assistant d'analyse de réunions. Tu réponds aux questions en te basant UNIQUEMENT sur le contexte fourni.

CAPACITÉS:
- Résumer, lister actions/décisions, rédiger emails de suivi
- Répondre aux questions sur le contenu
- Identifier participants et contributions

RÈGLES STRICTES:
1. Base tes réponses UNIQUEMENT sur le contexte fourni
2. N'invente JAMAIS d'informations absentes du contexte
3. Si l'information demandée n'existe pas, dis-le clairement
4. Adapte ton format à la demande (liste, email, paragraphe)

Réponds en français, de manière concise et factuelle.`;
