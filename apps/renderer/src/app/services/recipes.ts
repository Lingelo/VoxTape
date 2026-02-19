export interface Recipe {
  command: string;
  label: string;
  prompt: string;
}

export const RECIPES: Recipe[] = [
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
