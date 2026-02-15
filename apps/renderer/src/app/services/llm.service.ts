import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import type {
  LlmStatus,
  LlmTokenPayload,
  LlmCompletePayload,
  LlmErrorPayload,
} from '@sourdine/shared-types';

interface SourdineApi {
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
  private readonly api: SourdineApi['llm'] | undefined;
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
    this.api = (window as Window & { sourdine?: { llm?: SourdineApi['llm'] } }).sourdine?.llm;
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

const ENHANCE_SYSTEM_PROMPT = `Tu es un assistant de prise de notes. Résume le contenu de manière structurée.

RÈGLES:
- N'invente JAMAIS de noms, chiffres, dates, lieux ou entreprises non mentionnés
- Les notes de l'utilisateur sont prioritaires - intègre-les dans le résumé
- Adapte la longueur du résumé au contenu (plus le contenu est long/riche, plus le résumé peut être détaillé)

FORMAT:

Titre: [titre descriptif en 5-10 mots]

## Résumé
[Résumé complet du contenu. Pour du contenu court: 2-3 phrases. Pour du contenu long: jusqu'à 5-6 phrases couvrant les points essentiels.]

## Points clés
- [Point important 1]
- [Point important 2]
- [etc. - liste tous les points significatifs]

## Informations notables
- [Noms, dates, chiffres, lieux mentionnés]
- [Détails intéressants ou spécifiques]
(omets cette section si rien de notable)

## À retenir
- [Actions à faire si mentionnées]
- [Décisions prises si mentionnées]
(omets cette section si aucune action/décision)

Réponds en français.`;

const CHAT_SYSTEM_PROMPT = `Tu es un assistant pour analyser et répondre à des questions sur une conversation/réunion.

TU PEUX:
- Résumer le contenu
- Lister les action items, décisions, questions ouvertes
- Rédiger des emails de suivi basés sur le contenu réel
- Répondre à des questions sur ce qui a été dit
- Identifier les participants et leurs contributions

RÈGLES:
- Base TOUTES tes réponses sur le contexte fourni
- N'invente JAMAIS d'informations non présentes
- Si une information n'est pas dans le contexte, dis-le clairement
- Si on te demande des action items et qu'il n'y en a pas, dis "Aucune action mentionnée dans la conversation"
- Adapte le format de ta réponse à la demande (liste, email, paragraphe, etc.)

Réponds en français de manière concise mais complète.`;
