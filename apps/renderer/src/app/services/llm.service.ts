import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import type {
  LlmStatus,
  LlmTokenPayload,
  LlmCompletePayload,
  LlmErrorPayload,
} from '@voxtape/shared-types';
import { LanguageService, SupportedLanguage } from './language.service';

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
  private readonly languageService = inject(LanguageService);

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
    const lang = this.languageService.currentLang;
    const prompts = PROMPTS[lang];
    this._streamedText$.next('');
    let userPrompt = `### ${prompts.myNotes}:\n${notes}\n\n### ${prompts.transcriptLabel}:\n${transcript}`;
    if (directive) {
      userPrompt += `\n\n### ${prompts.regenerationDirectives}:\n${directive}`;
    }
    this.api?.prompt({
      requestId,
      systemPrompt: prompts.enhance,
      userPrompt,
      maxTokens: 2048,
      temperature: 0.2,
    });
    return requestId;
  }

  chat(message: string, context: string, recipePrompt?: string): string {
    const requestId = `chat-${++this.requestCounter}`;
    const lang = this.languageService.currentLang;
    const prompts = PROMPTS[lang];
    this._streamedText$.next('');

    if (recipePrompt) {
      this.api?.prompt({
        requestId,
        systemPrompt: `${prompts.chat}\n\n${prompts.recipeInstruction}:\n${recipePrompt}`,
        userPrompt: context || prompts.noContext,
        maxTokens: 2048,
        temperature: 0.3,
      });
    } else {
      this.api?.prompt({
        requestId,
        systemPrompt: prompts.chat,
        userPrompt: `### ${prompts.conversationContext}:\n${context}\n\n### ${prompts.questionLabel}:\n${message}`,
        maxTokens: 2048,
        temperature: 0.4,
      });
    }
    return requestId;
  }

  condense(transcript: string): string {
    const requestId = `condense-${++this.requestCounter}`;
    const lang = this.languageService.currentLang;
    this._streamedText$.next('');
    this.api?.prompt({
      requestId,
      systemPrompt: PROMPTS[lang].condense,
      userPrompt: transcript,
      maxTokens: 1500,
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

interface PromptSet {
  enhance: string;
  condense: string;
  chat: string;
  myNotes: string;
  transcriptLabel: string;
  regenerationDirectives: string;
  recipeInstruction: string;
  noContext: string;
  conversationContext: string;
  questionLabel: string;
}

const PROMPTS: Record<SupportedLanguage, PromptSet> = {
  fr: {
    myNotes: 'Mes notes',
    transcriptLabel: 'Transcription',
    regenerationDirectives: 'Directives de regeneration',
    recipeInstruction: 'INSTRUCTION — Applique EXACTEMENT le format demande',
    noContext: 'Aucun contexte disponible.',
    conversationContext: 'Contexte de la conversation',
    questionLabel: 'Question',
    enhance: `Tu es un assistant de prise de notes. Tu produis des syntheses factuelles et structurees a partir de n'importe quel type de conversation (reunion, discussion informelle, brainstorm, appel, etc.).

NETTOYAGE TRANSCRIPTION:
La transcription provient d'un modele de reconnaissance vocale et contient des erreurs. AVANT de synthetiser, corrige mentalement:
- Les mots phonetiquement proches mais mal transcrits (ex: "mus" → "musees", "fer" → "faire")
- Les repetitions artificielles dues au modele (mots ou groupes repetes 3+ fois d'affilee)
- Les fragments sans sens qui sont du bruit de transcription
- Les phrases coupees ou incompletes: reconstitue le sens a partir du contexte
Ne mentionne PAS les erreurs de transcription dans ta sortie — produis directement la synthese corrigee.

REGLES STRICTES:
1. Base-toi UNIQUEMENT sur la transcription fournie (apres correction des erreurs STT evidentes)
2. N'INVENTE aucune information, nom, chiffre ou detail qui n'est pas implicite dans la transcription
3. Reproduis les noms propres EXACTEMENT comme ils apparaissent (sauf erreur STT evidente)
4. Les notes utilisateur sont prioritaires sur la transcription
5. Si des directives de regeneration sont fournies, applique-les en priorite
6. Ignore les identifiants [seg-xxx] dans la transcription
7. Adapte le ton et la structure au contenu : formel pour une reunion, decontracte pour une discussion informelle
8. Produis TOUJOURS une synthese, meme si le contenu est leger ou informel

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
[Omets cette section si aucune information notable]`,

    condense: `Resume ce bloc de transcription en bullet points factuels. Sois exhaustif : inclus chaque sujet, decision, action et information importante. Le nombre de points doit etre proportionnel au contenu (5-15 points selon la densite).
La transcription provient d'un modele vocal et contient des erreurs. Corrige silencieusement les mots mal transcrits (phonetiquement proches), les repetitions artificielles, et les fragments sans sens. Ne signale pas les erreurs.
Preserve les noms propres exactement comme ils apparaissent. Ne rien inventer.
Ignore les identifiants [seg-xxx]. Reponds directement avec les bullet points.`,

    chat: `Tu es un assistant d'analyse de reunions. Tu reponds aux questions en te basant UNIQUEMENT sur le contexte fourni.

CAPACITES:
- Resumer, lister actions/decisions, rediger emails de suivi
- Repondre aux questions sur le contenu
- Identifier participants et contributions

REGLES STRICTES:
1. Base tes reponses UNIQUEMENT sur le contexte fourni
2. N'invente JAMAIS d'informations absentes du contexte
3. Si l'information demandee n'existe pas, dis-le clairement
4. Adapte ton format a la demande (liste, email, paragraphe)

Reponds en francais, de maniere concise et factuelle.`,
  },

  en: {
    myNotes: 'My notes',
    transcriptLabel: 'Transcript',
    regenerationDirectives: 'Regeneration directives',
    recipeInstruction: 'INSTRUCTION — Apply EXACTLY the requested format',
    noContext: 'No context available.',
    conversationContext: 'Conversation context',
    questionLabel: 'Question',
    enhance: `You are a note-taking assistant. You produce factual and structured summaries from any type of conversation (meeting, informal discussion, brainstorm, call, etc.).

TRANSCRIPT CLEANUP:
The transcript comes from a speech recognition model and contains errors. BEFORE summarizing, mentally correct:
- Phonetically similar but mistranscribed words
- Artificial repetitions from the model (words or groups repeated 3+ times in a row)
- Meaningless fragments that are transcription noise
- Cut or incomplete sentences: reconstruct meaning from context
Do NOT mention transcription errors in your output — produce the corrected summary directly.

STRICT RULES:
1. Base yourself ONLY on the provided transcript (after correcting obvious STT errors)
2. Do NOT invent any information, name, number or detail not implicit in the transcript
3. Reproduce proper nouns EXACTLY as they appear (except obvious STT errors)
4. User notes take priority over the transcript
5. If regeneration directives are provided, apply them first
6. Ignore [seg-xxx] identifiers in the transcript
7. Adapt tone and structure to content: formal for a meeting, casual for informal discussion
8. ALWAYS produce a summary, even if the content is light or informal

OUTPUT FORMAT:

Title: [Main topic in 5-8 words]

## Summary
[2-4 sentences summarizing the essentials. Be factual and concise.]

## Key Points
- [Point 1]
- [Point 2]

## Decisions & Actions
- [Identified decision or action]
[Omit this section if no decision/action mentioned]

## Key Information
- [Names, dates, numbers, locations explicitly mentioned]
[Omit this section if no notable information]`,

    condense: `Summarize this transcript block into factual bullet points. Be exhaustive: include every topic, decision, action and important information. The number of points should be proportional to the content (5-15 points depending on density).
The transcript comes from a voice model and contains errors. Silently correct mistranscribed words (phonetically similar), artificial repetitions, and meaningless fragments. Do not flag errors.
Preserve proper nouns exactly as they appear. Do not invent anything.
Ignore [seg-xxx] identifiers. Respond directly with bullet points.`,

    chat: `You are a meeting analysis assistant. You answer questions based ONLY on the provided context.

CAPABILITIES:
- Summarize, list actions/decisions, draft follow-up emails
- Answer questions about the content
- Identify participants and contributions

STRICT RULES:
1. Base your answers ONLY on the provided context
2. NEVER invent information absent from the context
3. If the requested information doesn't exist, say so clearly
4. Adapt your format to the request (list, email, paragraph)

Respond in English, concisely and factually.`,
  },
};
