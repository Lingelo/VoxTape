import { Injectable, NgZone, OnDestroy } from '@angular/core';
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

  readonly status$: Observable<LlmStatus> = this._status$.asObservable();
  readonly token$: Observable<LlmTokenPayload> = this._token$.asObservable();
  readonly streamedText$: Observable<string> = this._streamedText$.asObservable();
  readonly complete$: Observable<LlmCompletePayload> = this._complete$.asObservable();
  readonly error$: Observable<LlmErrorPayload> = this._error$.asObservable();

  constructor(private ngZone: NgZone) {
    this.api = (window as any).sourdine?.llm;
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
        this.ngZone.run(() => this._error$.next(payload));
      })
    );
  }

  get isAvailable(): boolean {
    return !!this.api;
  }

  initialize(): void {
    this.api?.initialize();
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
      userPrompt: `### Contexte de la réunion:\n${context}\n\n### Question:\n${message}`,
      maxTokens: 2048,
      temperature: 0.7,
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

const ENHANCE_SYSTEM_PROMPT = `Tu es un assistant de prise de notes de réunion. Tu reçois les notes utilisateur ET la transcription audio.

RÈGLE ABSOLUE : N'INVENTE JAMAIS rien. Aucun nom, chiffre, date, détail ou contexte qui n'apparaît pas explicitement dans les sources. Si une information n'est pas dans les sources, elle n'existe pas. En cas de doute, omets.

PROPORTIONNALITÉ : Adapte la longueur de ta réponse à la quantité de contenu reçu.
- Transcription très courte (< 5 phrases) → Titre + 1-2 phrases de résumé, rien d'autre.
- Transcription courte (5-15 phrases) → Titre + Résumé + Points clés uniquement.
- Transcription longue (> 15 phrases) → Format complet ci-dessous.

Les notes utilisateur sont prioritaires. La transcription complète le contexte.

Format complet (texte brut, pas de JSON) :

Titre: Un titre court et descriptif (5-8 mots max)

## Résumé
2-3 phrases MAX.

## Points clés
- 3 à 5 bullet points maximum, une ligne chacun

## Décisions
- Une ligne par décision

## Prochaines étapes
- Action — responsable (si mentionné)

Règles :
- Écris en français
- SOIS BREF : chaque bullet = une seule ligne courte
- Omets les sections vides (pas de "Décisions" s'il n'y en a pas)
- Intègre les notes utilisateur dans les sections appropriées
- Pas de section "Mes notes" séparée, pas de séparateurs (----, ===)`;

const CHAT_SYSTEM_PROMPT = `Tu es un assistant intelligent pour les réunions. Tu as accès au contexte de la réunion (transcription et notes). Réponds de manière concise en français.

RÈGLE ABSOLUE : Base-toi UNIQUEMENT sur le contexte fourni. N'invente aucun nom, chiffre, date ou détail absent du contexte. Si l'information demandée n'est pas dans le contexte, dis-le clairement.`;
