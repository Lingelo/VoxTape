import type { SupportedLanguage } from './language.service';

export interface Recipe {
  command: string;
  label: string;
  prompt: string;
}

const RECIPES_FR: Recipe[] = [
  {
    command: '/resume',
    label: 'Résumé',
    prompt: `Résume cette conversation en points clés.

Instructions:
- Liste les points essentiels (3-8 selon la longueur)
- Sois factuel, n'invente rien
- Utilise des bullet points concis

Format:
- [Point 1]
- [Point 2]`,
  },
  {
    command: '/actions',
    label: 'Points d\'action',
    prompt: `Extrais les actions à faire de cette conversation.

Instructions:
- Liste uniquement les actions explicitement mentionnées
- Indique le responsable si mentionné
- Si aucune action: réponds "Aucune action identifiée."

Format:
- [ ] [Action] (Responsable: [Nom] si connu)`,
  },
  {
    command: '/decisions',
    label: 'Décisions prises',
    prompt: `Extrais les décisions prises dans cette conversation.

Instructions:
- Liste uniquement les décisions explicites
- Si aucune décision: réponds "Aucune décision identifiée."

Format:
- [Décision 1]
- [Décision 2]`,
  },
  {
    command: '/email',
    label: 'E-mail de suivi',
    prompt: `Rédige un e-mail de suivi professionnel basé sur cette conversation.

Instructions:
- Objet clair et concis
- Corps structuré: contexte, points clés, prochaines étapes
- Ton professionnel
- N'invente aucun détail absent de la conversation

Format:
Objet: [sujet]

Bonjour,

[Corps de l'email]

Cordialement,
[Signature]`,
  },
  {
    command: '/questions',
    label: 'Questions ouvertes',
    prompt: `Identifie les questions ou points non résolus.

Instructions:
- Liste les questions restées sans réponse
- Liste les points nécessitant clarification
- Si tout est résolu: réponds "Aucune question ouverte."

Format:
- [Question/point 1]
- [Question/point 2]`,
  },
];

const RECIPES_EN: Recipe[] = [
  {
    command: '/summary',
    label: 'Summary',
    prompt: `Summarize this conversation into key points.

Instructions:
- List the essential points (3-8 depending on length)
- Be factual, don't invent anything
- Use concise bullet points

Format:
- [Point 1]
- [Point 2]`,
  },
  {
    command: '/actions',
    label: 'Action items',
    prompt: `Extract the action items from this conversation.

Instructions:
- List only explicitly mentioned actions
- Include the responsible person if mentioned
- If no actions: respond "No action items identified."

Format:
- [ ] [Action] (Owner: [Name] if known)`,
  },
  {
    command: '/decisions',
    label: 'Decisions made',
    prompt: `Extract the decisions made in this conversation.

Instructions:
- List only explicit decisions
- If no decisions: respond "No decisions identified."

Format:
- [Decision 1]
- [Decision 2]`,
  },
  {
    command: '/email',
    label: 'Follow-up email',
    prompt: `Draft a professional follow-up email based on this conversation.

Instructions:
- Clear and concise subject line
- Structured body: context, key points, next steps
- Professional tone
- Don't invent any details absent from the conversation

Format:
Subject: [topic]

Hello,

[Email body]

Best regards,
[Signature]`,
  },
  {
    command: '/questions',
    label: 'Open questions',
    prompt: `Identify unanswered questions or unresolved points.

Instructions:
- List questions that remained unanswered
- List points requiring clarification
- If everything is resolved: respond "No open questions."

Format:
- [Question/point 1]
- [Question/point 2]`,
  },
];

/** @deprecated Use getRecipes(lang) instead */
export const RECIPES = RECIPES_FR;

export function getRecipes(lang: SupportedLanguage): Recipe[] {
  return lang === 'en' ? RECIPES_EN : RECIPES_FR;
}
