export interface Recipe {
  command: string;
  label: string;
  prompt: string;
}

export const RECIPES: Recipe[] = [
  {
    command: '/resume',
    label: 'Résumé',
    prompt: `Résume cette conversation en bullet points concis.

FORMAT:
- Point 1
- Point 2
- etc.

Adapte le nombre de points à la longueur du contenu (3-5 pour court, jusqu'à 10 pour long). N'invente rien.`,
  },
  {
    command: '/actions',
    label: 'Points d\'action',
    prompt: `Liste les actions à faire mentionnées dans cette conversation.

FORMAT (si des actions existent):
- [ ] Action 1 (Responsable: Nom si mentionné)
- [ ] Action 2

Si aucune action n'a été mentionnée, réponds simplement: "Aucune action à faire n'a été mentionnée dans cette conversation."`,
  },
  {
    command: '/decisions',
    label: 'Décisions prises',
    prompt: `Liste les décisions prises dans cette conversation.

FORMAT (si des décisions existent):
- Décision 1
- Décision 2

Si aucune décision n'a été prise, réponds simplement: "Aucune décision n'a été mentionnée dans cette conversation."`,
  },
  {
    command: '/email',
    label: 'E-mail de suivi',
    prompt: `Rédige un e-mail de suivi professionnel basé sur cette conversation.

FORMAT:
Objet: [sujet concis]

Bonjour,

[Corps de l'email avec les points clés, décisions et prochaines étapes]

Cordialement,
[À compléter]

Base-toi uniquement sur le contenu réel. N'invente aucun détail, nom ou date.`,
  },
  {
    command: '/questions',
    label: 'Questions ouvertes',
    prompt: `Identifie les questions ou points non résolus dans cette conversation.

FORMAT (si des questions existent):
- Question/point 1
- Question/point 2

Si tout a été résolu ou qu'il n'y a pas de questions ouvertes, réponds: "Pas de questions ouvertes identifiées."`,
  },
];
