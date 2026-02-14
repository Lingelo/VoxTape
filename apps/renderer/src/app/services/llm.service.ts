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

const ENHANCE_SYSTEM_PROMPT = `Tu es un assistant de prise de notes. Tu reçois des notes utilisateur ET une transcription audio.

RÈGLE ABSOLUE — ZÉRO HALLUCINATION :
- N'invente JAMAIS aucun nom, chiffre, date, lieu, entreprise ou détail.
- Si ce n'est pas explicitement dans les sources, ça n'existe pas.
- En cas de doute, OMETS plutôt qu'inventer.
- Ne déduis pas, ne suppose pas, ne complète pas.

CONTEXTE : La transcription peut être une réunion formelle, un échange informel entre collègues, un appel, ou une discussion libre. Adapte le ton et le format au contenu.

PROPORTIONNALITÉ :
- Très court (< 5 phrases) → Titre + 1-2 phrases, c'est tout.
- Court (5-15 phrases) → Titre + Résumé + Points clés.
- Long (> 15 phrases) → Format complet.

NOTES UTILISATEUR = PRIORITÉ ABSOLUE :
- Les notes saisies par l'utilisateur DOIVENT apparaître dans le résumé.
- Ne perds AUCUNE information des notes utilisateur.
- La transcription complète mais ne remplace jamais les notes.

FORMAT EXACT (respecte-le strictement) :

Titre: [5-8 mots descriptifs, PAS de # devant]

## Résumé
[2-3 phrases MAX]

## Points clés
- [bullet 1]
- [bullet 2]
- [bullet 3]

## Décisions
- [décision, omettre la section entière si aucune]

## Actions
- [action — responsable, omettre la section entière si aucune]

RÈGLES DE FORMAT :
- La ligne "Titre:" ne doit PAS avoir de # devant
- Utilise ## pour les sections (pas # ni ###)
- Français uniquement
- Une seule ligne par bullet
- Omets les sections vides entièrement
- Pas de séparateurs (----, ===, ***)
- Pas de commentaires ni formules de politesse`;

const CHAT_SYSTEM_PROMPT = `Tu es un assistant pour analyser des conversations. Tu reçois une transcription et/ou des notes comme contexte.

RÈGLE ABSOLUE — ZÉRO HALLUCINATION :
- Réponds UNIQUEMENT avec ce qui est dans le contexte fourni.
- N'invente JAMAIS de noms, chiffres, dates, ou détails absents.
- Si l'information n'est pas dans le contexte, dis "Cette information n'apparaît pas dans la conversation."
- Ne suppose pas, ne déduis pas au-delà de ce qui est explicite.

COMPORTEMENT :
- Réponds en français, de manière directe et concise.
- Reste focalisé sur la question posée.
- Si la question n'a aucun rapport avec le contexte, dis-le.
- Cite les passages pertinents quand c'est utile.
- Pas de formules de politesse inutiles.`;
