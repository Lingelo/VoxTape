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

  enhance(notes: string, transcript: string, directive?: string): string {
    const requestId = `enhance-${++this.requestCounter}`;
    this._streamedText$.next('');
    let userPrompt = `### Mes notes:\n${notes}\n\n### Transcription:\n${transcript}`;
    if (directive) {
      userPrompt += `\n\n### Directives de regeneration:\n${directive}`;
    }
    this.api?.prompt({
      requestId,
      systemPrompt: ENHANCE_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 2048,
      temperature: 0.2,
    });
    return requestId;
  }

  chat(message: string, context: string, recipePrompt?: string): string {
    const requestId = `chat-${++this.requestCounter}`;
    this._streamedText$.next('');

    if (recipePrompt) {
      // Recipe mode: instruction goes in system prompt for stronger compliance
      this.api?.prompt({
        requestId,
        systemPrompt: `${CHAT_SYSTEM_PROMPT}\n\nINSTRUCTION — Applique EXACTEMENT le format demandé:\n${recipePrompt}`,
        userPrompt: context || 'Aucun contexte disponible.',
        maxTokens: 2048,
        temperature: 0.3,
      });
    } else {
      this.api?.prompt({
        requestId,
        systemPrompt: CHAT_SYSTEM_PROMPT,
        userPrompt: `### Contexte de la conversation:\n${context}\n\n### Question:\n${message}`,
        maxTokens: 2048,
        temperature: 0.4,
      });
    }
    return requestId;
  }

  condense(transcript: string): string {
    const requestId = `condense-${++this.requestCounter}`;
    this._streamedText$.next('');
    this.api?.prompt({
      requestId,
      systemPrompt: CONDENSE_SYSTEM_PROMPT,
      userPrompt: transcript,
      maxTokens: 1024,
      temperature: 0.15,
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

const ENHANCE_SYSTEM_PROMPT = `Tu es un assistant de prise de notes de reunion. Tu produis des syntheses factuelles et structurees.

REGLES STRICTES:
1. Base-toi UNIQUEMENT sur la transcription fournie
2. N'INVENTE aucune information, nom, chiffre ou detail
3. Reproduis les noms propres EXACTEMENT comme ils apparaissent dans la transcription
4. Les notes utilisateur sont prioritaires sur la transcription
5. Si des directives de regeneration sont fournies, applique-les en priorite
6. Ignore les identifiants [seg-xxx] dans la transcription
7. Si la transcription est incomplète ou confuse, signale-le

EXEMPLE D'ENTREE:
### Mes notes:
RDV budget Q2

### Transcription:
[seg-001] Bonjour tout le monde merci d'être là
[seg-002] On va parler du budget Q2 comme prévu
[seg-003] Marie a préparé les chiffres du trimestre
[seg-004] On est à 120K sur les 150K prévus soit 80%
[seg-005] Il faut décider si on réalloue le reste

EXEMPLE DE SORTIE:
Titre: Reunion budget Q2 - suivi et reallocation

## Resume
Reunion de suivi du budget Q2. L'equipe est a 80% de consommation (120K sur 150K prevus). Discussion sur la reallocation du budget restant.

## Points cles
- Budget Q2 consomme a 80% (120K / 150K)
- Marie a prepare les chiffres du trimestre
- Question ouverte sur la reallocation du solde

## Decisions & Actions
- Decider de la reallocation des 30K restants

FORMAT DE SORTIE:

Titre: [Sujet principal en 5-8 mots]

## Resume
[2-4 phrases resumant l'essentiel. Sois factuel et concis.]

## Points cles
- [Point 1]
- [Point 2]

## Decisions & Actions
- [Decision ou action identifiee]
[Omets cette section si aucune decision/action mentionnee]

## Informations cles
- [Noms, dates, chiffres, lieux explicitement mentionnes]
[Omets cette section si aucune information notable]`;

const CONDENSE_SYSTEM_PROMPT = `Resume ce bloc de transcription en bullet points factuels. Sois exhaustif : inclus chaque sujet, decision, action et information importante. Le nombre de points doit etre proportionnel au contenu (5-15 points selon la densite).
Preserve les noms propres exactement comme ils apparaissent. Ne rien inventer.
Ignore les identifiants [seg-xxx]. Reponds directement avec les bullet points.`;

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
